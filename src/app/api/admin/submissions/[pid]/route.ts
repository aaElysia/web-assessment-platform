import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/submissions/:pid
 *
 * 删除单条提交（一名匿名参与者）。需要有效管理端会话，否则 401。
 *
 * 级联删除：Participant 上的 sessions / ResponseSession 上的 items 均设了
 * `onDelete: Cascade`，删除参与者即同时清除其全部作答明细，不留孤儿记录。
 *
 * 响应：
 *  - 200 { deleted: true, id }：成功；
 *  - 400 { error }：pid 缺失或非法；
 *  - 404 { error }：该 pid 不存在（幂等，重复删除不会报错）。
 */
export async function DELETE(
  req: Request,
  { params }: { params: { pid: string } }
) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const pid = params.pid;
  if (!pid || typeof pid !== "string" || pid.length === 0) {
    return NextResponse.json(
      { error: "Bad Request" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const existing = await prisma.participant.findUnique({
    where: { id: pid },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Not Found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  await prisma.participant.delete({ where: { id: pid } });
  return NextResponse.json(
    { deleted: true, id: pid },
    { headers: { "Cache-Control": "no-store" } }
  );
}
