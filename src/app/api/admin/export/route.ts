import { guardAdminApi } from "@/lib/admin/guard";
import { loadAdminRecords } from "@/lib/admin/load";
import { buildExportTable, buildRawExportTable, toCsv } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/export?format=csv|raw
 *
 *  - `csv`（默认）：**程序算好的维度分**（长表：一行一名参与者）。
 *  - `raw`：**最原始的逐题作答**（宽表：一行一名参与者、一列一道题），
 *    供复核者在表格软件里从零重算以做交叉验证。
 *
 * 两者共同构成「独立复核」的最小数据闭环：拿 raw 手算出维度分，再与 csv 对账。
 * 只给 csv 的话，所谓复核就是「用程序的结果验证程序」。
 *
 * 需要有效管理端会话，否则 401。
 *
 * 设计要点：
 *  - **只输出脱敏数据**：匿名 UUID + 粗粒度人口学分桶（+ 逐题原始分）。
 *    数据库中本就没有姓名/邮箱/IP 等直接标识符（见 participants 路由）。
 *  - **公式注入防护**：见 `csvCell()`。人口学字段来自客户端自由文本，
 *    若不加防护，`=HYPERLINK(...)` 之类内容会在 Excel 里被当作公式执行。
 *  - **UTF-8 BOM**：Excel 在中文 Windows 上默认按 GBK 解析无 BOM 的 CSV，
 *    会把列名变成乱码；前置 BOM 是代价最小的兼容手段。
 *  - format 只支持 csv / raw；其它取值显式 400，而不是静默返回 CSV。
 */
export async function GET(req: Request) {
  const denied = guardAdminApi(req);
  if (denied) return denied;

  const format = (
    new URL(req.url).searchParams.get("format") ?? "csv"
  ).toLowerCase();
  if (format !== "csv" && format !== "raw") {
    return new Response(JSON.stringify({ error: "Unsupported format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const records = await loadAdminRecords();
  const table = format === "raw" ? buildRawExportTable(records) : buildExportTable(records);
  const csv = toCsv(table);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = format === "raw" ? "assessment-raw" : "assessment-export";

  return new Response("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
