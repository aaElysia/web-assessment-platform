import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { loadAdminStats } from "@/lib/admin/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats
 *
 * 聚合统计（参与量 / 完成率 / 端到端耗时 / 各维度均值与 sd / 合成指数分布）。
 * 需要有效管理端会话，否则 401。
 *
 * 与管理端仪表盘页面共用 `loadAdminStats()`，保证「页面看到的」与
 * 「API 返回的」永远是同一份数字，不会出现两套口径。
 */
export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const stats = await loadAdminStats();
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "no-store" },
  });
}
