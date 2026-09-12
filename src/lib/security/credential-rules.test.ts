import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  MIN_SECRET_LENGTH,
  credentialProblems,
  credentialsAreStrong,
} from "@/lib/security/credential-rules";

/**
 * 凭据强度规则的单元测试。
 *
 * 这套规则是**单一真源**：运行期告警（auth.ts）与部署期硬拦截（env-check.ts）
 * 都依赖它。因此它一旦被改松，两个防线同时失效——必须有测试钉住。
 */

const STRONG = {
  ADMIN_USERNAME: "op-7f3a91c2",
  ADMIN_PASSWORD: "Kq7#mZp2vLw9xRt4nBg6Hs1",
  ADMIN_SESSION_SECRET: "a3f19c7e5b2d8460937152acbde80746f5e2a91c7b3d6048",
};

describe("credentialProblems", () => {
  it("强凭据无任何问题", () => {
    expect(credentialProblems(STRONG)).toEqual([]);
    expect(credentialsAreStrong(STRONG)).toBe(true);
  });

  it("未配置凭据 → 明确指出变量名（便于运维定位）", () => {
    const problems = credentialProblems({}).join("|");
    expect(problems).toContain("ADMIN_USERNAME");
    expect(problems).toContain("ADMIN_PASSWORD");
    expect(problems).toContain("ADMIN_SESSION_SECRET");
  });

  it("示例默认值全部命中", () => {
    const problems = credentialProblems({
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "change-me-in-prod",
      ADMIN_SESSION_SECRET: "dev-only-secret-change-me",
    }).join("|");
    expect(problems).toContain("ADMIN_USERNAME");
    expect(problems).toContain("ADMIN_PASSWORD");
    expect(problems).toContain("ADMIN_SESSION_SECRET");
  });

  it(`密码不足 ${MIN_PASSWORD_LENGTH} 位即判不合格（但长度合规的弱密码仍可能通过，故只是必要条件）`, () => {
    const problems = credentialProblems({ ...STRONG, ADMIN_PASSWORD: "a".repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(problems.join("|")).toContain("ADMIN_PASSWORD");
    expect(credentialProblems({ ...STRONG, ADMIN_PASSWORD: "a".repeat(MIN_PASSWORD_LENGTH) })).toEqual([]);
  });

  it(`会话密钥不足 ${MIN_SECRET_LENGTH} 位即判不合格`, () => {
    const short = credentialProblems({ ...STRONG, ADMIN_SESSION_SECRET: "a".repeat(MIN_SECRET_LENGTH - 1) });
    expect(short.join("|")).toContain("ADMIN_SESSION_SECRET");
  });

  it("用户名 admin 单独命中（即使密码很强）", () => {
    const problems = credentialProblems({ ...STRONG, ADMIN_USERNAME: "admin" });
    expect(problems.join("|")).toContain("admin");
    expect(credentialsAreStrong({ ...STRONG, ADMIN_USERNAME: "admin" })).toBe(false);
  });

  it("返回值中不包含任何凭据明文（告警可能被渲染到页面上）", () => {
    const text = credentialProblems({ ...STRONG, ADMIN_USERNAME: "admin" }).join("\n");
    for (const v of Object.values(STRONG)) expect(text).not.toContain(v);
  });
});
