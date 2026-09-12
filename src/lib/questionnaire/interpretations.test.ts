import { describe, expect, it } from "vitest";
import {
  getCompositeInterpretation,
  getDomainInterpretation,
  getInterpretations,
  getScales,
} from "./loader";

/**
 * 解读文案的「配置完整性」测试。
 *
 * 为什么值得单独测：文案与量表配置分离存放，最容易发生的缺陷是
 * 「新增了一个维度，却忘了写这个维度的解读」—— 这类问题不会让任何代码报错，
 * 只会让结果页静默少一段说明。此测试把所有维度/合成指数都覆盖一遍，
 * 让这类遗漏在 CI 阶段就暴露。
 */
describe("解读文案配置 · 完整性", () => {
  const tones = ["low", "medium", "high"] as const;

  it("题库中声明的每个维度都有三段（low/medium/high）非空解读", () => {
    const interp = getInterpretations();
    const missing: string[] = [];

    for (const scale of getScales()) {
      for (const d of scale.domains) {
        const text = interp.domains[d.key];
        if (!text) {
          missing.push(`${d.key}(未配置)`);
          continue;
        }
        for (const t of tones) {
          if (!text[t] || text[t].trim().length < 5) {
            missing.push(`${d.key}.${t}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("题库中声明的每个合成指数都有三段非空解读", () => {
    const interp = getInterpretations();
    const missing: string[] = [];

    for (const scale of getScales()) {
      if (!scale.composite) continue;
      const text = interp.composites[scale.composite.key];
      if (!text) {
        missing.push(`${scale.composite.key}(未配置)`);
        continue;
      }
      for (const t of tones) {
        if (!text[t] || text[t].trim().length < 5) {
          missing.push(`${scale.composite.key}.${t}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("取用接口按 key + 分带返回文案，未配置时返回 null 而非空串", () => {
    expect(getDomainInterpretation("O", "high")).toContain("新观念");
    expect(getDomainInterpretation("PU", "low")).toBeTruthy();
    expect(getDomainInterpretation("NOPE", "high")).toBeNull();
    expect(getCompositeInterpretation("ai_adoption_index", "medium")).toBeTruthy();
    expect(getCompositeInterpretation("nope", "low")).toBeNull();
  });

  it("高风险的 N（情绪敏感性）与 CN（担忧）文案不含污名化或绝对化措辞", () => {
    const banned = ["不稳定", "患有", "障碍", "病", "抑郁", "焦虑症"];
    for (const key of ["N", "CN"]) {
      for (const t of tones) {
        const text = getDomainInterpretation(key, t) ?? "";
        for (const w of banned) {
          expect(text, `${key}.${t} 不应包含「${w}」`).not.toContain(w);
        }
      }
    }
  });
});
