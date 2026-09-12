import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  parseCookieHeader,
  verifySessionToken,
  type AdminSession,
} from "@/lib/auth";
import { formatProdEnvFailure, prodEnvProblems } from "@/lib/env-check";

/**
 * 鉴权与 Next.js 的胶水层（server-only）。
 *
 * 为什么不用 middleware 统一拦截：
 *  - middleware 跑在 Edge Runtime，拿不到项目里的 Node 加密原语，
 *    只能再写一套 Web Crypto 实现 —— 两套实现迟早会漂移，
 *    而「鉴权实现分叉」是最危险的一类缺陷；
 *  - 这里改为**显式守卫**：每个管理 API 的第一行调用 `guardAdminApi()`，
 *    每个受保护页面第一行调用 `requireAdminPage()`。
 *
 * 显式守卫的代价是「新增路由时可能忘记加守卫」，因此配套：
 *  - `guard-coverage.test.ts` 静态扫描 `src/app/api/admin/**\/route.ts`，
 *    凡不在白名单内却没调用守卫的，测试直接失败。
 */

/** 读取当前请求的会话（服务端组件 / Route Handler 均可）。 */
export function getAdminSession(): AdminSession | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** 受保护页面：未登录则重定向到登录页。 */
export function requireAdminPage(): AdminSession {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** 从裸 Request 读取会话（Route Handler 用，不依赖 next/headers 上下文）。 */
export function getAdminSessionFromRequest(req: Request): AdminSession | null {
  const jar = parseCookieHeader(req.headers.get("cookie"));
  return verifySessionToken(jar[SESSION_COOKIE]);
}

/** 统一的未授权响应：不区分「没有 cookie」与「令牌无效」，避免信息泄露。 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * 部署健康闸门：生产环境下若必需凭据 / 数据库连接不满足要求，一律 503。
 *
 * 为什么放在守卫里而不是每个路由自己判断：放在这里之后**所有**管理端 API
 * 自动受保护，新增路由不会漏（`guard-coverage.test.ts` 已保证新路由必须调用
 * `guardAdminApi`）。这比要求每个作者记得加一行检查可靠得多。
 *
 * 对外只回一句通用错误，**不回显问题清单**——清单含变量名与部署细节，
 * 对攻击者是有价值的侦察信息；详情只写进服务端日志。
 *
 * @returns 通过时返回 null；不通过时返回可直接 return 的 503 响应。
 */
export function deploymentBlockedResponse(): NextResponse | null {
  const problems = prodEnvProblems(process.env);
  if (problems.length === 0) return null;

  // 服务端日志给运维看细节（只含变量名，不含值）。
  console.error(
    "[security] 生产环境自检不通过，管理端接口已拒绝服务：\n" +
      formatProdEnvFailure(problems)
  );

  return NextResponse.json(
    { error: "Service unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Route Handler 守卫。
 * 用法：`const denied = guardAdminApi(req); if (denied) return denied;`
 * @returns 通过时返回 null；未通过时返回可直接 return 的 401 / 503 响应。
 */
export function guardAdminApi(req: Request): NextResponse | null {
  const blocked = deploymentBlockedResponse();
  if (blocked) return blocked;
  return getAdminSessionFromRequest(req) ? null : unauthorizedResponse();
}
