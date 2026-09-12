import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

const ITEMS = [
  { href: "/admin", label: "仪表盘" },
  { href: "/admin/analytics", label: "分析" },
  { href: "/admin/export", label: "导出" },
];

/**
 * 管理端子导航：固定在管理页顶部，高亮当前路由段。
 * 登录页（/admin/login）不渲染此导航。
 * 右侧固定「退出登录」，避免用户为了登出而回到登录页找按钮。
 */
export function AdminNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <nav className="flex flex-1 gap-1 rounded-xl border border-line bg-surface p-1">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
              active === it.href
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      <AdminLogoutButton />
    </div>
  );
}
