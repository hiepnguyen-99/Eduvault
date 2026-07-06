"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ScrollText, Table } from "lucide-react";
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
  page_size: 10,
  total: 0,
  has_next: false,
  has_prev: false,
  filters: { actor: "", action: "", resource_type: "", query: "" },
  options: { actions: [], resource_types: [] },
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "auth.login": "Đăng nhập",
    "auth.logout": "Đăng xuất",
    "rag.ask": "Hỏi đáp trợ lý",
    "document.upload": "Tải tài liệu lên",
    "document.delete": "Xóa tài liệu",
    "document.update": "Cập nhật tài liệu",
    "document.sync": "Đồng bộ tài liệu",
    "policy.create": "Tạo chính sách",
    "policy.update": "Cập nhật chính sách",
    "policy.delete": "Xóa chính sách",
    "policy.activate": "Kích hoạt chính sách",
    "user.create": "Tạo người dùng",
    "user.update": "Cập nhật người dùng",
    "user.delete": "Xóa người dùng",
    "folder.create": "Tạo thư mục",
    "folder.update": "Cập nhật thư mục",
    "folder.delete": "Xóa thư mục",
    "permission.grant": "Cấp quyền",
    "permission.revoke": "Thu hồi quyền",
  };
  return labels[action] || action;
}

function resourceLabel(type: string | null | undefined, id: string | null | undefined) {
  if (!type) return "";
  const t = type.replace("session", "Phiên làm việc").replace("query", "Hỏi đáp").replace("document", "Tài liệu");
  return id ? `${t}/${id}` : t;
}

function scopeLabel(scope: unknown) {
  if (scope === "public_or_owned") return "Công khai / của tôi";
  if (scope === "personal") return "Cá nhân";
  if (scope === "global") return "Toàn cục";
  return typeof scope === "string" ? scope : "";
}

function intentLabel(intent: unknown) {
  if (intent === "document_retrieval") return "Tra cứu tài liệu";
  if (intent === "statistics_query") return "Truy vấn thống kê";
  if (intent === "out_of_scope") return "Ngoài phạm vi";
  if (intent === "greetings") return "Chào hỏi";
  return typeof intent === "string" ? intent : "";
}

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
    params.set("page_size", "10");
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

    <Panel title="Bộ lọc audit" description="Lọc theo người thực hiện, hành động, tài nguyên và từ khóa tự do.">
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <input className="field" placeholder="Mã người dùng" value={filters.actor} onChange={event => set("actor", event.target.value)} />
        <select className="field" value={filters.action} onChange={event => set("action", event.target.value)}>
          <option value="">Tất cả hành động</option>
          {data.options.actions.map(item => <option key={item} value={item}>{actionLabel(item)}</option>)}
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



    {(() => {
      const startIdx = (data.page - 1) * data.page_size + (data.items.length > 0 ? 1 : 0);
      const endIdx = startIdx + data.items.length - (data.items.length > 0 ? 1 : 0);
      const desc = data.total > 0 ? `Hiển thị ${startIdx}-${endIdx} / ${data.total} sự kiện` : "Không có sự kiện";

      return (
        <Panel 
          title="Chi tiết hoạt động" 
          icon={<Table size={16} />}
          description={desc}
          action={<button className="btn-secondary py-1.5 px-3 text-xs flex items-center" onClick={() => load()}><RefreshCw size={14} className="mr-1"/> Làm mới</button>}
          className="mt-5"
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>THỜI GIAN</th>
                  <th>HÀNH ĐỘNG</th>
                  <th>NGƯỜI THỰC HIỆN</th>
                  <th>TÀI NGUYÊN</th>
                  <th>CÂU HỎI</th>
                  <th>CÂU TRẢ LỜI</th>
                  <th>PHẠM VI</th>
                  <th>MỤC ĐÍCH</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => {
                  const detail = (item.detail || {}) as any;
                  return (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{formatDate(item.created_at)}</td>
                      <td><strong>{actionLabel(item.action)}</strong></td>
                      <td><strong>{item.actor_code}</strong></td>
                      <td>{resourceLabel(item.resource_type, item.resource_id)}</td>
                      <td className="max-w-[150px] truncate" title={detail.question}>{detail.question}</td>
                      <td className="max-w-[150px] truncate" title={detail.answer}>{detail.answer}</td>
                      <td>{scopeLabel(detail.scope)}</td>
                      <td>{intentLabel(detail.intent)}</td>
                    </tr>
                  )
                })}
                {!data.items.length && <tr><td colSpan={9} className="muted text-center">Không có dữ liệu.</td></tr>}
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
      );
    })()}
  </div>;
}

export default function AuditLogsPage() {
  return <PermissionGuard permission="audit.view"><AuditLogsContent /></PermissionGuard>;
}
