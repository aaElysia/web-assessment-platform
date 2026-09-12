import { describe, it, expect } from "vitest";
import {
  getPublicQuestionnaire,
  getItemIndex,
  getLikert,
} from "@/lib/questionnaire/loader";

// 配置驱动契约测试：题库结构、题目唯一性、量表题量与 Likert 口径。
// 任何对 question-bank.json 的改动若破坏这些不变量，测试会立即失败。
describe("questionnaire loader — 配置驱动契约", () => {
  it("返回两个量表：big_five(40) 与 ai_adoption(20)", () => {
    const q = getPublicQuestionnaire();
    const bf = q.scales.find((s) => s.key === "big_five");
    const ai = q.scales.find((s) => s.key === "ai_adoption");
    expect(bf).toBeTruthy();
    expect(ai).toBeTruthy();
    expect(bf!.items.length).toBe(40);
    expect(ai!.items.length).toBe(20);
  });

  // 回归：题库曾漏写 scale.type，导致评分引擎输出 type=undefined，
  // 而结果页按 type 找量表 → 整页无内容（标题在、图表与明细全空）。
  // 这里把 type 作为题库的硬契约钉死。
  it("每个量表都声明了合法且互不重复的 type（personality / attitude）", () => {
    const q = getPublicQuestionnaire();
    const types = q.scales.map((s) => s.type);
    expect(types.every((t) => t === "personality" || t === "attitude")).toBe(true);
    expect(new Set(types).size).toBe(types.length);
    expect(q.scales.find((s) => s.key === "big_five")?.type).toBe("personality");
    expect(q.scales.find((s) => s.key === "ai_adoption")?.type).toBe("attitude");
  });

  it("每道题都有非空且唯一的 code（供客户端提交与后端解析）", () => {
    const q = getPublicQuestionnaire();
    const items = q.scales.flatMap((s) => s.items);
    expect(items.length).toBe(60);
    expect(items.every((i) => typeof i.code === "string" && i.code.length > 0)).toBe(true);
    expect(new Set(items.map((i) => i.code)).size).toBe(items.length);
  });

  it("每道题所属的 domain 均有对应的维度声明", () => {
    const q = getPublicQuestionnaire();
    for (const scale of q.scales) {
      const domainKeys = new Set(scale.domains.map((d) => d.key));
      expect(scale.items.every((i) => domainKeys.has(i.domain))).toBe(true);
    }
  });

  it("Likert 为 5 点，且选项值连续 1..5", () => {
    const likert = getLikert();
    expect(likert.scale).toBe(5);
    expect(likert.options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("itemIndex 覆盖全部 60 题且含反向标记", () => {
    const idx = getItemIndex();
    expect(Object.keys(idx).length).toBe(60);
    // O5 在设计上为反向题，作为反向标记的哨兵校验
    expect(idx["O5"]?.reverse).toBe(true);
    // O1 为正向题
    expect(idx["O1"]?.reverse).toBe(false);
  });

  it("反向题总数与设计一致（Big Five 20 + AI 9 = 29）", () => {
    const items = getPublicQuestionnaire().scales.flatMap((s) => s.items);
    const reverseCount = items.filter((i) => i.reverse).length;
    expect(reverseCount).toBe(29);
  });
});
