import { credentialProblems, type CredentialEnv } from "./security/credential-rules";

/**
 * 生产部署环境自检 —— 把「别把开发默认值带上线」从**告警**升级为**硬拦截**。
 *
 * 背景：原实现只在登录后于仪表盘顶部显示弱凭据告警（`weakCredentialReasons`），
 * 这依赖「有人看见并处理」。上线场景下更危险的是**根本没人登录过**——
 * 比如部署完就先发了链接。因此这里补上两道硬闸：
 *   1. 构建期：`scripts/check-prod-env.mts` 在 `next build` 之前运行，不合格即构建失败；
 *   2. 运行期：管理端 Route Handler 守卫先过 `deploymentBlockedResponse()`，
 *      自检不通过则一律 503，不签发任何会话。
 *
 * 关键设计：如何区分「真实部署」与「本地以 NODE_ENV=production 预览」？
 * 原实现用 NODE_ENV 单一信号，导致无法硬拒绝（本地 start 也会命中）。
 * 现改为**显式逃生舱**：只有显式设置 `ALLOW_INSECURE_DEFAULTS=1` 才放行弱值，
 * 而该变量只出现在本地 `npm start` / `npm run dev` 脚本里，绝不写入任何部署配置。
 * 「默认拒绝、需显式声明例外」比「默认放行、靠人看告警」安全得多。
 *
 * 本模块是纯函数（显式接收 env），因此构建脚本与运行期可以共用同一套判断，
 * 也可以在单测里用任意 env 快照验证——不会出现「构建说行、运行说不行」的分叉。
 */

/** 显式放行弱默认值的逃生舱变量名（仅本地预览使用）。 */
export const INSECURE_DEFAULTS_OPT_IN = "ALLOW_INSECURE_DEFAULTS";

export type DeployEnv = CredentialEnv & {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  ALLOW_INSECURE_DEFAULTS?: string | undefined;
};

/** 是否为生产构建/运行（NODE_ENV=production）。 */
export function isProductionMode(env: DeployEnv): boolean {
  return env.NODE_ENV === "production";
}

/** 是否显式声明了「我知道自己在用不安全的默认值」。 */
export function insecureOptInEnabled(env: DeployEnv): boolean {
  return env[INSECURE_DEFAULTS_OPT_IN] === "1";
}

/**
 * 是否按「真实部署」施加硬约束。
 * 严格模式 = 生产环境 且 未显式声明例外。
 */
export function isStrictDeployment(env: DeployEnv): boolean {
  return isProductionMode(env) && !insecureOptInEnabled(env);
}

/** 生产库连接串是否是本地 SQLite 文件。 */
function isLocalSqliteUrl(url: string): boolean {
  return /^file:/i.test(url.trim());
}

/** 连接串里是否残留占位密码（`postgres://user:changeme@host`）——上线事故高频来源。 */
function hasPlaceholderPassword(url: string): boolean {
  if (!/:\/\/[^:/?#]+:[^@/?#]+@/.test(url)) return false;
  // 1) 整段密码恰好等于某个写死的占位词（大小写不敏感）。
  const literal = /:\/\/[^:/?#]+:(changeme|change-me|password|passwd|pwd|secret|postgres|NEON_PASSWORD|example|placeholder|replace_me|xxxx|todo)@/i;
  if (literal.test(url)) return true;
  // 2) 连接串里还残留大写 NEON_ 占位符（NEON_HOST / NEON_DB / NEON_USER 等），
  //    说明整段没替换完全。真实 Neon 连接串只有小写 neon.tech，不会命中。
  if (/NEON_[A-Z]+/.test(url)) return true;
  return false;
}

/**
 * 返回生产部署环境的问题清单（空数组 = 可以上线）。
 * **非严格模式一律返回空数组**，这样本地 `npm start` 不会被自己拦住。
 *
 * @param env 显式传入，便于构建脚本与单测注入快照。
 */
export function prodEnvProblems(env: DeployEnv): string[] {
  if (!isStrictDeployment(env)) return [];

  // 凭据强度规则复用 credential-rules 单一真源，避免两套判断漂移。
  const problems = credentialProblems(env);

  const db = (env.DATABASE_URL ?? "").trim();
  if (!db) {
    problems.push("未配置 DATABASE_URL，生产环境无法连接数据库。");
  } else if (isLocalSqliteUrl(db)) {
    problems.push(
      "DATABASE_URL 仍指向本地 SQLite 文件（file:…），生产必须使用托管 Postgres 连接串（Neon 等）。"
    );
  } else if (!/^postgres(ql)?:\/\//i.test(db)) {
    problems.push(
      "DATABASE_URL 既不是 Postgres 连接串也不是本地文件，请确认连接串协议是否正确。"
    );
  } else if (hasPlaceholderPassword(db)) {
    problems.push("DATABASE_URL 中的密码仍是占位值，请替换为真实数据库密码。");
  }

  return problems;
}

/** 供构建脚本与运行期共用的失败信息（**只包含变量名，绝不包含任何变量值**）。 */
export function formatProdEnvFailure(problems: readonly string[]): string {
  return [
    "生产环境自检未通过，已拒绝继续（这是保护措施，不是故障）：",
    ...problems.map((p) => `  - ${p}`),
    "",
    "处理方式：在部署平台（Vercel → Settings → Environment Variables）补齐上述变量。",
    "生成强随机值：npm run gen:secrets（写入 .secrets/production.env，该目录被 git 忽略）",
    `本地以 NODE_ENV=production 预览时，可显式设置 ${INSECURE_DEFAULTS_OPT_IN}=1 跳过本检查。`,
  ].join("\n");
}

/**
 * 自检不通过则抛错（构建期使用，让构建直接失败）。
 * 注意：错误信息只含变量名与原因，**不含任何变量值**，可安全写入 CI 日志。
 */
export function assertProdEnv(env: DeployEnv): void {
  const problems = prodEnvProblems(env);
  if (problems.length > 0) throw new Error(formatProdEnvFailure(problems));
}
