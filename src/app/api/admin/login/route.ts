import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkCredentials,
  createSession,
  isHttpsRequest,
  sessionCookieOptions,
  signSessionToken,
  weakCredentialReasons,
} from "@/lib/auth";
import { loginThrottle } from "@/lib/admin/login-throttle";
import { deploymentBlockedResponse } from "@/lib/admin/guard";
import { adminLoginSchema } from "@/lib/validation";
import { clientIp, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/login
 *
 * 校验环境变量凭据并签发签名会话 cookie。
 *
 * 安全要点：
 *  - **统一错误文案**：用户名错与密码错都返回同一个 401，不做账号枚举；
 *  - **限流**：按来源 IP 计失败次数（进程内，见 login-throttle.ts 的局限说明）；
 *  - **请求体上限**：见 readJsonBody（防超大 body 打满内存）；
 *  - **失败一律不签发**：凭据未配置时 checkCredentials 返回 false，login 500/401 而非放行。
 */
export async function POST(req: Request) {
  // 部署自检闸门（登录是公开端点，不走 guardAdminApi，因此这里显式判一次）：
  // 生产环境凭据/数据库未达标时一律 503，避免「用弱凭据把线上管理端打开」。
  const blocked = deploymentBlockedResponse();
  if (blocked) return blocked;

  const body = await readJsonBody(req, 4096);
  if (!body.ok) {
    return NextResponse.json(
      {
        error:
          body.reason === "too_large" ? "Payload too large" : "Invalid JSON body",
      },
      { status: body.reason === "too_large" ? 413 : 400 }
    );
  }

  const parsed = adminLoginSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid credentials payload" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const verdict = loginThrottle.check(ip);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts", retryAfterSec: verdict.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSec) },
      }
    );
  }

  if (!checkCredentials(parsed.data.username, parsed.data.password)) {
    loginThrottle.recordFailure(ip);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  loginThrottle.reset(ip);

  const session = createSession(parsed.data.username);

  let token: string;
  try {
    token = signSessionToken(session);
  } catch {
    // 密钥未配置/过短：宁可 503 也不能签发一个无效令牌让前端反复跳转。
    return NextResponse.json(
      { error: "Server session secret is not configured" },
      { status: 503 }
    );
  }

  const res = NextResponse.json({
    ok: true,
    username: session.sub,
    expiresAt: new Date(session.exp * 1000).toISOString(),
    // 只对已登录者提示弱凭据，避免匿名探测服务端配置状态。
    credentialWarnings: weakCredentialReasons(),
  });
  res.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(isHttpsRequest(req))
  );
  return res;
}
