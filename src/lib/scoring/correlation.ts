import { getScales } from "@/lib/questionnaire/loader";
import { scoreAll, type Answers } from "./score";
import { pearsonPValue, pearsonR, round } from "./stats";

/**
 * 相关分析 —— Pearson r 矩阵。
 *
 * 设计取舍：
 *  1. **成对剔除（pairwise deletion）**：计算两个维度的相关时，只要求这两个
 *     维度同时有分的被试参与，而不是要求全表完整。样本量小时能保住尽量多的 n，
 *     代价是矩阵内各格子的 n 可能不同 —— 因此每格都返回自己的 n，UI 必须展示。
 *  2. **小样本诚实**：n < 3 直接返回 null（相关无定义）。p 值一并给出，但
 *     框架文档已明确要求「标注 n 与显著性，避免过度解读」——p 值只是辅助信息。
 *  3. 缺失用 null 占位，不用 0；0 会被当成真实的「低分」污染相关。
 */

export type Series = {
  key: string;
  name: string;
  /** 与其他序列等长；无分处为 null。 */
  values: (number | null)[];
};

export type PairResult = {
  r: number | null;
  /** 成对有效样本量。 */
  n: number;
  /** 双尾 p 值（H0: ρ = 0）。 */
  p: number | null;
};

export type CorrelationMatrix = {
  keys: string[];
  names: string[];
  /** matrix[i][j] = r（i、j 为 keys 下标）；对角线为 1（n ≥ 3 且非常数）。 */
  matrix: (number | null)[][];
  /** counts[i][j] = 成对样本量 n。 */
  counts: number[][];
  /** pValues[i][j] = 双尾 p。 */
  pValues: (number | null)[][];
};

/** 两个序列的相关（按索引成对剔除缺失）。 */
export function pearsonPairwise(a: Series, b: Series): PairResult {
  const len = Math.min(a.values.length, b.values.length);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < len; i++) {
    const x = a.values[i];
    const y = b.values[i];
    if (x === null || x === undefined || y === null || y === undefined) continue;
    xs.push(x);
    ys.push(y);
  }
  const r = pearsonR(xs, ys);
  return {
    r: r === null ? null : round(r, 4),
    n: xs.length,
    p: r === null ? null : pearsonPValue(r, xs.length),
  };
}

/** 计算完整的相关矩阵（含对角线、样本量、p 值）。 */
export function correlationMatrix(series: Series[]): CorrelationMatrix {
  const k = series.length;
  const matrix: (number | null)[][] = [];
  const counts: number[][] = [];
  const pValues: (number | null)[][] = [];

  for (let i = 0; i < k; i++) {
    matrix.push(new Array(k).fill(null));
    counts.push(new Array(k).fill(0));
    pValues.push(new Array(k).fill(null));
  }

  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      if (i === j) {
        // 对角线：自身相关理论上为 1，但零方差的序列（全体同分）无定义。
        const valid = series[i].values.filter(
          (v): v is number => v !== null && v !== undefined
        );
        const hasVariance = new Set(valid).size > 1;
        const r = valid.length >= 3 && hasVariance ? 1 : null;
        matrix[i][j] = r;
        counts[i][j] = valid.length;
        pValues[i][j] = r === null ? null : 0;
      } else {
        const res = pearsonPairwise(series[i], series[j]);
        matrix[i][j] = res.r;
        matrix[j][i] = res.r;
        counts[i][j] = res.n;
        counts[j][i] = res.n;
        pValues[i][j] = res.p;
        pValues[j][i] = res.p;
      }
    }
  }

  return {
    keys: series.map((s) => s.key),
    names: series.map((s) => s.name),
    matrix,
    counts,
    pValues,
  };
}

/**
 * 从多份作答构建「维度分序列」，供相关分析使用。
 * 维度 incomplete（缺失 > 1 题）时该被试在该维度记 null。
 */
export function buildDomainSeries(answersList: Answers[]): Series[] {
  const scales = getScales();
  // 每位被试只评一次分，避免 O(scales × participants) 的重复计算。
  const scored = answersList.map((answers) => scoreAll(answers));
  const series: Series[] = [];

  for (const scale of scales) {
    for (const d of scale.domains) {
      const values = scored.map((s) => {
        const target = s.scales.find((x) => x.scaleKey === scale.key);
        const ds = target?.domains.find((x) => x.key === d.key);
        return ds ? ds.score : null;
      });
      series.push({ key: d.key, name: d.name, values });
    }
  }

  return series;
}
