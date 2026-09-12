"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";

/**
 * 登出按钮（客户端组件）。
 *
 * 即使请求失败也照样跳回登录页：服务端清理失败时，前端的「已登录」状态
 * 也不应继续保持——让用户看到登录页并重新登录，比留在后台更安全、也更不困惑。
 */
export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* 忽略网络错误，原因见上方注释 */
    }
    router.replace("/admin/login");
    router.refresh();
    setPending(false);
  }

  return (
    <button
      type="button"
      className={buttonClasses("secondary", "sm")}
      onClick={logout}
      disabled={pending}
    >
      {pending ? "正在退出…" : "退出登录"}
    </button>
  );
}
