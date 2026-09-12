#!/usr/bin/env node
/**
 * 密钥泄露扫描（`npm run audit:secrets`）。
 *
 * 目的：把「会不会泄露开发者关键信息」变成**每次可执行、可回归的检查**，
 * 而不是依赖上线前有人想起来肉眼翻一遍。
 *
 * 覆盖 6 类真实事故：
 *   [A] 机密文件被纳入版本控制路径（.env / *.pem / *.key 且未被 .gitignore 覆盖）
 *   [B] **真实密钥值出现在源码/文档里**（从 .env* 读出真实值，全树反查）
 *   [C] 硬编码凭据形态（连接串带真实密码、sk-/AKIA/ghp_/PRIVATE KEY 等）
 *   [D] `NEXT_PUBLIC_*` 命名泄密（Next 会把 NEXT_PUBLIC_ 变量原样打进浏览器包）
 *   [E] 客户端组件里引用服务端密钥（'use client' 文件碰 ADMIN_*）
 *   [F] **构建产物泄露**：.next/static（真正的浏览器可见产物）里出现密钥名或密钥值
 *
 * 输出纪律（否则审计工具自己就成了泄露渠道）：
 *   - 只打印「文件:行号 + 掩码后的值 + 指纹」，**绝不打印明文**；
 *   - 发现任何问题退出码 1，可直接用作 CI / 部署前闸门。
 *
 * 用法：
 *   npm run audit:secrets
 *   node scripts/audit-secrets.mjs --json      # 机器可读（同样不含明文）
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { isIgnored } from "./lib/gitignore.mjs";
import { parseEnvFile } from "./lib/env-file.mjs";

const ROOT = resolve(import.meta.dirname, "..");

/** 不参与源码扫描的目录（构建产物单独扫描，第三方代码不看）。 */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "verify-output", "coverage", "dist", ".turbo",
]);

/** 单个文件扫描上限，超过视为数据文件跳过（避免把大 JSON 当源码读）。 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 12;

/** 允许承载「假密钥」的路径：测试夹具里的示例值不是泄露。 */
const FAKE_VALUE_ALLOWED = [
  /(^|\/)src\/.*\.test\.ts$/,
  /(^|\/)scripts\/.*\.(mjs|mts)$/,
  /(^|\/)\.env\.example$/,
  /(^|\/)docs\//,
];

/** 开发/示例占位值——出现在代码里是正常的，不算泄露。 */
const PLACEHOLDERS = new Set([
  "change-me-in-prod", "dev-only-secret-change-me", "admin", "password",
  "changeme", "changeme-in-prod", "secret", "test", "example", "your-password",
  "NEON_PASSWORD", "NEON_USER", "postgres", "postgresql", "localhost",
]);

const findings = [];
function report(check, file, line, masked, note) {
  findings.push({ check, file, line, masked, note });
}

/** 掩码：保留首尾各 2 字符（长度 ≥12 时），绝不输出可用于还原的片段。 */
function mask(value) {
  const v = String(value ?? "");
  if (v.length <= 6) return "*".repeat(v.length);
  return `${v.slice(0, 2)}${"*".repeat(Math.min(8, v.length - 4))}${v.slice(-2)} (len=${v.length})`;
}
function fingerprint(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 8);
}
function isAllowedFakePath(relPath) {
  return FAKE_VALUE_ALLOWED.some((re) => re.test(relPath));
}

/** 递归列出仓库内待扫描文件（相对路径 + 绝对路径）。 */
function walk(dir, depth = 0, out = []) {
  if (depth > MAX_DEPTH) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = resolve(dir, e.name);
    const rel = relative(ROOT, abs).split(sep).join("/");
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".") ) {
        // 允许扫描 .env* 这类点文件，但不下钻隐藏目录（.git/.next 已在上面排除）
        continue;
      }
      walk(abs, depth + 1, out);
    } else if (e.isFile()) {
      out.push({ abs, rel });
    }
  }
  return out;
}

/** 读文本文件；二进制（含 NUL）或超大文件返回 null。 */
function readText(abs) {
  try {
    const st = statSync(abs);
    if (st.size > MAX_FILE_BYTES) return null;
    const buf = readFileSync(abs);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * 判断某个变量值是否**真的值得反查**。
 *
 * 这里必须克制，否则会制造大量误报，而误报会让审计工具失去可信度：
 *  - `DATABASE_URL` 只有「远程连接串 + 带非占位密码」才算秘密。
 *    本地 `file:./dev.db` 只是路径；`postgresql://u:NEON_PASSWORD@h/db` 是占位串。
 *  - 用户名虽非严格意义的口令，但本项目生成的是随机用户名，泄露它等于缩小爆破面，
 *    因此一并纳入反查。
 */
function looksLikeRealSecret(key, value) {
  if (!value || value.length < 8) return false;
  if (PLACEHOLDERS.has(value)) return false;

  if (key === "DATABASE_URL") {
    const m = value.match(/:\/\/([^:/?#]+):([^@/?#]+)@/);
    if (!m) return false; // 无账号密码段 → 不是秘密（如 file:./dev.db）
    const password = m[2];
    if (PLACEHOLDERS.has(password)) return false;
    if (/PASSWORD|PASSWD|PLACEHOLDER|CHANGE|EXAMPLE|YOUR[_-]|NEON_|xxx/i.test(password)) return false;
    return true;
  }
  if (key === "ADMIN_SESSION_SECRET" || key === "ADMIN_PASSWORD") return value.length >= 12;
  if (key === "ADMIN_USERNAME") return value.length >= 8;
  return false;
}

/**
 * 列出本机所有「存放真实密钥」的文件（仓库根 `.env*` + `.secrets/` 目录）。
 *
 * 为什么要枚举而不是写死一个文件名：密钥存放位置一旦变动（本轮就把生产凭据从
 * `.env.production.local` 移到了 `.secrets/production.env`），写死的路径会让
 * **反查静默失效** —— 扫描照旧输出"✅ 未发现问题"，但它其实什么都没比对。
 * 这是最危险的一类失效：工具还在报平安，能力已经没了。
 */
function listSecretFiles() {
  const out = [];
  for (const name of existsSync(ROOT) ? readdirSync(ROOT) : []) {
    if (!name.startsWith(".env") || name === ".env.example") continue;
    out.push({ abs: resolve(ROOT, name), rel: name });
  }
  const secretsDir = resolve(ROOT, ".secrets");
  if (existsSync(secretsDir)) {
    for (const name of readdirSync(secretsDir)) {
      const abs = resolve(secretsDir, name);
      if (statSync(abs).isFile()) out.push({ abs, rel: `.secrets/${name}` });
    }
  }
  return out;
}

/**
 * 收集本机真实密钥值（这些是「绝不能出现在别处」的字符串）。
 * 返回按文件分组的说明，便于人工核对「到底哪些值参与了反查」——这一步很关键，
 * 因为「扫描通过」只有在**确实扫了真实值**的前提下才有意义。
 */
function collectLocalSecrets() {
  const secrets = new Map(); // value -> 来源变量名
  const perFile = [];

  for (const { abs, rel } of listSecretFiles()) {
    const text = readText(abs);
    if (!text) continue;
    const parsed = parseEnvFile(text);
    const taken = [];
    const dropped = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (!["ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "DATABASE_URL"].includes(key)) continue;
      if (looksLikeRealSecret(key, value)) {
        taken.push(key);
        if (!secrets.has(value)) secrets.set(value, `${rel}:${key}`);
      } else {
        dropped.push(key);
      }
    }
    perFile.push({ name: rel, taken, dropped });
  }
  return { secrets, perFile };
}

// ---------------------------------------------------------------------------
// [A] 机密文件未被忽略
// ---------------------------------------------------------------------------
function checkSecretFiles() {
  for (const { rel } of listSecretFiles()) {
    if (!isIgnored(ROOT, rel)) {
      report("A.机密文件未忽略", rel, 0, rel, "该文件可能被提交，请在 .gitignore 中覆盖（.env* 与 .secrets/）");
    }
  }
}

// ---------------------------------------------------------------------------
// [B] 真实密钥值出现在别处
// ---------------------------------------------------------------------------
function checkRealValues(tree, secrets) {
  if (secrets.size === 0) return;
  for (const { abs, rel } of tree) {
    if (rel.startsWith(".env") || rel.startsWith(".secrets")) continue; // 密钥的家（.env* 与 .secrets/）
    const text = readText(abs);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (const [value, origin] of secrets) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(value)) {
          report("B.真实密钥外泄", rel, i + 1, mask(value), `与 ${origin} 中的值完全一致`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// [C] 硬编码凭据形态 / [D] NEXT_PUBLIC 命名
// ---------------------------------------------------------------------------
const SHAPE_RULES = [
  { name: "连接串含真实密码", re: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+:[^\s"'`@]{6,}@[^\s"'`]+/g, allowPlaceholder: true },
  { name: "OpenAI 风格密钥", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub Token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/g },
  { name: "Slack Token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "私钥块", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

const NEXT_PUBLIC_SECRET_NAME = /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|APIKEY|API_KEY|PRIVATE|CREDENTIAL)[A-Z0-9_]*\b/g;

function checkShapes(tree) {
  for (const { abs, rel } of tree) {
    // 本地 .env*（被忽略，本就用来放密钥）不做形态检查；.env.example 是入库的，要查。
    const isLocalEnvFile = (/^\.env/.test(rel) && rel !== ".env.example") || rel.startsWith(".secrets/");
    if (isLocalEnvFile) continue;

    const text = readText(abs);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    const allowedFake = isAllowedFakePath(rel);

    for (const rule of SHAPE_RULES) {
      rule.re.lastIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(line)) !== null) {
          const hit = m[0];
          if (rule.allowPlaceholder) {
            const pw = hit.match(/:\/\/[^:/?#]+:([^@/?#]+)@/)?.[1] ?? "";
            if (PLACEHOLDERS.has(pw) || /^(password|passwd|pwd)$/i.test(pw)) continue;
          }
          if (allowedFake) continue; // 测试夹具里故意放的假值
          report(`C.硬编码凭据（${rule.name}）`, rel, i + 1, mask(hit), "疑似真实凭据，请改为环境变量注入");
        }
      }
    }

    if (!allowedFake) {
      for (let i = 0; i < lines.length; i++) {
        NEXT_PUBLIC_SECRET_NAME.lastIndex = 0;
        let m;
        while ((m = NEXT_PUBLIC_SECRET_NAME.exec(lines[i])) !== null) {
          report("D.NEXT_PUBLIC 泄密命名", rel, i + 1, m[0], "NEXT_PUBLIC_ 变量会被打进浏览器包，密钥类不可用此前缀");
        }
      }
    }

    // 逃生舱变量绝不应出现在被跟踪的文件里（只允许在本地的 .env 中）。
    // 排除项：src/lib/（定义该开关的代码）、docs/ 与 *.md（文档只是说明变量名，无法真正设置环境变量）、.env*（本地环境文件，本就是它的家）。
    if (!allowedFake && /ALLOW_INSECURE_DEFAULTS\s*[=:]\s*["']?1/.test(text) && !rel.startsWith("src/lib/") && !rel.startsWith("docs/") && !rel.endsWith(".md") && !rel.startsWith(".env")) {
      for (let i = 0; i < lines.length; i++) {
        if (/ALLOW_INSECURE_DEFAULTS\s*[=:]\s*["']?1/.test(lines[i])) {
          report("D.逃生舱被固化", rel, i + 1, "ALLOW_INSECURE_DEFAULTS=1", "此变量只应存在于被忽略的本地 .env");
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// [E] 客户端组件引用服务端密钥
// ---------------------------------------------------------------------------
function checkClientComponents(tree) {
  for (const { abs, rel } of tree) {
    if (!/\.(tsx?|jsx?)$/.test(rel)) continue;
    const text = readText(abs);
    if (!text) continue;
    const isClient = /^\s*(?:"use client"|'use client')/.test(text) || /\n\s*(?:"use client"|'use client')/.test(text);
    if (!isClient) continue;
    if (/process\.env\.(ADMIN_[A-Z_]+|DATABASE_URL)/.test(text)) {
      const line = text.split(/\r?\n/).findIndex((l) => /process\.env\.(ADMIN_|DATABASE_URL)/.test(l)) + 1;
      report("E.客户端引用服务端密钥", rel, line, "process.env.ADMIN_*/DATABASE_URL", "客户端组件不得读取服务端密钥");
    }
  }
}

// ---------------------------------------------------------------------------
// [F] 构建产物泄露（真正会送到浏览器的字节）
// ---------------------------------------------------------------------------
function checkBuildOutput(secrets) {
  const staticDir = resolve(ROOT, ".next/static");
  if (!existsSync(staticDir)) return { scanned: 0, skipped: true };

  const NAMES = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "ADMIN_USERNAME", "DATABASE_URL"];
  let scanned = 0;

  const walkStatic = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = resolve(dir, e.name);
      if (e.isDirectory()) { walkStatic(abs); continue; }
      if (!/\.(js|mjs|json|map|css|html|txt)$/.test(e.name)) continue;
      const text = readText(abs);
      if (!text) continue;
      scanned++;
      const rel = relative(ROOT, abs).split(sep).join("/");
      const lines = text.split(/\r?\n/);

      for (const name of NAMES) {
        const idx = lines.findIndex((l) => l.includes(name));
        if (idx >= 0) {
          report("F.构建产物含密钥名", rel, idx + 1, name, "浏览器可见产物中出现了服务端密钥名，请检查是否被客户端引用");
        }
      }
      for (const [value, origin] of secrets) {
        const idx = lines.findIndex((l) => l.includes(value));
        if (idx >= 0) {
          report("F.构建产物含密钥值", rel, idx + 1, mask(value), `与 ${origin} 一致 —— 密钥已被打进前端包`);
        }
      }
    }
  };

  walkStatic(staticDir);
  return { scanned, skipped: false };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  const asJson = process.argv.includes("--json");
  const log = asJson ? () => {} : console.log;

  log("密钥泄露扫描（只输出掩码与指纹，不输出明文）");
  log("=".repeat(64));

  const { secrets, perFile } = collectLocalSecrets();
  log(`本地机密文件：${secrets.size} 个真实值纳入反查`);
  for (const f of perFile) {
    const parts = [];
    if (f.taken.length > 0) parts.push(`纳入 ${f.taken.join("/")}`);
    if (f.dropped.length > 0) parts.push(`跳过 ${f.dropped.join("/")}（本地路径或开发占位值）`);
    log(`  ${f.name} → ${parts.join("；") || "无相关内容"}`);
  }
  if (secrets.size === 0) {
    log("  ⚠️  没有任何真实值参与反查：这通常意味着你还没生成生产凭据；");
    log("     此时「扫描通过」的证明力有限，请先 npm run gen:secrets 再重跑。");
  }

  const tree = walk(ROOT);
  log(`扫描源码文件：${tree.length} 个（已排除 node_modules / .next / verify-output）`);
  log("");

  checkSecretFiles();
  checkRealValues(tree, secrets);
  checkShapes(tree);
  checkClientComponents(tree);
  const build = checkBuildOutput(secrets);

  if (build.skipped) {
    log("⚠️  未发现 .next/static —— 跳过构建产物检查。");
    log("    上线前请先 `npm run build` 再重跑本扫描，这是唯一能证明密钥没进浏览器包的手段。");
    log("");
  } else {
    log(`构建产物：已扫描 .next/static 下 ${build.scanned} 个浏览器可见文件`);
    log("");
  }

  if (findings.length === 0) {
    log("✅ 未发现问题。");
    log("");
    log("仍需人工确认（自动化无法替代）：");
    log("  1. 部署平台的环境变量面板里，值是否与 .secrets/production.env 的指纹一致；");
    log("  2. 是否曾在聊天/工单/截图里贴过明文（贴过即视为已泄露，应轮换）；");
    log("  3. Neon 控制台的数据库密码是否只授予了这一套凭据。");
    if (asJson) console.log(JSON.stringify({ ok: true, findings: [], scannedFiles: tree.length, build }, null, 2));
    process.exit(0);
  }

  const byCheck = new Map();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }

  console.error(`❌ 发现 ${findings.length} 处问题：`);
  console.error("");
  for (const [check, list] of byCheck) {
    console.error(`【${check}】共 ${list.length} 处`);
    for (const f of list.slice(0, 20)) {
      const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
      console.error(`  - ${loc}  →  ${f.masked}`);
      console.error(`      ${f.note}  指纹=${fingerprint(f.masked)}`);
    }
    if (list.length > 20) console.error(`  …另有 ${list.length - 20} 处同类问题`);
    console.error("");
  }
  console.error("处理建议：");
  console.error("  - 真实值一旦进入上述任何位置，即视为**已泄露**，正确做法是轮换密钥（npm run gen:secrets -- --force）");
  console.error("    并同步更新部署平台，而不是只删掉那一行；");
  console.error("  - 需要注入的密钥一律走部署平台的 env 面板，代码里只读 process.env。");

  if (asJson) {
    console.log(JSON.stringify({ ok: false, findings, scannedFiles: tree.length, build }, null, 2));
  }
  process.exit(1);
}

main();
