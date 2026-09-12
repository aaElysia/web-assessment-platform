/**
 * 轻量 className 合并工具（避免引入 clsx 依赖）。
 * 过滤假值并以空格连接，便于条件化拼接 Tailwind 类。
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
