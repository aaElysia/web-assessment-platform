import { prisma } from "@/lib/db";
import {
  sortParticipantRows,
  type ListParticipantsOptions,
  type ParticipantRow,
} from "./types";

/**
 * 管理端「提交明细」取数（**server-only**）。
 *
 * 与 `loadAdminRecords`（只取最新已完成会话、且要拼 answers）不同，这里的目标是
 * 「逐条列出、便于清理」：
 *  - 取全部参与者（含仅创建未作答者，方便清理测试期产生的空 ID）；
 *  - 每名参与者取**最新一次会话**（startedAt 倒序），展示其填写时间与题数；
 *  - 计算 `submittedAt = completedAt ?? startedAt ?? createdAt` 作为统一时间口径；
 *  - 排序交给纯函数 `sortParticipantRows`，便于单测、且与 SQLite/Postgres 无关。
 */
export async function loadParticipantsList(
  opts: ListParticipantsOptions = {}
): Promise<ParticipantRow[]> {
  const { sortKey = "submittedAt", sortDir = "desc" } = opts;

  const participants = await prisma.participant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          startedAt: true,
          completedAt: true,
          status: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  const rows: ParticipantRow[] = participants.map((p) => {
    const session = p.sessions[0] ?? null;
    const submittedAt = (
      session?.completedAt ??
      session?.startedAt ??
      p.createdAt
    ).toISOString();

    return {
      id: p.id,
      shortId: p.id.slice(0, 8),
      createdAt: p.createdAt.toISOString(),
      status: p.status,
      session: session
        ? {
            startedAt: session.startedAt.toISOString(),
            completedAt: session.completedAt
              ? session.completedAt.toISOString()
              : null,
            status: session.status,
            itemCount: session._count.items,
          }
        : null,
      submittedAt,
    };
  });

  return sortParticipantRows(rows, sortKey, sortDir);
}
