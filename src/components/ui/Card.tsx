import { cn } from "@/lib/utils";

/**
 * 卡片容器：圆角、细边框、浅阴影。作为页面主要信息区块的视觉边界。
 * 可选 title / subtitle 渲染标准卡片头部。
 */
export function Card({
  className,
  children,
  title,
  subtitle,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6",
        className
      )}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
