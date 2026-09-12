import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/participants
// 创建匿名参与者，返回随机 UUID。不接收/不存储任何 PII（姓名/邮箱/IP 均不收集）。
export async function POST() {
  const participant = await prisma.participant.create({ data: {} });
  return NextResponse.json({ id: participant.id }, { status: 201 });
}
