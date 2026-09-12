import { describe, expect, it } from "vitest";
import { sortParticipantRows, type ParticipantRow } from "./types";

/**
 * `sortParticipantRows` 是纯函数（不依赖 DB），单独覆盖排序与 null 处理。
 */

function row(over: Partial<ParticipantRow> & { id: string }): ParticipantRow {
  return {
    id: over.id,
    shortId: over.id.slice(0, 8),
    createdAt: over.createdAt ?? "2026-01-01T00:00:00.000Z",
    status: over.status ?? "created",
    session: over.session ?? null,
    submittedAt: over.submittedAt ?? over.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("sortParticipantRows", () => {
  const a = row({
    id: "a",
    submittedAt: "2026-01-01T10:00:00.000Z",
    createdAt: "2026-01-01T09:00:00.000Z",
    session: { startedAt: "2026-01-01T09:30:00.000Z", completedAt: null, status: "in_progress", itemCount: 3 },
  });
  const b = row({
    id: "b",
    submittedAt: "2026-01-02T10:00:00.000Z",
    createdAt: "2026-01-02T09:00:00.000Z",
    session: { startedAt: "2026-01-02T09:30:00.000Z", completedAt: "2026-01-02T10:00:00.000Z", status: "completed", itemCount: 60 },
  });
  const c = row({
    id: "c", // 无会话：startedAt 为 null
    submittedAt: "2026-01-03T10:00:00.000Z",
    createdAt: "2026-01-03T09:00:00.000Z",
    session: null,
  });

  it("默认 submittedAt 降序，最新在顶部", () => {
    const out = sortParticipantRows([a, b, c], "submittedAt", "desc");
    expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("submittedAt 升序，最旧在顶部", () => {
    const out = sortParticipantRows([c, b, a], "submittedAt", "asc");
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("startedAt 排序时，无会话(null)永远垫底，与方向无关", () => {
    const desc = sortParticipantRows([c, a, b], "startedAt", "desc");
    expect(desc[desc.length - 1].id).toBe("c");
    const asc = sortParticipantRows([c, a, b], "startedAt", "asc");
    expect(asc[asc.length - 1].id).toBe("c");
  });

  it("startedAt 降序：有会话的按开始时间倒序", () => {
    const out = sortParticipantRows([a, b, c], "startedAt", "desc");
    expect(out.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("createdAt 排序（恒有值）按创建时间升降", () => {
    const desc = sortParticipantRows([a, b, c], "createdAt", "desc");
    expect(desc.map((r) => r.id)).toEqual(["c", "b", "a"]);
    const asc = sortParticipantRows([c, b, a], "createdAt", "asc");
    expect(asc.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("不修改入参数组（返回新数组）", () => {
    const input = [a, b, c];
    const inputIds = input.map((r) => r.id);
    const out = sortParticipantRows(input, "submittedAt", "asc");
    expect(input.map((r) => r.id)).toEqual(inputIds); // 原数组顺序不变
    expect(out).not.toBe(input); // 不同引用
  });
});
