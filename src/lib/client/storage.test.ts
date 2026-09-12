import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CONSENT_VERSION,
  getParticipantId,
  setParticipantId,
  getDraft,
  saveDraft,
  clearDraft,
} from "@/lib/client/storage";

// 用内存 Map 模拟 localStorage（node 环境无 window）。
function createLocalStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

// 草稿持久化契约测试：这是"刷新/关闭后可续答"这一用户可见行为的核心逻辑。
describe("client/storage — 草稿持久化与续答", () => {
  let store: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    store = createLocalStorageMock();
    vi.stubGlobal("window", { localStorage: store });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("participantId 写入后可读回", () => {
    setParticipantId("pid-abc");
    expect(getParticipantId()).toBe("pid-abc");
  });

  it("草稿保存后可完整恢复（等价于刷新续答）", () => {
    saveDraft("pid-1", {
      answers: { O1: 5, O5: 1, PU1: 4 },
      demographics: { ageRange: "18-25" },
      updatedAt: 1699999999999,
    });
    const d = getDraft("pid-1");
    expect(d).not.toBeNull();
    expect(d!.answers).toEqual({ O1: 5, O5: 1, PU1: 4 });
    expect(d!.demographics.ageRange).toBe("18-25");
    expect(d!.updatedAt).toBe(1699999999999);
  });

  it("不同参与者的草稿互不串扰", () => {
    saveDraft("pid-1", { answers: { O1: 1 }, demographics: {}, updatedAt: 1 });
    saveDraft("pid-2", { answers: { O2: 2 }, demographics: {}, updatedAt: 2 });
    expect(getDraft("pid-1")!.answers).toEqual({ O1: 1 });
    expect(getDraft("pid-2")!.answers).toEqual({ O2: 2 });
  });

  it("提交后清除草稿", () => {
    saveDraft("pid-1", { answers: { O1: 1 }, demographics: {}, updatedAt: 1 });
    clearDraft("pid-1");
    expect(getDraft("pid-1")).toBeNull();
  });

  it("损坏的草稿不抛错，安全降级为 null", () => {
    store.setItem("wap_draft_pid-x", "{not valid json");
    expect(getDraft("pid-x")).toBeNull();
  });

  it("未知参与者无草稿时返回 null", () => {
    expect(getDraft("never-saved")).toBeNull();
  });

  it("知情同意版本常量为 v1", () => {
    expect(CONSENT_VERSION).toBe("v1");
  });
});
