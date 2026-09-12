import { NextResponse } from "next/server";
import { weakCredentialReasons } from "@/lib/auth";
import { getAdminSessionFromRequest } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/session
 *
 * 会话状态探针：供登录页判断「已登录则直接进后台」。
 *
 * 未登录时返回 **200 + `{ authenticated: false }`**（而不是 401）：
 * 这是「查询状态」而非「受保护资源」，用 200 表达状态、
 * 用 body 表达结果，前端逻辑更简单，也不会在控制台刷出 401 报错。
 * 未登录时不返回任何配置信息（弱凭据告警只在已登录后给出）。
 */
export async function GET(req: Request) {
  const session = getAdminSessionFromRequest(req);

  if (!session) {
    return NextResponse.json(
      { authenticated: false, username: null, expiresAt: null, credentialWarnings: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      username: session.sub,
      expiresAt: new Date(session.exp * 1000).toISOString(),
      credentialWarnings: weakCredentialReasons(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
