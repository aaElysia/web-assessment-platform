import { getLikert, getScales } from "@/lib/questionnaire/loader";
import { buildDomainSeries, correlationMatrix } from "@/lib/scoring/correlation";
import { buildDomainMatrix, cronbachAlpha } from "@/lib/scoring/reliability";
import { reverseRecode, type Answers } from "@/lib/scoring/score";
import { mean, round, sampleStdDev } from "@/lib/scoring/stats";
import type {
  AlphaRow,
  AdminRecord,
  CorrelationResult,
  Interval,
  ItemGroup,
  ItemRow,
  ItemsResult,
  ReliabilityResult,
} from "./types";

/**
 * 管理端分析聚合 —— 纯函数，不做任何 IO。
 *
 * 这里复用 Step 6 已实现并通过单测的统计引擎
 * （`scoring/reliability.ts` 的 α、`scoring/correlation.ts` 的 Pearson r），
 * 本文件只负责「取哪些人 / 哪些题 → 调引擎 → 组装成 UI 能直接画的结构」。
 *
 * 三条不可让步的诚实性约束（与 stats.ts 一脉相承）：
 *  1. **α 无定义时给 null 与原因，不给 0 或 1**。0 会被读成「信度极差」，
 *     1 会被读成「完美」——两者都是可测量的错误结论。
 *  2. **必须给出不确定性**。α 附 bootstrap 区间、r 附每格 n 与近似半宽。
 *     小样本下「点估计」单独呈现是一种误导。
 *  3. **不把统计量翻译成因果结论**。相关不是因果，α 不是效度，
 *     分带不是常模——这些必须写在 notes 里，而不是只在文档里。
 */

/** 默认 bootstrap 重抽样次数。 */
export const DEFAULT_BOOTSTRAP = 1000;

/**
 * 默认随机种子。
 * 固定种子是刻意的：否则仪表盘每刷新一次 α 的置信区间都会变，
 * 会被误认为「数据在变」。同一份数据必须给出同一个区间。
 */
export const BOOTSTRAP_SEED = 20260912;

/** α 等级阈值（通用惯例，非本平台常模）。 */
const ALPHA_GRADES: { min: number; label: string }[] = [
  { min: 0.9, label: "优秀（≥ 0.90）" },
  { min: 0.8, label: "良好（0.80–0.90）" },
  { min: 0.7, label: "可接受（0.70–0.80）" },
  { min: 0.6, label: "边缘（0.60–0.70）" },
  { min: -Infinity, label: "偏低（< 0.60）" },
];

/** 低于此样本量时 α / r 的估计不稳定（与 stats.ts 的 MIN_RELIABLE_N 同源）。 */
const MIN_RELIABLE_N = 30;

/** 地板 / 天花板效应的判定：某一端占比达到此值。 */
const EXTREME_SHARE = 0.6;

/** 确定性伪随机数（mulberry32）：纯整数运算，跨平台结果一致。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 线性插值分位数（输入必须已升序排序）。 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * α 的百分位 bootstrap 置信区间。
 *
 * 为什么不用解析近似（Feldt / Iacobucci 等公式）：那些公式假设 α 的抽样分布
 * 近似正态，在 n 很小或 α 接近 0/1 时明显失真，而本平台恰恰处于小样本场景。
 * Bootstrap 不依赖该假设，并且能如实体现「样本太少 → 区间极宽」。
 *
 * 代价是结果依赖随机数，因此**种子固定**以保证可复现（见 BOOTSTRAP_SEED）。
 * 重抽样中若出现总分零方差（α 无定义），该次结果被跳过；若有效次数不足半数，
 * 返回 null 而不是硬凑一个区间。
 */
export function bootstrapAlphaCI(
  rows: number[][],
  bootstrap = DEFAULT_BOOTSTRAP,
  seed = BOOTSTRAP_SEED,
  conf = 0.95
): Interval | null {
  if (rows.length < 2 || bootstrap < 1) return null;
  const rand = mulberry32(seed);
  const n = rows.length;
  const alphas: number[] = [];
  const sample: number[][] = new Array(n);

  for (let b = 0; b < bootstrap; b++) {
    for (let i = 0; i < n; i++) {
      sample[i] = rows[Math.floor(rand() * n)]!;
    }
    const a = cronbachAlpha(sample).alpha;
    if (a !== null && Number.isFinite(a)) alphas.push(a);
  }
  if (alphas.length === 0) return null;

  alphas.sort((x, y) => x - y);
  const lo = percentile(alphas, (1 - conf) / 2);
  const hi = percentile(alphas, 1 - (1 - conf) / 2);
  return { lo: round(lo, 4), hi: round(hi, 4) };
}

function alphaGrade(alpha: number): string {
  return ALPHA_GRADES.find((g) => alpha >= g.min)!.label;
}

/**
 * 由 α 与 k 反解「题目平均两两相关」（Spearman-Brown）。
 *
 *   α = k·r̄ / (1 + (k−1)·r̄)  ⟺  r̄ = α / (k − (k−1)·α)
 *
 * 它的价值在于**剔除 k 的影响**：α 天生随题目数升高，k=4 的维度不该
 * 因为 α 低于 k=8 的维度就被判定为「质量更差」。
 *
 * 分母趋近 0 这一分支是纯数值防御：α = k/(k−1) 要求「题内方差为 0」，
 * 而题内方差为 0 又必然推出总分方差为 0（那样 α 已在上游返回 null），
 * 二者矛盾，因此该情形在有限样本下不可达。
 */
export function meanInterItemR(alpha: number | null, k: number): number | null {
  if (alpha === null || !Number.isFinite(alpha) || k < 2) return null;
  const denom = k - (k - 1) * alpha;
  if (Math.abs(denom) < 1e-9) return 1;
  return round(alpha / denom, 4);
}

/** 取「已完成作答」的作答列表（每名参与者只取最新一次完成会话）。 */
export function answeredList(records: AdminRecord[]): Answers[] {
  const out: Answers[] = [];
  for (const r of records) if (r.session) out.push(r.session.answers);
  return out;
}

// ---------------------------------------------------------------------------
// 信度
// ---------------------------------------------------------------------------

export function analyzeReliability(
  records: AdminRecord[],
  opts: { bootstrap?: number; seed?: number } = {}
): ReliabilityResult {
  const bootstrap = opts.bootstrap ?? DEFAULT_BOOTSTRAP;
  const seed = opts.seed ?? BOOTSTRAP_SEED;
  const answersList = answeredList(records);
  const rows: AlphaRow[] = [];

  for (const scale of getScales()) {
    for (const domain of scale.domains) {
      const { rows: matrix, droppedIncomplete } = buildDomainMatrix(
        answersList,
        scale.key,
        domain.key
      );
      const base = cronbachAlpha(matrix);
      rows.push({
        scaleKey: scale.key,
        scaleName: scale.name,
        scaleType: scale.type,
        domainKey: domain.key,
        domainName: domain.name,
        alpha: base.alpha,
        ci: base.alpha === null ? null : bootstrapAlphaCI(matrix, bootstrap, seed),
        k: base.k,
        n: base.n,
        droppedIncomplete,
        reason: base.reason,
        meanInterItemR: meanInterItemR(base.alpha, base.k),
        grade: base.alpha === null ? null : alphaGrade(base.alpha),
      });
    }
  }

  const n = answersList.length;
  const usable = rows.filter((r) => r.alpha !== null);

  const notes = [
    "α 的等级描述（优秀 / 良好 / 可接受 / 边缘 / 偏低）来自通用惯例阈值，不是本平台常模，也不等于量表效度已被验证。",
    "α 由**完整作答该维度全部题目**的被试计算（listwise）：任一题缺失即整行剔除，被剔除人数单独列出。",
    "置信区间为百分位 bootstrap（固定随机种子，可复现），非解析近似公式；小样本下区间很宽是**真实的不确定性**，不是计算缺陷。",
    "α 会随题目数 k 升高，因此不同 k 的维度不能直接比高低——请结合「题目平均相关」列一并判断。",
    "本页只报告内部一致性，不涉及重测信度、结构效度或测量不变性。",
  ];

  const warnings: string[] = [];
  if (n === 0) {
    warnings.push(
      "尚无完成的作答：信度无法估计。请先积累数据（本页不会用 0 或 1 顶替）。"
    );
  } else if (n < MIN_RELIABLE_N) {
    warnings.push(
      `当前完成样本 n=${n}（< ${MIN_RELIABLE_N}）：α 及其置信区间都很不稳定，` +
        `只能作为「量表在本样本中是否可继续使用」的粗略信号，不可作为信度结论。`
    );
  }
  if (usable.length > 0 && usable.some((r) => r.alpha !== null && r.alpha < 0.6)) {
    warnings.push(
      "存在 α < 0.60 的维度：可能是题目过少（k 小）、题目异质、或反向题处理有误——" +
        "请先核对「题目平均相关」与题项分布，不要直接断定量表无效。"
    );
  }
  if (usable.some((r) => r.alpha !== null && r.alpha < 0)) {
    warnings.push(
      "存在 α < 0 的维度（题目间平均相关为负）：这通常意味着**存在未正确反向计分的题目**，" +
        "或该维度内混入了不同构念的题目。此情形下 α 不具解释价值，应先查数据与题面。"
    );
  }
  if (usable.some((r) => r.k > 0 && r.k < 5)) {
    warnings.push(
      "存在题目数 k < 5 的维度：α 在这些维度上天然偏低，其数值不适合与前 8 题维度横向比较。"
    );
  }
  if (usable.some((r) => r.droppedIncomplete > 0)) {
    warnings.push(
      "有维度因被试缺失个别题目而被整行剔除（见「剔除」列）：若剔除人数较多，" +
        "该 α 的样本已不代表全部完成者。"
    );
  }

  return { rows, n, notes, warnings };
}

// ---------------------------------------------------------------------------
// 相关
// ---------------------------------------------------------------------------

export function analyzeCorrelation(records: AdminRecord[]): CorrelationResult {
  const answersList = answeredList(records);
  const m = correlationMatrix(buildDomainSeries(answersList));

  const scales = getScales();
  const scaleKeys: string[] = [];
  for (const s of scales) for (const _ of s.domains) scaleKeys.push(s.key);

  const k = m.keys.length;
  const pairCount = (k * (k - 1)) / 2;
  const bonferroniAlpha = pairCount > 0 ? round(0.05 / pairCount, 6) : 0;

  let sigUncorrected = 0;
  let sigCorrected = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const p = m.pValues[i]?.[j];
      if (p === null || p === undefined) continue;
      if (p < 0.05) sigUncorrected++;
      if (p < bonferroniAlpha) sigCorrected++;
    }
  }

  const n = answersList.length;
  // Fisher z 近似：SE(z) ≈ 1/√(n−3)，95% 半宽 ≈ 1.96/√(n−3)。
  const rCiHalfWidth = n > 3 ? round(1.96 / Math.sqrt(n - 3), 3) : null;

  const notes = [
    "相关矩阵使用**成对剔除**（pairwise）：计算两个维度时只要这两维都有分的被试参与，" +
      "因此每格的 n 可能不同（热力图每格均标注 n）。",
    "**相关不等于因果**。本页的 r 只描述维度分在本样本中的线性共变程度，不说明任何方向性机制。",
    "每格同时给出双尾 p 值，但 p 只是辅助信息：n 很小时 p 极不稳定，且未校正的 p 受多重比较影响。",
    "对角线（r = 1）仅在样本 ≥ 3 且该维度有变异时成立，否则显示为不可用。",
  ];
  if (rCiHalfWidth !== null) {
    notes.push(
      `以整体 n=${n} 估算，r 的 95% 置信半宽约为 ±${rCiHalfWidth}（Fisher z 近似）：` +
        `即 |r| 小于该值的相关在本样本中与 0 无法区分。`
    );
  }

  const warnings: string[] = [];
  if (n === 0) {
    warnings.push("尚无完成的作答：相关无法估计（不会用 0 顶替）。");
  } else if (n < 3) {
    warnings.push(
      `完成样本 n=${n}（< 3）：Pearson r 无定义，矩阵将全为空——这是预期行为而非计算失败。`
    );
  } else if (n < MIN_RELIABLE_N) {
    warnings.push(
      `完成样本 n=${n}（< ${MIN_RELIABLE_N}）：r 的抽样波动极大，单个系数几乎不可解读。`
    );
  }
  if (pairCount > 1) {
    warnings.push(
      `本矩阵含 ${pairCount} 个配对比较：按 α=0.05 判定，**平均约 ${(pairCount * 0.05).toFixed(1)} 个` +
        `「显著」纯属偶然**。已给出 Bonferroni 校正阈值 ${bonferroniAlpha} ` +
        `（校正后仍显著者 ${sigCorrected} 个，未校正 ${sigUncorrected} 个）——` +
        `请以后者作为「值得进一步检验」的线索，而不是结论。`
    );
  }
  if (sigUncorrected > 0 && sigCorrected === 0) {
    warnings.push(
      "所有未校正的「显著」相关都未通过 Bonferroni 校正：这与「纯属多重比较的偶然产物」完全一致，不应作为发现来报告。"
    );
  }

  return {
    keys: m.keys,
    names: m.names,
    scaleKeys,
    matrix: m.matrix,
    counts: m.counts,
    pValues: m.pValues,
    n,
    pairCount,
    bonferroniAlpha,
    sigUncorrected,
    sigCorrected,
    rCiHalfWidth,
    notes,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 题项反应分布
// ---------------------------------------------------------------------------

export function analyzeItems(records: AdminRecord[]): ItemsResult {
  const scales = getScales();
  const likert = getLikert();
  const optionValues = likert.options.map((o) => o.value);
  const groups: ItemGroup[] = [];

  for (const scale of scales) {
    for (const domain of scale.domains) {
      const items: ItemRow[] = [];

      for (const itemId of domain.itemIds) {
        const item = scale.items.find((it) => it.id === itemId);
        if (!item) continue;

        const counts = new Map<number, number>(optionValues.map((v) => [v, 0]));
        const recodedCounts = new Map<number, number>(optionValues.map((v) => [v, 0]));
        const raws: number[] = [];
        const recoded: number[] = [];
        let missing = 0;

        for (const r of records) {
          const raw = r.session?.answers[item.id];
          if (raw === undefined || !Number.isFinite(raw) || !counts.has(raw)) {
            missing++;
            continue;
          }
          counts.set(raw, counts.get(raw)! + 1);
          const rc = item.reverse ? reverseRecode(raw, likert.scale) : raw;
          if (recodedCounts.has(rc)) recodedCounts.set(rc, recodedCounts.get(rc)! + 1);
          raws.push(raw);
          recoded.push(rc);
        }

        const n = raws.length;
        // ⚠️ 地板 / 天花板必须按**重编码后**的方向判定：反向题的原始低分
        // 在构念上其实是高分，按原始分判会把它误报成地板效应。
        const lowCount = recodedCounts.get(Math.min(...optionValues)) ?? 0;
        const highCount = recodedCounts.get(Math.max(...optionValues)) ?? 0;

        items.push({
          code: item.id,
          text: item.text,
          scaleKey: scale.key,
          scaleName: scale.name,
          domainKey: domain.key,
          domainName: domain.name,
          reverse: item.reverse,
          options: optionValues.map((v) => ({ value: v, count: counts.get(v) ?? 0 })),
          recodedOptions: optionValues.map((v) => ({
            value: v,
            count: recodedCounts.get(v) ?? 0,
          })),
          missing,
          n,
          rawMean: n > 0 ? round(mean(raws), 4) : null,
          recodedMean: n > 0 ? round(mean(recoded), 4) : null,
          rawSd: n >= 2 ? round(sampleStdDev(raws), 4) : null,
          // 反向重编码是双射，故按 raw 或 recoded 判零变异等价；这里统一用 recoded。
          noVariance: n > 0 && new Set(recoded).size === 1,
          floorEffect: n > 0 && lowCount / n >= EXTREME_SHARE,
          ceilingEffect: n > 0 && highCount / n >= EXTREME_SHARE,
        });
      }

      groups.push({
        scaleKey: scale.key,
        scaleName: scale.name,
        domainKey: domain.key,
        domainName: domain.name,
        items,
      });
    }
  }

  const n = records.length;
  const allItems = groups.flatMap((g) => g.items);
  const zeroVar = allItems.filter((i) => i.noVariance);
  const extreme = allItems.filter((i) => i.floorEffect || i.ceilingEffect);

  const notes = [
    "「原始均值」与「重编码均值」并列给出：反向题（标有「反」）的原始均值天然偏低，属正常现象；" +
      "跨题比较必须使用重编码均值。",
    "地板 / 天花板效应按**构念方向**（重编码后）判定，而不是原始选项分布：" +
      "反向题选「1」在构念上其实是高分，按原始分判定会把反向题误报成地板效应。",
    "每题的「有效作答 + 未作答」恒等于参与者总数（本页用此守恒关系校验数据完整性）。",
    "标准差在有效作答 < 2 时为不可用（显示为 —），不写 0。",
    "分布只反映本样本的作答反应，样本量小时各档占比波动极大。",
  ];

  const warnings: string[] = [];
  if (n === 0) {
    warnings.push("尚无数据：题项分布为空是预期结果。");
  }
  if (zeroVar.length > 0) {
    warnings.push(
      `有 ${zeroVar.length} 道题在本样本中**零变异**（所有作答完全相同）：` +
        `这类题对 α 没有任何贡献，也无法区被试——若并非题意所致，建议复核题干或计分。`
    );
  }
  if (extreme.length > 0) {
    warnings.push(
      `有 ${extreme.length} 道题在构念方向上挤向某一端（占比 ≥ ${EXTREME_SHARE * 100}%）：` +
        `可用于区分的分数区间被压缩，会同时压低 α 与相关系数。`
    );
  }
  if (n > 0 && n < MIN_RELIABLE_N) {
    warnings.push(
      `当前参与者 n=${n}（< ${MIN_RELIABLE_N}）：各档占比波动很大，不要据此判断题目「过难/过易」。`
    );
  }

  return {
    groups,
    likertOptions: likert.options.map((o) => ({ value: o.value, label: o.label })),
    n,
    notes,
    warnings,
  };
}
