"use client";

import { cn } from "@/lib/utils";

const DEFAULT_LABELS = [
  "非常不符合",
  "不太符合",
  "中立",
  "比较符合",
  "非常符合",
];

/**
 * Likert 5 点量表选项组件（受控）。
 * - value: 当前选中值（1–5），未选为 undefined。
 * - onChange: 选择回调（Step 5 接草稿状态）。
 * - 纯展示用法（无 onChange）时也可静态渲染，用于骨架/预览。
 * 注意：本组件不改写评分逻辑，仅负责交互与样式；评分在 src/lib/scoring。
 */
export function LikertScale({
  name,
  value,
  onChange,
  disabled = false,
  labels = DEFAULT_LABELS,
}: {
  name: string;
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  labels?: string[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="grid grid-cols-5 gap-2"
    >
      {labels.map((label, idx) => {
        const v = idx + 1;
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange?.(v)}
            className={cn(
              "flex flex-col items-center rounded-xl border px-1 py-2 text-center transition-colors",
              selected
                ? "border-primary bg-primary/5 text-primary"
                : "border-line text-slate-600 hover:border-primary/40",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <span className="text-sm font-semibold">{v}</span>
            <span className="mt-1 text-[11px] leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
