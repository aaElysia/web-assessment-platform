import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// POST /api/consent
// 记录参与者知情同意版本与时间；不存在的 participant 返回 404。
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { participantId, version } = parsed.data;
  const updated = await prisma.participant
    .update({
      where: { id: participantId },
      data: { consentVersion: version, consentAt: new Date(), status: "consented" },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
