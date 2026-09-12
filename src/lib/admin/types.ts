/**
 * 管理端统计的**纯类型**定义。
 *
 * 为什么单独一个文件：图表组件是客户端组件，而统计实现（stats.ts）会
 * 间接 import `node:fs`（题库加载器）。把类型抽到无依赖的本文件，
 * 客户端就可以安全地 `import type`，不会把服务端模块拖进浏览器包。
 */

/** 作答映射：题目 code → 1..5。 */
export type AnswersMap = Record<string, number>;

/** 参与者最新一次「已完成」会话（没有则为 null）。 */
export type AdminSessionSummary = {
  startedAt: Date;
  completedAt: Date | null;
  answers: AnswersMap;
};

/** 管理端统计的输入行：一名参与者 + 其最新已完成会话。 */
export type AdminRecord = {
  id: string;
  createdAt: Date;
  status: string;
  consentAt: Date | null;
  ageRange: string | null;
  gender: string | null;
  education: string | null;
  session: AdminSessionSummary | null;
};

// ---------------------------------------------------------------------------
// 提交明细（管理端「提交明细」页 / submissions API）
//
// 与 stats 的「聚合」视角互补：这里逐条列出参与者，便于在测试期清理污染数据。
// 类型与排序逻辑放在本无依赖文件，客户端组件与单测都能安全 import。
// ---------------------------------------------------------------------------

/** 提交明细行的「会话」摘要（取该参与者最新一次会话）。 */
export type ParticipantSessionSummary = {
  startedAt: string; // ISO
  completedAt: string | null; // ISO 或 null（进行中 / 放弃）
  status: string;
  /** 该会话已作答的题数（用于快速识别空/不完整提交）。 */
  itemCount: number;
};

/** 提交明细的一行：一名参与者 + 其最新会话（可能无会话）。 */
export type ParticipantRow = {
  id: string;
  /** 匿名 ID 前 8 位，便于在 UI 中辨识与口头核对（完整 ID 仅在 title 提示）。 */
  shortId: string;
  createdAt: string; // ISO
  status: string;
  session: ParticipantSessionSummary | null;
  /**
   * 用于「填写时间」展示与默认排序的时间：
   * completedAt ?? startedAt ?? createdAt（恒不为 null）。
   */
  submittedAt: string; // ISO
};

/** 可排序的时间字段。 */
export type SortKey = "submittedAt" | "startedAt" | "createdAt";
/** 排序方向。 */
export type SortDir = "asc" | "desc";

export type ListParticipantsOptions = {
  sortKey?: SortKey;
  sortDir?: SortDir;
};

/**
 * 纯函数：按指定时间字段对提交明细排序。
 * - submittedAt：恒有值，直接比较；
 * - startedAt：会话可能为 null，null 一律排到末尾（与方向无关）；
 * - createdAt：恒有值，直接比较。
 * 不修改入参（返回新数组）。
 */
export function sortParticipantRows(
  rows: ParticipantRow[],
  key: SortKey,
  dir: SortDir
): ParticipantRow[] {
  const factor = dir === "asc" ? 1 : -1;
  const pick = (r: ParticipantRow): string | null => {
    if (key === "submittedAt") return r.submittedAt;
    if (key === "startedAt") return r.session?.startedAt ?? null;
    return r.createdAt;
  };
  return [...rows].sort((a, b) => {
    const va = pick(a);
    const vb = pick(b);
    // null（无会话的 startedAt）永远垫底，无论升序降序
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const ta = new Date(va).getTime();
    const tb = new Date(vb).getTime();
    return (ta - tb) * factor;
  });
}

export type BandCounts = { low: number; medium: number; high: number };

export type DomainSummary = {
  key: string;
  name: string;
  scaleKey: string;
  scaleName: string;
  scaleType: string;
  polarity?: string;
  /** 有效被试数（该维度 score 非 null 的人数）。**逐维不同**，必须逐维展示。 */
  n: number;
  mean: number | null;
  /** 样本标准差；n < 2 时为 null（不是 0）——0 会被读成「无差异」。 */
  sd: number | null;
  bands: BandCounts;
};

export type HistogramBin = {
  from: number;
  to: number;
  label: string;
  count: number;
};

export type IndexSummary = {
  key: string;
  label: string;
  formula: string | null;
  n: number;
  mean: number | null;
  sd: number | null;
  bands: BandCounts;
  histogram: HistogramBin[];
};

export type AdminTotals = {
  /** 已创建匿名 ID 的总数（含仅创建、未作答者）。 */
  participants: number;
  /** 已记录知情同意的人数。 */
  consented: number;
  /** 有已完成作答会话的人数。 */
  completed: number;
};

export type AdminStats = {
  totals: AdminTotals;
  /** completed / participants；参与者为 0 时 null（不是 0%）。 */
  completionRate: number | null;
  /** 端到端耗时（创建 ID → 提交作答）。 */
  elapsed: { n: number; meanSec: number | null; medianSec: number | null };
  latestCompletedAt: string | null;
  domains: DomainSummary[];
  index: IndexSummary;
  /** 恒定展示的边界说明（与结果页口径保持一致）。 */
  notes: string[];
  /** 随数据变化的诚实性提示（小样本、空数据等）。 */
  warnings: string[];
};

/** 导出表：header + 行（单元格均为字符串，空字符串代表缺失）。 */
export type ExportTable = {
  header: string[];
  rows: string[][];
};

// ---------------------------------------------------------------------------
// Step 9 · 分析（信度 / 相关 / 题项分布）
//
// 这些类型同样放在无依赖的本文件，原因与上面相同：图表组件是客户端组件，
// 而分析实现（analysis.ts）会间接 import `node:fs`（题库加载器）。
// ---------------------------------------------------------------------------

/** 置信区间。 */
export type Interval = { lo: number; hi: number };

/** 信度分析（Cronbach α）逐维度结果。 */
export type AlphaRow = {
  scaleKey: string;
  scaleName: string;
  scaleType: string;
  domainKey: string;
  domainName: string;
  /**
   * Cronbach α；无定义时为 null（**不写 0**）。
   * α 在数据内部矛盾时**允许为负**，如实返回、不在引擎层截断。
   */
  alpha: number | null;
  /**
   * α 的 95% 百分位 bootstrap 区间（固定种子 → 同一份数据每次得到同一区间）。
   * 小样本下这个区间会很宽 —— 那正是最需要被看到的信息。
   */
  ci: Interval | null;
  /** 题目数 k。 */
  k: number;
  /** 参与计算的被试数（该维度**完整作答**者，listwise）。 */
  n: number;
  /** 因该维度存在缺失而被整行剔除的被试数。 */
  droppedIncomplete: number;
  /** α 无定义时的原因，便于 UI 直接展示。 */
  reason?: string;
  /**
   * 题目平均两两相关（由 Spearman-Brown 反解）。
   * 它剔除了「题目数 k」对 α 的影响，因此比 α 本身更适合跨维度比较。
   */
  meanInterItemR: number | null;
  /** 启发式等级描述（通用惯例阈值，**非本平台常模**）；α 无定义时为 null。 */
  grade: string | null;
};

export type ReliabilityResult = {
  rows: AlphaRow[];
  /** 参与分析的「已完成作答」人数。 */
  n: number;
  notes: string[];
  warnings: string[];
};

export type CorrelationResult = {
  keys: string[];
  names: string[];
  /** 与 keys 等长：每个维度所属量表 key（用于热力图分区着色）。 */
  scaleKeys: string[];
  /** matrix[i][j] = r（对角线在有效时恒为 1）。 */
  matrix: (number | null)[][];
  /** counts[i][j] = 成对有效样本量（**每格不同**，必须展示）。 */
  counts: number[][];
  /** pValues[i][j] = 双尾 p（H0: ρ = 0）。 */
  pValues: (number | null)[][];
  /** 参与者数（相关分析的整体样本量）。 */
  n: number;
  /** 唯一配对数量 = k(k-1)/2。 */
  pairCount: number;
  /** Bonferroni 校正后的显著性阈值 = 0.05 / pairCount。 */
  bonferroniAlpha: number;
  /** 未校正 p < 0.05 的配对数（含多重比较造成的虚高）。 */
  sigUncorrected: number;
  /** 通过 Bonferroni 校正的配对数。 */
  sigCorrected: number;
  /** r 在 95% 置信水平下的近似半宽（Fisher z 近似）；n < 4 时为 null。 */
  rCiHalfWidth: number | null;
  notes: string[];
  warnings: string[];
};

export type ItemOptionCount = { value: number; count: number };

/** 单题反应分布。 */
export type ItemRow = {
  code: string;
  text: string;
  scaleKey: string;
  scaleName: string;
  domainKey: string;
  domainName: string;
  reverse: boolean;
  /** 1–5 各档的作答人数（含计数为 0 的档，保证图不塌陷）。 */
  options: ItemOptionCount[];
  /**
   * 1–5 各档**重编码后**的人数。
   * 反向题的原始分布与构念方向相反（原始选 1 表示构念上高分），因此
   * 地板 / 天花板效应必须按本字段判定，否则会把反向题误报成地板效应。
   */
  recodedOptions: ItemOptionCount[];
  /** 未作答人数（含未完成会话者）。 */
  missing: number;
  /** 有效作答人数。 */
  n: number;
  /** 原始分均值（未重编码）——反向题会自然偏低，属正常。 */
  rawMean: number | null;
  /** 重编码后均值（跨题可比）。 */
  recodedMean: number | null;
  rawSd: number | null;
  /** 所有有效作答取值相同 → 该题零方差，对 α 无贡献、也不能区分被试。 */
  noVariance: boolean;
  /** 在**构念方向**上选择最低档的占比 ≥ 阈值（按 recodedOptions 判定）。 */
  floorEffect: boolean;
  /** 在**构念方向**上选择最高档的占比 ≥ 阈值（按 recodedOptions 判定）。 */
  ceilingEffect: boolean;
};

export type ItemGroup = {
  scaleKey: string;
  scaleName: string;
  domainKey: string;
  domainName: string;
  items: ItemRow[];
};

export type ItemsResult = {
  groups: ItemGroup[];
  likertOptions: { value: number; label: string }[];
  /** 参与者数（每题的 n + missing 应等于它，这是可断言的守恒关系）。 */
  n: number;
  notes: string[];
  warnings: string[];
};
