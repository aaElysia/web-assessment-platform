import type { ResultDomain, ResultPayload, ResultScale } from "@/lib/client/api";
import { AI_COLORS, DIMENSION_COLORS } from "@/lib/design/colors";

/**
 * 结果视图模型（纯函数）。
 *
 * 为什么单独抽出来：
 *  - 图表数据结构（雷达图/柱状图要的字段形状）与「业务结果」是两件事，混在组件里就没法单测；
 *  - 这里全是无副作用的映射，可以被单元测试锁定，组件只负责渲染。
 */

/** 雷达图的一个轴。`missing` 为 true 表示该维度不可评分（score 被置 0 仅为占位）。 */
export type RadarPoint = {
  key: string;
  name: string;
  score: number;
  missing: boolean;
};

/** 条形图的一根柱。`concern` 为 true 表示该维度语义反向（越高代表越担忧）。 */
export type BarPoint = {
  key: string;
  name: string;
  score: number;
  missing: boolean;
  concern: boolean;
  color: string;
};

export function findScaleByType(
  payload: ResultPayload | null | undefined,
  type: string
): ResultScale | null {
  if (!payload) return null;
  return payload.scales.find((s) => s.type === type) ?? null;
}

function findDomain(scale: ResultScale | null, key: string): ResultDomain | null {
  if (!scale) return null;
  return scale.domains.find((d) => d.key === key) ?? null;
}

/**
 * Big Five 雷达图数据，按 O→C→E→A→N 固定顺序输出。
 *
 * 为什么不可评分的维度也要保留在轴里：雷达图的轴集合必须稳定，
 * 若动态删除某个维度，读者会误以为该维度"不存在"而非"未计分"。
 * 因此保留轴、以 0 占位，并由 `missing` 标记，UI 侧必须显式提示。
 */
export function toRadarData(scale: ResultScale | null): RadarPoint[] {
  const order = ["O", "C", "E", "A", "N"];
  if (!scale) return [];

  return order
    .map((key) => {
      const d = findDomain(scale, key);
      if (!d) return null;
      return {
        key: d.key,
        name: d.name,
        score: d.score ?? 0,
        missing: d.score === null,
      } satisfies RadarPoint;
    })
    .filter((x): x is RadarPoint => x !== null);
}

/**
 * 判断某维度是否为「反向语义」维度（越高代表越负面）。
 *
 * 判定依据来自题库配置 `polarity`（当前 CN 为 "higher = more concern"），
 * 并保留 CN 兜底，避免配置漏填时把反向维度当正向展示——那会直接误导读者。
 */
export function isConcernDomain(domain: Pick<ResultDomain, "key" | "polarity">): boolean {
  if (domain.key === "CN") return true;
  return /concern/i.test(domain.polarity ?? "");
}

/**
 * AI 采纳态度条形图数据，按量表中声明的维度顺序输出。
 * CN（担忧）带 `concern: true` 与独立配色，UI 必须给出语义提示，
 * 否则「柱子高」会被误读为「态度积极」——这是本维度最容易被读错的地方。
 */
export function toBarData(scale: ResultScale | null): BarPoint[] {
  if (!scale) return [];
  return scale.domains.map((d) => ({
    key: d.key,
    name: d.name,
    score: d.score ?? 0,
    missing: d.score === null,
    concern: isConcernDomain(d),
    color: AI_COLORS[d.key] ?? "#64748b",
  }));
}

/** 是否存在不可评分（incomplete）的维度 —— 有则不展示"整体画像"类结论。 */
export function hasIncompleteDomains(payload: ResultPayload | null): boolean {
  if (!payload) return false;
  return payload.scales.some((s) => s.domains.some((d) => d.incomplete));
}

/** 维度色（供 Big Five 列表使用）。 */
export function dimensionColor(key: string): string {
  return DIMENSION_COLORS[key] ?? "#64748b";
}

/** 分数展示：null → 「—」，否则保留 2 位小数。 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "—";
  return score.toFixed(2);
}

/** 作答完成度展示：0–1 → 百分比整数。 */
export function formatCompletion(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}
