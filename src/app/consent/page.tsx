"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { createParticipant, submitConsent } from "@/lib/client/api";
import { CONSENT_VERSION, setParticipantId } from "@/lib/client/storage";

/**
 * 知情同意页（Step 5 接入真实流程）。
 * 行为：勾选同意 -> 创建匿名参与者 -> 记录同意版本 -> 写入本机 participantId -> 跳转作答。
 * 未勾选不能进入作答（门槛）；全程不收集任何 PII。
 */
export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!agreed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const pid = await createParticipant();
      await submitConsent(pid, CONSENT_VERSION);
      setParticipantId(pid);
      router.push("/assessment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生未知错误，请重试");
      setLoading(false);
    }
  }

  return (
    <Container>
      <h1 className="text-2xl font-bold text-slate-900">知情同意</h1>
      <p className="mt-2 text-sm text-muted">
        在开始之前，请阅读并理解以下说明。
      </p>

      <Card className="mt-6" title="研究目的与数据使用">
        <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
          <li>
            <strong>用途：</strong>
            本平台用于心理学教学与研究演示，帮助你了解自身性格与对 AI
            技术的态度倾向。
          </li>
          <li>
            <strong>匿名：</strong>
            我们不要求也不收集姓名、邮箱、电话、IP
            等任何可识别身份的信息。你的作答仅以随机 ID 标识。
          </li>
          <li>
            <strong>自愿：</strong>
            参与完全自愿，你可随时关闭页面退出，不会产生任何后果。
          </li>
          <li>
            <strong>数据：</strong>
            作答以聚合形式用于统计分析（如均值、分布、信度），不会单独识别到你。
          </li>
          <li>
            <strong>数据存储与保留：</strong>
            你提交后的作答保存在受管云数据库（与你的本机设备分离），仅以匿名随机
            ID 标识、不含可识别信息。作为参与者，你无法通过本平台自行定位并删除自己的记录
            （匿名无关联标识）；但你可通过页面底部反馈渠道请求删除。作为研究者/管理员，
            可在管理端随时删除任意一条提交记录（含其全部作答明细）。数据将保留用于本研究的聚合统计分析。
          </li>
          <li>
            <strong>退出：</strong>
            你随时可以停止；作答进行中、尚未提交的草稿仅存于你本机浏览器，可随时清除。
          </li>
        </ul>
      </Card>

      <Alert tone="warning" className="mt-4">
        本测评<strong>不是心理诊断工具</strong>，结果不应被视为临床结论或医疗建议。
        如有心理困扰，请咨询专业机构。
      </Alert>

      <label className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-white p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]"
        />
        <span className="text-sm text-slate-700">
          我已阅读并理解上述说明，自愿参与本次匿名测评，并同意按所述方式使用我的作答数据。
        </span>
      </label>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          返回
        </Link>
        <Button variant="primary" size="lg" onClick={handleStart} disabled={!agreed || loading}>
          {loading ? "正在进入…" : "开始测评"}
        </Button>
      </div>
    </Container>
  );
}
