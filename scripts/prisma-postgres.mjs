#!/usr/bin/env node
/**
 * Postgres（Neon）切换辅助。
 *
 * 问题：Prisma 的 `datasource.provider` **不能在 schema 里动态化**。
 * 本地开发要继续用 SQLite（零依赖、快），生产必须用 Postgres，
 * 于是常见的两种做法都有明显代价：
 *   a) 维护两份 schema  → 模型定义重复，迟早漂移（本项目明确反对）；
 *   b) 直接改成 postgresql → 本地没有 Postgres 就完全跑不起来。
 *
 * 这里采取第三条路：**以 prisma/schema.prisma 为唯一真源**，在需要时
 * 机械地派生出 `prisma/schema.generated.postgres.prisma`（仅替换 provider 一行），
 * 派生文件被 .gitignore 忽略。因此：
 *   - 模型定义只有一处，不存在漂移；
 *   - 本地 SQLite 流程完全不变；
 *   - 生产只需要执行派生 + 生成 / 推送，不需要人肉改文件。
 *
 * 用法：
 *   node scripts/prisma-postgres.mjs prepare    # 只派生 schema（可肉眼 diff）
 *   node scripts/prisma-postgres.mjs generate   # 派生 + 按 Postgres schema 生成 client
 *   node scripts/prisma-postgres.mjs push       # 派生 + 建表（db push，不改动 client）
 *   node scripts/prisma-postgres.mjs all        # 派生 + 生成 + 建表
 *
 * 安全：连接串只以「脱敏形式」打印（隐藏用户名与密码），绝不回显明文。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseEnvFile } from "./lib/env-file.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, "prisma/schema.prisma");
const TARGET = resolve(ROOT, "prisma/schema.generated.postgres.prisma");
// 生产凭据固定放在 .secrets/（Next 不会自动加载该目录，避免本地预览被生产串覆盖）。
const ENV_PROD_FILE = resolve(ROOT, ".secrets/production.env");

/** 连接串脱敏：只保留协议、主机与库名，抹掉用户名与密码。 */
function redactDbUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//***@${u.host}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return "(无法解析的连接串)";
  }
}

/** 取 DATABASE_URL：优先进程 env，其次 .secrets/production.env，最后 .env。 */
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, from: "进程环境变量" };
  }
  for (const [file, label] of [
    [ENV_PROD_FILE, ".secrets/production.env"],
    [resolve(ROOT, ".env"), ".env"],
  ]) {
    if (!existsSync(file)) continue;
    const parsed = parseEnvFile(readFileSync(file, "utf8"));
    if (parsed.DATABASE_URL) return { url: parsed.DATABASE_URL, from: label };
  }
  return { url: "", from: "(未找到)" };
}

function prepare() {
  if (!existsSync(SOURCE)) {
    console.error("找不到 prisma/schema.prisma，无法派生。");
    process.exit(1);
  }
  const text = readFileSync(SOURCE, "utf8");
  const providerLine = /(\n\s*provider\s*=\s*)"sqlite"/;
  if (!providerLine.test(text)) {
    if (/provider\s*=\s*"postgresql"/.test(text)) {
      console.error(
        "prisma/schema.prisma 的 provider 已是 postgresql。\n" +
          "本项目的约定是：**源 schema 保持 sqlite**，Postgres 版本由本脚本派生。\n" +
          "若确实要把源 schema 也切成 Postgres，请先删除本脚本的假设并同步更新文档。"
      );
      process.exit(1);
    }
    console.error("未能在 prisma/schema.prisma 中找到 `provider = \"sqlite\"`，拒绝盲目改写。");
    process.exit(1);
  }

  const generated = text
    .replace(providerLine, '$1"postgresql"')
    .replace(
      /^\/\/ Prisma schema/m,
      "// ⚠️ 本文件由 scripts/prisma-postgres.mjs 从 prisma/schema.prisma 自动派生，请勿手工编辑。\n// Prisma schema"
    );

  writeFileSync(TARGET, generated, "utf8");
  console.log(`已派生：${relative(ROOT, TARGET)}（仅 provider 由 sqlite 改为 postgresql）`);
  return TARGET;
}

function runPrisma(args, label) {
  console.log(`\n> ${label}`);
  try {
    execFileSync(process.execPath, [resolve(ROOT, "node_modules/prisma/build/index.js"), ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    console.error(`\n${label} 失败（上方为 prisma 原始输出）。`);
    process.exit(1);
  }
}

function requirePostgresUrl() {
  const { url, from } = resolveDatabaseUrl();
  if (!url) {
    console.error(
      "未找到 DATABASE_URL。请先 `npm run gen:secrets` 生成 .secrets/production.env，\n" +
        "或临时导出环境变量：DATABASE_URL='postgresql://…' node scripts/prisma-postgres.mjs all"
    );
    process.exit(1);
  }
  if (/^file:/i.test(url)) {
    console.error(
      `DATABASE_URL 当前指向本地 SQLite（来源：${from}），本命令用于 Postgres，已中止。` +
        "（这是保护措施：避免把本地的 file: 串当成生产库去建表。）"
    );
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    console.error(`DATABASE_URL 不是 Postgres 连接串（来源：${from}），已中止。`);
    process.exit(1);
  }
  if (/:NEON_PASSWORD@|:(?:changeme|change-me|password)@/i.test(url)) {
    console.error(
      "DATABASE_URL 里还是占位密码，尚未替换为真实 Neon 凭据，已中止。\n" +
        "（Neon 控制台 → Connection Details 可复制完整连接串，注意保留 ?sslmode=require。）"
    );
    process.exit(1);
  }
  // Neon 池化串（pooler / 端口 6543）走 pgbouncer 事务池，prisma db push / migrate
  // 依赖会话级 SET 语句，用池化串建表会卡住或报 "prepared statement" 类错误。
  // 建表/迁移必须用直连串（非 pooler，端口 5432）。池化串只留给线上运行时。
  if (/pooler/i.test(url) || /:6543\//.test(url)) {
    console.warn(
      "\n⚠️ 警告：检测到 Neon 池化连接串（pooler / 端口 6543）。\n" +
        "   本命令要做 `db push` 建表，建议改用 Neon 的 **Direct（非 pooler）** 直连串，\n" +
        "   否则可能因 pgbouncer 事务池导致建表失败。\n" +
        "   线上运行时（Vercel 的 DATABASE_URL）才使用池化串。\n" +
        "   （仍要继续也可，但建表若失败请换直连串重试。）"
    );
  }
  console.log(`目标数据库：${redactDbUrl(url)}（来源：${from}）`);
  return url;
}

function runSeed() {
  console.log("\n> 写入量表与题目（seed，来自 data/question-bank.json）");
  try {
    execFileSync(
      process.execPath,
      [resolve(ROOT, "node_modules/tsx/dist/cli.mjs"), resolve(ROOT, "prisma/seed.ts")],
      { cwd: ROOT, stdio: "inherit", env: process.env }
    );
  } catch {
    console.error("\nseed 失败（上方为 tsx / prisma 原始输出）。");
    process.exit(1);
  }
}

function main() {
  const mode = process.argv[2] ?? "prepare";
  const known = new Set(["prepare", "generate", "push", "all", "provision"]);
  if (!known.has(mode)) {
    console.error(`未知模式：${mode}（可用：${[...known].join(" / ")}）`);
    process.exit(1);
  }

  if (mode === "prepare") {
    prepare();
    console.log("\n下一步：把 Vercel 的 Build Command 设为");
    console.log("  node scripts/prisma-postgres.mjs generate && next build");
    console.log("这样部署时会按 Postgres schema 生成 Prisma Client，本地 SQLite 流程不受影响。");
    return;
  }

  const schema = prepare();
  if (mode === "generate" || mode === "all" || mode === "provision") {
    runPrisma(["generate", `--schema=${schema}`], "按 Postgres schema 生成 Prisma Client");
  }
  if (mode === "push" || mode === "all" || mode === "provision") {
    requirePostgresUrl();
    console.log(
      "提示：`db push` 不产生迁移历史，适合「全新空库首次建表」。\n" +
        "      若库中已有数据却改了模型，请改用迁移流程（prisma migrate）。"
    );
    runPrisma(
      ["db", "push", `--schema=${schema}`, "--skip-generate", "--accept-data-loss"],
      "在目标 Postgres 上建表"
    );
  }
  if (mode === "provision") {
    runSeed();
  }

  console.log("\n完成。注意：`generate` 会把 node_modules 里的 Prisma Client 切到 Postgres 版本；");
  console.log("回到本地 SQLite 开发前，请执行 `npm run db:generate` 切回来。");
}

main();
