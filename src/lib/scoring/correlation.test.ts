import { describe, expect, it } from "vitest";
import type { Answers } from "./score";
import {
  buildDomainSeries,
  correlationMatrix,
  pearsonPairwise,
  type Series,
} from "./correlation";
import {
  logGamma,
  pearsonPValue,
  pearsonR,
  regularizedIncompleteBeta,
  studentTCdf,
} from "./stats";

/**
 * 测试策略：
 *  - 相关系数用**手算值**校验（r = sxy / √(sxx·syy)）。
 *  - p 值用**统计表临界值**反向校验：df=8、双尾 α=0.05 的临界 r = 0.632，
 *    因此 r = 0.632、n = 10 时 p 应 ≈ 0.05。这是独立于实现的第三方基准。
 */

describe("数学基础函数", () => {
  it("logGamma(5) = ln(4!) = ln 24", () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
  });

  it("logGamma(0.5) = ln(√π)", () => {
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });

  it("正则化不完全 Beta 在端点为 0 / 1", () => {
    expect(regularizedIncompleteBeta(2, 3, 0)).toBe(0);
    expect(regularizedIncompleteBeta(2, 3, 1)).toBe(1);
  });

  it("t 分布 CDF：t=0 → 0.5；t=1.96、大自由度 → ≈ 0.975", () => {
    expect(studentTCdf(0, 10)).toBe(0.5);
    expect(studentTCdf(1.96, 100000)).toBeCloseTo(0.975, 3);
    expect(studentTCdf(-1.96, 100000)).toBeCloseTo(0.025, 3);
  });

  it("t 分布 CDF 单调递增", () => {
    const a = studentTCdf(-2, 5);
    const b = studentTCdf(0, 5);
    const c = studentTCdf(2, 5);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("pearsonR —— 已知答案", () => {
  it("手算算例：xs=[1..5], ys=[2,4,5,4,3] → r = 2/√52 ≈ 0.27735", () => {
    const r = pearsonR([1, 2, 3, 4, 5], [2, 4, 5, 4, 3]);
    expect(r).toBeCloseTo(2 / Math.sqrt(52), 10);
  });

  it("完全正相关 → 1；完全负相关 → -1", () => {
    expect(pearsonR([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearsonR([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it("n < 3 → null（相关无定义）", () => {
    expect(pearsonR([1, 2], [2, 4])).toBeNull();
    expect(pearsonR([], [])).toBeNull();
  });

  it("任一序列零方差 → null（而非 NaN 或 0）", () => {
    expect(pearsonR([3, 3, 3, 3], [1, 2, 3, 4])).toBeNull();
    expect(pearsonR([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull();
  });
});

describe("pearsonPValue —— 用统计表临界值校验", () => {
  it("r = 0 → p = 1", () => {
    expect(pearsonPValue(0, 10)).toBeCloseTo(1, 10);
  });

  it("df = 8（n = 10）双尾 α=0.05 的临界 r = 0.632 → p ≈ 0.05", () => {
    const p = pearsonPValue(0.632, 10);
    expect(p).not.toBeNull();
    expect(p as number).toBeCloseTo(0.05, 2);
  });

  it("df = 8 双尾 α=0.01 的临界 r = 0.765 → p ≈ 0.01", () => {
    const p = pearsonPValue(0.765, 10);
    expect(p as number).toBeCloseTo(0.01, 2);
  });

  it("|r| = 1 → p = 0；p 恒在 [0, 1]", () => {
    expect(pearsonPValue(1, 10)).toBe(0);
    expect(pearsonPValue(-1, 10)).toBe(0);
    for (const r of [-0.9, -0.3, 0.1, 0.5, 0.99]) {
      const p = pearsonPValue(r, 12) as number;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("p 随 |r| 增大而减小（df 固定）", () => {
    const p1 = pearsonPValue(0.2, 20) as number;
    const p2 = pearsonPValue(0.5, 20) as number;
    const p3 = pearsonPValue(0.8, 20) as number;
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });

  it("r 为 null 或 n < 3 → null", () => {
    expect(pearsonPValue(null, 10)).toBeNull();
    expect(pearsonPValue(0.5, 2)).toBeNull();
  });
});

describe("pearsonPairwise —— 成对剔除缺失", () => {
  it("按索引配对，跳过任一为 null 的位置", () => {
    const a: Series = { key: "A", name: "A", values: [1, 2, null, 4, 5] };
    const b: Series = { key: "B", name: "B", values: [2, 4, 6, null, 10] };
    const res = pearsonPairwise(a, b);
    // 有效配对：(1,2)、(2,4)、(5,10) → n = 3
    expect(res.n).toBe(3);
    expect(res.r).not.toBeNull();
    expect(res.p).not.toBeNull();
  });

  it("有效配对不足 3 对 → r 为 null，但 n 如实回报", () => {
    const a: Series = { key: "A", name: "A", values: [1, null, null, 4] };
    const b: Series = { key: "B", name: "B", values: [2, 3, null, 5] };
    const res = pearsonPairwise(a, b);
    expect(res.n).toBe(2);
    expect(res.r).toBeNull();
    expect(res.p).toBeNull();
  });

  it("缺失不会被当成 0 参与计算", () => {
    const clean: Series = { key: "A", name: "A", values: [1, 2, 3, 4, 5] };
    const cleanB: Series = { key: "B", name: "B", values: [2, 4, 5, 4, 3] };
    const dirty: Series = { key: "A", name: "A", values: [1, 2, 3, 4, 5] };
    const dirtyB: Series = { key: "B", name: "B", values: [2, 4, 5, 4, null] };
    const r1 = pearsonPairwise(clean, cleanB).r as number;
    const r2 = pearsonPairwise(dirty, dirtyB).r as number;
    expect(r2).not.toBeCloseTo(r1, 6); // 若误当 0，r 会明显变化
    expect(pearsonPairwise(dirty, dirtyB).n).toBe(4);
  });
});

describe("correlationMatrix", () => {
  const series: Series[] = [
    { key: "A", name: "A", values: [1, 2, 3, 4, 5] },
    { key: "B", name: "B", values: [2, 4, 6, 8, 10] },
    { key: "C", name: "C", values: [5, 4, 3, 2, 1] },
  ];

  it("对称、对角线为 1、并给出成对样本量", () => {
    const m = correlationMatrix(series);
    expect(m.keys).toEqual(["A", "B", "C"]);
    for (let i = 0; i < 3; i++) {
      expect(m.matrix[i][i]).toBe(1);
      expect(m.counts[i][i]).toBe(5);
      for (let j = 0; j < 3; j++) {
        expect(m.matrix[i][j]).toBeCloseTo(m.matrix[j][i] as number, 12);
        expect(m.counts[i][j]).toBe(m.counts[j][i]);
      }
    }
    expect(m.matrix[0][1]).toBeCloseTo(1, 12); // A、B 完全正相关
    expect(m.matrix[0][2]).toBeCloseTo(-1, 12); // A、C 完全负相关
  });

  it("零方差序列的对角线为 null（相关系数无定义）", () => {
    const m = correlationMatrix([
      { key: "A", name: "A", values: [3, 3, 3, 3] },
      { key: "B", name: "B", values: [1, 2, 3, 4] },
    ]);
    expect(m.matrix[0][0]).toBeNull();
    expect(m.matrix[0][1]).toBeNull();
  });
});

describe("buildDomainSeries —— 与真实题库对接", () => {
  function uniform(value: number): Answers {
    const a: Answers = {};
    for (const s of [
      ["O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8"],
      ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
      ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"],
      ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"],
      ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"],
      ["PU1", "PU2", "PU3", "PU4"],
      ["TR1", "TR2", "TR3", "TR4"],
      ["WA1", "WA2", "WA3", "WA4"],
      ["LA1", "LA2", "LA3", "LA4"],
      ["CN1", "CN2", "CN3", "CN4"],
    ].flat()) {
      a[s] = value;
    }
    return a;
  }

  it("输出 10 个维度序列（Big Five 5 + AI 5），长度等于被试数", () => {
    const s = buildDomainSeries([uniform(3), uniform(4), uniform(2)]);
    expect(s).toHaveLength(10);
    for (const x of s) expect(x.values).toHaveLength(3);
    expect(s.map((x) => x.key)).toEqual([
      "O", "C", "E", "A", "N",
      "PU", "TR", "WA", "LA", "CN",
    ]);
  });

  it("维度 incomplete 的被试在该序列上记 null（不会伪造分数）", () => {
    const broken = uniform(3);
    delete broken.O1;
    delete broken.O2; // O 维度缺 2 题 → incomplete
    const s = buildDomainSeries([uniform(3), broken]);
    const o = s.find((x) => x.key === "O")!;
    expect(o.values[0]).not.toBeNull();
    expect(o.values[1]).toBeNull();
  });
});
