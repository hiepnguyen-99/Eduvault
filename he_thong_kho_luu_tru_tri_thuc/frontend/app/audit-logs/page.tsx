"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { PermissionGuard } from "@/components/permission-guard";
import { useAuth } from "@/components/auth-provider";
import { Audit, formatDate } from "@/lib/api";
import { PageHeader, Panel } from "@/components/ui";

type AuditLogsResponse = {
  items: Audit[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
  has_prev: boolean;
  filters: {
    actor: string;
    action: string;
    resource_type: string;
    query: string;
  };
  options: {
    actions: string[];
    resource_types: string[];
  };
};

const emptyResponse: AuditLogsResponse = {
  items: [],
  page: 1,
  page_size: 20,
  total: 0,
  has_next: false,
  has_prev: false,
  filters: { actor: "", action: "", resource_type: "", query: "" },
  options: { actions: [], resource_types: [] },
};

function AuditLogsContent() {
  const { request } = useAuth();
  const [data, setData] = useState<AuditLogsResponse>(emptyResponse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ actor: "", action: "", resource_type: "", query: "", page: 1 });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.actor.trim()) params.set("actor", filters.actor.trim());
    if (filters.action.trim()) params.set("action", filters.action.trim());
    if (filters.resource_type.trim()) params.set("resource_type", filters.resource_type.trim());
    if (filters.query.trim()) params.set("q", filters.query.trim());
    params.set("page", String(filters.page));
    params.set("page_size", "20");
    return params.toString();
  }, [filters]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await request<AuditLogsResponse>(`/api/audit-logs?${queryString}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải nhật ký hệ thống.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [queryString]);

  function set<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters(current => ({ ...current, [key]: value, page: key === "page" ? Number(value) : 1 }));
  }

  return <div>
    <PageHeader eyebrow="Vận hành" title="Nhật ký hệ thống" description="Theo dõi hành động quản trị, tải lên, chính sách, truy cập và sự kiện vận hành theo bộ lọc riêng." actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15}/>Làm mới</button>}/>
    {error && <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}

    <Panel title="Bộ lọc nhật ký" description="Lọc theo người thực hiện, hành động, tài nguyên và từ khóa tự do.">
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <input className="field" placeholder="Mã người dùng" value={filters.actor} onChange={event => set("actor", event.target.value)} />
        <select className="field" value={filters.action} onChange={event => set("action", event.target.value)}>
          <option value="">Tất cả hành động</option>
          {data.options.actions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="field" value={filters.resource_type} onChange={event => set("resource_type", event.target.value)}>
          <option value="">Tất cả tài nguyên</option>
          {data.options.resource_types.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="field" placeholder="Tìm trong hành động, tài nguyên, chi tiết..." value={filters.query} onChange={event => set("query", event.target.value)} />
      </div>
    </Panel>

    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <div className="app-card p-4">
        <ScrollText className="text-blue-600" size={18}/>
        <strong className="mt-3 block text-xl">{data.total}</strong>
        <span className="muted text-xs">Tổng sự kiện phù hợp bộ lọc</span>
      </div>
      <div className="app-card p-4">
        <strong className="block text-xl">{data.page}</strong>
        <span className="muted text-xs">Trang hiện tại</span>
      </div>
      <div className="app-card p-4">
        <strong className="block text-xl">{data.items.length}</strong>
        <span className="muted text-xs">Sự kiện trên trang này</span>
      </div>
    </div>

    <Panel title="Dòng thời gian nhật ký" description={loading ? "Đang tải..." : "Sự kiện mới nhất được sắp xếp giảm dần theo thời gian"} className="mt-5">
      <div className="space-y-3 p-4">
        {data.items.map(item => (
          <div key={item.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-blue">{item.action}</span>
              <strong className="text-sm">{item.actor_code}</strong>
              <span className="muted text-xs">{item.resource_type}{item.resource_id ? `/${item.resource_id}` : ""}</span>
              <span className="ml-auto text-[11px] text-[var(--muted)]">{formatDate(item.created_at)}</span>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--soft)] p-3 text-[11px] leading-5 text-[var(--text)]">{JSON.stringify(item.detail || {}, null, 2)}</pre>
          </div>
        ))}
        {!data.items.length && <p className="muted py-6 text-center text-xs">Không có sự kiện nào phù hợp bộ lọc hiện tại.</p>}
      </div>
    </Panel>

    <Panel title="Bảng nhật ký" className="mt-5">
      <div className="table-shell">
        <table className="data-table">
          <thead><tr><th>ID</th><th>Người thực hiện</th><th>Hành động</th><th>Tài nguyên</th><th>Thời gian</th></tr></thead>
          <tbody>
            {data.items.map(item => <tr key={item.id}><td>{item.id}</td><td>{item.actor_code}</td><td><strong>{item.action}</strong></td><td>{item.resource_type}{item.resource_id ? `/${item.resource_id}` : ""}</td><td>{formatDate(item.created_at)}</td></tr>)}
            {!data.items.length && <tr><td colSpan={5} className="muted text-center">Không có dữ liệu.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] p-4">
        <span className="muted text-xs">Trang {data.page} · Tổng {data.total} sự kiện</span>
        <div className="flex gap-2">
          <button className="btn-secondary px-3 py-2 text-xs" disabled={!data.has_prev} onClick={() => set("page", filters.page - 1)}>Trang trước</button>
          <button className="btn-secondary px-3 py-2 text-xs" disabled={!data.has_next} onClick={() => set("page", filters.page + 1)}>Trang sau</button>
        </div>
      </div>
    </Panel>
  </div>;
}

export default function AuditLogsPage() {
  return <PermissionGuard permission="audit.view"><AuditLogsContent /></PermissionGuard>;
}
