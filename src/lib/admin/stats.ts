import { getScales } from "@/lib/questionnaire/loader";
import { scoreAll, type Answers, type ScoreResult } from "@/lib/scoring/score";
import { mean, round, sampleStdDev } from "@/lib/scoring/stats";
import type {
  AdminRecord,
  AdminStats,
  BandCounts,
  DomainSummary,
  ExportTable,
  HistogramBin,
  IndexSummary,
} from "./types";

/**
 * 管理端统计聚合 —— 纯函数，不做任何 IO。
 *
 * 三条不可让步的诚实性约束（本文件是它们的落点）：
 *  1. **逐维报 n**。某维度缺失 > 1 题即判为不可用（引擎口径），因此
 *     各维度的有效样本数天然不同。用「总样本量」统一标注会谎报精度。
 *  2. **n < 2 时 sd 为 null，不写 0**。样本标准差在 n=1 时未定义；
 *     写 0 等于宣称「无差异」，是一个可测量的错误结论。
 *  3. **无数据时为 null，不写 0**。0 分与「没有分」是两件事
 *     （完成率 0% 与「还没有人参与」必须区分）。
 */

/** 低于此样本量时，均值 / 分带都不足以支撑任何推断（经验阈值）。 */
export const MIN_RELIABLE_N = 30;

/** 合成指数直方图分箱数：1–5 等宽 0.5，共 8 箱。 */
export const INDEX_BIN_COUNT = 8;

const EMPTY_BANDS = (): BandCounts => ({ low: 0, medium: 0, high: 0 });

/** 中位数（偶数个取中间两者平均）；空数组返回 null。 */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 等宽直方图分箱。
 * 上界归属最后一箱（即 5.0 计入 [4.5, 5.0]），避免最大值被丢到箱外。
 */
export function buildHistogram(
  values: number[],
  min = 1,
  max = 5,
  binCount = INDEX_BIN_COUNT
): HistogramBin[] {
  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    from: round(min + i * width, 4),
    to: round(min + (i + 1) * width, 4),
    label: `${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`,
    count: 0,
  }));

  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]!.count++;
  }
  return bins;
}

/** 把秒数格式化为「x 分 y 秒」；null 返回「—」。 */
export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const total = Math.max(0, Math.round(sec));
  if (total < 60) return `${total} 秒`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return s === 0 ? `${m} 分` : `${m} 分 ${s} 秒`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h} 小时` : `${h} 小时 ${rm} 分`;
}

const BASE_NOTES = [
  "分带（相对偏低 / 中等 / 相对偏高）为启发式参考，本平台尚未建立常模，不代表人群百分位。",
  "各维度 n 可能不同：某维度缺失超过 1 题即判为不可用、不计入均值，因此不会用估计值顶替。",
  "「端到端耗时」＝自创建匿名 ID 至提交作答的时长，含阅读知情同意与中途停留，不等于纯作答时长。",
  "完成率以「已创建匿名 ID 的总数」为分母（含中途放弃者），因此天然偏低。",
  "本页所有数字仅为量表层面的自我报告汇总，不构成任何临床诊断、心理评估或医疗建议。",
];

/**
 * 预先为每位参与者评分一次。
 * 三个汇总函数（维度 / 指数 / 导出）都要用同一份结果，重复评分既慢
 * 又可能出现「同一次请求内两处口径不一致」的风险，因此集中评分后复用。
 */
export function scoreRecords(records: AdminRecord[]): (ScoreResult | null)[] {
  return records.map((r) => (r.session ? scoreAll(r.session.answers) : null));
}

/** 逐维统计：均值 / sd / 分带计数，n 为「该维度可用」的被试数。 */
export function summarizeDomains(
  records: AdminRecord[],
  scored: (ScoreResult | null)[] = scoreRecords(records)
): DomainSummary[] {
  const scales = getScales();
  const out: DomainSummary[] = [];
  for (const scale of scales) {
    for (const domain of scale.domains) {
      const values: number[] = [];
      const bands = EMPTY_BANDS();

      for (const result of scored) {
        const d = result?.scales
          .find((s) => s.scaleKey === scale.key)
          ?.domains.find((x) => x.key === domain.key);
        // band 与 score 同生同灭：band 为 null ⇔ score 为 null（incomplete）。
        if (!d || d.score === null || !d.band) continue;
        values.push(d.score);
        bands[d.band.tone]++;
      }

      out.push({
        key: domain.key,
        name: domain.name,
        scaleKey: scale.key,
        scaleName: scale.name,
        scaleType: scale.type,
        polarity: domain.polarity,
        n: values.length,
        mean: values.length > 0 ? round(mean(values), 4) : null,
        sd: values.length >= 2 ? round(sampleStdDev(values), 4) : null,
        bands,
      });
    }
  }
  return out;
}

/** 合成指数汇总（AI 采纳指数）。 */
export function summarizeIndex(
  records: AdminRecord[],
  scored: (ScoreResult | null)[] = scoreRecords(records)
): IndexSummary {
  const scale = getScales().find((s) => s.composite);
  if (!scale?.composite) {
    return {
      key: "",
      label: "",
      formula: null,
      n: 0,
      mean: null,
      sd: null,
      bands: EMPTY_BANDS(),
      histogram: buildHistogram([]),
    };
  }

  const values: number[] = [];
  const bands = EMPTY_BANDS();
  for (const result of scored) {
    const comp = result?.scales.find((s) => s.scaleKey === scale.key)?.composite;
    if (!comp || comp.score === null || !comp.band) continue;
    values.push(comp.score);
    bands[comp.band.tone]++;
  }

  return {
    key: scale.composite.key,
    label: scale.composite.label ?? scale.composite.key,
    formula: scale.composite.formula ?? null,
    n: values.length,
    mean: values.length > 0 ? round(mean(values), 4) : null,
    sd: values.length >= 2 ? round(sampleStdDev(values), 4) : null,
    bands,
    histogram: buildHistogram(values),
  };
}

/** 端到端耗时（创建 ID → 提交作答）。 */
export function summarizeElapsed(records: AdminRecord[]): {
  n: number;
  meanSec: number | null;
  medianSec: number | null;
} {
  const secs: number[] = [];
  for (const r of records) {
    if (!r.session?.completedAt) continue;
    const sec = (r.session.completedAt.getTime() - r.createdAt.getTime()) / 1000;
    if (Number.isFinite(sec) && sec >= 0) secs.push(sec);
  }
  return {
    n: secs.length,
    meanSec: secs.length > 0 ? round(mean(secs), 1) : null,
    medianSec: secs.length > 0 ? round(median(secs)!, 1) : null,
  };
}

/** 汇总全部管理端指标。 */
export function computeAdminStats(records: AdminRecord[]): AdminStats {
  const participants = records.length;
  const consented = records.filter((r) => r.consentAt !== null).length;
  const withSession = records.filter((r) => r.session !== null);
  const completed = withSession.length;

  const elapsed = summarizeElapsed(records);
  const scored = scoreRecords(records);
  const domains = summarizeDomains(records, scored);
  const index = summarizeIndex(records, scored);

  let latest: number | null = null;
  for (const r of records) {
    const t = r.session?.completedAt?.getTime();
    if (t !== undefined && (latest === null || t > latest)) latest = t;
  }

  const warnings: string[] = [];
  if (participants === 0) {
    warnings.push(
      "尚未收集到任何数据：请先完成至少一次测评，本页所有指标才有意义。"
    );
  } else if (completed === 0) {
    warnings.push(
      "已有匿名 ID 创建记录，但尚无完成的作答：均值与分布为空属于预期，而非计算失败。"
    );
  }
  if (completed > 0 && completed < MIN_RELIABLE_N) {
    warnings.push(
      `当前完成样本 n=${completed}（< ${MIN_RELIABLE_N}）：均值、标准差与分带均不稳定，` +
        `只能作为趋势参考，不可用于推断总体或与他人比较。`
    );
  }
  if (domains.some((d) => d.n === 1)) {
    warnings.push(
      "存在 n=1 的维度：标准差无法估计（表中显示为 —），其均值几乎是噪声。"
    );
  }
  if (index.n > 0 && index.n < 3) {
    warnings.push(
      "合成指数的可用样本不足 3 人：分布图仅示意，不构成任何分布形态结论。"
    );
  }
  if (elapsed.n > 0 && elapsed.medianSec !== null && elapsed.medianSec < 5) {
    warnings.push(
      "端到端耗时中位数不足 5 秒：真人完成 60 题需要数分钟，因此这通常意味着" +
        "数据来自脚本 / 自动化提交（或旧数据的会话时间戳缺失），" +
        "该指标不可当作「作答时长」使用。"
    );
  }

  return {
    totals: { participants, consented, completed },
    completionRate: participants > 0 ? round(completed / participants, 4) : null,
    elapsed,
    latestCompletedAt: latest === null ? null : new Date(latest).toISOString(),
    domains,
    index,
    notes: [...BASE_NOTES],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// CSV 导出
// ---------------------------------------------------------------------------

/** 导出中**必须**出现的元数据列（在维度列之前）。 */
const META_COLUMNS = [
  "participant_id",
  "status",
  "created_at",
  "consent_at",
  "completed_at",
  "elapsed_sec",
  "age_range",
  "gender",
  "education",
] as const;

/** 维度列之后的收尾列。 */
const TAIL_COLUMNS = [
  "answered_items",
  "item_total",
  "completion_rate",
] as const;

/**
 * 单元格转义。
 *
 * ⚠️ 公式注入防护：Excel / Sheets / Numbers 会把以 `=` `+` `-` `@`
 * 或 TAB / CR 开头的单元格当**公式**执行（CSV Injection / DDE）。
 * 人口学字段来自客户端自由文本，属于不可信输入，因此统一加前导单引号
 * 使其退化为文本。数值列本身非负，不会被误伤。
 */
export function csvCell(value: string | number | null | undefined): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (typeof value === "number") s = Number.isFinite(value) ? String(value) : "";
  else s = value;

  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** 把表转成 RFC 4180 风格的 CSV 文本（CRLF 换行，Excel 友好）。 */
export function toCsv(table: ExportTable): string {
  const lines = [
    table.header.map(csvCell).join(","),
    ...table.rows.map((row) => row.map(csvCell).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** 端到端耗时（秒）：创建 ID → 提交作答；无完成时间返回 null。 */
export function elapsedSecOf(r: AdminRecord): number | null {
  if (!r.session?.completedAt) return null;
  const sec = (r.session.completedAt.getTime() - r.createdAt.getTime()) / 1000;
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.round(sec);
}

/**
 * 构建「原始作答」导出表（宽表：一行一名参与者、一列一道题）。
 *
 * 为什么需要它：`buildExportTable` 输出的是**程序已经算好的维度分**，
 * 用它做「独立复核」等于用程序的结果验证程序。要真正交叉验证，必须给出
 * 最原始的数据，让复核者在表格软件里从零重算（包括反向重编码这一步）。
 *
 * 列 = 匿名元数据 + 按题库顺序排列的全部题目 code，值为**原始 1–5**，
 * 未作答留空。刻意不附带任何重编码结果，以免复核者把重编码值当成原始值
 * 再重编码一次（那会得到一个看似合理的错误答案）。
 */
export function buildRawExportTable(records: AdminRecord[]): ExportTable {
  const itemCodes: string[] = [];
  for (const s of getScales()) for (const it of s.items) itemCodes.push(it.id);

  const header = [...META_COLUMNS, ...itemCodes];

  const rows = records.map((r) => {
    const elapsed = elapsedSecOf(r);
    return [
      r.id,
      r.status,
      r.createdAt.toISOString(),
      r.consentAt ? r.consentAt.toISOString() : "",
      r.session?.completedAt ? r.session.completedAt.toISOString() : "",
      elapsed === null ? "" : String(elapsed),
      r.ageRange ?? "",
      r.gender ?? "",
      r.education ?? "",
      ...itemCodes.map((code) => {
        const v = r.session?.answers[code];
        return v === undefined || !Number.isFinite(v) ? "" : String(v);
      }),
    ];
  });

  return { header, rows };
}

/**
 * 构建「维度分」导出表（长表：一行一名参与者）。
 *
 * 隐私：只输出匿名 UUID + 粗粒度人口学分桶 + 维度分。
 * 不存在任何直接标识符（姓名 / 邮箱 / IP / 设备指纹均未收集）。
 */
export function buildExportTable(records: AdminRecord[]): ExportTable {
  const scales = getScales();
  const domainCols: { key: string; scaleKey: string; name: string }[] = [];
  for (const s of scales) {
    for (const d of s.domains) {
      domainCols.push({ key: d.key, scaleKey: s.key, name: d.key });
    }
  }
  const compositeKey = scales.find((s) => s.composite)?.composite?.key ?? null;

  const header = [
    ...META_COLUMNS,
    ...domainCols.map((d) => d.name),
    ...(compositeKey ? [compositeKey] : []),
    ...TAIL_COLUMNS,
  ];

  const rows = records.map((r) => {
    const answers: Answers = r.session ? r.session.answers : {};
    const result = r.session ? scoreAll(answers) : null;

    const domainCells = domainCols.map((col) => {
      const d = result?.scales
        .find((s) => s.scaleKey === col.scaleKey)
        ?.domains.find((x) => x.key === col.key);
      // 不可用维度留空（不是 0）：空 = 无分，0 = 低分，语义完全不同。
      return d?.score === null || d?.score === undefined
        ? ""
        : (d.score as number).toFixed(4);
    });

    const compositeCell = compositeKey
      ? (() => {
          const c = result?.scales.find((s) => s.composite)?.composite;
          return c?.score === null || c?.score === undefined
            ? ""
            : (c.score as number).toFixed(4);
        })()
      : null;

    const elapsedSec = elapsedSecOf(r);

    return [
      r.id,
      r.status,
      r.createdAt.toISOString(),
      r.consentAt ? r.consentAt.toISOString() : "",
      r.session?.completedAt ? r.session.completedAt.toISOString() : "",
      elapsedSec === null ? "" : String(elapsedSec),
      r.ageRange ?? "",
      r.gender ?? "",
      r.education ?? "",
      ...domainCells,
      ...(compositeCell === null ? [] : [compositeCell]),
      result ? String(result.answeredTotal) : "",
      result ? String(result.itemTotal) : "",
      result ? result.completionRate.toFixed(4) : "",
    ];
  });

  return { header, rows };
}
