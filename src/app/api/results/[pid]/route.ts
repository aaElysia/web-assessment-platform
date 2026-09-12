import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scoreAll, type Answers } from "@/lib/scoring/score";
import {
  getCompositeInterpretation,
  getDomainInterpretation,
  getInterpretations,
} from "@/lib/questionnaire/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/results/:pid
 *
 * 返回某位匿名参与者的维度分与解读所需数据。
 *
 * 为什么在服务端算而不是把答案回传前端：
 *  - 评分口径只有一处（`src/lib/scoring`），避免前端另算一套导致口径漂移；
 *  - 客户端拿不到「哪道题反向计分」的完整映射，也降低被手工伪造分数的动机。
 *
 * 隐私：只按 participantId 查询，返回体中不含任何人口学字段与作答原文，
 * 仅返回聚合后的维度分（每个维度仅 1 个数值），符合数据最小化原则。
 */
export async function GET(
  _req: Request,
  { params }: { params: { pid: string } }
) {
  const participant = await prisma.participant.findUnique({
    where: { id: params.pid },
    select: {
      id: true,
      status: true,
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          completedAt: true,
          items: {
            select: { value: true, item: { select: { code: true } } },
          },
        },
      },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const session = participant.sessions[0];
  if (!session || session.items.length === 0) {
    return NextResponse.json(
      { error: "No responses submitted for this participant" },
      { status: 404 }
    );
  }

  // ResponseItem 里存的是 Item.id，需借 include 出来的 code 还原为题库 code。
  const answers: Answers = {};
  for (const ri of session.items) {
    answers[ri.item.code] = ri.value;
  }

  const result = scoreAll(answers);

  // 把中性解读文案按「维度 × 分带」贴上，前端只负责渲染。
  // 文案来源 data/interpretations.json（配置驱动），未配置时返回 null 而非临时编造。
  const enriched = {
    ...result,
    scales: result.scales.map((s) => ({
      ...s,
      domains: s.domains.map((d) => ({
        ...d,
        interpretation: d.band
          ? getDomainInterpretation(d.key, d.band.tone)
          : null,
      })),
      composite: s.composite
        ? {
            ...s.composite,
            interpretation: s.composite.band
              ? getCompositeInterpretation(s.composite.key, s.composite.band.tone)
              : null,
          }
        : null,
    })),
  };

  return NextResponse.json({
    participantId: participant.id,
    sessionId: session.id,
    completedAt: session.completedAt,
    result: enriched,
    // 结果页/导出必须原样展示的边界说明，避免被解读为临床结论。
    interpretationNotes: [
      "分带（相对偏低 / 中等 / 相对偏高）为启发式参考，本平台尚未建立常模，不代表人群百分位。",
      "结果仅用于教育性自我洞察，不构成任何临床诊断、心理评估或医疗建议。",
      "若某维度显示 incomplete，说明该维度有效作答不足，未给出分数（不会用估计值替代）。",
      "AI 态度量表中「对 AI 的担忧」为反向语义维度：数值越高表示担忧越多，并非越积极。",
    ],
    interpretationConfig: {
      version: getInterpretations().version,
    },
  });
}
