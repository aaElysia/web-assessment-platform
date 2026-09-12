"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { RadarPoint } from "@/lib/result/view-model";
import { DIMENSION_COLORS } from "@/lib/design/colors";

/**
 * Big Five 雷达图。
 *
 * 设计取舍：
 *  - 固定 0–5 的半径刻度（与 Likert 一致）。**不做**基于样本的归一化——
 *    小样本下归一化会让「相对分」看起来像「绝对水平」，属于典型的夸大呈现。
 *  - 数字轴刻度直接标注，读者可核验数值，而不是只能凭形状猜测。
 */
export function BigFiveRadar({ data }: { data: RadarPoint[] }) {
  if (data.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fill: "#334155", fontSize: 12 }}
          />
          <PolarRadiusAxis
            domain={[0, 5]}
            tickCount={6}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="维度得分"
            dataKey="score"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.28}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(value: number) => [value.toFixed(2), "得分（1–5）"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* 图例：颜色与维度一一对应，且标注「未计分」的维度。 */}
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: DIMENSION_COLORS[d.key] ?? "#64748b" }}
            />
            <span className="text-slate-600">
              {d.name}
              {d.missing ? "（未计分）" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
