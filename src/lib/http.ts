/**
 * HTTP 请求处理的小工具（server-only，纯逻辑、无框架依赖）。
 */

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid" };

/**
 * 读取并解析 JSON 请求体，带体积上限。
 *
 * 为什么需要上限：Route Handler 默认没有请求体大小限制，一个匿名开放的
 * 登录端点如果直接 `await req.json()`，等于允许任何人用超大 body 把
 * 内存打满。先看 Content-Length 快速拒绝，再在读取后复核一次
 * （应对 chunked 编码不报 Content-Length 的情况）。
 */
export async function readJsonBody(
  req: Request,
  maxBytes = 8192
): Promise<JsonBodyResult> {
  const declared = req.headers.get("content-length");
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, reason: "too_large" };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (raw.length > maxBytes) return { ok: false, reason: "too_large" };

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * 取客户端来源标识，仅用于登录失败限流分桶。
 *
 * ⚠️ `x-forwarded-for` 可被伪造，因此**不能**作为安全边界，
 * 只用于「抬高暴力破解成本」这一目标。生产环境应由平台（Vercel 等）
 * 覆写该头，或在可信代理后取值。
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
