#!/usr/bin/env node
/**
 * 生成生产用强随机凭据，写入 `.secrets/production.env`（目录被 git 忽略）。
 *
 * **为什么不是 `.env.production.local`**：Next.js 在 `NODE_ENV=production` 时会自动加载
 * `.env.production.local`，且其优先级高于 `.env`。把生产凭据放在那里会导致本地
 * `npm start`（生产模式预览）拿到生产的占位连接串，从而连不上本地 SQLite——
 * 实测构建日志里的 `Environments: .env.production.local, .env` 就是这个机制。
 * 改放到 `.secrets/` 子目录后，Next **不会**自动加载，本地与生产的凭据彻底隔离，
 * 也避免了"本地预览时误以为在连生产库"的认知风险。
 *
 * 安全约定（本脚本的核心职责就是**不制造泄露**）：
 *  1. 写入前先确认目标文件确实被 `.gitignore` 覆盖，否则**拒绝写入并退出** ——
 *     从不把密钥写进可能被提交的文件；
 *  2. 终端的输出**只有掩码指纹，没有明文**：这样截图、录屏、贴日志都不会泄密；
 *     明文只存在于本地文件里，由你手工粘进部署平台的 env 面板；
 *  3. 已存在时默认不覆盖（避免把线上正在用的密钥冲掉），需显式 `--force`。
 *
 * 用法：
 *   npm run gen:secrets              # 首次生成
 *   npm run gen:secrets -- --force   # 轮换（会覆盖，注意同步更新部署平台）
 *   npm run gen:secrets -- --out .secrets/other.env
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { isIgnored } from "./lib/gitignore.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_OUT = ".secrets/production.env";

/** 密码字母表：去掉容易在手工复制时混淆的字符（0/O、1/l/I）。 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const SYMBOLS = "!@#$%^&*-_=+?";

/** 无模偏差的均匀取样：拒绝采样，避免 256 % len 带来的偏斜。 */
function pickUniform(alphabet, count) {
  const out = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < count) {
    for (const byte of randomBytes(count * 2)) {
      if (out.length >= count) break;
      if (byte >= limit) continue;
      out.push(alphabet[byte % alphabet.length]);
    }
  }
  return out.join("");
}

/** 强随机密码：22 个字母数字 + 6 个符号，再洗牌一次（避免符号总在末尾）。 */
function strongPassword() {
  const core = pickUniform(ALPHABET, 22);
  const sym = pickUniform(SYMBOLS, 6);
  const chars = [...core, ...sym];
  // Fisher–Yates，随机源用 crypto
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** 会话签名密钥：32 字节 → 64 位十六进制。 */
function sessionSecret() {
  return randomBytes(32).toString("hex");
}

/** 非默认用户名，避免攻击者直接猜常见账户名。 */
function adminUsername() {
  return `op-${randomBytes(4).toString("hex")}`;
}

function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function parseArgs(argv) {
  const args = { force: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a.startsWith("--out=")) args.out = a.slice("--out=".length);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isIgnored(ROOT, args.out)) {
    console.error(
      `拒绝写入：${args.out} 未被 .gitignore 覆盖。\n` +
        `为避免把密钥写进可能被提交的文件，请先确认 .gitignore 含 .env* 与 .secrets/ 规则。`
    );
    process.exit(1);
  }

  const abs = resolve(ROOT, args.out);
  if (existsSync(abs) && !args.force) {
    console.error(
      `拒绝覆盖：${relative(ROOT, abs)} 已存在。\n` +
        `若确实要轮换密钥，请加 --force（并记得同步更新部署平台的环境变量）。`
    );
    process.exit(1);
  }

  const username = adminUsername();
  const password = strongPassword();
  const secret = sessionSecret();

  const content = `# 生产环境变量 —— 本文件被 .gitignore 忽略（.secrets/ 目录整体忽略），切勿提交、切勿贴进聊天/工单/截图。
# 生成时间：${new Date().toISOString()}
# 存放位置说明：放在 .secrets/ 子目录而不是 .env.production.local，
#   因为 Next.js 在生产模式会自动加载后者并覆盖 .env，导致本地预览连不上本地 SQLite。
# 用法：把下面 4 项逐条粘进部署平台的环境变量面板（Vercel → Settings → Environment Variables）。
# 提示：DATABASE_URL 请用 Neon 控制台给出的连接串替换（务必保留 ?sslmode=require）。

# 1) 数据库。生产必须用托管 Postgres；本地 SQLite 的 file: 会被生产自检拒绝。
DATABASE_URL="postgresql://NEON_USER:NEON_PASSWORD@NEON_HOST/NEON_DB?sslmode=require"

# 2) 管理端登录凭据（已生成为强随机值，勿改短、勿复用旧密码）
ADMIN_USERNAME="${username}"
ADMIN_PASSWORD="${password}"

# 3) 会话签名密钥（HMAC-SHA256，32 字节随机）
ADMIN_SESSION_SECRET="${secret}"
`;

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, { encoding: "utf8", mode: 0o600 });

  const posix = process.platform !== "win32";
  console.log(
    `已写入：${relative(ROOT, abs)}（已被 .gitignore 忽略` +
      (posix ? "，权限 600" : "；Windows 下 mode 参数不生效，NTFS 权限需另行收紧") +
      "）"
  );
  console.log("");
  console.log("凭据指纹（SHA-256 前 8 位）—— 用于核对部署平台上粘的是不是这一份：");
  console.log(`  ADMIN_USERNAME        = ${fingerprint(username)}`);
  console.log(`  ADMIN_PASSWORD        = ${fingerprint(password)}`);
  console.log(`  ADMIN_SESSION_SECRET  = ${fingerprint(secret)}`);
  console.log("");
  console.log("明文只在文件里，本终端不打印明文（避免截图/录屏/日志泄露）。");
  console.log("下一步：");
  console.log(`  1. 用编辑器打开 ${relative(ROOT, abs)}，把 4 项粘进部署平台；`);
  console.log("  2. 替换其中的 DATABASE_URL 为真实 Neon 连接串；");
  console.log("  3. 校验这份配置：npm run check:prod-env");
}

main();
