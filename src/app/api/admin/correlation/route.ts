import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { loadCorrelation } from "@/lib/admin/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/correlation
 *
 * 10 个维度分的 Pearson r 矩阵（成对剔除 → 每格自带 n）、双尾 p 值、
 * Bonferroni 校正阈值与校正前后显著数、r 的近似置信半宽。需要有效管理端会话。
 */
export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const data = await loadCorrelation();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
