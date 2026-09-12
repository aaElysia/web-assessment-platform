import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isHttpsRequest,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/logout
 *
 * 清除会话 cookie。
 *
 * 为什么**不做**登录校验：登出是幂等且无副作用的操作（只清自己的 cookie）。
 * 若要求「必须先登录」，会话一旦过期或密钥轮换，用户反而无法登出，
 * 只能手动清 cookie —— 体验更差而安全性没有提升。
 */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(isHttpsRequest(req)),
    maxAge: 0,
  });
  return res;
}
