import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Web 心理测评平台",
  description:
    "匿名 Big Five 人格与 AI 技术采纳态度测评（教育 / 自我洞察用途，非临床诊断）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-6 text-center text-xs text-muted sm:px-6">
            本平台所有作答匿名处理，结果仅用于自我洞察与教育用途，不构成任何临床诊断或医疗建议。
          </div>
        </footer>
      </body>
    </html>
  );
}
