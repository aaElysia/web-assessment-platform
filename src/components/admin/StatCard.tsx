import { Card } from "@/components/ui/Card";

/**
 * 仪表盘指标卡（纯展示，可用于服务端组件）。
 * value 传字符串而非数字，是为了让「—」这类占位符也能自然表达（缺失 ≠ 0）。
 */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
