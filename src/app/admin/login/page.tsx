import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { getAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

/**
 * 管理员登录页。
 *
 * 服务端先判会话：已登录则直接跳转仪表盘，避免出现「已登录却停在登录页」
 * 这种需要用户自己猜的状态。
 */
export default function AdminLoginPage() {
  if (getAdminSession()) redirect("/admin");

  return (
    <Container>
      <h1 className="text-2xl font-bold text-slate-900">管理端登录</h1>
      <p className="mt-2 text-sm text-muted">
        仅授权研究人员可访问聚合数据与导出功能。
      </p>

      <Card className="mt-6">
        <AdminLoginForm />
      </Card>

      <Alert tone="info" className="mt-4">
        管理端使用环境变量凭据 + HMAC 签名会话（httpOnly cookie，8 小时有效），
        不引入外部身份提供方。所有管理 API 均要求有效会话，否则返回 401；
        连续登录失败会触发来源限流。
      </Alert>
    </Container>
  );
}
