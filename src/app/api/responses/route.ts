import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitResponsesSchema } from "@/lib/validation";
import { getItemIndex } from "@/lib/questionnaire/loader";

export const dynamic = "force-dynamic";

// POST /api/responses
// 提交一次完整作答：创建完成态 ResponseSession + 逐题 ResponseItem。
// 注意：客户端提交的 itemId 实为题目 code（如 "O1"），需解析为 Item 的真实 id 后再写入，
// 否则会触发外键约束失败（P2003）。
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = submitResponsesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { participantId, items, demographics } = parsed.data;

  // 校验所有提交的 code 都存在于题库（防止脏数据）。
  const index = getItemIndex();
  for (const it of items) {
    if (!index[it.itemId]) {
      return NextResponse.json(
        { error: `Unknown itemId: ${it.itemId}` },
        { status: 400 }
      );
    }
  }

  // 将提交的 code 解析为 Item 真实 id（外键需要）。
  const codes = items.map((it) => it.itemId);
  const dbItems = await prisma.item.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const codeToId = new Map(dbItems.map((d) => [d.code, d.id]));
  for (const it of items) {
    if (!codeToId.has(it.itemId)) {
      return NextResponse.json(
        { error: `Unknown itemId: ${it.itemId}` },
        { status: 400 }
      );
    }
  }

  try {
    const session = await prisma.$transaction(async (tx) => {
      const participant = await tx.participant.findUnique({
        where: { id: participantId },
      });
      if (!participant) throw new Error("participant_not_found");

      const created = await tx.responseSession.create({
        data: { participantId, status: "completed", completedAt: new Date() },
      });

      await tx.responseItem.createMany({
        data: items.map((it) => ({
          sessionId: created.id,
          itemId: codeToId.get(it.itemId)!,
          value: it.value,
        })),
      });

      await tx.participant.update({
        where: { id: participantId },
        data: { status: "completed", ...(demographics ?? {}) },
      });

      return created;
    });

    return NextResponse.json(
      { sessionId: session.id, status: "completed" },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Error && e.message === "participant_not_found") {
      return NextResponse.json(
        { error: "Participant not found" },
        { status: 404 }
      );
    }
    throw e;
  }
}
