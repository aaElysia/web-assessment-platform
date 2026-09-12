import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { loadParticipantsList } from "@/lib/admin/submissions";
import type { SortDir, SortKey } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/submissions
 *
 * 提交明细列表。需要有效管理端会话，否则 401。
 * 支持查询参数：
 *  - sort：submittedAt（默认）| startedAt | createdAt
 *  - dir ：desc（默认）| asc
 * 与「提交明细」页共用 `loadParticipantsList()`，保证页面与 API 数字一致。
 */
const VALID_KEYS: SortKey[] = ["submittedAt", "startedAt", "createdAt"];
const VALID_DIRS: SortDir[] = ["asc", "desc"];

export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const keyParam = url.searchParams.get("sort");
  const dirParam = url.searchParams.get("dir");

  const sortKey: SortKey = VALID_KEYS.includes(keyParam as SortKey)
    ? (keyParam as SortKey)
    : "submittedAt";
  const sortDir: SortDir = VALID_DIRS.includes(dirParam as SortDir)
    ? (dirParam as SortDir)
    : "desc";

  const rows = await loadParticipantsList({ sortKey, sortDir });
  return NextResponse.json(
    { rows, sortKey, sortDir },
    { headers: { "Cache-Control": "no-store" } }
  );
}
