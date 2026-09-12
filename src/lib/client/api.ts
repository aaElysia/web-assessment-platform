"use client";

// 用户端 API 客户端：封装匿名参与者创建、知情同意、题库获取与作答提交。
// 所有请求均为匿名，不携带任何身份标识。

import type { Demographics } from "@/lib/client/storage";

export type LikertOption = { value: number; label: string; shortLabel?: string };

export type PublicQuestionnaire = {
  likert: {
    scale: number;
    minLabel: string;
    maxLabel: string;
    options: LikertOption[];
  };
  scales: {
    key: string;
    name: string;
    type: string;
    domains: { key: string; name: string; polarity?: string }[];
    items: { code: string; domain: string; text: string; reverse: boolean }[];
  }[];
};

export async function createParticipant(): Promise<string> {
  const res = await fetch("/api/participants", { method: "POST" });
  if (!res.ok) throw new Error("创建匿名参与者失败");
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function submitConsent(
  participantId: string,
  version: string
): Promise<void> {
  const res = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, version }),
  });
  if (!res.ok) throw new Error("记录知情同意失败");
}

export async function fetchQuestionnaire(): Promise<PublicQuestionnaire> {
  const res = await fetch("/api/questionnaire");
  if (!res.ok) throw new Error("加载题库失败");
  return (await res.json()) as PublicQuestionnaire;
}

export async function submitResponses(
  participantId: string,
  items: { itemId: string; value: number }[],
  demographics?: Demographics
): Promise<void> {
  const res = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, items, demographics }),
  });
  if (res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "提交内容不合法");
  }
  if (!res.ok) throw new Error("提交作答失败");
}

// ---------------------------------------------------------------------------
// 结果查询（Step 7）
// ---------------------------------------------------------------------------

export type Band = { label: string; tone: "low" | "medium" | "high" };

export type ResultDomain = {
  key: string;
  name: string;
  polarity?: string;
  /** 1–5；维度 incomplete 时为 null。 */
  score: number | null;
  answered: number;
  total: number;
  missing: number;
  imputed: boolean;
  incomplete: boolean;
  band: Band | null;
  /** 中性解读文案（来自服务端配置），未配置时为 null。 */
  interpretation: string | null;
};

export type ResultComposite = {
  key: string;
  label: string;
  formula: string;
  score: number | null;
  band: Band | null;
  interpretation: string | null;
};

export type ResultScale = {
  scaleKey: string;
  scaleName: string;
  type: string;
  domains: ResultDomain[];
  composite: ResultComposite | null;
};

export type ResultPayload = {
  scales: ResultScale[];
  answeredTotal: number;
  itemTotal: number;
  completionRate: number;
  /** 作答质量粗筛标记（见服务端 detectResponseQuality）。 */
  qualityFlags: string[];
};

export type ResultResponse = {
  participantId: string;
  sessionId: string;
  completedAt: string | null;
  result: ResultPayload;
  interpretationNotes: string[];
  interpretationConfig?: { version: string };
};

/** 结果查询的失败原因，便于页面区分「未找到 / 未作答 / 网络错误」。 */
export class ResultFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ResultFetchError";
    this.status = status;
  }
}

export async function fetchResult(participantId: string): Promise<ResultResponse> {
  const res = await fetch(`/api/results/${encodeURIComponent(participantId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const message =
      res.status === 404
        ? data.error === "Participant not found"
          ? "未找到该参与记录（匿名编号可能已失效）。"
          : "该参与者尚未提交任何作答。"
        : "加载结果失败，请稍后重试。";
    throw new ResultFetchError(message, res.status);
  }
  return (await res.json()) as ResultResponse;
}
