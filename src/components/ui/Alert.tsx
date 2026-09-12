import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "success" | "danger";

const toneClasses: Record<Tone, string> = {
  info: "border-line bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

/**
 * 提示框：用于免责声明、注意事项、状态反馈等。
 * 默认 info；免责/诊断相关声明统一用 warning 以强调。
 */
export function Alert({
  tone = "info",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
