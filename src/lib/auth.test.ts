import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  checkCredentials,
  createSession,
  isHttpsRequest,
  parseCookieHeader,
  safeEqual,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
  weakCredentialReasons,
} from "./auth";

/**
 * 鉴权核心的单测。重点覆盖「能拒绝什么」，而不只是「能通过什么」——
 * 鉴权模块的缺陷几乎总是表现为「该拒的没拒」。
 */

const SECRET = "test-secret-at-least-16-chars-long";
const NOW = Date.UTC(2026, 8, 12, 4, 0, 0); // 2026-09-12T04:00:00Z

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("会话令牌", () => {
  it("签发的令牌可被校验通过，并保留主体与有效期", () => {
    const session = createSession("alice", NOW, 3600);
    const token = signSessionToken(session, SECRET);
    const back = verifySessionToken(token, NOW + 1000, SECRET);

    expect(back).toEqual(session);
    expect(back?.sub).toBe("alice");
    expect(back!.exp - back!.iat).toBe(3600);
  });

  it("默认有效期为 8 小时", () => {
    const s = createSession("alice", NOW);
    expect(s.exp - s.iat).toBe(SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBe(8 * 60 * 60);
  });

  it("篡改 payload 会被签名校验拦下", () => {
    const token = signSessionToken(createSession("alice", NOW), SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "root", iat: 0, exp: 9_999_999_999 })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(verifySessionToken(`${forged}.${sig}`, NOW, SECRET)).toBeNull();
    expect(verifySessionToken(`${body}.${sig}`, NOW, SECRET)).not.toBeNull();
  });

  it("换一把密钥签发的令牌无效", () => {
    const token = signSessionToken(createSession("alice", NOW), SECRET);
    expect(verifySessionToken(token, NOW, "another-secret-16-chars")).toBeNull();
  });

  it("过期即失效（边界：恰好到点也算过期）", () => {
    const session = createSession("alice", NOW, 60);
    const token = signSessionToken(session, SECRET);
    expect(verifySessionToken(token, NOW + 59_000, SECRET)).not.toBeNull();
    expect(verifySessionToken(token, NOW + 60_000, SECRET)).toBeNull();
    expect(verifySessionToken(token, NOW + 3_600_000, SECRET)).toBeNull();
  });

  it.each([
    ["空字符串", ""],
    ["undefined", undefined],
    ["null", null],
    ["无点分隔", "abcdef"],
    ["点多于一个", "a.b.c"],
    ["空 body", ".sig"],
    ["空签名", "body."],
    ["非 base64 载荷", "!!!.###"],
    ["签名被截断", "body.AAAA"],
  ])("畸形令牌（%s）返回 null", (_label, token) => {
    expect(verifySessionToken(token as string, NOW, SECRET)).toBeNull();
  });

  it("payload 合法但字段不合规（如缺少 exp）时拒绝", () => {
    const body = Buffer.from(JSON.stringify({ sub: "alice" }))
      .toString("base64")
      .replace(/=+$/, "");
    // 用真密钥为正则 payload 签名 → 签名正确，但字段缺失，必须仍被拒。
    const token = signSessionToken({ sub: "alice" } as never, SECRET);
    expect(token.startsWith(body.slice(0, 8))).toBe(true);
    expect(verifySessionToken(token, NOW, SECRET)).toBeNull();
  });

  it("密钥未配置或过短时拒绝所有令牌（fail closed）", () => {
    resetEnv();
    delete process.env.ADMIN_SESSION_SECRET;
    const token = signSessionToken(createSession("alice", NOW), SECRET);

    // 无 secret 参数 → 读取环境变量 → 缺失 → 拒绝。
    expect(verifySessionToken(token, NOW)).toBeNull();

    process.env.ADMIN_SESSION_SECRET = "too-short";
    expect(verifySessionToken(token, NOW)).toBeNull();
  });

  it("环境变量密钥可用时，签发/校验走同一来源", () => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
    const token = signSessionToken(createSession("bob", NOW));
    expect(verifySessionToken(token, NOW)?.sub).toBe("bob");
    resetEnv();
  });
});

describe("凭据校验", () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = "researcher";
    process.env.ADMIN_PASSWORD = "a-long-enough-password";
  });
  afterEach(resetEnv);

  it("正确凭据通过", () => {
    expect(checkCredentials("researcher", "a-long-enough-password")).toBe(true);
  });

  it.each([
    ["用户名错", "someoneelse", "a-long-enough-password"],
    ["密码错", "researcher", "wrong-password"],
    ["两者皆错", "someoneelse", "wrong-password"],
    ["空用户名", "", "a-long-enough-password"],
    ["空密码", "researcher", ""],
    ["大小写不同", "Researcher", "a-long-enough-password"],
  ])("%s → 拒绝", (_label, u, p) => {
    expect(checkCredentials(u, p)).toBe(false);
  });

  it("非字符串入参（原型污染 / 数字 / 对象）不通过", () => {
    expect(checkCredentials({ toString: () => "researcher" }, "a-long-enough-password")).toBe(false);
    expect(checkCredentials(123, 456)).toBe(false);
    expect(checkCredentials(null, undefined)).toBe(false);
  });

  it("未配置凭据时一律拒绝（不出现「空密码可进」）", () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    expect(checkCredentials("", "")).toBe(false);
    expect(checkCredentials("admin", "admin")).toBe(false);
  });

  it("safeEqual 对相同串为真、不同串为假", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("弱凭据告警", () => {
  afterEach(resetEnv);

  it("示例默认值全部命中告警", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "change-me-in-prod";
    process.env.ADMIN_SESSION_SECRET = "dev-only-secret-change-me";
    const reasons = weakCredentialReasons();
    expect(reasons.length).toBeGreaterThanOrEqual(3);
    expect(reasons.join("|")).toContain("ADMIN_PASSWORD");
    expect(reasons.join("|")).toContain("ADMIN_SESSION_SECRET");
  });

  it("强凭据无告警", () => {
    process.env.ADMIN_USERNAME = "researcher01";
    process.env.ADMIN_PASSWORD = "Xk9#mQ2vLp7wZr4t";
    process.env.ADMIN_SESSION_SECRET = "f3a91c7e5b2d8460937152acbde80746";
    expect(weakCredentialReasons()).toEqual([]);
  });

  it("凭据缺失时给出明确原因", () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
    const reasons = weakCredentialReasons();
    expect(reasons.join("|")).toContain("ADMIN_USERNAME");
    expect(reasons.join("|")).toContain("会话无法签发");
  });
});

describe("Cookie 辅助", () => {
  it("解析 Cookie 请求头（含多值、空格、无值项）", () => {
    const jar = parseCookieHeader("a=1; admin_session=abc.def ; broken; b=2");
    expect(jar).toEqual({ a: "1", admin_session: "abc.def", b: "2" });
  });

  it("空/缺失请求头返回空表", () => {
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });

  it("畸形百分号编码不抛异常，回退为原值", () => {
    expect(parseCookieHeader("x=%E0%A4%A").x).toBe("%E0%A4%A");
  });

  it("cookie 属性固定为 httpOnly + lax + path=/", () => {
    const opts = sessionCookieOptions(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(opts.secure).toBe(false);
  });

  it("HTTPS 请求置 Secure，本地 HTTP 不置（否则浏览器会丢弃 cookie）", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);

    const fake = (url: string, headers: Record<string, string> = {}) => ({
      url,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    });

    expect(isHttpsRequest(fake("http://localhost:3000/api/admin/login"))).toBe(false);
    expect(isHttpsRequest(fake("https://example.com/api/admin/login"))).toBe(true);
    expect(
      isHttpsRequest(
        fake("http://internal/api/admin/login", { "x-forwarded-proto": "https" })
      )
    ).toBe(true);
    expect(
      isHttpsRequest(
        fake("http://internal/api/admin/login", {
          "x-forwarded-proto": "https, http",
        })
      )
    ).toBe(true);
  });
});
