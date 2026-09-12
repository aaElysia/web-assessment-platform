/**
 * 可视化的颜色单一来源。
 *
 * 为什么单独一个文件：
 *  - Recharts 只接受具体色值（hex/rgb），无法读取 Tailwind 工具类，因此图表必须拿到硬编码色值；
 *  - 若在多个组件里各自写一遍，迟早出现「雷达图是紫、图例是蓝」的不一致。
 *
 * ⚠️ 维护约定：本文件的色值与 `tailwind.config.ts` 中 `dimension.*` / `ai.*` 必须保持一致。
 * 改动任一处的配色时，请同步另一处。
 */

/** Big Five 维度色（与 tailwind.config.ts 的 dimension.* 对齐）。 */
export const DIMENSION_COLORS: Record<string, string> = {
  O: "#8b5cf6", // 开放性 Openness
  C: "#3b82f6", // 尽责性 Conscientiousness
  E: "#f59e0b", // 外向性 Extraversion
  A: "#10b981", // 宜人性 Agreeableness
  N: "#f43f5e", // 情绪敏感性 Neuroticism
};

/** AI 采纳态度维度色（与 tailwind.config.ts 的 ai.* 对齐）。 */
export const AI_COLORS: Record<string, string> = {
  PU: "#0ea5e9", // 感知有用性
  TR: "#6366f1", // 信任
  WA: "#10b981", // 采纳意愿
  LA: "#f59e0b", // 学习态度
  CN: "#ef4444", // 担忧（语义反向）
};

/** 分带语义色（low / medium / high），供徽标与进度条使用。 */
export const BAND_COLORS: Record<string, string> = {
  low: "#64748b",
  medium: "#0ea5e9",
  high: "#10b981",
};

/**
 * Likert 1–5 各档的**单调明度阶梯**（浅 = 低档，深 = 高档）。
 *
 * 刻意不使用「红→绿」这类评价性色阶：在本平台上「选 5」不代表「好」，
 * 尤其反向题与担忧维度（CN）方向上恰好相反。用明度阶梯只表达「档位高低」，
 * 不夹带价值判断。
 */
export const LIKERT_SHADES: Record<number, string> = {
  1: "#e0f2fe",
  2: "#bae6fd",
  3: "#7dd3fc",
  4: "#38bdf8",
  5: "#0ea5e9",
};

/**
 * 相关热力图发散色阶的两个基色（RGB 三元组字符串，便于拼接 alpha）。
 * 正相关用暖色、负相关用冷色，0 附近接近透明 —— 与国内「暖色 = 同向」的
 * 直觉一致，且不会与 Likert 明度阶梯混淆。
 */
export const CORRELATION_POSITIVE_RGB = "220,38,38"; // red-600
export const CORRELATION_NEGATIVE_RGB = "37,99,235"; // blue-600
