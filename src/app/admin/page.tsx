import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AdminNav } from "@/components/ui/AdminNav";
import { StatCard } from "@/components/admin/StatCard";
import { DomainStatsTable } from "@/components/admin/DomainStatsTable";
import { DomainMeanChart } from "@/components/charts/DomainMeanChart";
import { IndexHistogram } from "@/components/charts/IndexHistogram";
import { requireAdminPage } from "@/lib/admin/guard";
import { loadAdminStats } from "@/lib/admin/load";
import { MIN_RELIABLE_N, formatDuration } from "@/lib/admin/stats";
import { formatCnDateTime } from "@/lib/utils";
import { weakCredentialReasons } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 管理端仪表盘（真实数据）。
 *
 * 数据由服务端直接聚合（复用 `loadAdminStats()`），因此：
 *  - 不需要在浏览器里再调一次 API，也不会出现「页面与 API 数字不一致」；
 *  - 图表组件只接收已算好的数据，客户端不参与任何统计计算。
 */
export default async function AdminDashboardPage() {
  requireAdminPage();

  const stats = await loadAdminStats();
  const credentialWarnings = weakCredentialReasons();

  const total = stats.totals.participants;
  const pct = (n: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
  const num = (v: number | null, digits = 2) =>
    v === null ? "—" : v.toFixed(digits);
  const latest = stats.latestCompletedAt
    ? formatCnDateTime(stats.latestCompletedAt)
    : "—";

  const stages = [
    { label: "已创建匿名 ID", value: stats.totals.participants },
    { label: "已记录知情同意", value: stats.totals.consented },
    { label: "已完成作答", value: stats.totals.completed },
  ];

  return (
    <Container className="max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">管理端 · 仪表盘</h1>
      <p className="mt-2 text-sm text-muted">
        匿名作答的聚合视图。所有指标均为量表层面的汇总，用于量表的试点评估，
        不作个人诊断之用。
      </p>
      <AdminNav active="/admin" />

      {credentialWarnings.length > 0 && (
        <Alert tone="danger" className="mb-6">
          <p className="font-medium">⚠️ 当前管理端凭据仍不安全，请勿直接上线：</p>
          <ul className="mt-1 list-disc pl-5">
            {credentialWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="参与人数"
          value={String(stats.totals.participants)}
          hint="已创建的匿名 ID 总数"
        />
        <StatCard
          label="完成人数"
          value={String(stats.totals.completed)}
          hint="提交了完整作答会话"
        />
        <StatCard
          label="完成率"
          value={stats.completionRate === null ? "—" : `${Math.round(stats.completionRate * 100)}%`}
          hint="完成 / 创建（分母含放弃者，天然偏低）"
        />
        <StatCard
          label="端到端耗时（中位）"
          value={formatDuration(stats.elapsed.medianSec)}
          hint={`n = ${stats.elapsed.n}；含阅读同意与中途停留`}
        />
      </div>

      <Card className="mt-6" title="完成漏斗" subtitle="各阶段的绝对人数与占已创建 ID 的比例">
        <div className="space-y-4">
          {stages.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-slate-700">{s.label}</span>
                <span className="tabular-nums text-slate-900">
                  <span className="font-semibold">{s.value}</span>
                  <span className="ml-1.5 text-muted">({pct(s.value)})</span>
                </span>
              </div>
              <ProgressBar value={total > 0 ? (s.value / total) * 100 : 0} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">最新提交：{latest}</p>
      </Card>

      <Card
        className="mt-6"
        title="各维度均值"
        subtitle="Openness / Conscientiousness / Extraversion / Agreeableness / 情绪敏感性 + AI 态度五维度"
      >
        <DomainMeanChart domains={stats.domains} />
      </Card>

      <Card
        className="mt-6"
        title={`AI 采纳指数分布（${stats.index.label}）`}
        subtitle={`n = ${stats.index.n}，均值 ${num(stats.index.mean)}，标准差 ${
          stats.index.sd === null ? "—（n < 2，无法估计）" : stats.index.sd.toFixed(2)
        }`}
      >
        <IndexHistogram
          bins={stats.index.histogram}
          n={stats.index.n}
          mean={stats.index.mean}
        />
        <p className="mt-3 text-xs text-muted">
          分带人数：相对偏低 {stats.index.bands.low} · 中等 {stats.index.bands.medium} ·
          相对偏高 {stats.index.bands.high}
        </p>
      </Card>

      <Card
        className="mt-6"
        title="样本量与分带明细"
        subtitle="逐维 n 与标准差——解读任何均值之前都必须先看这两列"
      >
        <DomainStatsTable domains={stats.domains} />
      </Card>

      <Card className="mt-6" title="口径与边界说明" subtitle="以下文字须与任何对外报告保持一致">
        {stats.warnings.length > 0 && (
          <Alert tone="warning" className="mb-4">
            <ul className="list-disc space-y-1 pl-5">
              {stats.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {stats.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          样本量低于 {MIN_RELIABLE_N} 时，本页数字只能用于「量表是否可用」的
          技术性检查（如是否有题目全无变异），不适用于任何实质性结论。
        </p>
      </Card>
    </Container>
  );
}
