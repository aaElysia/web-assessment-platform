import { Fragment } from "react";
import type { AlphaRow, ReliabilityResult } from "@/lib/admin/types";

/**
 * 信度表（Cronbach α）。
 *
 * 呈现原则：**不确定性必须与点估计同屏**。
 *  - α 与它的 95% bootstrap 区间放在相邻两列，不允许只挑好看的点估计看；
 *  - k（题目数）与被剔除人数都是独立列：α 天生随 k 升高、listwise 会改变样本，
 *     两者都会改变 α 的可比性，不能塞进脚注；
 *  - α 无定义时显示「无法估计」并给出原因，**绝不显示 0**（会被读成信度极差）。
 */

function alphaTone(alpha: number | null): string {
  if (alpha === null) return "text-slate-400";
  if (alpha >= 0.8) return "text-emerald-600";
  if (alpha >= 0.7) return "text-sky-600";
  if (alpha >= 0.6) return "text-amber-600";
  return "text-red-600";
}

function fmtAlpha(alpha: number | null): string {
  // α 允许为负，如实显示（负值意味着题目间平均相关为负，是重要信号）
  return alpha === null ? "无法估计" : alpha.toFixed(4);
}

function fmtCi(ci: { lo: number; hi: number } | null): string {
  return ci === null ? "—" : `[${ci.lo.toFixed(2)}, ${ci.hi.toFixed(2)}]`;
}

export function AlphaTable({ data }: { data: ReliabilityResult }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-muted">题库中没有可分析的维度。</p>;
  }

  // 按量表分组（保持题库声明顺序）
  const groups: { scaleKey: string; scaleName: string; rows: AlphaRow[] }[] = [];
  for (const row of data.rows) {
    const last = groups[groups.length - 1];
    if (last && last.scaleKey === row.scaleKey) last.rows.push(row);
    else groups.push({ scaleKey: row.scaleKey, scaleName: row.scaleName, rows: [row] });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">维度</th>
            <th className="px-2 py-2 text-right font-medium" title="题目数">
              k
            </th>
            <th className="px-2 py-2 text-right font-medium" title="完整作答该维度的被试数（listwise）">
              n
            </th>
            <th className="px-2 py-2 text-right font-medium" title="因该维度缺失任一题而被整行剔除的人数">
              剔除
            </th>
            <th className="px-2 py-2 text-right font-medium">Cronbach α</th>
            <th className="px-2 py-2 text-right font-medium" title="百分位 bootstrap，固定种子可复现">
              95% 区间
            </th>
            <th className="px-2 py-2 text-right font-medium" title="由 α 与 k 反解的题目平均两两相关">
              题目平均相关
            </th>
            <th className="px-2 py-2 font-medium">惯例等级</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.scaleKey}>
              <tr className="bg-slate-50">
                <td colSpan={8} className="px-2 py-1.5 text-xs font-medium text-slate-600">
                  {g.scaleName}
                </td>
              </tr>
              {g.rows.map((row) => (
                <tr key={row.domainKey} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs text-muted">{row.domainKey}</span>
                    <span className="ml-2 text-slate-700">{row.domainName}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                    {row.k}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                    {row.n}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-slate-500">
                    {row.droppedIncomplete > 0 ? (
                      <span className="text-amber-600">{row.droppedIncomplete}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono ${alphaTone(row.alpha)}`}>
                    {fmtAlpha(row.alpha)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-slate-600">
                    {fmtCi(row.ci)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-slate-600">
                    {row.meanInterItemR === null ? "—" : row.meanInterItemR.toFixed(3)}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    {row.grade ?? (
                      <span className="text-slate-400" title={row.reason}>
                        不下结论（{row.reason ?? "无法估计"}）
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        α 为<span className="font-medium">完整作答该维度全部题目</span>
        的被试计算；「剔除」列是因此被排除的人数。区间由百分位 bootstrap
        得到（固定种子，可复现），小样本下会很宽——那是真实的不确定性。
      </p>
    </div>
  );
}
