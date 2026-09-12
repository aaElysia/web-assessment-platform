import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { credentialProblems } from "@/lib/security/credential-rules";

/**
 * 管理端会话（轻量鉴权，不引入外部 IdP）。
 *
 * 设计取舍：
 *  1. **无状态签名令牌**，存在 httpOnly cookie 里。服务端不维护会话表，
 *     因此不需要额外迁移、也没有「会话存储」这一层可被读泄露。
 *     代价：无法在服务端主动吊销单个会话（只能改密钥让全部失效）——
 *     对单管理员、教育用途的管理端可接受，已记入交接文档待办。
 *  2. **本模块是纯逻辑**：不 import next/*，因此可被单测直接覆盖。
 *     与 Next 的胶水（cookies()/redirect()/NextResponse）放在 `lib/admin/guard.ts`。
 *  3. **一律 fail closed**：密钥缺失、令牌畸形、签名不符、过期 —— 全部返回 null。
 *     没有「开发模式跳过校验」这类后门。
 *
 * 令牌格式：`base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))`
 *  - 先验签、后解析 payload（解析前不可信任其内容）；
 *  - 签名比较用 timingSafeEqual，避免逐字节比较泄露信息。
 */

export const SESSION_COOKIE = "admin_session";

/** 会话有效期：8 小时（覆盖一个工作班次，又不会长期驻留）。 */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AdminSession = {
  /** 登录主体（管理员用户名）。 */
  sub: string;
  /** 签发时间（epoch 秒）。 */
  iat: number;
  /** 过期时间（epoch 秒）。 */
  exp: number;
};

// ---------------------------------------------------------------------------
// 编解码
// ---------------------------------------------------------------------------

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data, "utf8").digest();
}

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.trim().length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET 未配置或过短（至少 16 字符），无法签发会话"
    );
  }
  return s;
}

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === "string" &&
    v.sub.length > 0 &&
    typeof v.iat === "number" &&
    Number.isFinite(v.iat) &&
    typeof v.exp === "number" &&
    Number.isFinite(v.exp)
  );
}

// ---------------------------------------------------------------------------
// 会话令牌
// ---------------------------------------------------------------------------

/** 构造会话载荷（测试可注入 nowMs / ttl 以获得确定性）。 */
export function createSession(
  subject: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = SESSION_TTL_SECONDS
): AdminSession {
  const iat = Math.floor(nowMs / 1000);
  return { sub: subject, iat, exp: iat + ttlSeconds };
}

/**
 * 签发会话令牌。
 * @param secret 仅供测试注入；生产始终走环境变量。
 */
export function signSessionToken(
  session: AdminSession,
  secret: string = getSecret()
): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(session), "utf8"));
  return `${body}.${b64urlEncode(sign(body, secret))}`;
}

/**
 * 校验会话令牌。任何异常都收敛为 null（fail closed）。
 * @param nowMs 仅供测试注入时钟。
 */
export function verifySessionToken(
  token: string | null | undefined,
  nowMs: number = Date.now(),
  secret?: string
): AdminSession | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  let key: string;
  try {
    key = secret ?? getSecret();
  } catch {
    // 密钥不可用 → 拒绝一切令牌，绝不「无签名放行」。
    return null;
  }

  const expected = sign(body, key);
  const given = b64urlDecode(sig);
  // 长度不同时 timingSafeEqual 会抛异常，因此先比长度（长度本身不是秘密）。
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!isAdminSession(payload)) return null;
  if (payload.exp * 1000 <= nowMs) return null;

  return payload;
}

// ---------------------------------------------------------------------------
// 凭据校验
// ---------------------------------------------------------------------------

/**
 * 常量时间字符串比较。
 * 先各自 SHA-256 到定长再比较，这样长度差异也不会通过提前返回泄露。
 */
export function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}

/**
 * 校验管理员凭据。
 *
 * 关键点：**两次比较都必须执行**。若写成 `safeEqual(u) && safeEqual(p)`，
 * 用户名一旦不匹配就会短路，攻击者可从响应耗时差异判断「用户名猜对了没」。
 * 因此这里先算完两个结果再合并。
 */
export function checkCredentials(
  username: unknown,
  password: unknown
): boolean {
  const expectUser = process.env.ADMIN_USERNAME;
  const expectPass = process.env.ADMIN_PASSWORD;

  // 未配置凭据 → 拒绝登录（fail closed），而不是「无密码可进」。
  if (!expectUser || !expectPass) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  if (username.length === 0 || password.length === 0) return false;

  const userOk = safeEqual(username, expectUser);
  const passOk = safeEqual(password, expectPass);
  return userOk && passOk;
}

/**
 * 返回「当前凭据仍不安全」的具体原因（空数组 = 没有发现问题）。
 *
 * 规则本身定义在 `lib/security/credential-rules.ts`（单一真源）：
 * 部署期硬拦截（`env-check.ts`）与这里显示告警必须用同一套判断，
 * 否则会出现「告警说安全、自检说危险」的自相矛盾状态。
 *
 * 为什么生产环境不在这里直接拒绝默认凭据：本项目本地预览以
 * `npm start`（NODE_ENV=production）运行。硬拒绝改由 `env-check.ts` 承担，
 * 并给出显式逃生舱 `ALLOW_INSECURE_DEFAULTS=1`（仅本地 start 脚本会设），
 * 因此「真部署」与「本地预览」不再靠 NODE_ENV 这一个信号去猜。
 */
export function weakCredentialReasons(): string[] {
  return credentialProblems({
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  });
}

// ---------------------------------------------------------------------------
// Cookie 辅助（纯字符串/对象处理，便于单测）
// ---------------------------------------------------------------------------

export type SessionCookieOptions = {
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  path: string;
  maxAge: number;
};

/**
 * 会话 cookie 属性：
 *  - httpOnly：JS 读不到，XSS 也偷不走令牌；
 *  - sameSite=lax：跨站请求不携带，抵御 CSRF（管理端只用 GET 读 + POST 登入/登出，lax 足够）；
 *  - secure：仅在 HTTPS 下置位。本地预览是 http://localhost，若强置 secure
 *    会让浏览器静默丢弃 cookie 导致「登录成功却仍被判定未登录」。
 *  - path=/：登出接口在 /api/admin/* 下，若限到 /admin 会收不到 cookie。
 */
export function sessionCookieOptions(
  secure: boolean,
  maxAge: number = SESSION_TTL_SECONDS
): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge };
}

/** 解析 Cookie 请求头为键值表（畸形项静默跳过）。 */
export function parseCookieHeader(
  header: string | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const rawValue = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      out[key] = rawValue;
    }
  }
  return out;
}

/** 请求是否走 HTTPS（决定 cookie 是否置 Secure）。兼容反向代理头。 */
export function isHttpsRequest(req: {
  url: string;
  headers: { get(name: string): string | null };
}): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
