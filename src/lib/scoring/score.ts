import {
  getLikert,
  getScales,
  type BankDomain,
  type BankScale,
} from "@/lib/questionnaire/loader";
import { mean, round } from "./stats";

/**
 * 评分引擎 —— 纯函数，不含任何 IO / DB 依赖。
 *
 * 输入：`answers = { itemCode: 1..5 }`（缺失即键不存在）。
 * 输出：结构化维度分 + 合成指数，供结果 API 与管理端分析复用。
 *
 * 关键正确性约束（务必保持）：
 *  1. 反向题只做 **一次** 题目级重编码 `recoded = (scale+1) - value`。
 *  2. AI 合成指数里的 `(scale+1) - mean(CN)` 是针对 **维度分** 的反转，
 *     与 CN4 的题目级反转是两件不同的事，不可互相替代、也不可叠加两次。
 *     即：CN 维度分语义恒为「越高越担忧」，合成指数再把它翻正。
 *  3. 缺失 > 1 题的维度判为 incomplete（score = null），不参与任何均值，
 *     避免用小样本均值伪造出一个看似正常的分数。
 */

export type Answers = Record<string, number>;

export type Interpretation = {
  /** 相对分带标签（启发式，非常模）。 */
  label: string;
  /** 展示用的语义色标记，供 UI 映射。 */
  tone: "low" | "medium" | "high";
};

export type DomainScore = {
  key: string;
  name: string;
  polarity?: string;
  /** 1–5；维度 incomplete 时为 null。 */
  score: number | null;
  /** 该维度内有效作答数。 */
  answered: number;
  /** 该维度题目总数。 */
  total: number;
  missing: number;
  /** 缺失恰好 1 题、已用维度均值填补。 */
  imputed: boolean;
  /** 缺失 > 1 题，分数不可用。 */
  incomplete: boolean;
  /** score 非 null 时给出启发式分带。 */
  band: Interpretation | null;
};

export type CompositeScore = {
  key: string;
  label: string;
  formula: string;
  score: number | null;
  band: Interpretation | null;
};

export type ScaleScore = {
  scaleKey: string;
  scaleName: string;
  type: string;
  domains: DomainScore[];
  composite: CompositeScore | null;
};

export type ScoreResult = {
  scales: ScaleScore[];
  answeredTotal: number;
  itemTotal: number;
  /** 0–1，作答完成度。 */
  completionRate: number;
  /**
   * 作答质量粗筛标记（见 detectResponseQuality）。
   * 仅作提示、不参与计分、也不阻断结果；空数组表示未触发任何可疑模式。
   */
  qualityFlags: string[];
};

/** 反向重编码：5 点制下 recoded = 6 - value。 */
export function reverseRecode(value: number, likertScale = 5): number {
  return likertScale + 1 - value;
}

/**
 * 启发式分带（非常模、量表中点相对）。
 *
 * 阈值是相对于**量表中点 3.0** 的启发式切割，不是人群百分位：
 *   ≤ 2.5 → 低于中点；2.5–3.5 → 接近中点；≥ 3.5 → 高于中点。
 *
 * 本平台尚未建立参照人群常模，任何"高/低"均应理解为"相对本量表中点"，
 * 不得解读为"高于/低于大多数人"。标签刻意使用"中点"而非"相对"，以免
 * 被误读为与他人的比较（详见审查报告 P1）。
 */
export function interpretBand(score: number | null): Interpretation | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score <= 2.5) return { label: "低于中点", tone: "low" };
  if (score < 3.5) return { label: "接近中点", tone: "medium" };
  return { label: "高于中点", tone: "high" };
}

/**
 * 作答质量粗筛（无注意力/测谎题前提下的轻量防护，见审查报告 P4）。
 *
 * 本平台未设置专门的注意力检测题 / 一致性题 / 测谎题，故这里用「作答模式」
 * 做最轻量的可疑标记。它**只作提示、不参与计分、也不阻断结果**——
 * 真正的质控仍应靠题项设计与后续人工复核。
 *
 * 两个保守信号：
 *  1. straightlining：某一单一选项覆盖了绝大多数有效作答（默认 ≥ 90%），
 *     代表未认真区分题目、连续勾选同一项；
 *  2. low_discrimination：全部有效作答的离散程度极低（等距假设下标准差 < 0.25），
 *     代表几乎不区分题目。
 *
 * 注意：这两个信号在"真诚但高度一致的作答"下也可能触发，因此输出的是
 * 「标记」而非「判定」，由上层决定是否提示。
 */
export function detectResponseQuality(
  answers: Answers,
  validCodes: Set<string>,
  opts: { straightlineRatio?: number; minStdDev?: number } = {}
): { flags: string[] } {
  const ratio = opts.straightlineRatio ?? 0.9;
  const minStd = opts.minStdDev ?? 0.25;

  const values: number[] = [];
  for (const code of validCodes) {
    const v = answers[code];
    if (v !== undefined && v !== null && Number.isFinite(v)) values.push(v);
  }
  if (values.length < 2) return { flags: [] };

  const flags: string[] = [];

  // 1) straightlining：众数占比
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const maxFreq = Math.max(...freq.values());
  if (maxFreq / values.length >= ratio) flags.push("straightlining");

  // 2) low_discrimination：标准差（等距假设）
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  const sd = Math.sqrt(acc / values.length);
  if (sd < minStd) flags.push("low_discrimination");

  return { flags };
}

type ItemMeta = Record<string, { reverse: boolean }>;

function buildItemMeta(scales: BankScale[]): ItemMeta {
  const meta: ItemMeta = {};
  for (const s of scales) {
    for (const it of s.items) meta[it.id] = { reverse: it.reverse };
  }
  return meta;
}

/** 单维度评分（含缺失策略）。 */
export function scoreDomain(
  domain: BankDomain,
  answers: Answers,
  itemMeta: ItemMeta,
  likertScale = 5
): DomainScore {
  const total = domain.itemIds.length;
  const recoded: number[] = [];
  let missing = 0;

  for (const id of domain.itemIds) {
    const raw = answers[id];
    if (raw === undefined || raw === null || !Number.isFinite(raw)) {
      missing++;
      continue;
    }
    const rev = itemMeta[id]?.reverse ?? false;
    recoded.push(rev ? reverseRecode(raw, likertScale) : raw);
  }

  const answered = recoded.length;
  let score: number | null;
  let imputed = false;
  let incomplete = false;

  if (answered === 0 || missing > 1) {
    // 无有效作答，或缺失过多 → 不可评分。
    score = null;
    incomplete = true;
  } else if (missing === 1) {
    // 缺失 1 题：用已答题目的均值填补。
    // 数学上填补后的均值恒等于已答题目的均值，故直接取均值（结果一致且无浮点噪声）。
    score = mean(recoded);
    imputed = true;
  } else {
    score = mean(recoded);
  }

  return {
    key: domain.key,
    name: domain.name,
    polarity: domain.polarity,
    score: score === null ? null : round(score, 4),
    answered,
    total,
    missing,
    imputed,
    incomplete,
    band: interpretBand(score),
  };
}

/**
 * AI 采纳态度「探索性」指数（等权合成，仅表面效度，非已验证构念）。
 *
 * 设计取舍（见审查报告 P2 / P3）：
 *  - CN（对 AI 的担忧）在本平台**作为独立维度**报告（结果页已有 CN 柱与解读），
 *    本指数仅作「补充性的整体倾向」参考，不代表一个已被验证的单维构念；
 *  - **各域等权**：五个域（PU/TR/WA/LA 与翻正后的 CN）各占 1/5，
 *    避免旧公式把 CN 实际加权到约 4 倍于其它任一正向域；
 *  - 公式：`( mean(PU,TR,WA,LA) + ((scale+1) - mean(CN)) ) / 5`
 *    （即五个域分数（CN 已翻正）的算术平均，范围 1–5，每域权重 0.2）。
 * 任一分维度不可用 → 返回 null（不猜测、不部分合成）。
 */
export function computeAiAdoptionIndex(
  domainScores: Record<string, number | null>,
  likertScale = 5
): number | null {
  const positiveKeys = ["PU", "TR", "WA", "LA"];
  const allKeys = [...positiveKeys, "CN"];
  for (const k of allKeys) {
    if (domainScores[k] === null || domainScores[k] === undefined) return null;
  }
  const favorable = positiveKeys.map((k) => domainScores[k] as number);
  const concern = domainScores["CN"] as number;
  // 注意：此处是对「CN 维度分」的第二次、也是唯一一次反转（域级）。
  const favorableConcern = likertScale + 1 - concern;
  return round(mean([...favorable, favorableConcern]), 4);
}

/** 单量表评分。 */
export function scoreScale(
  scale: BankScale,
  answers: Answers,
  itemMeta: ItemMeta,
  likertScale = 5
): ScaleScore {
  const domains = scale.domains.map((d) =>
    scoreDomain(d, answers, itemMeta, likertScale)
  );

  let composite: CompositeScore | null = null;
  if (scale.composite) {
    const map: Record<string, number | null> = {};
    for (const d of domains) map[d.key] = d.score;
    const score = computeAiAdoptionIndex(map, likertScale);
    composite = {
      key: scale.composite.key,
      label: scale.composite.label ?? scale.composite.key,
      formula: scale.composite.formula,
      score,
      band: interpretBand(score),
    };
  }

  return {
    scaleKey: scale.key,
    scaleName: scale.name,
    type: scale.type,
    domains,
    composite,
  };
}

/** 对一份完整作答评分（题库配置驱动，新增题目无需改此文件）。 */
export function scoreAll(answers: Answers): ScoreResult {
  const scales = getScales();
  const likert = getLikert();
  const itemMeta = buildItemMeta(scales);

  const scaleScores = scales.map((s) =>
    scoreScale(s, answers, itemMeta, likert.scale)
  );

  let itemTotal = 0;
  for (const s of scales) itemTotal += s.items.length;

  // 只统计题库中真实存在的题目 code，防止脏键抬高完成度。
  const validCodes = new Set(Object.keys(itemMeta));
  const answeredTotal = Object.keys(answers).filter((k) =>
    validCodes.has(k)
  ).length;

  // 作答质量粗筛：传全部有效题码，命中则为可疑模式（仅提示、不计分）。
  const quality = detectResponseQuality(answers, validCodes);

  return {
    scales: scaleScores,
    answeredTotal,
    itemTotal,
    completionRate: itemTotal === 0 ? 0 : round(answeredTotal / itemTotal, 4),
    qualityFlags: quality.flags,
  };
}
