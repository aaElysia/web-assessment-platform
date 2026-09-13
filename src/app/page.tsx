import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/Button";
import { SITE_CONFIG } from "@/lib/site-config";

export default function HomePage() {
  return (
    <Container>
      <section className="text-center">
        <Badge tone="primary">匿名 · 免费 · 自我洞察</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          了解你的性格与 AI 态度
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          两分量表、约 10 分钟、无需注册。我们采用成熟的大五人格模型与 AI
          技术采纳态度量表，帮助你从数据中看见自己的倾向。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/consent" className={buttonClasses("primary", "lg")}>
            开始测评
          </Link>
          <a href="#scales" className={buttonClasses("secondary", "lg")}>
            查看测评内容
          </a>
        </div>
      </section>

      <section id="scales" className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card title="大五人格（Big Five）" subtitle="40 题 · 5 个维度">
          <p className="text-sm text-muted">
            测量开放性、尽责性、外向性、宜人性与神经质。每个维度以相对水平呈现，
            帮助你理解自己的行为倾向。
          </p>
        </Card>
        <Card title="AI 技术采纳态度" subtitle="20 题 · 5 个维度">
          <p className="text-sm text-muted">
            测量感知有用性、信任、采纳意愿、学习态度与对 AI
            的担忧，并给出综合采纳倾向指数。
          </p>
        </Card>
      </section>

      <Alert tone="warning" className="mt-8">
        <strong>重要声明：</strong>
        本测评为教育 / 自我洞察用途，结果不具有诊断意义，不构成任何临床诊断、
        心理评估或医疗建议。你随时可以退出，且我们不收集任何可识别个人身份的信息。
      </Alert>

      <section className="mt-6 text-center">
        <p className="text-sm text-muted">
          想告诉我们你的使用感受？写信到
          <a
            href={SITE_CONFIG.feedbackUrl}
            className="ml-1 font-medium text-primary hover:underline"
          >
            {SITE_CONFIG.feedbackEmail}
          </a>
        </p>
      </section>
    </Container>
  );
}
