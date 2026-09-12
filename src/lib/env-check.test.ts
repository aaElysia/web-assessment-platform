import { describe, expect, it } from "vitest";
import {
  INSECURE_DEFAULTS_OPT_IN,
  assertProdEnv,
  formatProdEnvFailure,
  insecureOptInEnabled,
  isStrictDeployment,
  prodEnvProblems,
  type DeployEnv,
} from "@/lib/env-check";

/**
 * 生产环境自检的单元测试。
 *
 * 这是「别把开发默认值带上线」的唯一机械保障，因此两类断言都要有：
 *  1. **正例**：合规的生产 env 必须放行（否则会误伤真实部署）；
 *  2. **反例**：任一必需项不合格必须拦下，且**失败信息里不得出现任何明文**。
 */

const SECRET = "a3f19c7e5b2d8460937152acbde80746f5e2a91c7b3d6048";
const PASSWORD = "Kq7#mZp2vLw9xRt4nBg6Hs1";
const PG_URL = "postgresql://neon_user:S3cretDbPw9x@ep-cool-1234.us-east-2.aws.neon.tech/neondb?sslmode=require";

const HEALTHY: DeployEnv = {
  NODE_ENV: "production",
  ADMIN_USERNAME: "op-7f3a91c2",
  ADMIN_PASSWORD: PASSWORD,
  ADMIN_SESSION_SECRET: SECRET,
  DATABASE_URL: PG_URL,
};

describe("严格部署的判定", () => {
  it("非生产环境永不判定为严格部署（本地开发不受影响）", () => {
    expect(isStrictDeployment({ ...HEALTHY, NODE_ENV: "development" })).toBe(false);
    expect(isStrictDeployment({ ...HEALTHY, NODE_ENV: undefined })).toBe(false);
  });

  it("生产 + 未显式声明例外 → 严格部署", () => {
    expect(isStrictDeployment(HEALTHY)).toBe(true);
    expect(insecureOptInEnabled(HEALTHY)).toBe(false);
  });

  it("生产 + 显式逃生舱 → 不再严格（这是本地以 production 预览的唯一通道）", () => {
    const env = { ...HEALTHY, [INSECURE_DEFAULTS_OPT_IN]: "1" };
    expect(insecureOptInEnabled(env)).toBe(true);
    expect(isStrictDeployment(env)).toBe(false);
  });

  it("逃生舱只认字面量 1，其他值一律按未开启处理（避免 'true'/'yes' 之类的意外放行）", () => {
    for (const v of ["true", "yes", "0", "", " 1"]) {
      const env = { ...HEALTHY, [INSECURE_DEFAULTS_OPT_IN]: v };
      expect(isStrictDeployment(env)).toBe(true);
    }
  });
});

describe("prodEnvProblems", () => {
  it("合规的生产 env 无问题", () => {
    expect(prodEnvProblems(HEALTHY)).toEqual([]);
  });

  it("非生产环境下即使全是弱值也放行（本地 npm run dev / test 不受影响）", () => {
    expect(
      prodEnvProblems({
        NODE_ENV: "development",
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD: "change-me-in-prod",
        ADMIN_SESSION_SECRET: "dev-only-secret-change-me",
        DATABASE_URL: "file:./dev.db",
      })
    ).toEqual([]);
  });

  it("生产环境沿用开发默认凭据 → 拦下，且原因指向具体变量", () => {
    const problems = prodEnvProblems({
      ...HEALTHY,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "change-me-in-prod",
      ADMIN_SESSION_SECRET: "dev-only-secret-change-me",
    }).join("|");
    expect(problems).toContain("ADMIN_USERNAME");
    expect(problems).toContain("ADMIN_PASSWORD");
    expect(problems).toContain("ADMIN_SESSION_SECRET");
  });

  it("生产环境仍指向本地 SQLite 文件 → 拦下", () => {
    const problems = prodEnvProblems({ ...HEALTHY, DATABASE_URL: "file:./dev.db" }).join("|");
    expect(problems).toContain("SQLite");
  });

  it("缺少 DATABASE_URL → 拦下", () => {
    const problems = prodEnvProblems({ ...HEALTHY, DATABASE_URL: undefined }).join("|");
    expect(problems).toContain("DATABASE_URL");
  });

  it("连接串协议不对（既非 Postgres 也非本地文件）→ 拦下", () => {
    const problems = prodEnvProblems({ ...HEALTHY, DATABASE_URL: "mysql://u:p@host/db" }).join("|");
    expect(problems).toContain("Postgres");
  });

  it("连接串里还是占位密码 → 拦下（这是上线事故的高频来源）", () => {
    for (const pw of ["changeme", "change-me", "password", "postgres", "NEON_PASSWORD"]) {
      const problems = prodEnvProblems({
        ...HEALTHY,
        DATABASE_URL: `postgresql://u:${pw}@host/db`,
      }).join("|");
      expect(problems).toContain("占位值");
    }
  });

  it("gen-secrets 生成的 NEON_ 占位串（未替换完整）→ 拦下", () => {
    const problems = prodEnvProblems({
      ...HEALTHY,
      DATABASE_URL:
        "postgresql://NEON_USER:NEON_PASSWORD@NEON_HOST/NEON_DB?sslmode=require",
    }).join("|");
    expect(problems).toContain("占位值");
  });

  it("合法连接串里的真实密码不会被占位规则误伤", () => {
    expect(prodEnvProblems(HEALTHY)).toEqual([]);
  });
});

describe("失败信息不泄露明文", () => {
  it("formatProdEnvFailure 只含变量名与原因，不含任何凭据/连接串内容", () => {
    const env: DeployEnv = {
      NODE_ENV: "production",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "change-me-in-prod",
      ADMIN_SESSION_SECRET: SECRET,
      DATABASE_URL: "postgresql://neon_user:RealDbPassword77@host/db",
    };
    const text = formatProdEnvFailure(prodEnvProblems(env));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("change-me-in-prod");
    expect(text).not.toContain("RealDbPassword77");
    expect(text).not.toContain("neon_user");
    expect(text).not.toContain("host/db");
    // 但仍要有足够信息定位问题
    expect(text).toContain("ADMIN_USERNAME");
    expect(text).toContain("ADMIN_PASSWORD");
  });
});

describe("assertProdEnv", () => {
  it("合规则静默通过", () => {
    expect(() => assertProdEnv(HEALTHY)).not.toThrow();
  });

  it("不合规则抛错，错误信息可直接进 CI 日志", () => {
    let captured = "";
    try {
      assertProdEnv({ ...HEALTHY, ADMIN_PASSWORD: "change-me-in-prod" });
    } catch (err) {
      captured = (err as Error).message;
    }
    expect(captured).toContain("生产环境自检未通过");
    expect(captured).not.toContain("change-me-in-prod");
    expect(captured).not.toContain(SECRET);
  });
});
