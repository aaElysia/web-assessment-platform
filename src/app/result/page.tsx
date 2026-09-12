"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { BigFiveRadar } from "@/components/charts/BigFiveRadar";
import { AiDomainBar } from "@/components/charts/AiDomainBar";
import { DomainBreakdown } from "@/components/result/DomainBreakdown";
import {
  fetchResult,
  type ResultResponse,
} from "@/lib/client/api";
import {
  dimensionColor,
  findScaleByType,
  formatCompletion,
  formatScore,
  hasIncompleteDomains,
  toBarData,
  toRadarData,
} from "@/lib/result/view-model";

/**
 * 结果报告页（Step 7）。
 *
 * 呈现原则（与心理测量学要求一致）：
 *  1. 主信息是 1–5 的原始维度分，分带只作辅助且视觉弱化；
 *  2. 不做样本归一化、不给"人群百分位"——因为平台尚无常模，任何这类说法都是编造；
 *  3. 每个维度都有中性解读，且两处高风险措辞被特殊处理：
 *     - N（情绪敏感性）高分不被写成"情绪不稳定"；
 *     - CN（担忧）明确标注为反向语义，避免"柱子高 = 态度好"的误读；
 *  4. 免责声明与边界说明固定在页面内，不折叠、不隐藏。
 */
function ResultInner() {
  const params = useSearchParams();
  const pid = params.get("pid");

  const [data, setData] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchResult(id));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "加载结果失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pid) void load(pid);
  }, [pid, load]);

  // ---- 未携带参与编号：给出明确下一步，而不是白屏 -------------------------
  if (!pid) {
    return (
      <Container>
        <div className="py-12 text-center">
          <h1 className="text-2xl font-bold text-slate-900">未找到结果</h1>
          <p className="mt-2 text-sm text-muted">
            本页需要携带匿名参与编号（形如
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              /result?pid=…
            </code>
            ）。如果你刚完成作答，请通过提交后的跳转进入。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/consent" className={buttonClasses("primary")}>
              开始测评
            </Link>
            <Link href="/" className={buttonClasses("secondary")}>
              返回首页
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <div className="py-20 text-center text-muted">正在加载你的结果…</div>
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container>
        <div className="py-12">
          <h1 className="text-center text-2xl font-bold text-slate-900">
            无法显示结果
          </h1>
          <Alert tone="warning" className="mt-4">
            {error ?? "未知错误"}
          </Alert>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void load(pid)}
              className={buttonClasses("primary")}
            >
              重试
            </button>
            <Link href="/" className={buttonClasses("secondary")}>
              返回首页
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const { result, interpretationNotes } = data;
  const bigFive = findScaleByType(result, "personality");
  const aiScale = findScaleByType(result, "attitude");
  const radarData = toRadarData(bigFive);
  const barData = toBarData(aiScale);
  const aiComposite = aiScale?.composite ?? null;
  const hasIncomplete = hasIncompleteDomains(result);
  const shortId = data.participantId.slice(0, 8);

  return (
    <Container>
      {/* ---- 头部 ---- */}
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-slate-900">你的测评结果</h1>
        <p className="mt-2 text-sm text-muted">
          完成度 {formatCompletion(result.completionRate)}（{result.answeredTotal}/
          {result.itemTotal} 题）
          {data.completedAt && (
            <>
              {" · "}
              提交于 {new Date(data.completedAt).toLocaleString("zh-CN")}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">
          匿名参与编号：{shortId}
          {data.interpretationConfig?.version
            ? ` · 解读文案版本 ${data.interpretationConfig.version}`
            : ""}
        </p>
      </div>

      {/* ---- 免责声明：固定展示，不折叠 ---- */}
      <Alert tone="warning">
        <strong className="font-semibold">
          结果仅反映你当前的相对倾向，属于教育性自我洞察，不构成任何临床诊断、心理评估或医疗建议。
        </strong>
        <br />
        本平台尚未建立常模，因此不提供人群百分位或"排名"；如需专业评估，请咨询有资质的专业人员。
      </Alert>

      {hasIncomplete && (
        <Alert tone="info" className="mt-4">
          你有一项或多项维度因有效作答不足而未计分。这类维度在下方以「未计分」标出，
          我们不会用估计值代替，以免呈现一个看似正常的假分数。
        </Alert>
      )}

      {/* ---- 大五人格 ---- */}
      <Card
        className="mt-6"
        title="大五人格画像"
        subtitle="Big Five / IPIP 构念框架 · 每维度 8 题 · 分值为 1–5，越高表示该倾向越明显"
      >
        <BigFiveRadar data={radarData} />
        <div className="mt-6">
          <DomainBreakdown domains={bigFive?.domains ?? []} colorFor={dimensionColor} />
        </div>
      </Card>

      {/* ---- AI 技术采纳态度 ---- */}
      <Card
        className="mt-6"
        title="AI 技术采纳态度"
        subtitle="五维度评估：感知有用性 / 信任 / 采纳意愿 / 学习态度 / 对 AI 的担忧"
      >
        {/* 合成指数：整份量表里最需要"说清楚它怎么来的"的数字 */}
        {aiComposite && (
          <div className="mb-5 rounded-xl border border-line bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">
                {aiComposite.label}
              </span>
              <span className="flex items-center gap-2">
                {aiComposite.band && (
                  <Badge tone="primary">{aiComposite.band.label}</Badge>
                )}
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {formatScore(aiComposite.score)}
                  <span className="text-sm font-normal text-muted"> / 5</span>
                </span>
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              计算方式：{aiComposite.formula}（等权，未经实证加权；「担忧」项已翻正，故越高表示采纳态度越积极）
            </p>
            {aiComposite.interpretation && (
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {aiComposite.interpretation}
              </p>
            )}
          </div>
        )}

        <AiDomainBar data={barData} />
        <div className="mt-5">
          <DomainBreakdown
            domains={aiScale?.domains ?? []}
            colorFor={(k) => barData.find((b) => b.key === k)?.color ?? "#64748b"}
          />
        </div>
      </Card>

      {/* ---- 边界说明 ---- */}
      <Card className="mt-6" title="关于这些结果，需要你知道的">
        <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
          {interpretationNotes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted">•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/consent" className={buttonClasses("secondary")}>
          重新测评
        </Link>
        <Link href="/" className={buttonClasses("secondary")}>
          返回首页
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        提示：请保存本页链接（含匿名编号）以便回看；我们无法通过其它方式找回你的结果。
      </p>
    </Container>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="py-20 text-center text-muted">正在加载…</div>
        </Container>
      }
    >
      <ResultInner />
    </Suspense>
  );
}
