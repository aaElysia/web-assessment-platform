import { cn } from "@/lib/utils";

/**
 * 页面内容容器：居中、限制最大宽度，统一左右内边距与纵向间距。
 * 所有页面统一使用，保证视觉一致性。
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10",
        className
      )}
    >
      {children}
    </div>
  );
}
