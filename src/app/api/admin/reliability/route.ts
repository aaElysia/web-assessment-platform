import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { loadReliability } from "@/lib/admin/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reliability
 *
 * 各维度的 Cronbach α（含 95% bootstrap 置信区间、题目数 k、listwise 样本量
 * 与被剔除人数、题目平均相关、惯例等级描述）。需要有效管理端会话，否则 401。
 *
 * ⚠️ 与分析页共用 `loadReliability()`，保证「页面看到的」与「API 返回的」
 * 永远是同一份数字（含 bootstrap 的固定种子，否则两处区间会不一致）。
 */
export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const data = await loadReliability();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
