"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

/**
 * 管理端登录表单（客户端组件）。
 *
 * 注：这里**不**把密码写进 localStorage / sessionStorage —— 凭据只在
 * 这一次请求体内出现；登录态由服务端签发的 httpOnly cookie 承载。
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        // replace 而非 push：避免用户按返回键回到登录页。
        router.replace("/admin");
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        res.status === 429
          ? "登录尝试过于频繁，请稍后再试。"
          : res.status === 401
            ? "用户名或密码不正确。"
            : res.status === 503
              ? "服务端会话密钥未正确配置，请联系管理员。"
              : (data.error ?? "登录失败，请稍后重试。")
      );
    } catch {
      setError("网络错误，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <input
        type="text"
        name="username"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        placeholder="用户名"
        aria-label="用户名"
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        placeholder="密码"
        aria-label="密码"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "正在登录…" : "登录"}
      </Button>
    </form>
  );
}
