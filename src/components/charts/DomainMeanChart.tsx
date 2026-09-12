"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AI_COLORS, DIMENSION_COLORS } from "@/lib/design/colors";
import type { DomainSummary } from "@/lib/admin/types";

/**
 * 各维度均值条形图。
 *
 * 三个刻意的设计约束：
 *  1. **Y 轴固定 0–5**，不做自适应缩放。自适应会把 3.1 与 3.4 拉成巨大差异，
 *     在小样本下制造出并不存在的「发现」。
 *  2. **不画误差棒**。n = 1 时样本标准差无定义；若用 0 代替，图上就是
 *     「误差为 0」——一个明确的错误陈述。误差信息改为在悬浮提示与明细表中
 *     以文字给出（null 显示为「无法估计」）。
 *  3. **保留 3.0 中位参考线**，让「相对高/低」有参照，而不是只看柱高比较。
 */

type Point = {
  key: string;
  name: string;
  label: string;
  mean: number;
  sd: number | null;
  n: number;
  missing: boolean;
  color: string;
  concern: boolean;
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-900">
        {p.key} · {p.name}
      </p>
      {p.missing ? (
        <p className="mt-1 text-muted">该维度无可用作答，未给出分数</p>
      ) : (
        <>
          <p className="mt-1 text-slate-700">
            均值 {p.mean.toFixed(2)}　n = {p.n}
          </p>
          <p className="text-muted">
            标准差 {p.sd === null ? "—（n < 2，无法估计）" : p.sd.toFixed(2)}
          </p>
        </>
      )}
      {p.concern && (
        <p className="mt-1 text-red-600">
          语义反向：数值越高 = 担忧越多（不是越积极）
        </p>
      )}
    </div>
  );
}

export function DomainMeanChart({ domains }: { domains: DomainSummary[] }) {
  const data: Point[] = domains.map((d) => ({
    key: d.key,
    name: d.name,
    label: d.key,
    mean: d.mean ?? 0,
    sd: d.sd,
    n: d.n,
    missing: d.mean === null,
    color: DIMENSION_COLORS[d.key] ?? AI_COLORS[d.key] ?? "#64748b",
    concern:
      (d.polarity ?? "").toLowerCase().includes("concern") || d.key === "CN",
  }));

  const hasData = data.some((d) => !d.missing);

  if (!hasData) {
    return (
      <p className="text-sm text-muted">
        尚无可用维度分：需要至少一位参与者完成某维度的作答（缺失超过 1 题即不可用）。
      </p>
    );
  }

  return (
    <div>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
            <ReferenceLine y={3} stroke="#94a3b8" strokeDasharray="4 4" />
            <Bar dataKey="mean" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.color}
                  fillOpacity={d.missing ? 0.25 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        纵轴固定 0–5（不做缩放）；虚线为量表中点 3.0。柱高为均值，不含误差信息——
        误差须结合样本量阅读，见下方明细表。
      </p>
    </div>
  );
}
