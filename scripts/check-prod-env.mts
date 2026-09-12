#!/usr/bin/env node
/**
 * 生产环境自检 CLI（构建期闸门）。
 *
 * 用法：
 *   node scripts/check-prod-env.mts                      # 检查当前进程 env（部署平台注入）
 *   node scripts/check-prod-env.mts --force              # 强制按「真实部署」判定
 *   node scripts/check-prod-env.mts --env-file .env.prod # 从指定文件读取后再判定
 *
 * 设计要点：
 *  - 判断逻辑**完全复用** `src/lib/env-check.ts`，本脚本只做「取 env → 调用 → 打印」，
 *    不在脚本里重写任何规则（避免构建期与运行期两套判断漂移）。
 *  - 输出**只含变量名与原因，绝不含变量值**，因此可安全写进 CI / Vercel 构建日志。
 *  - 强凭据额外打印「指纹」（SHA-256 前 8 位十六进制）：用于确认线上跑的是哪一份密钥，
 *    且因为值本身是强随机，指纹不构成可离线爆破的泄露。弱值一律不打印指纹。
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvFile } from "./lib/env-file.mjs";

const ROOT = resolve(import.meta.dirname, "..");

/** 只用于「确认线上是哪份密钥」，不可逆且只取前 8 位。 */
function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function parseArgs(argv) {
  const args = { force: false, envFile: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "--env-file") args.envFile = argv[++i] ?? null;
    else if (a.startsWith("--env-file=")) args.envFile = a.slice("--env-file=".length);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 动态 import TS 模块（由 tsx 提供加载），避免本脚本复制任何判断规则。
  const { prodEnvProblems, formatProdEnvFailure, isStrictDeployment, INSECURE_DEFAULTS_OPT_IN } =
    await import(
      pathToFileURL(resolve(ROOT, "src/lib/env-check.ts")).href
    );
  const { credentialProblems, credentialsAreStrong } = await import(
    pathToFileURL(resolve(ROOT, "src/lib/security/credential-rules.ts")).href
  );

  let fileEnv = {};
  if (args.envFile) {
    const abs = resolve(ROOT, args.envFile);
    try {
      fileEnv = parseEnvFile(readFileSync(abs, "utf8"));
      if (!args.quiet) {
        console.log(`已读取环境变量文件：${relative(ROOT, abs)}（值不会被执行，也不会被打印）`);
      }
    } catch (err) {
      console.error(`无法读取 --env-file 指定的文件：${relative(ROOT, abs)}（${err.code ?? "error"}）`);
      process.exit(2);
    }
  }

  // 显式传入的进程 env 优先（便于 CI 用真实密钥覆盖文件值）。
  const env = { ...fileEnv };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && env[k] === undefined) env[k] = v;
  }
  if (args.force) env.NODE_ENV = "production";

  if (!isStrictDeployment(env)) {
    if (!args.quiet) {
      console.log("跳过生产自检：当前非「真实部署」场景。");
      console.log(
        `  判定依据：NODE_ENV=${env.NODE_ENV ?? "(未设置)"}` +
          (env[INSECURE_DEFAULTS_OPT_IN] === "1"
            ? `，且已显式设置 ${INSECURE_DEFAULTS_OPT_IN}=1`
            : "")
      );
      console.log("  提示：加 --force 可在本地模拟真实部署的判定。");
    }
    process.exit(0);
  }

  const problems = prodEnvProblems(env);
  if (problems.length > 0) {
    // 注意：失败信息只含变量名，不含值——可直接贴到任何工单里。
    console.error(formatProdEnvFailure(problems));
    process.exit(1);
  }

  console.log("生产环境自检通过 ✅");
  const creds = {
    ADMIN_USERNAME: env.ADMIN_USERNAME,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET,
  };
  if (credentialsAreStrong(creds)) {
    console.log("凭据指纹（SHA-256 前 8 位，用于核对线上部署的是哪一份密钥）：");
    for (const [k, v] of Object.entries(creds)) {
      console.log(`  ${k} = ${fingerprint(v)}`);
    }
  } else {
    console.log("凭据强度告警：" + credentialProblems(creds).join(" "));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("自检脚本执行失败：" + (err?.message ?? String(err)));
  process.exit(2);
});
