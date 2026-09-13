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
import { Alert } from "@/components/ui/Alert";

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
    <div className="w-full">
      {/* 图表容器：固定高度，读图提示框独立于其外，避免溢出遮挡下方明细 */}
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
      </div>

      {/* 读图提示：沿用站点统一的信息提示样式（Alert info），独立于图表流，不与下方明细重叠 */}
      <Alert tone="info" className="mt-6">
        <span className="font-medium text-slate-700">读图提示：</span>
        PU 感知有用性 / TR 信任 / WA 采纳意愿 / LA 学习态度 —— 数值越高越积极；
        <span className="font-medium text-red-600">CN 对 AI 的担忧为反向语义，数值越高表示担忧越多</span>
        ，并非越积极。
      </Alert>
    </div>
  );
}
