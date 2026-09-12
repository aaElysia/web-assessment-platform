import { describe, expect, it } from "vitest";
import { getScales, type BankItem, type BankScale } from "@/lib/questionnaire/loader";
import type { AdminRecord } from "./types";
import {
  analyzeCorrelation,
  analyzeItems,
  analyzeReliability,
  bootstrapAlphaCI,
  meanInterItemR,
  mulberry32,
  percentile,
} from "./analysis";

const SCALES: BankScale[] = getScales();
const BIG_FIVE = SCALES.find((s) => s.key === "big_five")!;
const AI = SCALES.find((s) => s.key === "ai_adoption")!;
const O_IDS = BIG_FIVE.domains.find((d) => d.key === "O")!.itemIds;

function makeRecord(id: string, answers: Record<string, number>): AdminRecord {
  return {
    id,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    status: "completed",
    consentAt: null,
    ageRange: null,
    gender: null,
    education: null,
    session: {
      startedAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: new Date("2026-01-01T00:05:00Z"),
      answers,
    },
  };
}

/**
 * 造一名被试：`fn` 接收题目元数据，返回**重编码后**的目标分（1..5）。
 * 内部按 reverse 标记还原为原始作答，因此测试中看到的矩阵就是引擎眼中的矩阵，
 * 不受反向题标记干扰。
 */
function recordRecoded(id: string, fn: (item: BankItem) => number): AdminRecord {
  const answers: Record<string, number> = {};
  for (const s of SCALES) {
    for (const it of s.items) {
      const target = Math.max(1, Math.min(5, Math.round(fn(it))));
      answers[it.id] = it.reverse ? 6 - target : target;
    }
  }
  return makeRecord(id, answers);
}

/** 造一名「所有题都给同一**原始**分」的被试（用于检验原始分布与地板/天花板判定）。 */
function flatRaw(id: string, value: number): AdminRecord {
  const answers: Record<string, number> = {};
  for (const s of SCALES) for (const it of s.items) answers[it.id] = value;
  return makeRecord(id, answers);
}

/** 造一名「所有题都给同一重编码分」的被试。 */
function flat(id: string, value: number): AdminRecord {
  return recordRecoded(id, () => value);
}

/** 造一名缺题的被试（从完整作答里删掉指定 code）。 */
function without(id: string, codes: string[], value = 3): AdminRecord {
  const r = flat(id, value);
  for (const c of codes) delete r.session!.answers[c];
  return r;
}

describe("统计小工具", () => {
  it("mulberry32 同种子输出完全一致（可复现的前提）", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  it("percentile 线性插值；空数组返回 NaN", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(percentile([1], 0.5)).toBe(1);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });

  it("meanInterItemR 由 α 与 k 正确反解", () => {
    // α = k·r̄ / (1 + (k−1)·r̄)，k=8、α=0.75 → r̄ = 0.75 / (8 − 5.25) = 0.2727
    expect(meanInterItemR(0.75, 8)).toBeCloseTo(0.2727, 3);
    // k=4、α=0.7273 → r̄ = 0.7273/(4−2.1818) = 0.4
    expect(meanInterItemR(0.7273, 4)).toBeCloseTo(0.4, 3);
  });

  it("meanInterItemR 对无定义输入返回 null，对零方差特判返回 1", () => {
    expect(meanInterItemR(null, 8)).toBeNull();
    expect(meanInterItemR(0.7, 1)).toBeNull(); // k < 2
    // α = k/(k−1) 只在「题内零方差、完美一致」时出现，此时 r̄ 语义上为 1
    expect(meanInterItemR(8 / 7, 8)).toBe(1);
  });
});

describe("α 的 bootstrap 置信区间", () => {
  const rows = [
    [5, 4, 5, 4, 5, 4],
    [4, 3, 4, 3, 4, 3],
    [3, 2, 3, 2, 3, 2],
    [5, 5, 4, 5, 4, 5],
    [2, 1, 2, 1, 2, 1],
    [4, 4, 5, 4, 5, 4],
  ];

  it("返回升序区间且包含点估计附近范围", () => {
    const ci = bootstrapAlphaCI(rows, 400, 7);
    expect(ci).not.toBeNull();
    expect(ci!.hi).toBeGreaterThanOrEqual(ci!.lo);
    // 该矩阵内部高度一致，α 应处于高位
    expect(ci!.lo).toBeGreaterThan(0.5);
  });

  it("同种子两次调用结果完全一致（刷新页面数字不会漂移）", () => {
    expect(bootstrapAlphaCI(rows, 300, 99)).toEqual(bootstrapAlphaCI(rows, 300, 99));
  });

  it("不同种子会给出略有差异的区间（说明确实在重抽样）", () => {
    const a = bootstrapAlphaCI(rows, 300, 1);
    const b = bootstrapAlphaCI(rows, 300, 2);
    expect(a).not.toEqual(b);
  });

  it("总分为零方差的数据 → 区间不可得，返回 null（不硬凑）", () => {
    expect(bootstrapAlphaCI([[3, 3, 3], [3, 3, 3]], 50, 1)).toBeNull();
  });

  it("样本不足（n < 2）→ null", () => {
    expect(bootstrapAlphaCI([[3, 3, 3]], 50, 1)).toBeNull();
  });
});

describe("analyzeReliability", () => {
  it("覆盖题库中全部量表 × 维度，且 k 与题库一致", () => {
    const res = analyzeReliability([flat("a", 3), flat("b", 4)], { bootstrap: 50 });
    const expected = SCALES.flatMap((s) => s.domains.map((d) => [s.key, d.key]));
    expect(res.rows.length).toBe(expected.length);
    for (const row of res.rows) {
      const scale = SCALES.find((s) => s.key === row.scaleKey)!;
      const domain = scale.domains.find((d) => d.key === row.domainKey)!;
      expect(row.k).toBe(domain.itemIds.length);
    }
    expect(res.rows.find((r) => r.domainKey === "O")!.k).toBe(O_IDS.length);
  });

  it("所有被试作答完全相同 → α 无定义（null + 原因），绝不给 0 或 1", () => {
    const res = analyzeReliability([flat("a", 3), flat("b", 3), flat("c", 3)], {
      bootstrap: 50,
    });
    for (const row of res.rows) {
      expect(row.alpha).toBeNull();
      expect(row.grade).toBeNull();
      expect(row.reason).toBeTruthy();
      expect(row.ci).toBeNull();
    }
  });

  it("题间完全一致 + 跨被试有差异 → α = 1，题目平均相关为 1", () => {
    // 每位被试所有题同分且彼此不同 → 各题在跨被试上完全同序 → 完美一致
    const res = analyzeReliability(
      [flat("a", 2), flat("b", 3), flat("c", 4)],
      { bootstrap: 50 }
    );
    const o = res.rows.find((r) => r.domainKey === "O")!;
    expect(o.alpha).toBeCloseTo(1, 4);
    expect(o.meanInterItemR).toBe(1);
  });

  it("维度内题目自相矛盾 → α 为负并如实返回（不在引擎层截断为 0）", () => {
    // 前 4 题与后 4 题呈相反模式，第三名被试用中间值打破总分零方差
    const cont = (it: BankItem) => (O_IDS.indexOf(it.id) < 4 ? 5 : 1);
    const flipped = (it: BankItem) => (O_IDS.indexOf(it.id) < 4 ? 1 : 5);
    const res = analyzeReliability(
      [
        recordRecoded("a", cont),
        recordRecoded("b", flipped),
        recordRecoded("c", (it) => (O_IDS.includes(it.id) ? 2 : 3)),
      ],
      { bootstrap: 50 }
    );
    const o = res.rows.find((r) => r.domainKey === "O")!;
    expect(o.alpha).not.toBeNull();
    expect(o.alpha!).toBeLessThan(0);
    expect(o.grade).toBe("偏低（< 0.60）");
    expect(res.warnings.some((w) => w.includes("α < 0"))).toBe(true);
  });

  it("缺失任意一题的被试整行剔除，并回报剔除人数", () => {
    const res = analyzeReliability(
      [without("a", [O_IDS[0]!]), flat("b", 3), flat("c", 4), flat("d", 5)],
      { bootstrap: 50 }
    );
    const o = res.rows.find((r) => r.domainKey === "O")!;
    expect(o.droppedIncomplete).toBe(1);
    expect(o.n).toBe(3);
    // 被剔除只影响 O 维度，其它维度仍是 4 人
    const c = res.rows.find((r) => r.domainKey === "C")!;
    expect(c.droppedIncomplete).toBe(0);
    expect(c.n).toBe(4);
  });

  it("固定种子 → 同一份数据两次分析结果完全一致", () => {
    const records = [flat("a", 2), flat("b", 4), flat("c", 5), flat("d", 3)];
    expect(analyzeReliability(records, { bootstrap: 200 })).toEqual(
      analyzeReliability(records, { bootstrap: 200 })
    );
  });

  it("空数据 → 全部 α 为 null 且给出明确警示（不写 0）", () => {
    const res = analyzeReliability([], { bootstrap: 50 });
    expect(res.n).toBe(0);
    expect(res.rows.every((r) => r.alpha === null)).toBe(true);
    expect(res.warnings.some((w) => w.includes("尚无完成的作答"))).toBe(true);
  });

  it("始终给出「非常模 / 非效度」等边界说明", () => {
    const res = analyzeReliability([flat("a", 3)], { bootstrap: 50 });
    const joined = res.notes.join(" ");
    expect(joined).toContain("不是本平台常模");
    expect(joined).toContain("listwise");
    expect(joined).toContain("bootstrap");
  });
});

describe("analyzeCorrelation", () => {
  it("所有维度同向共变 → r 全为 1、对角线为 1、每格 n 一致", () => {
    const records = [1, 2, 3, 4, 5].map((v, i) => flat(`p${i}`, v));
    const res = analyzeCorrelation(records);

    expect(res.n).toBe(5);
    expect(res.keys.length).toBe(res.matrix.length);
    expect(res.scaleKeys.length).toBe(res.keys.length);
    expect(res.pairCount).toBe((res.keys.length * (res.keys.length - 1)) / 2);

    for (let i = 0; i < res.keys.length; i++) {
      expect(res.matrix[i]![i]).toBe(1);
      for (let j = 0; j < res.keys.length; j++) {
        expect(res.counts[i]![j]).toBe(5);
        if (i !== j) {
          expect(res.matrix[i]![j]).toBeCloseTo(1, 6);
          // 对称性：这是热力图只画下三角的前提
          expect(res.matrix[i]![j]).toBe(res.matrix[j]![i]);
          expect(res.pValues[i]![j]).toBe(res.pValues[j]![i]);
        }
      }
    }
  });

  it("Bonferroni 阈值 = 0.05 / 配对数，并分别统计校正前后显著数", () => {
    const records = [1, 2, 3, 4, 5].map((v, i) => flat(`p${i}`, v));
    const res = analyzeCorrelation(records);
    expect(res.bonferroniAlpha).toBeCloseTo(0.05 / res.pairCount, 6);
    expect(res.sigUncorrected).toBe(res.pairCount);
    expect(res.sigCorrected).toBe(res.pairCount);
  });

  it("n < 3 → r 全为 null（相关无定义，不用 0 顶替）", () => {
    const res = analyzeCorrelation([flat("a", 2), flat("b", 4)]);
    expect(res.n).toBe(2);
    for (let i = 0; i < res.keys.length; i++) {
      for (let j = 0; j < res.keys.length; j++) {
        if (i !== j) expect(res.matrix[i]![j]).toBeNull();
      }
    }
    expect(res.warnings.some((w) => w.includes("无定义"))).toBe(true);
  });

  it("零方差维度 → 对角线也不可用（不给假的 1）", () => {
    // 所有被试所有题同分：每个维度都零方差
    const res = analyzeCorrelation([flat("a", 3), flat("b", 3), flat("c", 3)]);
    expect(res.matrix[0]![0]).toBeNull();
  });

  it("空数据 → 给出「无法估计」而非全 1/全 0 的假矩阵", () => {
    const res = analyzeCorrelation([]);
    expect(res.n).toBe(0);
    expect(res.warnings.some((w) => w.includes("尚无完成的作答"))).toBe(true);
  });

  it("始终声明「相关不等于因果」与成对剔除口径", () => {
    const joined = analyzeCorrelation([flat("a", 3), flat("b", 4), flat("c", 5)]).notes.join(" ");
    expect(joined).toContain("相关不等于因果");
    expect(joined).toContain("成对剔除");
  });
});

describe("analyzeItems", () => {
  it("每题「有效作答 + 未作答」恒等于参与者总数（计数守恒）", () => {
    const records = [
      flat("a", 4),
      flat("b", 2),
      without("c", [O_IDS[0]!]),
      // 未作答者：没有 session，全部题目都算 missing
      { ...flat("d", 3), session: null },
    ];
    const res = analyzeItems(records);
    expect(res.n).toBe(4);
    for (const g of res.groups) {
      for (const item of g.items) {
        const sum = item.options.reduce((a, o) => a + o.count, 0);
        expect(sum + item.missing).toBe(records.length);
        expect(sum).toBe(item.n);
      }
    }
  });

  it("反向题的原始均值与重编码均值互补（和为 6）", () => {
    const res = analyzeItems([flat("a", 2), flat("b", 2), flat("c", 2)]);
    const reversed = res.groups.flatMap((g) => g.items).filter((i) => i.reverse);
    expect(reversed.length).toBeGreaterThan(0);
    for (const item of reversed) {
      expect(item.rawMean! + item.recodedMean!).toBeCloseTo(6, 4);
    }
  });

  it("全体同选最高档 → 正向题天花板、反向题构念地板；全部零变异且 sd 为 0", () => {
    const res = analyzeItems([flatRaw("a", 5), flatRaw("b", 5), flatRaw("c", 5)]);
    for (const item of res.groups.flatMap((g) => g.items)) {
      expect(item.rawMean).toBe(5);
      expect(item.rawSd).toBe(0);
      expect(item.noVariance).toBe(true);
      if (item.reverse) {
        // 原始 5 → 构念 1：不是天花板，是地板
        expect(item.ceilingEffect).toBe(false);
        expect(item.floorEffect).toBe(true);
      } else {
        expect(item.ceilingEffect).toBe(true);
        expect(item.floorEffect).toBe(false);
      }
    }
  });

  it("全体同选最低档 → 恰好与上一情形相反（反向题不因原始分被误报）", () => {
    const res = analyzeItems([flatRaw("a", 1), flatRaw("b", 1)]);
    const items = res.groups.flatMap((g) => g.items);
    expect(items.some((i) => i.reverse)).toBe(true);
    expect(items.some((i) => !i.reverse)).toBe(true);
    for (const item of items) {
      if (item.reverse) {
        expect(item.ceilingEffect).toBe(true);
        expect(item.floorEffect).toBe(false);
      } else {
        expect(item.floorEffect).toBe(true);
        expect(item.ceilingEffect).toBe(false);
      }
    }
  });

  it("原始分布与重编码分布互为镜像（反向题），并说明判定口径", () => {
    const res = analyzeItems([flatRaw("a", 1), flatRaw("b", 5)]);
    const rev = res.groups.flatMap((g) => g.items).find((i) => i.reverse)!;
    // 原始：1 与 5 各一人；重编码后正好互换
    expect(rev.options.find((o) => o.value === 1)!.count).toBe(1);
    expect(rev.options.find((o) => o.value === 5)!.count).toBe(1);
    expect(rev.recodedOptions.find((o) => o.value === 1)!.count).toBe(1);
    expect(rev.recodedOptions.find((o) => o.value === 5)!.count).toBe(1);
    expect(res.notes.join(" ")).toContain("构念方向");
  });

  it("选项计数包含所有档位（含 0 计数），保证图表不塌陷", () => {
    const res = analyzeItems([flat("a", 1), flat("b", 5)]);
    const item = res.groups[0]!.items[0]!;
    expect(item.options.map((o) => o.value)).toEqual(
      res.likertOptions.map((o) => o.value)
    );
    expect(item.options.find((o) => o.value === 3)!.count).toBe(0);
  });

  it("有效作答 < 2 时 sd 为 null（不写 0）", () => {
    const res = analyzeItems([flat("a", 3), { ...flat("b", 3), session: null }]);
    const item = res.groups[0]!.items[0]!;
    expect(item.n).toBe(1);
    expect(item.rawSd).toBeNull();
  });

  it("空数据 → 分组仍完整（题面不丢），但计数全为 missing", () => {
    const res = analyzeItems([]);
    expect(res.n).toBe(0);
    const total = res.groups.flatMap((g) => g.items).length;
    expect(total).toBe(SCALES.flatMap((s) => s.items).length);
    expect(res.warnings.some((w) => w.includes("尚无数据"))).toBe(true);
  });

  it("AI 量表维度归属正确（PU/TR/WA/LA/CN 各 4 题）", () => {
    const res = analyzeItems([flat("a", 3)]);
    const aiGroups = res.groups.filter((g) => g.scaleKey === AI.key);
    expect(aiGroups.length).toBe(AI.domains.length);
    for (const g of aiGroups) {
      const expected = AI.domains.find((d) => d.key === g.domainKey)!.itemIds.length;
      expect(g.items.length).toBe(expected);
    }
  });
});
