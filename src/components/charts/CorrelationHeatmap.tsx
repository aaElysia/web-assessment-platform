import {
  CORRELATION_NEGATIVE_RGB,
  CORRELATION_POSITIVE_RGB,
} from "@/lib/design/colors";
import type { CorrelationResult } from "@/lib/admin/types";

/**
 * 维度间 Pearson r 热力图。
 *
 * 呈现上的三个刻意选择：
 *  1. **只画下三角 + 对角线**。矩阵对称，重复画上三角只会增加视觉噪音；
 *     上三角留白是论文里相关矩阵的通行画法。
 *  2. **每格同时显示 r 与 n**，而不是只显示 r。成对剔除会让每格的样本量都不同，
 *     只给 r 等于隐去「这个系数有多可信」。n 隐藏在悬浮提示里不够——它必须被看见。
 *  3. **不发散到饱和度上限**：alpha 最高约 0.78，保证格内文字始终可读；
 *     颜色只是引导，数值才是信息。
 *
 * 本组件不依赖任何客户端能力（无 hooks / 事件），因此保持为服务端组件：
 * 热力图不参与「客户端渲染失败就一片空白」的风险面。
 */

function cellStyle(r: number | null): { backgroundColor: string; color: string } {
  if (r === null) return { backgroundColor: "transparent", color: "#94a3b8" };
  const mag = Math.min(1, Math.abs(r));
  const alpha = 0.06 + mag * 0.72;
  const base = r >= 0 ? CORRELATION_POSITIVE_RGB : CORRELATION_NEGATIVE_RGB;
  return {
    backgroundColor: `rgba(${base},${alpha.toFixed(3)})`,
    color: mag > 0.5 ? "#ffffff" : "#0f172a",
  };
}

function fmtP(p: number | null): string {
  if (p === null) return "—";
  if (p < 0.0001) return "< 0.0001";
  return p.toFixed(4);
}

export function CorrelationHeatmap({ data }: { data: CorrelationResult }) {
  const { keys, names, matrix, counts, pValues } = data;
  const k = keys.length;

  if (k === 0) {
    return <p className="text-sm text-muted">题库中没有任何维度，无法生成相关矩阵。</p>;
  }

  const label = (i: number) => `${keys[i]} · ${names[i]}`;

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="inline-grid min-w-full gap-px text-xs"
          style={{ gridTemplateColumns: `minmax(120px, 140px) repeat(${k}, minmax(56px, 1fr))` }}
        >
          {/* 表头 */}
          <div />
          {keys.map((key, j) => (
            <div
              key={`h-${key}`}
              className="px-1 pb-1 text-center font-mono text-[11px] font-medium text-slate-600"
              title={label(j)}
            >
              {key}
            </div>
          ))}

          {/* 矩阵体 */}
          {keys.map((rowKey, i) => (
            <Row
              key={`r-${rowKey}`}
              i={i}
              keys={keys}
              label={label}
              matrix={matrix}
              counts={counts}
              pValues={pValues}
              fmtP={fmtP}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="font-medium text-slate-600">色阶：</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={cellStyle(-1)} />
          负相关 −1
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={cellStyle(0)} />
          0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={cellStyle(1)} />
          正相关 +1
        </span>
        <span>每格上行为 r，下行为该格的成对样本量 n。</span>
      </div>
    </div>
  );
}

function Row({
  i,
  keys,
  label,
  matrix,
  counts,
  pValues,
  fmtP,
}: {
  i: number;
  keys: string[];
  label: (i: number) => string;
  matrix: (number | null)[][];
  counts: number[][];
  pValues: (number | null)[][];
  fmtP: (p: number | null) => string;
}) {
  return (
    <>
      <div
        className="flex items-center justify-end pr-2 font-mono text-[11px] font-medium text-slate-600"
        title={label(i)}
      >
        {keys[i]}
      </div>
      {keys.map((colKey, j) => {
        // 上三角：不重复显示（矩阵对称）
        if (j > i) {
          return (
            <div
              key={`c-${i}-${j}`}
              className="h-14 rounded-sm bg-slate-50"
              title="对称区间，已在左下三角显示"
            />
          );
        }

        const r = matrix[i]?.[j] ?? null;
        const n = counts[i]?.[j] ?? 0;
        const isDiag = i === j;
        const tip = isDiag
          ? `${label(i)} 自身：r = ${r === null ? "不可用（样本不足或无变异）" : "1.00"}，n = ${n}`
          : `${label(i)} × ${label(j)}：r = ${r === null ? "不可用（n < 3 或有维度零方差）" : r.toFixed(4)}，n = ${n}，双尾 p = ${fmtP(pValues[i]?.[j] ?? null)}`;

        return (
          <div
            key={`c-${i}-${j}`}
            className="flex h-14 flex-col items-center justify-center rounded-sm"
            style={cellStyle(r)}
            title={tip}
          >
            {isDiag ? (
              <>
                <span className="font-mono text-xs">{r === null ? "—" : "1.00"}</span>
                <span className="mt-0.5 text-[10px] opacity-70">n={n}</span>
              </>
            ) : (
              <>
                <span className="font-mono text-xs font-medium">
                  {r === null ? "—" : r.toFixed(2)}
                </span>
                <span className="mt-0.5 text-[10px] opacity-75">n={n}</span>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
