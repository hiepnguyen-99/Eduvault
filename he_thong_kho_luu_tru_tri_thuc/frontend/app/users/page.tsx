"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, Pencil, Search, ShieldCheck, UserCheck, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useBackendData } from "@/lib/hooks";
import { PageHeader, Panel } from "@/components/ui";

type User = { code: string; name: string; role: string; department: string; active: number };
type ProfileUpdateRequest = {
  id: string;
  user_code: string;
  new_name: string;
  new_department: string;
  reason: string;
  status: string;
  created_at: string;
  current_name: string;
  current_department: string;
};

type UserImportPreviewRow = {
  row: number;
  code: string;
  name: string;
  role: string;
  department: string;
  password: string;
  active: number;
  action: "create" | "update";
  status: "valid" | "error";
  errors: string[];
  warnings: string[];
  exists: boolean;
  current?: { code: string; name: string; role: string; department: string; active: number } | null;
};

type UserImportPreview = {
  status: "validated" | "has_errors";
  summary: {
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    warning_rows: number;
    create_rows: number;
    update_rows: number;
  };
  rows: UserImportPreviewRow[];
};

const roleLabels: Record<string, string> = { lecturer: "Giảng viên", new_lecturer: "Giảng viên moi", head: "Trưởng bộ môn", admin: "Quản trị viên" };
const roleBadge: Record<string, string> = { lecturer: "badge-green", new_lecturer: "badge-amber", head: "badge-blue", admin: "badge-red" };

function randomCode(name: string) {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "D");
  const initials = ascii.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").filter(c => /[A-Z]/.test(c)).join("").slice(0, 3);
  const num = String(Math.floor(Math.random() * 900) + 100);
  return (initials || "USR") + num;
}

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { request } = useAuth();
  const [form, setForm] = useState({ code: randomCode(""), name: "", password: "", role: "lecturer", department: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, value: string) {
    setForm(current => {
      const next = { ...current, [key]: value };
      if (key === "name") next.code = randomCode(value);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await request("/api/admin/users", { method: "POST", body: JSON.stringify({ ...form, code: form.code.toUpperCase() }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tạo tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="app-card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div><p className="eyebrow">Tạo mới</p><h2 className="mt-0.5 text-sm font-bold">Thêm tài khoản</h2></div>
          <button onClick={onClose} className="icon-btn"><X size={16}/></button>
        </div>
        <form className="p-5 space-y-3" onSubmit={submit}>
          <label className="block text-xs font-bold">Họ tên <span className="text-red-500">*</span>
            <input className="field mt-1" required value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nguyen Van A"/>
          </label>
          <label className="block text-xs font-bold">Mã tài khoản <span className="text-red-500">*</span>
            <div className="mt-1 flex gap-2">
              <input className="field flex-1 uppercase" required value={form.code} onChange={e => setForm(current => ({ ...current, code: e.target.value.toUpperCase() }))}/>
              <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => setForm(current => ({ ...current, code: randomCode(current.name) }))}>Đổi mã</button>
            </div>
          </label>
          <label className="block text-xs font-bold">Mật khẩu <span className="text-red-500">*</span>
            <input className="field mt-1" required minLength={4} value={form.password} onChange={e => set("password", e.target.value)}/>
          </label>
          <label className="block text-xs font-bold">Bộ môn <span className="text-red-500">*</span>
            <input className="field mt-1" required value={form.department} onChange={e => set("department", e.target.value)} placeholder="Công nghệ thông tin"/>
          </label>
          <label className="block text-xs font-bold">Vai trò
            <select className="field mt-1" value={form.role} onChange={e => set("role", e.target.value)}>
              <option value="lecturer">Giảng viên</option>
              <option value="new_lecturer">Giảng viên moi</option>
              <option value="head">Trưởng bộ môn</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </label>
          {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Hủy</button>
            <button className="btn-primary flex-1" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" size={14}/> : <UserPlus size={14}/>}Tạo tài khoản
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ userRow, onClose, onDone }: { userRow: User; onClose: () => void; onDone: () => void }) {
  const { request } = useAuth();
  const [form, setForm] = useState({ name: userRow.name, role: userRow.role, department: userRow.department, active: Boolean(userRow.active) });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, value: string | boolean) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await request(`/api/admin/users/${userRow.code}`, { method: "PUT", body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi cập nhật tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="app-card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div><p className="eyebrow">Chỉnh sửa tài khoản</p><h2 className="mt-0.5 text-sm font-bold font-mono">{userRow.code}</h2></div>
          <button onClick={onClose} className="icon-btn"><X size={16}/></button>
        </div>
        <form className="p-5 space-y-3" onSubmit={submit}>
          <label className="block text-xs font-bold">Họ tên <span className="text-red-500">*</span>
            <input className="field mt-1" required value={form.name} onChange={e => set("name", e.target.value)}/>
          </label>
          <label className="block text-xs font-bold">Bộ môn <span className="text-red-500">*</span>
            <input className="field mt-1" required value={form.department} onChange={e => set("department", e.target.value)}/>
          </label>
          <label className="block text-xs font-bold">Vai trò
            <select className="field mt-1" value={form.role} onChange={e => set("role", e.target.value)}>
              <option value="lecturer">Giảng viên</option>
              <option value="new_lecturer">Giảng viên moi</option>
              <option value="head">Trưởng bộ môn</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} className="h-4 w-4 rounded"/>
            Tài khoản đang hoạt động
          </label>
          {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Hủy</button>
            <button className="btn-primary flex-1" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" size={14}/> : <Pencil size={14}/>}Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user, request } = useAuth();
  const { data: users, reload: reloadUsers } = useBackendData<User[]>("/api/admin/users", []);
  const { data: profileRequests, reload: reloadProfileRequests } = useBackendData<ProfileUpdateRequest[]>("/api/admin/profile-update-requests", []);
  const [editing, setEditing] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<UserImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  if (user?.role !== "admin") {
    return <div className="p-10 text-center"><ShieldCheck className="mx-auto mb-3 text-[var(--muted)]" size={40}/><p className="font-bold">Chỉ quản trị viên mới có quyền truy cập trang này.</p></div>;
  }

  async function approveProfile(id: string) {
    if (!confirm("Phê duyệt cập nhật thông tin này?")) return;
    try {
      await request(`/api/admin/profile-update-requests/${id}/approve`, { method: "PUT" });
      setMessage("Đã phê duyệt. Thông tin người dùng đã được cập nhật.");
      reloadProfileRequests();
      reloadUsers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Lỗi khi phê duyệt.");
    }
  }

  async function rejectProfile(id: string) {
    if (!confirm("Từ chối yêu cầu cập nhật này?")) return;
    try {
      await request(`/api/admin/profile-update-requests/${id}/reject`, { method: "PUT" });
      setMessage("Đã từ chối yêu cầu cập nhật.");
      reloadProfileRequests();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Lỗi khi từ chối.");
    }
  }

  async function toggleActive(code: string, userRow: User) {
    await request(`/api/admin/users/${code}`, {
      method: "PUT",
      body: JSON.stringify({ name: userRow.name, role: userRow.role, department: userRow.department, active: !userRow.active }),
    });
    reloadUsers();
  }

  async function previewImport() {
    if (!importFile) return;
    setImportBusy(true);
    setMessage("");
    try {
      const result = await request<UserImportPreview>("/api/admin/users/import/preview", {
        method: "POST",
        headers: { "X-Filename": importFile.name, "Content-Type": importFile.type || "text/csv" },
        body: await importFile.arrayBuffer(),
      });
      setImportPreview(result);
      setMessage(result.status === "validated" ? "CSV hợp lệ, bạn có thể xác nhận import." : "CSV còn lỗi, vui lòng kiểm tra preview.");
    } catch (err) {
      setImportPreview(null);
      setMessage(err instanceof Error ? err.message : "Không preview được file CSV người dùng.");
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImportBusy(true);
    setMessage("");
    try {
      const result = await request<{ created: number; updated: number; reactivated: number; processed: number }>("/api/admin/users/import/confirm", {
        method: "POST",
        body: JSON.stringify({ rows: importPreview.rows }),
      });
      setMessage(`Đã import ${result.processed} tài khoản: tạo mới ${result.created}, cập nhật ${result.updated}, mở lại ${result.reactivated}.`);
      setImportPreview(null);
      setImportFile(null);
      reloadUsers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không confirm được import người dùng.");
    } finally {
      setImportBusy(false);
    }
  }

  const pendingProfileRequests = profileRequests.filter(item => item.status === "pending");

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Người dùng"
        description="Quản lý tài khoản, vai trò và yêu cầu cập nhật hồ sơ trong hệ thống."
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><UserPlus size={15}/>Tạo tài khoản</button>}
      />

      {message && <p className="mb-4 rounded bg-green-50 p-3 text-xs text-green-700">{message}</p>}

      {pendingProfileRequests.length > 0 && (
        <Panel title={`Yêu cầu cập nhật hồ sơ (${pendingProfileRequests.length} chờ duyệt)`} className="mb-5">
          <div className="divide-y divide-[var(--border)]">
            {pendingProfileRequests.map(req => (
              <div key={req.id} className="flex items-start gap-4 p-4">
                <div className="h-9 w-9 shrink-0 rounded-full bg-blue-100 text-blue-700 grid place-items-center text-xs font-bold">
                  {req.user_code.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-bold text-sm">{req.user_code}</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <span className="muted">Tên hiện tại:</span><span>{req.current_name}</span>
                    <span className="muted">Tên mới:</span><strong>{req.new_name}</strong>
                    <span className="muted">Bộ môn hien tai:</span><span>{req.current_department}</span>
                    <span className="muted">Bộ môn moi:</span><strong>{req.new_department}</strong>
                  </div>
                  <p className="muted mt-1">Lý do: {req.reason}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button className="btn-primary text-xs" onClick={() => approveProfile(req.id)}><UserCheck size={13}/>Duyệt</button>
                  <button className="btn-secondary text-xs text-red-600" onClick={() => rejectProfile(req.id)}>Từ chối</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="mb-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Import CSV người dùng" description="Tạo mới hoặc cập nhật hàng loạt tài khoản từ file CSV.">
          <div className="space-y-4 p-4">
            <label className="block rounded-xl border-2 border-dashed border-blue-300 p-6 text-center">
              <FileUp className="mx-auto text-blue-600" size={24}/>
              <strong className="mt-3 block text-sm">{importFile?.name || "Chọn file CSV người dùng"}</strong>
              <span className="muted mt-1 block text-xs">Cột gợi ý: code, name, role, department, password, active</span>
              <input className="hidden" type="file" accept=".csv" onChange={event => setImportFile(event.target.files?.[0] || null)} />
            </label>
            <button className="btn-primary w-full" disabled={!importFile || importBusy} onClick={previewImport}>
              {importBusy ? <LoaderCircle className="animate-spin" size={15}/> : <Search size={15}/>}Preview CSV
            </button>
            <button className="btn-secondary w-full" disabled={!importPreview || importPreview.summary.error_rows > 0 || importBusy} onClick={confirmImport}>
              <CheckCircle2 size={15}/>Xác nhận import
            </button>
          </div>
        </Panel>

        <Panel title="Preview import" description="Kiểm tra lỗi và các tài khoản sẽ được tạo/cập nhật trước khi xác nhận.">
          <div className="p-4">
            {!importPreview ? (
              <p className="muted text-xs">Chưa có preview. Hãy chọn file CSV rồi bấm Preview.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <MiniMetric label="Total" value={importPreview.summary.total_rows} />
                  <MiniMetric label="Valid" value={importPreview.summary.valid_rows} />
                  <MiniMetric label="Errors" value={importPreview.summary.error_rows} />
                  <MiniMetric label="Warnings" value={importPreview.summary.warning_rows} />
                  <MiniMetric label="Create" value={importPreview.summary.create_rows} />
                  <MiniMetric label="Update" value={importPreview.summary.update_rows} />
                </div>
                <div className="table-shell">
                  <table className="data-table">
                    <thead><tr><th>Row</th><th>Mã</th><th>Họ tên</th><th>Vai trò</th><th>Hành động</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
                    <tbody>
                      {importPreview.rows.map(item => (
                        <tr key={`${item.row}-${item.code}`}>
                          <td>{item.row}</td>
                          <td><strong className="font-mono text-xs">{item.code}</strong></td>
                          <td>{item.name}<span className="muted block text-[10px]">{item.department}</span></td>
                          <td><span className={`badge ${roleBadge[item.role] || "badge-gray"}`}>{roleLabels[item.role] || item.role}</span></td>
                          <td><span className={`badge ${item.action === "create" ? "badge-green" : "badge-blue"}`}>{item.action === "create" ? "Tạo mới" : "Cập nhật"}</span></td>
                          <td><span className={`badge ${item.status === "valid" ? "badge-green" : "badge-red"}`}>{item.status === "valid" ? "Hợp lệ" : "Lỗi"}</span></td>
                          <td className="text-xs">{[...item.errors, ...item.warnings].join("; ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={`Tài khoản hệ thống (${users.length})`}>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Mã</th><th>Họ tên</th><th>Vai trò</th><th>Bộ môn</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {users.map(userRow => (
                <tr key={userRow.code}>
                  <td><strong className="font-mono text-xs">{userRow.code}</strong></td>
                  <td>{userRow.name}</td>
                  <td><span className={`badge ${roleBadge[userRow.role] || "badge-green"}`}>{roleLabels[userRow.role] || userRow.role}</span></td>
                  <td className="muted text-xs">{userRow.department}</td>
                  <td>
                    <span className={`badge ${userRow.active ? "badge-green" : "badge-red"}`}>
                      {userRow.active ? <><CheckCircle2 size={11}/>Hoạt động</> : "Đã khóa"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-secondary text-xs" onClick={() => setEditing(userRow)}>
                        <Pencil size={12}/>Sửa
                      </button>
                      {userRow.code !== user?.code && (
                        <button className="btn-secondary text-xs" onClick={() => toggleActive(userRow.code, userRow)}>
                          {userRow.active ? "Khóa" : "Mở khóa"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); setMessage("Tạo tài khoản thanh cong."); reloadUsers(); }}/>
      )}
      {editing && (
        <EditUserModal userRow={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setMessage("Đã cập nhật tài khoản."); reloadUsers(); }}/>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}
