import { describe, it, expect } from "vitest";
import { scoreAll } from "@/lib/scoring/score";
import { getPublicQuestionnaire } from "@/lib/questionnaire/loader";
import type { ResultPayload } from "@/lib/client/api";
import {
  findScaleByType,
  formatScore,
  hasIncompleteDomains,
  toBarData,
  toRadarData,
} from "./view-model";

/**
 * 结果页「数据链」回归测试：真实引擎输出 → JSON → 视图模型。
 *
 * 为什么单独存在这一层（而不是只测手写 fixture）：
 *  1. `view-model.test.ts` 用的是**手写 fixture**，fixture 里的 `type` 是我自己填的，
 *     而真实引擎输出当时并没有 `type` —— fixture 与真实数据漂移，单测全绿但页面全空。
 *     教训：**验证渲染逻辑时，输入必须来自真实产出，不能只用手捏的数据。**
 *  2. 结果页是客户端渲染，HTTP 层的 E2E 只能断言外壳（200 + 布局文案），
 *     断言不到维度分数是否真的渲染出来。
 *
 * 特别保留 JSON 往返这一环：`undefined` 字段会被 `JSON.stringify` 丢弃，
 * 这正是本次线上故障的成因（引擎给出 type=undefined，浏览器收到的是「没有 type」）。
 * 若有人把 `type` 从题库里删掉，下面第一个用例会立刻变红。
 */

/** 模拟 HTTP 边界：真实响应体就是引擎输出经过 JSON 序列化后的结果。 */
function asTransportPayload(answers: Record<string, number>): ResultPayload {
  return JSON.parse(JSON.stringify(scoreAll(answers))) as ResultPayload;
}

/** 全部题目答同一个值（3 为量表中点，反向题重编码后仍是 3，便于校验口径）。 */
function allAnswers(value: number): Record<string, number> {
  const items = getPublicQuestionnaire().scales.flatMap((s) => s.items);
  return Object.fromEntries(items.map((i) => [i.code, value]));
}

describe("结果数据链（真实引擎输出 → JSON → 视图模型）", () => {
  const payload = asTransportPayload(allAnswers(3));

  it("两个量表经传输后仍带有非空 type（undefined 会被 JSON 静默丢弃）", () => {
    expect(payload.scales.length).toBe(2);
    expect(
      payload.scales.every((s) => typeof s.type === "string" && s.type.length > 0)
    ).toBe(true);
    expect(payload.scales.map((s) => s.type).sort()).toEqual([
      "attitude",
      "personality",
    ]);
  });

  it("结果页能定位大五量表并产出 5 个雷达轴（定位失败即整页无内容）", () => {
    const bigFive = findScaleByType(payload, "personality");
    expect(bigFive).not.toBeNull();
    expect(bigFive!.scaleKey).toBe("big_five");

    const radar = toRadarData(bigFive);
    expect(radar.map((d) => d.key)).toEqual(["O", "C", "E", "A", "N"]);
    expect(
      radar.every((d) => Number.isFinite(d.score) && d.score >= 0 && d.score <= 5)
    ).toBe(true);
    // 每个轴都能格式化成真实数字，而不是 null 占位的「—」
    expect(radar.every((d) => formatScore(d.score) !== "—")).toBe(true);
  });

  it("结果页能定位 AI 量表并产出 5 根柱子，且 CN 被标记为反向语义", () => {
    const ai = findScaleByType(payload, "attitude");
    expect(ai).not.toBeNull();
    expect(ai!.scaleKey).toBe("ai_adoption");

    const bars = toBarData(ai);
    expect(bars.map((b) => b.key)).toEqual(["PU", "TR", "WA", "LA", "CN"]);
    expect(bars.find((b) => b.key === "CN")?.concern).toBe(true);
    expect(bars.filter((b) => b.key !== "CN").every((b) => !b.concern)).toBe(true);
    expect(bars.every((b) => formatScore(b.score) !== "—")).toBe(true);
  });

  it("合成指数可直接展示：有数值、有分带、有公式", () => {
    const ai = findScaleByType(payload, "attitude");
    expect(ai?.composite).toBeTruthy();
    expect(Number.isFinite(ai!.composite!.score)).toBe(true);
    expect(ai!.composite!.band).toBeTruthy();
    expect(ai!.composite!.formula.length).toBeGreaterThan(0);
    expect(formatScore(ai!.composite!.score)).toMatch(/^\d+\.\d{2}$/);
  });

  it("全部答量表中点 3 时，所有维度分与合成指数都应恰为 3（口径自检）", () => {
    const radar = toRadarData(findScaleByType(payload, "personality"));
    const bars = toBarData(findScaleByType(payload, "attitude"));
    const composite = findScaleByType(payload, "attitude")?.composite;

    for (const p of [...radar, ...bars]) {
      expect(Math.abs(p.score - 3)).toBeLessThan(1e-9);
    }
    expect(Math.abs((composite?.score ?? NaN) - 3)).toBeLessThan(1e-9);
    expect(payload.completionRate).toBe(1);
    expect(hasIncompleteDomains(payload)).toBe(false);
  });

  it("作答不全时仍能定位量表（不可评分维度留给 UI 显式提示，而不是让整页消失）", () => {
    const partial = allAnswers(3);
    // 只答前 10 题，其余留空
    const keys = Object.keys(partial);
    for (const k of keys.slice(10)) delete partial[k];

    const p = asTransportPayload(partial);
    const bigFive = findScaleByType(p, "personality");
    const ai = findScaleByType(p, "attitude");

    expect(bigFive).not.toBeNull();
    expect(ai).not.toBeNull();
    // 量表定位成功即为本用例的核心：图表数据可以少，但页面不能空白
    expect(toRadarData(bigFive).length).toBe(5);
  });
});
