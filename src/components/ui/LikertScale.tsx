"use client";

import { cn } from "@/lib/utils";

const DEFAULT_LABELS = [
  "非常不符合",
  "比较不符合",
  "中立",
  "比较符合",
  "非常符合",
];

const DEFAULT_SHORT_LABELS = ["很不符", "不太", "中立", "比较", "很符合"];

/**
 * Likert 5 点量表选项组件（受控）。
 * - value: 当前选中值（1–5），未选为 undefined。
 * - onChange: 选择回调。
 * - 纯展示用法（无 onChange）时也可静态渲染，用于骨架/预览。
 *
 * 移动端适配（P0-3）：
 *  - 窄屏（<sm）只显示「数字 + 缩写标签」，避免长标签在 5 列里拥挤换行；
 *  - 中屏及以上显示完整文案；
 *  - 每个按钮最小高度 44px，满足移动端可点击热区规范。
 * 注意：本组件不改写评分逻辑，仅负责交互与样式；评分在 src/lib/scoring。
 */
export function LikertScale({
  name,
  value,
  onChange,
  disabled = false,
  labels = DEFAULT_LABELS,
  shortLabels,
}: {
  name: string;
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  labels?: string[];
  /** 窄屏缩写标签；缺省回退到 labels。 */
  shortLabels?: string[];
}) {
  const shorts = shortLabels ?? labels;
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="grid grid-cols-5 gap-1.5 sm:gap-2"
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
              "flex min-h-[44px] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors",
              selected
                ? "border-primary bg-primary/5 text-primary"
                : "border-line text-slate-600 hover:border-primary/40",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <span className="text-sm font-semibold leading-none">{v}</span>
            <span className="mt-1 hidden text-[11px] leading-tight sm:block">
              {label}
            </span>
            <span className="mt-1 block text-[10px] leading-tight sm:hidden">
              {shorts[idx] ?? label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
