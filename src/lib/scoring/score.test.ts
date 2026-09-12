import { describe, expect, it } from "vitest";
import { getScales } from "@/lib/questionnaire/loader";
import {
  computeAiAdoptionIndex,
  interpretBand,
  reverseRecode,
  scoreAll,
  type Answers,
  type ScoreResult,
} from "./score";

// ---------------------------------------------------------------------------
// 测试夹具：直接读取真实题库，保证测试与线上配置同源（而非另造一份假题库）。
// ---------------------------------------------------------------------------

function allItems(): { id: string; reverse: boolean }[] {
  return getScales().flatMap((s) => s.items.map((i) => ({ id: i.id, reverse: i.reverse })));
}

/** 所有题给同一个值。 */
function uniform(value: number): Answers {
  const a: Answers = {};
  for (const it of allItems()) a[it.id] = value;
  return a;
}

/** 「一致作答」：正向题给 p、反向题给 r，使重编码后全部相等（= p 若 r = 6-p）。 */
function aligned(positive: number, reverse: number): Answers {
  const a: Answers = {};
  for (const it of allItems()) a[it.id] = it.reverse ? reverse : positive;
  return a;
}

function domain(result: ScoreResult, scaleKey: string, domainKey: string) {
  const scale = result.scales.find((s) => s.scaleKey === scaleKey);
  const d = scale?.domains.find((x) => x.key === domainKey);
  if (!d) throw new Error(`domain ${scaleKey}/${domainKey} not found`);
  return d;
}

function scaleOf(result: ScoreResult, scaleKey: string) {
  const s = result.scales.find((x) => x.scaleKey === scaleKey);
  if (!s) throw new Error(`scale ${scaleKey} not found`);
  return s;
}

// ---------------------------------------------------------------------------

describe("reverseRecode（反向重编码）", () => {
  it("5 点制：recoded = 6 - value", () => {
    expect(reverseRecode(1)).toBe(5);
    expect(reverseRecode(2)).toBe(4);
    expect(reverseRecode(3)).toBe(3);
    expect(reverseRecode(4)).toBe(2);
    expect(reverseRecode(5)).toBe(1);
  });

  it("中性值 3 是重编码的不动点", () => {
    expect(reverseRecode(3)).toBe(3);
  });

  it("double reverse 回到原值（用于验证不会误翻转两次）", () => {
    expect(reverseRecode(reverseRecode(2))).toBe(2);
  });
});

describe("scoreAll —— 已知答案校验（误差 < 1e-6）", () => {
  it("全 3 分作答 → 所有维度分与合成指数均为 3.0", () => {
    const r = scoreAll(uniform(3));
    for (const s of r.scales) {
      for (const d of s.domains) {
        expect(d.score).not.toBeNull();
        expect(Math.abs((d.score as number) - 3)).toBeLessThan(1e-6);
        expect(d.imputed).toBe(false);
        expect(d.incomplete).toBe(false);
      }
    }
    const composite = scaleOf(r, "ai_adoption").composite;
    expect(composite).not.toBeNull();
    expect(Math.abs((composite!.score as number) - 3)).toBeLessThan(1e-6);
  });

  it("框架文档示例：某维度含一半反向题且全给 5 → 重编码后均值 3.0", () => {
    // O 维度：O1–O4 正向、O5–O8 反向；全给 5 → recoded [5,5,5,5,1,1,1,1] → 3.0
    const o = domain(scoreAll(uniform(5)), "big_five", "O");
    expect(Math.abs((o.score as number) - 3)).toBeLessThan(1e-6);
  });

  it("全 5 分（默认同意偏差）不会把 Big Five 全推高 —— 反向题起到抑制作用", () => {
    const r = scoreAll(uniform(5));
    for (const d of scaleOf(r, "big_five").domains) {
      expect(Math.abs((d.score as number) - 3)).toBeLessThan(1e-6);
    }
    // AI 量表为 3 正 + 1 反：全 5 → PU/TR/WA/LA 仍为 3.0，CN（3 正 1 反）为 4.0
    for (const key of ["PU", "TR", "WA", "LA"]) {
      expect(Math.abs((domain(r, "ai_adoption", key).score as number) - 3)).toBeLessThan(1e-6);
    }
    expect(Math.abs((domain(r, "ai_adoption", "CN").score as number) - 4)).toBeLessThan(1e-6);
    // 合成指数 = (mean(PU,TR,WA,LA)=3 + (6 - 4)) / 2 = 2.5
    expect(Math.abs((scaleOf(r, "ai_adoption").composite!.score as number) - 2.5)).toBeLessThan(1e-6);
  });

  it("全 1 分 → Big Five 同样回到 3.0（对称性）", () => {
    const r = scoreAll(uniform(1));
    for (const d of scaleOf(r, "big_five").domains) {
      expect(Math.abs((d.score as number) - 3)).toBeLessThan(1e-6);
    }
  });

  it("最大限度「一致作答」（正向 5 / 反向 1）→ 所有维度分 = 5.0", () => {
    const r = scoreAll(aligned(5, 1));
    for (const s of r.scales) {
      for (const d of s.domains) {
        expect(Math.abs((d.score as number) - 5)).toBeLessThan(1e-6);
      }
    }
    // CN 达到最大担忧 5；合成指数 = (5 + (6-5))/2 = 3.0（担忧抵消了正向态度）
    expect(Math.abs((scaleOf(r, "ai_adoption").composite!.score as number) - 3)).toBeLessThan(1e-6);
  });

  it("反向一致作答（正向 1 / 反向 5）→ 所有维度分 = 1.0，合成指数 = 3.0", () => {
    const r = scoreAll(aligned(1, 5));
    for (const s of r.scales) {
      for (const d of s.domains) {
        expect(Math.abs((d.score as number) - 1)).toBeLessThan(1e-6);
      }
    }
    expect(Math.abs((scaleOf(r, "ai_adoption").composite!.score as number) - 3)).toBeLessThan(1e-6);
  });
});

describe("反向题专项：只作答单个维度", () => {
  it("O 维度：正向全 5 + 反向全 1 → 5.0（若漏掉重编码则会是 3.0）", () => {
    const r = scoreAll({ O1: 5, O2: 5, O3: 5, O4: 5, O5: 1, O6: 1, O7: 1, O8: 1 });
    const o = domain(r, "big_five", "O");
    expect(Math.abs((o.score as number) - 5)).toBeLessThan(1e-6);
    expect(o.answered).toBe(8);
  });

  it("O 维度：正向全 5 + 反向也全 5 → 3.0（反向题被正确翻转）", () => {
    const r = scoreAll({ O1: 5, O2: 5, O3: 5, O4: 5, O5: 5, O6: 5, O7: 5, O8: 5 });
    expect(
      Math.abs((domain(r, "big_five", "O").score as number) - 3)
    ).toBeLessThan(1e-6);
  });

  it("CN4（反向的「放心」题）只翻转一次：CN1..3=5、CN4=1 → CN = 5.0（最大担忧）", () => {
    const r = scoreAll({ CN1: 5, CN2: 5, CN3: 5, CN4: 1 });
    const cn = domain(r, "ai_adoption", "CN");
    expect(cn.answered).toBe(4);
    expect(Math.abs((cn.score as number) - 5)).toBeLessThan(1e-6);
  });

  it("CN4 给 5（很放心）→ 重编码为 1，CN = (5+5+5+1)/4 = 4.0", () => {
    const r = scoreAll({ CN1: 5, CN2: 5, CN3: 5, CN4: 5 });
    const cn = domain(r, "ai_adoption", "CN");
    expect(Math.abs((cn.score as number) - 4)).toBeLessThan(1e-6);
  });
});

describe("缺失值策略", () => {
  const base = { O1: 4, O2: 4, O3: 4, O4: 4, O5: 2, O6: 2, O7: 2 }; // 7 题，缺 O8

  it("缺失 1 题 → 用该维度均值填补，标记 imputed、不算 incomplete", () => {
    const r = scoreAll(base);
    const o = domain(r, "big_five", "O");
    // recoded = [4,4,4,4,4,4,4] → 4.0
    expect(o.answered).toBe(7);
    expect(o.missing).toBe(1);
    expect(o.imputed).toBe(true);
    expect(o.incomplete).toBe(false);
    expect(Math.abs((o.score as number) - 4)).toBeLessThan(1e-6);
  });

  it("缺失 2 题 → 维度标志 incomplete、score 为 null", () => {
    const r = scoreAll({ ...base, O7: undefined as unknown as number });
    const o = domain(r, "big_five", "O");
    expect(o.missing).toBe(2);
    expect(o.incomplete).toBe(true);
    expect(o.imputed).toBe(false);
    expect(o.score).toBeNull();
    expect(o.band).toBeNull();
  });

  it("某维度完全未作答 → incomplete，score 为 null（不会被当成 0）", () => {
    const r = scoreAll({ C1: 3, C2: 3, C3: 3, C4: 3, C5: 3, C6: 3, C7: 3, C8: 3 });
    const o = domain(r, "big_five", "O");
    expect(o.answered).toBe(0);
    expect(o.score).toBeNull();
    expect(o.incomplete).toBe(true);
  });

  it("缺失值不会被当成 0 分而拉低维度分", () => {
    // 正向 4 / 反向 2 → 重编码后 O 维度全部为 4
    const full = scoreAll(aligned(4, 2));
    const withMissing = scoreAll({ ...aligned(4, 2), O8: undefined as unknown as number });
    expect(Math.abs((domain(full, "big_five", "O").score as number) - 4)).toBeLessThan(1e-6);
    expect(
      Math.abs((domain(withMissing, "big_five", "O").score as number) - 4)
    ).toBeLessThan(1e-6);
    expect(domain(withMissing, "big_five", "O").imputed).toBe(true);
  });
});

describe("AI 采纳态度合成指数", () => {
  it("正向维度 5、担忧 1 → 5.0（最积极）", () => {
    const idx = computeAiAdoptionIndex({ PU: 5, TR: 5, WA: 5, LA: 5, CN: 1 });
    expect(Math.abs((idx as number) - 5)).toBeLessThan(1e-6);
  });

  it("正向维度 1、担忧 5 → 1.0（最消极）", () => {
    const idx = computeAiAdoptionIndex({ PU: 1, TR: 1, WA: 1, LA: 1, CN: 5 });
    expect(Math.abs((idx as number) - 1)).toBeLessThan(1e-6);
  });

  it("正向维度 4、担忧 2 → 4.0", () => {
    const idx = computeAiAdoptionIndex({ PU: 4, TR: 4, WA: 4, LA: 4, CN: 2 });
    expect(Math.abs((idx as number) - 4)).toBeLessThan(1e-6);
  });

  it("任一子维度不可用 → 返回 null（不做部分合成）", () => {
    expect(computeAiAdoptionIndex({ PU: 4, TR: 4, WA: 4, LA: 4, CN: null })).toBeNull();
    expect(computeAiAdoptionIndex({ PU: null, TR: 4, WA: 4, LA: 4, CN: 2 })).toBeNull();
    expect(computeAiAdoptionIndex({ PU: 4, TR: 4, WA: 4, LA: 4 })).toBeNull();
  });

  it("通过 scoreAll 端到端：CN 缺失 2 题 → composite 为 null", () => {
    const r = scoreAll({ PU1: 4, PU2: 4, PU3: 2, PU4: 2, TR1: 4, TR2: 4, TR3: 2, TR4: 2, WA1: 4, WA2: 4, WA3: 2, WA4: 2, LA1: 4, LA2: 4, LA3: 2, LA4: 2, CN1: 5, CN2: 5 });
    expect(scaleOf(r, "ai_adoption").composite!.score).toBeNull();
  });
});

describe("完成度统计", () => {
  it("忽略题库中不存在的 code，避免脏数据抬高完成度", () => {
    const r = scoreAll({ O1: 5, O2: 5, ZZZ: 5 });
    expect(r.itemTotal).toBe(60);
    expect(r.answeredTotal).toBe(2);
    // 引擎对 completionRate 保留 4 位小数（稳定 JSON 输出）
    expect(r.completionRate).toBeCloseTo(2 / 60, 4);
    expect(r.completionRate).toBe(0.0333);
  });

  it("全量作答完成度 = 1", () => {
    const r = scoreAll(uniform(3));
    expect(r.answeredTotal).toBe(60);
    expect(r.completionRate).toBe(1);
  });
});

describe("interpretBand（启发式分带）", () => {
  it("按框架文档阈值分带", () => {
    expect(interpretBand(1.0)?.tone).toBe("low");
    expect(interpretBand(2.5)?.tone).toBe("low");
    expect(interpretBand(2.51)?.tone).toBe("medium");
    expect(interpretBand(3.49)?.tone).toBe("medium");
    expect(interpretBand(3.5)?.tone).toBe("high");
    expect(interpretBand(5)?.tone).toBe("high");
  });

  it("null / 非有限值 → null", () => {
    expect(interpretBand(null)).toBeNull();
    expect(interpretBand(Number.NaN)).toBeNull();
    expect(interpretBand(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("引擎输出的维度分始终带 band（分数可用时）", () => {
    const r = scoreAll(uniform(4));
    for (const s of r.scales) {
      for (const d of s.domains) {
        expect(d.band).not.toBeNull();
      }
    }
  });
});

describe("Big Five 不参与合成指数", () => {
  it("big_five 的 composite 为 null", () => {
    expect(scaleOf(scoreAll(uniform(3)), "big_five").composite).toBeNull();
  });

  it("题库共 2 个量表、10 个维度（5 + 5）", () => {
    const r = scoreAll(uniform(3));
    expect(r.scales).toHaveLength(2);
    expect(r.scales.flatMap((s) => s.domains)).toHaveLength(10);
  });
});
