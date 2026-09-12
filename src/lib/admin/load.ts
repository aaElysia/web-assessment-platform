import { prisma } from "@/lib/db";
import type { Answers } from "@/lib/scoring/score";
import { analyzeCorrelation, analyzeItems, analyzeReliability } from "./analysis";
import { computeAdminStats } from "./stats";
import type {
  AdminRecord,
  AdminStats,
  CorrelationResult,
  ItemsResult,
  ReliabilityResult,
} from "./types";

/**
 * 管理端数据读取（**server-only**）。
 *
 * 与 `stats.ts` 分开的原因：stats.ts 是纯函数、可被单测直接覆盖；
 * 这里持有 Prisma 依赖，只做「取数 → 组装成 AdminRecord[]」这一件事。
 *
 * 取数口径：
 *  - 参与者全量（含仅创建未作答者）——完成率的分母需要它们；
 *  - 每名参与者只取**最新一次已完成会话**（与结果页 `/api/results/:pid`
 *    取 `sessions[0]` 的口径一致，避免管理端与个人结果页出现两套数字）。
 */

export async function loadAdminRecords(): Promise<AdminRecord[]> {
  const participants = await prisma.participant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      consentAt: true,
      ageRange: true,
      gender: true,
      education: true,
      sessions: {
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          startedAt: true,
          completedAt: true,
          items: {
            select: { value: true, item: { select: { code: true } } },
          },
        },
      },
    },
  });

  return participants.map((p) => {
    const session = p.sessions[0];
    const answers: Answers = {};
    if (session) {
      for (const ri of session.items) answers[ri.item.code] = ri.value;
    }
    return {
      id: p.id,
      createdAt: p.createdAt,
      status: p.status,
      consentAt: p.consentAt,
      ageRange: p.ageRange,
      gender: p.gender,
      education: p.education,
      session: session
        ? {
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            answers,
          }
        : null,
    };
  });
}

/** 取数 + 聚合一步到位（页面与 API 共用，保证两处数字完全一致）。 */
export async function loadAdminStats(): Promise<AdminStats> {
  return computeAdminStats(await loadAdminRecords());
}

// ---------------------------------------------------------------------------
// Step 9 · 分析
//
// 三个分析各自只需一次 DB 读取；分析页要三份结果，因此提供合并入口，
// 避免同一页面触发三次全量查询（并保证三块内容读的是同一批数据）。
// ---------------------------------------------------------------------------

export type AdminAnalysis = {
  reliability: ReliabilityResult;
  correlation: CorrelationResult;
  items: ItemsResult;
};

/** 一次取数、一次算齐三份分析结果（分析页用）。 */
export async function loadAdminAnalysis(): Promise<AdminAnalysis> {
  const records = await loadAdminRecords();
  return {
    reliability: analyzeReliability(records),
    correlation: analyzeCorrelation(records),
    items: analyzeItems(records),
  };
}

export async function loadReliability(): Promise<ReliabilityResult> {
  return analyzeReliability(await loadAdminRecords());
}

export async function loadCorrelation(): Promise<CorrelationResult> {
  return analyzeCorrelation(await loadAdminRecords());
}

export async function loadItems(): Promise<ItemsResult> {
  return analyzeItems(await loadAdminRecords());
}
