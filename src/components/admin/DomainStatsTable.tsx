import { Badge } from "@/components/ui/Badge";
import type { DomainSummary } from "@/lib/admin/types";

/**
 * 各维度样本量与分带明细表（服务端组件，无客户端状态）。
 *
 * 为什么必须存在这张表：均值图只画均值，会让人误以为每个维度都基于同样多的
 * 数据。这张表把 **n / sd** 逐维摊开——「n 不同」与「sd 无法估计」都是
 * 解读均值前必须知道的事实。
 */
export function DomainStatsTable({ domains }: { domains: DomainSummary[] }) {
  const scaleKeys = [...new Set(domains.map((d) => d.scaleKey))];
  const num = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));

  return (
    <div className="space-y-6">
      {scaleKeys.map((scaleKey) => {
        const rows = domains.filter((d) => d.scaleKey === scaleKey);
        const scaleName = rows[0]?.scaleName ?? scaleKey;
        return (
          <div key={scaleKey}>
            <p className="mb-2 text-sm font-medium text-slate-700">{scaleName}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">维度</th>
                    <th className="py-2 pr-3 font-medium">n</th>
                    <th className="py-2 pr-3 font-medium">均值</th>
                    <th className="py-2 pr-3 font-medium">标准差</th>
                    <th className="py-2 pr-3 font-medium">相对偏低</th>
                    <th className="py-2 pr-3 font-medium">中等</th>
                    <th className="py-2 font-medium">相对偏高</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const concern =
                      (d.polarity ?? "").toLowerCase().includes("concern") ||
                      d.key === "CN";
                    return (
                      <tr key={d.key} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-3 text-slate-800">
                          <span className="mr-1.5 font-medium">{d.key}</span>
                          <span className="text-slate-600">{d.name}</span>
                          {concern && (
                            <Badge tone="danger" className="ml-2">
                              语义反向
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">{d.n}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">
                          {num(d.mean)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">
                          {d.sd === null ? (
                            <span
                              className="text-muted"
                              title="样本标准差在 n < 2 时无定义；显示 0 会谎称「毫无差异」"
                            >
                              —
                            </span>
                          ) : (
                            d.sd.toFixed(2)
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">{d.bands.low}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">{d.bands.medium}</td>
                        <td className="py-2 tabular-nums text-slate-700">{d.bands.high}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        分带阈值：≤ 2.5 相对偏低；2.5–3.5 中等；≥ 3.5 相对偏高（启发式，非常模）。
        「—」表示该值在数学上无法估计，不是 0。
      </p>
    </div>
  );
}
