import type { ResultDomain } from "@/lib/client/api";
import { Badge } from "@/components/ui/Badge";
import { formatScore } from "@/lib/result/view-model";

/**
 * 维度明细列表：分数 + 分带徽标 + 相对位置条 + 中性解读。
 *
 * 为什么同时显示"数值"和"分带"而不是只给一句结论：
 *  - 只给结论（如"你偏内向"）会被当成定性判断，属于夸大；给出 1–5 的原始数值与范围更诚实；
 *  - 分带只是启发式参考，因此视觉上弱化（小徽标），数值才是主信息。
 */
export function DomainBreakdown({
  domains,
  colorFor,
}: {
  domains: ResultDomain[];
  colorFor: (key: string) => string;
}) {
  return (
    <ul className="divide-y divide-line">
      {domains.map((d) => {
        const color = colorFor(d.key);
        const pct = d.score === null ? 0 : (d.score / 5) * 100;

        return (
          <li key={d.key} className="py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {d.name}
                <span className="text-xs font-normal text-muted">{d.key}</span>
              </span>

              <span className="flex items-center gap-2">
                {d.band && <Badge tone="neutral">{d.band.label}</Badge>}
                <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {formatScore(d.score)}
                </span>
              </span>
            </div>

            {/* 相对位置条：仅作视觉锚点，刻度固定 0–5，不做样本归一化。 */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>

            {d.incomplete ? (
              <p className="mt-2 text-xs text-amber-700">
                该维度有效作答不足（{d.answered}/{d.total}），未给出分数。
              </p>
            ) : (
              <>
                {d.imputed && (
                  <p className="mt-2 text-xs text-amber-700">
                    该维度缺失 1 题，分数按已答题目均值计算（{d.answered}/{d.total}）。
                  </p>
                )}
                {d.interpretation && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {d.interpretation}
                  </p>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
