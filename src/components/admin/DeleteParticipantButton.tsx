"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";

/**
 * 删除单条提交按钮（客户端组件）。
 *
 * 删除前用原生确认框二次确认——这是不可逆操作（级联清除该参与者的全部作答）。
 * 成功后 `router.refresh()` 让服务端重渲染列表与聚合统计（仪表盘数字会自动更新）。
 */
export function DeleteParticipantButton({
  pid,
  shortId,
}: {
  pid: string;
  shortId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    const ok = window.confirm(
      `确认删除该提交（匿名 ID ${shortId}）？\n此操作不可恢复，将同时删除其全部作答明细，并影响聚合统计。`
    );
    if (!ok) return;

    setPending(true);
    try {
      const res = await fetch(`/api/admin/submissions/${pid}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        const msg = body?.error ?? `HTTP ${res.status}`;
        window.alert(`删除失败：${msg}`);
        return;
      }
      router.refresh();
    } catch {
      window.alert("网络错误，删除失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={buttonClasses("danger", "sm")}
      onClick={handleDelete}
      disabled={pending}
    >
      {pending ? "删除中…" : "删除"}
    </button>
  );
}
