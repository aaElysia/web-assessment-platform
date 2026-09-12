import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { loadItems } from "@/lib/admin/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/items
 *
 * 单题反应分布（按量表 × 维度分组）：1–5 各档人数（原始 + 重编码）、
 * 未作答人数、原始/重编码均值、sd、零变异与地板/天花板标记。
 * 需要有效管理端会话，否则 401。
 *
 * 该端点会下发**完整题干**——它本就由匿名用户可见（测评页会展示），
 * 因此不构成额外泄露；不含任何评分公式的额外信息。
 */
export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const data = await loadItems();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
