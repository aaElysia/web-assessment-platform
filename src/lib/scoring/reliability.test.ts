import { describe, expect, it } from "vitest";
import type { Answers } from "./score";
import { alphaForDomain, buildDomainMatrix, cronbachAlpha } from "./reliability";

/**
 * 测试策略：
 *  - 用**手工核算过的**小样本作为已知答案（不依赖第三方库输出的"黑箱基准"）。
 *  - 覆盖所有边界：n<2、k<2、零方差、完全负相关、缺失剔除。
 *  - 专门放一条"不重编码会得到错结论"的反例测试，锁死反向题处理。
 */

describe("cronbachAlpha —— 已知答案（手工核算）", () => {
  it("k=2 的已知算例 → α = 0.4167", () => {
    // col1=[1,2,3,4,5] var=2.5；col2=[2,4,5,4,3] var=1.3；总分 var=4.8
    // α = (2/1)·(1 − 3.8/4.8) = 0.41666...
    const rows = [
      [1, 2],
      [2, 4],
      [3, 5],
      [4, 4],
      [5, 3],
    ];
    const res = cronbachAlpha(rows);
    expect(res.n).toBe(5);
    expect(res.k).toBe(2);
    expect(res.alpha).toBeCloseTo(0.4167, 4);
  });

  it("完全一致（每题在被试间同增同减）→ α = 1", () => {
    const rows = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ];
    expect(cronbachAlpha(rows).alpha).toBeCloseTo(1, 6);
  });

  it("多题完全一致 → α 恰好为 1（而非仅接近 1）", () => {
    const rows = [1, 2, 3, 4, 5].map((v) => [v, v, v, v, v]);
    expect(cronbachAlpha(rows).alpha).toBeCloseTo(1, 9);
  });
});

describe("cronbachAlpha —— 边界与不可定义情形", () => {
  it("n < 2 → null 且给出原因", () => {
    const res = cronbachAlpha([[1, 2, 3]]);
    expect(res.alpha).toBeNull();
    expect(res.reason).toContain("n < 2");
    expect(cronbachAlpha([]).alpha).toBeNull();
  });

  it("k < 2 → null（单题无内部一致性）", () => {
    const res = cronbachAlpha([[3], [4]]);
    expect(res.alpha).toBeNull();
    expect(res.reason).toContain("k < 2");
  });

  it("所有被试总分相同（总分方差为 0）→ null，而非 0 或 1", () => {
    const rows = [
      [3, 3],
      [3, 3],
      [3, 3],
    ];
    const res = cronbachAlpha(rows);
    expect(res.alpha).toBeNull();
    expect(res.reason).toContain("总分方差为 0");
  });

  it("题目间完全负相关（总分恒为常数）→ null，而不是误报 α = -∞", () => {
    const rows = [
      [1, 5],
      [2, 4],
      [3, 3],
      [4, 2],
      [5, 1],
    ];
    const res = cronbachAlpha(rows);
    expect(res.alpha).toBeNull();
    expect(res.reason).toContain("总分方差为 0");
  });

  it("矩阵不规整 → null 并提示", () => {
    const res = cronbachAlpha([
      [1, 2, 3],
      [1, 2],
    ] as number[][]);
    expect(res.alpha).toBeNull();
    expect(res.reason).toContain("不规整");
  });

  it("α 可以为负（题目间负协方差），引擎如实返回、不截断", () => {
    // col1=[1,2,3,4,5] v=2.5；col2=[4,4,3,2,2] v=1；总分=[5,6,6,6,7] v=0.5
    // α = 2·(1 − 3.5/0.5) = −12（已知算例）
    const rows = [
      [1, 4],
      [2, 4],
      [3, 3],
      [4, 2],
      [5, 2],
    ];
    const res = cronbachAlpha(rows);
    expect(res.alpha).not.toBeNull();
    expect(res.alpha as number).toBeLessThan(0);
    expect(res.alpha).toBeCloseTo(-12, 4);
  });
});

describe("buildDomainMatrix —— 反向重编码 + listwise 剔除", () => {
  function oAnswers(positive: number): Answers {
    // O1–O4 正向、O5–O8 反向；正向给 positive，反向给 6-positive → 重编码后全相等
    return {
      O1: positive,
      O2: positive,
      O3: positive,
      O4: positive,
      O5: 6 - positive,
      O6: 6 - positive,
      O7: 6 - positive,
      O8: 6 - positive,
    };
  }

  it("输出已重编码的规整矩阵，且从不完整被试被剔除", () => {
    const incomplete: Answers = { ...oAnswers(4) };
    delete incomplete.O8;

    const { rows, droppedIncomplete, itemCodes } = buildDomainMatrix(
      [oAnswers(4), oAnswers(2), incomplete],
      "big_five",
      "O"
    );

    expect(itemCodes).toHaveLength(8);
    expect(rows).toHaveLength(2);
    expect(droppedIncomplete).toBe(1);
    // 两位被试重编码后各自内部完全一致
    expect(rows[0]).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect(rows[1]).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("未知量表 / 维度 → 返回空矩阵而非抛异常", () => {
    expect(buildDomainMatrix([oAnswers(3)], "nope", "O").rows).toHaveLength(0);
    expect(buildDomainMatrix([oAnswers(3)], "big_five", "ZZ").rows).toHaveLength(0);
  });

  it("反例：若不重编码，完全一致的作答会因反向题导致总分零方差 → α 不可估计", () => {
    // 原始（未重编码）作答：正向 a、反向 6-a → 总分恒为 24
    const rawRows = [1, 2, 3, 4, 5].map((a) => [a, a, a, a, 6 - a, 6 - a, 6 - a, 6 - a]);
    expect(cronbachAlpha(rawRows).alpha).toBeNull();

    // 重编码后 → α = 1，证明重编码是 α 正确性的前提
    const rows = [1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0, 0, 0]);
    void rows;
    const recoded = [1, 2, 3, 4, 5].map((a) => [a, a, a, a, a, a, a, a]);
    expect(cronbachAlpha(recoded).alpha).toBeCloseTo(1, 9);
  });
});

describe("alphaForDomain —— 端到端（使用真实题库）", () => {
  function oAnswers(positive: number): Answers {
    return {
      O1: positive,
      O2: positive,
      O3: positive,
      O4: positive,
      O5: 6 - positive,
      O6: 6 - positive,
      O7: 6 - positive,
      O8: 6 - positive,
    };
  }

  it("5 名作答模式高度一致的被试（a=1..5）→ α = 1", () => {
    const list = [1, 2, 3, 4, 5].map(oAnswers);
    const res = alphaForDomain(list, "big_five", "O");
    expect(res.k).toBe(8);
    expect(res.n).toBe(5);
    expect(res.alpha).toBeCloseTo(1, 9);
    expect(res.droppedIncomplete).toBe(0);
  });

  it("回报被剔除的不完整被试数量", () => {
    const bad = oAnswers(3);
    delete bad.O1;
    const res = alphaForDomain([oAnswers(3), oAnswers(4), bad], "big_five", "O");
    expect(res.n).toBe(2);
    expect(res.droppedIncomplete).toBe(1);
  });

  it("样本不足时返回 null 并说明原因（不抛异常）", () => {
    const res = alphaForDomain([oAnswers(3)], "big_five", "O");
    expect(res.alpha).toBeNull();
    expect(res.reason).toBeTruthy();
  });
});
