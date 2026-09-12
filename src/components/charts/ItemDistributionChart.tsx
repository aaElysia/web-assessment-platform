import { LIKERT_SHADES } from "@/lib/design/colors";
import type { ItemRow, ItemsResult } from "@/lib/admin/types";

/**
 * 题项反应分布。
 *
 * 呈现上的关键决定：
 *  1. 分布条按**重编码后（构念方向）**绘制，与地板/天花板徽章同向。
 *     若按原始分绘制，反向题会出现「条挤在最右却标着地板效应」的自相矛盾。
 *     原始分布（未重编码）改为放在悬浮提示里，仍可查。
 *  2. 每一档都显示**具体人数**，不只给比例条：样本量小时只看条形会误判。
 *  3. 用原生 `<details>` 折叠（服务端渲染即可工作，不依赖客户端 JS）。
 *  4. 颜色用单调明度阶梯，不夹带「选 5 就是好」的价值暗示。
 */

function Badge({ tone, children }: { tone: "warn" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function ItemBadges({ item }: { item: ItemRow }) {
  return (
    <>
      {item.noVariance && <Badge tone="muted">零变异</Badge>}
      {item.floorEffect && <Badge tone="warn">构念地板</Badge>}
      {item.ceilingEffect && <Badge tone="warn">构念天花板</Badge>}
    </>
  );
}

function ItemBlock({ item }: { item: ItemRow }) {
  const n = item.n;
  const rawTip = item.options.map((o) => `${o.value}×${o.count}`).join(", ");

  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">
          <span className="mr-2 font-mono text-xs text-muted">{item.code}</span>
          {item.reverse && (
            <span
              className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500"
              title="反向计分题：原始分越低，在构念方向上越高"
            >
              反
            </span>
          )}
          {item.text}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <ItemBadges item={item} />
        </div>
      </div>

      {/* 堆叠条（构念方向） */}
      <div
        className="mt-2 flex h-4 w-full overflow-hidden rounded-sm bg-slate-100"
        title={`重编码后分布：${item.recodedOptions.map((o) => `${o.value}×${o.count}`).join(", ")}\n原始分布（未重编码）：${rawTip}`}
      >
        {item.recodedOptions.map((o) =>
          o.count > 0 ? (
            <div
              key={o.value}
              style={{
                flexGrow: o.count,
                backgroundColor: LIKERT_SHADES[o.value] ?? "#cbd5e1",
              }}
            />
          ) : null
        )}
      </div>

      {/* 各档人数 */}
      <div className="mt-1 grid grid-cols-5 gap-1 text-[11px] text-muted">
        {item.recodedOptions.map((o) => (
          <div key={o.value} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: LIKERT_SHADES[o.value] ?? "#cbd5e1" }}
            />
            <span>{o.value}</span>
            <span className={o.count > 0 ? "font-medium text-slate-700" : ""}>{o.count}</span>
          </div>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] text-muted">
        n = {n}
        {item.missing > 0 && <span className="text-amber-600">（未作答 {item.missing}）</span>}
        {" · "}原始均值 {item.rawMean === null ? "—" : item.rawMean.toFixed(2)}
        {" → "}重编码均值 {item.recodedMean === null ? "—" : item.recodedMean.toFixed(2)}
        {" · "}sd {item.rawSd === null ? "—（n < 2）" : item.rawSd.toFixed(2)}
      </p>
    </div>
  );
}

export function ItemDistributionChart({ data }: { data: ItemsResult }) {
  if (data.groups.length === 0) {
    return <p className="text-sm text-muted">题库中没有题目。</p>;
  }

  return (
    <div className="space-y-3">
      {data.groups.map((g, idx) => {
        const flagged = g.items.filter(
          (i) => i.noVariance || i.floorEffect || i.ceilingEffect
        ).length;
        return (
          <details
            key={`${g.scaleKey}-${g.domainKey}`}
            open={idx < 2}
            className="overflow-hidden rounded-xl border border-line bg-surface"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
              <span className="font-medium text-slate-800">
                {g.domainKey} · {g.domainName}
              </span>
              <span className="text-xs text-muted">{g.items.length} 题</span>
              {flagged > 0 && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 ring-1 ring-inset ring-amber-200">
                  {flagged} 题需关注
                </span>
              )}
            </summary>
            <div>
              {g.items.map((item) => (
                <ItemBlock key={item.code} item={item} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
