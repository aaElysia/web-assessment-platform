/**
 * 轻量 className 合并工具（避免引入 clsx 依赖）。
 * 过滤假值并以空格连接，便于条件化拼接 Tailwind 类。
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * 统一把时间格式化为「中国时区（Asia/Shanghai）」可读字符串。
 *
 * 为什么必须显式锁定时区：管理端页面在服务端渲染，若不指定 timeZone，
 * Vercel（UTC）会把 UTC 时间直接当成服务器本地时间展示，比北京时间慢 8 小时，
 * 造成「作答时间记录错误」的观感。锁定 Asia/Shanghai 后，任何部署环境都显示正确北京时间。
 * 结果为非有限时间时返回 "—"。
 */
export function formatCnDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}
