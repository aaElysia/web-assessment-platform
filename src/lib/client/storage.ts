"use client";

// 客户端本地存储：匿名参与者 ID 与作答草稿。
// 设计原则：不存任何 PII；草稿仅在本机浏览器，用于刷新/关闭后续答。

export const CONSENT_VERSION = "v1";

export type Demographics = {
  ageRange?: string;
  gender?: string;
  education?: string;
};

export type DraftAnswers = Record<string, number>;

export type DraftState = {
  answers: DraftAnswers;
  demographics: Demographics;
  updatedAt: number;
};

const PID_KEY = "wap_participant_id";
const draftKey = (pid: string) => `wap_draft_${pid}`;

export function getParticipantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PID_KEY);
}

export function setParticipantId(pid: string): void {
  window.localStorage.setItem(PID_KEY, pid);
}

export function getDraft(pid: string): DraftState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftKey(pid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftState;
    if (!parsed.answers) parsed.answers = {};
    if (!parsed.demographics) parsed.demographics = {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(pid: string, state: DraftState): void {
  window.localStorage.setItem(draftKey(pid), JSON.stringify(state));
}

export function clearDraft(pid: string): void {
  window.localStorage.removeItem(draftKey(pid));
}
