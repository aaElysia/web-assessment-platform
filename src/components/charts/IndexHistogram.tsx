"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistogramBin } from "@/lib/admin/types";

/**
 * AI 采纳指数分布直方图（1–5，等宽 0.5，共 8 箱）。
 *
 * 注意：**箱高是人数，不是概率**。样本量很小时（试点常见），
 * 直方图形状几乎完全由个别被试决定，因此图上必须显著标注 n，
 * 且不给出任何「分布形态」的结论性文案。
 */
export function IndexHistogram({
  bins,
  n,
  mean,
}: {
  bins: HistogramBin[];
  n: number;
  mean: number | null;
}) {
  if (n === 0) {
    return (
      <p className="text-sm text-muted">
        尚无可用样本。合成指数要求 PU / TR / WA / LA / CN 五个维度**全部**有分，
        缺任一维度即不计算（不做部分合成）。
      </p>
    );
  }

  return (
    <div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 4, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              formatter={(value: number) => [`${value} 人`, "人数"]}
              labelFormatter={(label: string) => `指数区间 ${label}`}
            />
            <Bar
              dataKey="count"
              fill="#0ea5e9"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        n = {n}（可用样本）
        {mean === null ? "" : `，均值 ${mean.toFixed(2)}`}。
        纵轴为**人数**，横轴为指数区间（1–5，等宽 0.5）。
        样本量小时箱高几乎由个别被试决定，不宜据此讨论「分布形态」。
      </p>
    </div>
  );
}
