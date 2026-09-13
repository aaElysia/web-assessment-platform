"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarPoint } from "@/lib/result/view-model";

/**
 * AI 采纳态度维度条形图。
 *
 * ⚠️ 关键呈现约束：CN（对 AI 的担忧）语义与其它四个维度相反（越高 = 越担忧）。
 * 因此这里 **不翻转** 它的数值（翻转会与合成指数里的域级反转重复，也容易造成口径混乱），
 * 而是用独立配色 + 明确文案提示语义方向，避免"柱子高 = 态度积极"的误读。
 */
export function AiDomainBar({ data }: { data: BarPoint[] }) {
  if (data.length === 0) return null;

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 28, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: "#334155", fontSize: 12 }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [value.toFixed(2), "维度得分（1–5）"]}
            labelFormatter={(key: string) =>
              data.find((d) => d.key === key)?.name ?? key
            }
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
            <LabelList
              dataKey="score"
              position="top"
              formatter={(v: number) => (v === 0 ? "" : v.toFixed(2))}
              style={{ fill: "#475569", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 读图提示：独立成框，避免与下方逐维度分数列表视觉粘连 */}
      <div className="mt-6 flex gap-2 rounded-lg border border-slate-200 border-l-2 border-l-slate-400 bg-slate-50 px-3.5 py-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-xs leading-relaxed text-slate-600">
          <span className="font-medium text-slate-700">读图提示：</span>
          PU 感知有用性 / TR 信任 / WA 采纳意愿 / LA 学习态度 —— 数值越高越积极；
          <span className="font-medium text-red-600">CN 对 AI 的担忧为反向语义，数值越高表示担忧越多</span>
          ，并非越积极。
        </p>
      </div>
    </div>
  );
}
