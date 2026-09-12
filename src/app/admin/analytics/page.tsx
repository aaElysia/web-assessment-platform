import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Alert";
import { AdminNav } from "@/components/ui/AdminNav";
import { StatCard } from "@/components/admin/StatCard";
import { AlphaTable } from "@/components/admin/AlphaTable";
import { CorrelationHeatmap } from "@/components/charts/CorrelationHeatmap";
import { ItemDistributionChart } from "@/components/charts/ItemDistributionChart";
import { requireAdminPage } from "@/lib/admin/guard";
import { loadAdminAnalysis } from "@/lib/admin/load";

export const dynamic = "force-dynamic";

/**
 * 管理端分析页。
 *
 * 页面与服务端渲染（非客户端取数），出于两个理由：
 *  1. 分析结果依赖大量计算（α 含 bootstrap），放在服务端一次算完比在浏览器里
 *     重算更省客户端资源，也避免把统计逻辑打进前端包；
 *  2. Step 7 的教训——客户端渲染的页面一旦取数出错就是「标题在、内容空白」，
 *     服务端渲染至少能让失败以可见的错误形式出现。
 *
 * 与三个 `/api/admin/*` 分析端点共用同一批 `analysis.ts` 纯函数，
 * 因此「页面看到的」与「API 返回的」永远是同一份数字。
 */
export default async function AdminAnalyticsPage() {
  requireAdminPage();
  const { reliability, correlation, items } = await loadAdminAnalysis();

  // 合并去重：三个分析各自的警示口径不同，但同一条不必重复显示。
  const warnings = [
    ...new Set([
      ...reliability.warnings,
      ...correlation.warnings,
      ...items.warnings,
    ]),
  ];
  const notes = [
    ...new Set([...reliability.notes, ...correlation.notes, ...items.notes]),
  ];

  const usableAlphas = reliability.rows.filter((r) => r.alpha !== null);
  const lowest = usableAlphas.reduce<{ key: string; alpha: number } | null>(
    (acc, r) => (acc === null || r.alpha! < acc.alpha ? { key: r.domainKey, alpha: r.alpha! } : acc),
    null
  );

  return (
    <Container className="max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">管理端 · 分析</h1>
      <p className="mt-2 text-sm text-muted">
        量表层面的心理测量学指标：内部一致性（Cronbach α）、维度间相关（Pearson r）、
        题项反应分布。
      </p>
      <AdminNav active="/admin/analytics" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="参与分析的完成样本"
          value={String(reliability.n)}
          hint="每名参与者取其最新一次已完成会话"
        />
        <StatCard
          label="可估计 α 的维度"
          value={`${usableAlphas.length} / ${reliability.rows.length}`}
          hint={
            lowest
              ? `其中最低：${lowest.key} = ${lowest.alpha.toFixed(3)}`
              : "暂无可用估计（样本或变异不足）"
          }
        />
        <StatCard
          label="校正后仍显著的维度配对"
          value={`${correlation.sigCorrected} / ${correlation.pairCount}`}
          hint={`未校正显著 ${correlation.sigUncorrected} 个；Bonferroni 阈值 ${correlation.bonferroniAlpha}`}
        />
      </div>

      {warnings.length > 0 && (
        <Alert tone="warning" className="mt-4">
          <p className="font-medium">解读前请先看这些限制</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Card className="mt-4" title="信度分析（Cronbach α）">
        <AlphaTable data={reliability} />
      </Card>

      <Card className="mt-4" title="相关分析（Pearson r）">
        <CorrelationHeatmap data={correlation} />
        <p className="mt-3 text-xs text-muted">
          共 {correlation.pairCount} 个配对，Bonferroni 校正阈值{" "}
          {correlation.bonferroniAlpha}；校正后仍显著{" "}
          <span className="font-medium text-slate-700">{correlation.sigCorrected}</span> 个，
          未校正显著 {correlation.sigUncorrected} 个。
          {correlation.rCiHalfWidth !== null && (
            <>整体 n = {correlation.n}，r 的 95% 置信半宽约 ±{correlation.rCiHalfWidth}。</>
          )}
        </p>
      </Card>

      <Card className="mt-4" title="题项反应分布">
        <ItemDistributionChart data={items} />
      </Card>

      <Card className="mt-4" title="口径、限制与独立复核">
        <div className="space-y-3 text-sm text-slate-700">
          <div>
            <p className="font-medium">口径与限制</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">独立复核（Excel 交叉验证）</p>
            <p className="mt-1 text-xs text-muted">
              分析结论不应只信任本页的计算。可下载原始作答，在表格软件中独立重算维度分与
              合成指数，再与程序输出逐格对账——
              <span className="font-medium text-slate-700">
                注意维度分是「反向重编码后的均值」
              </span>
              ，直接对原始作答取平均会得到错误的对账结果。
            </p>
            <p className="mt-1.5 flex flex-wrap gap-3 text-xs">
              <a className="text-primary underline" href="/api/admin/export?format=raw">
                下载原始作答 CSV（60 列，供独立手算）
              </a>
              <a className="text-primary underline" href="/api/admin/export?format=csv">
                下载维度分 CSV（程序输出，供对账）
              </a>
            </p>
            <p className="mt-1 text-xs text-muted">
              也可运行 <code className="rounded bg-slate-100 px-1">npm run verify:scoring</code>
              ：该脚本**不引用项目代码**，独立实现评分口径后与上述两处输出逐格比对。
            </p>
          </div>
        </div>
      </Card>
    </Container>
  );
}
