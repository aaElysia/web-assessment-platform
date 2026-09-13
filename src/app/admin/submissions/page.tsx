import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { AdminNav } from "@/components/ui/AdminNav";
import { DeleteParticipantButton } from "@/components/admin/DeleteParticipantButton";
import { requireAdminPage } from "@/lib/admin/guard";
import { loadParticipantsList } from "@/lib/admin/submissions";
import type { SortDir, SortKey } from "@/lib/admin/types";
import { cn, formatCnDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID_KEYS: SortKey[] = ["submittedAt", "startedAt", "createdAt"];
const KEY_LABEL: Record<SortKey, string> = {
  submittedAt: "提交时间",
  startedAt: "开始时间",
  createdAt: "创建时间",
};

function parseSort(sp: Record<string, string | string[] | undefined>): {
  key: SortKey;
  dir: SortDir;
} {
  const k = sp.sort;
  const d = sp.dir;
  const key =
    typeof k === "string" && (VALID_KEYS as string[]).includes(k)
      ? (k as SortKey)
      : "submittedAt";
  const dir = d === "desc" ? "desc" : "asc";
  return { key, dir };
}

function fmt(iso: string): string {
  return formatCnDateTime(iso);
}

function StatusBadge({ row }: { row: { status: string; session: { status: string } | null } }) {
  const s = row.session?.status ?? row.status;
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    in_progress: { label: "进行中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    abandoned: { label: "已放弃", cls: "bg-slate-100 text-slate-500 border-slate-200" },
    created: { label: "未作答", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };
  const info = map[s] ?? { label: s, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs", info.cls)}>
      {info.label}
    </span>
  );
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  requireAdminPage();
  const { key, dir } = parseSort(searchParams);
  const rows = await loadParticipantsList({ sortKey: key, sortDir: dir });

  const total = rows.length;
  const completed = rows.filter((r) => r.session?.status === "completed").length;

  // 排序 chips：点当前字段切换方向，点其它字段切到该字段（默认降序）
  const sortChip = (k: SortKey) => {
    const active = k === key;
    const nextDir: SortDir = active ? (dir === "desc" ? "asc" : "desc") : "desc";
    return (
      <Link
        key={k}
        href={`/admin/submissions?sort=${k}&dir=${nextDir}`}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-sm transition-colors",
          active
            ? "border-primary bg-primary text-white"
            : "border-line bg-surface text-slate-600 hover:bg-slate-100"
        )}
      >
        {KEY_LABEL[k]}
        {active ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </Link>
    );
  };

  return (
    <Container className="max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">管理端 · 提交明细</h1>
      <p className="mt-2 text-sm text-muted">
        逐条列出匿名提交，可按填写时间排序并删除。测试期产生的多余提交可在此清理，
        删除后聚合统计将自动重算。
      </p>
      <AdminNav active="/admin/submissions" />

      <Card
        className="mt-6"
        title="提交列表"
        subtitle={`共 ${total} 条 · 已完成 ${completed} 条`}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">排序：</span>
          {VALID_KEYS.map(sortChip)}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">暂无提交记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2 font-medium">填写时间</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">题数</th>
                  <th className="px-3 py-2 font-medium">匿名 ID</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-slate-50">
                    <td className="px-3 py-2 tabular-nums text-slate-800">
                      {fmt(r.submittedAt)}
                      {r.session?.startedAt &&
                        r.session.startedAt !== r.submittedAt && (
                          <span className="ml-1 text-xs text-muted">
                            （开始 {fmt(r.session.startedAt)}）
                          </span>
                        )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge row={r} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {r.session?.itemCount ?? 0}
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs text-slate-500"
                      title={r.id}
                    >
                      {r.shortId}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeleteParticipantButton pid={r.id} shortId={r.shortId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          默认按「提交时间」倒序（最新在顶部），方便快速定位并清理测试提交。删除为级联操作，
          会一并清除该参与者的全部作答明细。
        </p>
      </Card>
    </Container>
  );
}
