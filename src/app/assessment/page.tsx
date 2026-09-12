"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Alert } from "@/components/ui/Alert";
import { LikertScale } from "@/components/ui/LikertScale";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import {
  fetchQuestionnaire,
  submitResponses,
  type PublicQuestionnaire,
} from "@/lib/client/api";
import {
  getParticipantId,
  getDraft,
  saveDraft,
  clearDraft,
  type DraftAnswers,
  type Demographics,
} from "@/lib/client/storage";

type QA = { code: string; text: string; reverse: boolean };

function QuestionCard({
  index,
  item,
  labels,
  value,
  onChange,
}: {
  index: number;
  item: QA;
  labels: string[];
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <Card className="mb-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {index}
        </span>
        <div className="flex-1">
          <p className="text-base leading-relaxed text-slate-800">{item.text}</p>
          <div className="mt-3">
            <LikertScale
              name={item.text}
              labels={labels}
              value={value}
              onChange={onChange}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * 作答页（Step 5 真实流程）。
 * - 无 participantId -> 跳转 /consent（门槛）。
 * - 从 /api/questionnaire 拉取真实题库。
 * - 每题选择即时写入本机草稿（localStorage），刷新/关闭后可续答。
 * - 全部作答后可提交到 /api/responses，成功后清除草稿并跳转 /result。
 * - 可选人口学（全部匿名分桶，不强制）。
 */
export default function AssessmentPage() {
  const router = useRouter();
  const [pid, setPid] = useState<string | null>(null);
  const [data, setData] = useState<PublicQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [demographics, setDemographics] = useState<Demographics>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const participantId = getParticipantId();
    if (!participantId) {
      router.replace("/consent");
      return;
    }
    setPid(participantId);
    let cancelled = false;
    (async () => {
      try {
        const q = await fetchQuestionnaire();
        if (cancelled) return;
        setData(q);
        const draft = getDraft(participantId);
        if (draft) {
          setAnswers(draft.answers ?? {});
          setDemographics(draft.demographics ?? {});
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载题库失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const likertLabels = useMemo(
    () => (data ? data.likert.options.map((o) => o.label) : []),
    [data]
  );

  const questions = useMemo(() => {
    if (!data) return [];
    const list: {
      scaleKey: string;
      scaleName: string;
      item: QA;
      index: number;
    }[] = [];
    for (const scale of data.scales) {
      for (const it of scale.items) {
        list.push({
          scaleKey: scale.key,
          scaleName: scale.name,
          item: { code: it.code, text: it.text, reverse: it.reverse },
          index: list.length + 1,
        });
      }
    }
    return list;
  }, [data]);

  const total = questions.length;
  const answered = questions.filter((q) => answers[q.item.code] != null).length;
  const progress = total ? Math.round((answered / total) * 100) : 0;
  const allAnswered = total > 0 && answered === total;

  function persist(nextAnswers: DraftAnswers, nextDemo: Demographics) {
    if (pid) {
      saveDraft(pid, {
        answers: nextAnswers,
        demographics: nextDemo,
        updatedAt: Date.now(),
      });
    }
  }

  function handleAnswer(code: string, value: number) {
    setAnswers((prev) => {
      const next = { ...prev, [code]: value };
      persist(next, demographics);
      return next;
    });
  }

  function handleDemo(field: keyof Demographics, value: string) {
    setDemographics((prev) => {
      const next = { ...prev, [field]: value };
      persist(answers, next);
      return next;
    });
  }

  async function handleSubmit() {
    if (!pid || !allAnswered || submitting || !data) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = data.scales
        .flatMap((s) => s.items)
        .filter((it) => answers[it.code] != null)
        .map((it) => ({ itemId: it.code, value: answers[it.code] as number }));
      await submitResponses(pid, items, demographics);
      clearDraft(pid);
      router.push(`/result?pid=${encodeURIComponent(pid)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Container>
        <div className="py-20 text-center text-muted">正在加载问卷…</div>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container>
        <Alert tone="danger" className="mt-10">
          {error ?? "题库加载失败，请稍后重试或返回首页。"}
        </Alert>
        <div className="mt-4">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
            返回首页
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="sticky top-0 z-10 -mx-4 mb-6 bg-white/90 px-4 py-3 backdrop-blur">
        <ProgressBar value={progress} label={`作答进度 ${answered} / ${total}`} />
      </div>

      {questions.map((q, idx) => {
        const showHeader =
          idx === 0 || questions[idx - 1].scaleKey !== q.scaleKey;
        return (
          <Fragment key={q.item.code}>
            {showHeader && (
              <SectionHeading className="mt-2" title={q.scaleName} />
            )}
            <QuestionCard
              index={q.index}
              item={q.item}
              labels={likertLabels}
              value={answers[q.item.code]}
              onChange={(v) => handleAnswer(q.item.code, v)}
            />
          </Fragment>
        );
      })}

      <Card className="mt-6" title="补充信息（全部可选、匿名分桶）">
        <p className="mb-4 text-sm text-muted">
          以下信息完全可选，仅用于聚合分析，不会单独识别到你。留空也可提交。
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">年龄段</span>
            <select
              value={demographics.ageRange ?? ""}
              onChange={(e) => handleDemo("ageRange", e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-slate-800"
            >
              <option value="">不愿透露</option>
              <option value="<18">18 岁以下</option>
              <option value="18-25">18–25</option>
              <option value="26-35">26–35</option>
              <option value="36-45">36–45</option>
              <option value="46-55">46–55</option>
              <option value="56+">56 以上</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">性别</span>
            <select
              value={demographics.gender ?? ""}
              onChange={(e) => handleDemo("gender", e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-slate-800"
            >
              <option value="">不愿透露</option>
              <option value="female">女</option>
              <option value="male">男</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">学历</span>
            <select
              value={demographics.education ?? ""}
              onChange={(e) => handleDemo("education", e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-slate-800"
            >
              <option value="">不愿透露</option>
              <option value="highschool">高中及以下</option>
              <option value="college">大专</option>
              <option value="bachelor">本科</option>
              <option value="master">硕士</option>
              <option value="phd">博士</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="mt-6 rounded-2xl border border-line bg-white p-4">
        {error && (
          <Alert tone="danger" className="mb-3">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">
            草稿已自动保存在本设备，刷新或关闭页面后可继续作答。
          </span>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting
              ? "提交中…"
              : allAnswered
                ? "提交并查看结果"
                : `还需作答 ${total - answered} 题`}
          </Button>
        </div>
      </div>
    </Container>
  );
}
