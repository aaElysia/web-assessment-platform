import { getLikert, getScaleByKey } from "@/lib/questionnaire/loader";
import { reverseRecode, type Answers } from "./score";
import { round, sampleVariance, sum } from "./stats";

/**
 * 信度分析 —— Cronbach's α（内部一致性）。
 *
 * 公式：α = (k / (k-1)) · (1 - Σ itemVariance / totalVariance)
 *   k             = 题目数
 *   itemVariance  = 每道题在**所有被试**上的样本方差
 *   totalVariance = 每位被试总分（该维度内 k 题之和）的样本方差
 *
 * 两个容易被忽略但会直接算错的地方：
 *  1. **必须先做反向重编码**再算 α。若直接用原始作答，反向题会与同维度
 *     其它题负相关，人为压低 α —— 这是最常见的 α 计算错误。
 *  2. **必须使用完整作答的被试**（listwise）。缺失值若按 0 或按均值填补，
 *     都会改变方差结构，使 α 失真。本模块对不完整被试直接剔除并回报数量。
 *
 * 边界情形：
 *  - n < 2：α 未定义（方差无法估计）。
 *  - k < 2：α 未定义（单题无内部一致性可言）。
 *  - totalVariance = 0（如所有被试总分相同）：α 未定义，返回 null 并给出原因，
 *    而不是返回 0 或 1 —— 后者会被误读为「信度极差/极好」。
 *  - α 允许为负（数据内部矛盾时数学上成立），如实返回，不在引擎层截断。
 */

export type AlphaResult = {
  alpha: number | null;
  /** 题目数。 */
  k: number;
  /** 参与计算的被试数（完整作答者）。 */
  n: number;
  /** alpha 为 null 时的原因说明，便于 UI 直接展示。 */
  reason?: string;
};

/**
 * 计算 Cronbach's α。
 * @param rows 行 = 被试，列 = 题目；**必须已做反向重编码**且每行长度一致、无缺失。
 */
export function cronbachAlpha(rows: number[][]): AlphaResult {
  const n = rows.length;
  if (n < 2) {
    return { alpha: null, k: 0, n, reason: "有效样本量不足（n < 2）" };
  }
  const k = rows[0].length;
  if (k < 2) {
    return { alpha: null, k, n, reason: "题目数不足（k < 2）" };
  }
  if (rows.some((r) => r.length !== k)) {
    return { alpha: null, k, n, reason: "数据矩阵不规整（各行题目数不一致）" };
  }

  let sumItemVar = 0;
  for (let j = 0; j < k; j++) {
    sumItemVar += sampleVariance(rows.map((r) => r[j]));
  }
  const totalVar = sampleVariance(rows.map((r) => sum(r)));

  if (!Number.isFinite(totalVar)) {
    return { alpha: null, k, n, reason: "总分方差不可估计" };
  }
  if (totalVar === 0) {
    return {
      alpha: null,
      k,
      n,
      reason: "总分方差为 0（所有被试总分相同），α 无定义",
    };
  }

  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
  return { alpha: round(alpha, 4), k, n };
}

/**
 * 构建某量表某维度的「被试 × 题目」重编码矩阵（供 α 与题项分析使用）。
 * 缺失任一题的被试整行剔除（listwise），并回报剔除数量，避免静默丢数据。
 */
export function buildDomainMatrix(
  answersList: Answers[],
  scaleKey: string,
  domainKey: string
): { rows: number[][]; droppedIncomplete: number; itemCodes: string[] } {
  const scale = getScaleByKey(scaleKey);
  if (!scale) return { rows: [], droppedIncomplete: 0, itemCodes: [] };
  const domain = scale.domains.find((d) => d.key === domainKey);
  if (!domain) return { rows: [], droppedIncomplete: 0, itemCodes: [] };

  const likertScale = getLikert().scale;
  const reverse = new Map(scale.items.map((it) => [it.id, it.reverse]));

  const rows: number[][] = [];
  let droppedIncomplete = 0;

  for (const answers of answersList) {
    const row: number[] = [];
    let complete = true;
    for (const id of domain.itemIds) {
      const raw = answers[id];
      if (raw === undefined || raw === null || !Number.isFinite(raw)) {
        complete = false;
        break;
      }
      row.push(reverse.get(id) ? reverseRecode(raw, likertScale) : raw);
    }
    if (complete) rows.push(row);
    else droppedIncomplete++;
  }

  return { rows, droppedIncomplete, itemCodes: [...domain.itemIds] };
}

/** 便捷方法：直接对某量表某维度求 α。 */
export function alphaForDomain(
  answersList: Answers[],
  scaleKey: string,
  domainKey: string
): AlphaResult & { droppedIncomplete: number } {
  const { rows, droppedIncomplete } = buildDomainMatrix(
    answersList,
    scaleKey,
    domainKey
  );
  return { ...cronbachAlpha(rows), droppedIncomplete };
}
