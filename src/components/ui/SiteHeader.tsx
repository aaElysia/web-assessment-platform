"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "./Container";
import { cn } from "@/lib/utils";

/**
 * 站点顶栏。
 *
 * 导航去重原则（避免顶栏与页面内 CTA 重复）：
 *  - 首页 `/`：页面 hero 已有主 CTA「开始测评」，顶栏因此**不再重复**「参与测评」，
 *    只保留低频工具入口「管理端」。
 *  - 作答流程页：页面内没有全局入口，顶栏提供「参与测评」+「管理端」。
 *  - 管理端页面：顶栏切换为「返回测评首页」，避免在后台出现前台流程链接。
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const isAdmin = pathname.startsWith("/admin");
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
      <Container className="flex items-center justify-between py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-slate-900"
        >
          心理测评平台
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          {isAdmin ? (
            <Link href="/" className="text-slate-600 hover:text-primary">
              返回测评首页
            </Link>
          ) : (
            <>
              {!isHome && (
                <Link href="/consent" className="text-slate-600 hover:text-primary">
                  参与测评
                </Link>
              )}
              <Link
                href="/admin"
                className={cn(
                  "hover:text-primary",
                  // 首页上这是唯一的顶栏入口，故不再弱化；其它页面保持低调的工具链接样式。
                  isHome ? "text-slate-600" : "text-slate-500"
                )}
              >
                管理端
              </Link>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
