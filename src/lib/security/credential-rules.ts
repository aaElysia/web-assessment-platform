/**
 * 管理端凭据强度规则 —— **单一真源**。
 *
 * 为什么必须抽出来：这套规则有两个消费方
 *  1. `auth.ts::weakCredentialReasons()` —— 运行期在仪表盘顶部显示告警；
 *  2. `env-check.ts::prodEnvProblems()`   —— 部署期/构建期硬拦截。
 * 若两边各写一份，迟早会出现「告警说安全、自检说危险」这种自相矛盾的状态，
 * 而安全代码的两套实现分叉是最危险的一类缺陷（同 guard.ts 中拒绝 middleware
 * 双实现的理由）。因此规则只在这里定义一次。
 *
 * 本模块是**纯函数**（显式接收 env，不读 process.env），因此可被单测完整覆盖，
 * 也可以在构建脚本里用任意 env 快照调用。
 */

/** 常见示例值 / 占位值。生产环境出现任一项即视为未替换。 */
export const EXAMPLE_VALUES: ReadonlySet<string> = new Set([
  "change-me-in-prod",
  "dev-only-secret-change-me",
  "admin",
  "password",
  "changeme",
  "changeme-in-prod",
  "secret",
  "test",
]);

/** 密码最小长度（字符数；不区分码点，够用且不做无意义的过度承诺）。 */
export const MIN_PASSWORD_LENGTH = 12;

/** 会话签名密钥最小长度。HMAC-SHA256 的密钥建议 ≥32 字节，这里按字符近似要求。 */
export const MIN_SECRET_LENGTH = 32;

export type CredentialEnv = {
  ADMIN_USERNAME?: string | undefined;
  ADMIN_PASSWORD?: string | undefined;
  ADMIN_SESSION_SECRET?: string | undefined;
};

/**
 * 返回当前凭据的问题清单（空数组 = 没问题）。
 * 文案中保留 `ADMIN_*` 变量名，便于运维直接定位到要改哪个环境变量。
 */
export function credentialProblems(env: CredentialEnv): string[] {
  const reasons: string[] = [];
  const user = env.ADMIN_USERNAME ?? "";
  const pass = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";

  if (!user || !pass) {
    reasons.push("未配置 ADMIN_USERNAME / ADMIN_PASSWORD，管理端登录将一律被拒绝。");
  }
  if (user === "admin") reasons.push("ADMIN_USERNAME 仍为常见默认值 admin。");

  if (pass && EXAMPLE_VALUES.has(pass)) {
    reasons.push("ADMIN_PASSWORD 仍为示例默认值。");
  } else if (pass && pass.length < MIN_PASSWORD_LENGTH) {
    reasons.push(`ADMIN_PASSWORD 长度不足 ${MIN_PASSWORD_LENGTH} 位。`);
  }

  if (!secret) {
    reasons.push("未配置 ADMIN_SESSION_SECRET，会话无法签发。");
  } else if (EXAMPLE_VALUES.has(secret)) {
    reasons.push("ADMIN_SESSION_SECRET 仍为示例默认值。");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    reasons.push(`ADMIN_SESSION_SECRET 长度不足 ${MIN_SECRET_LENGTH} 位。`);
  }

  return reasons;
}

/**
 * 凭据是否达到「可安全公网暴露」的强度。
 * 注意：这里**只**判强度，不判「是否配置了」以外的任何部署条件。
 */
export function credentialsAreStrong(env: CredentialEnv): boolean {
  return credentialProblems(env).length === 0;
}
