import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { AdminNav } from "@/components/ui/AdminNav";
import { buttonClasses } from "@/components/ui/Button";
import { requireAdminPage } from "@/lib/admin/guard";
import { loadAdminRecords } from "@/lib/admin/load";
import { buildExportTable } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

/**
 * 管理端导出页。
 *
 * 页面本身不生成文件，只把「将要导出的列」原样列出来（透明化），
 * 真正的下载由浏览器直接请求 `/api/admin/export?format=csv` 完成——
 * cookie 会自动带上，因此不需要在前端拼 header 或做鉴权判断。
 */
export default async function AdminExportPage() {
  requireAdminPage();

  const records = await loadAdminRecords();
  const table = buildExportTable(records);

  return (
    <Container className="max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">管理端 · 导出</h1>
      <p className="mt-2 text-sm text-muted">
        以 CSV 长表导出匿名作答与维度得分，供离线统计分析（如 Excel 交叉校验）。
      </p>
      <AdminNav active="/admin/export" />

      <Card className="mt-6" title="导出聚合数据">
        <p className="text-sm text-slate-700">
          当前可导出 <strong>{records.length}</strong> 名参与者、
          <strong>{table.header.length}</strong> 列（每行一名参与者）。
        </p>

        <a
          href="/api/admin/export?format=csv"
          download
          className={buttonClasses("primary", "md", "mt-4")}
        >
          下载 CSV
        </a>

        <div className="mt-5">
          <p className="text-xs font-medium text-slate-700">将导出的列：</p>
          <p className="mt-1 break-all font-mono text-xs text-muted">
            {table.header.join(", ")}
          </p>
        </div>
      </Card>

      <Alert tone="info" className="mt-4">
        <p className="font-medium">隐私与安全</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            只包含匿名 UUID 与粗粒度人口学分桶；平台自始未收集姓名、邮箱、IP
            等直接标识符。
          </li>
          <li>
            自由文本字段在导出时做了 CSV 公式注入中和（`=`「+」「-」「@」开头会加前导单引号），
            避免在 Excel 中被当作公式执行。
          </li>
          <li>
            文件为 UTF-8 with BOM，中文列名在 Excel 中不会乱码。
          </li>
          <li>导出接口需要有效管理端会话，未登录返回 401。</li>
        </ul>
      </Alert>
    </Container>
  );
}
