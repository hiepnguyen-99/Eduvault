"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FileUp,
  Folder,
  FolderOpen,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  UploadCloud,
  UserCheck,
  Users,
} from "lucide-react";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader, Panel } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { useBackendData } from "@/lib/hooks";
import { FolderNode, PolicyFile, User, formatDate } from "@/lib/api";

type GovernanceTab = "import" | "tree" | "assignment" | "audit";
type MasterTree = { policy: PolicyFile | null; tree: FolderNode | null; message?: string };
type PolicyAudit = { id: string; actor: string; action: string; status: string; created_at: string };
type PolicyRequest = { id: string; actor: string; message: string; action_json: Record<string, unknown>; status: string; created_at: string; applied_at?: string };
type Assignment = {
  id: string;
  batch_id: string;
  lecturer_code: string;
  lecturer_name?: string;
  lecturer_name_snapshot?: string;
  specialization_id: string;
  specialization_code_snapshot?: string;
  specialization_name?: string;
  specialization_name_snapshot?: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type AssignmentList = { items: Assignment[] };
type AssignmentPreviewRow = {
  row: number;
  lecturer_code: string;
  lecturer_name: string;
  specialization_input: string;
  specialization_id: string | null;
  specialization_code: string;
  specialization_name: string;
  status: "valid" | "error";
  errors: string[];
  warnings: string[];
};
type AssignmentPreview = {
  status: "validated" | "has_errors";
  batch_preview_id: string;
  summary: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number };
  assignments: AssignmentPreviewRow[];
  errors: Array<{ row: number; lecturer_code: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
};
type ActivationSpecialization = { key?: string; code?: string; name?: string; name_en?: string; courses_count?: number };
type ActivationPreview = {
  policy_id: string;
  policy_title: string;
  current_policy_id?: string | null;
  current_policy_title?: string | null;
  status: string;
  tree_impact: {
    added_specializations: ActivationSpecialization[];
    removed_specializations: ActivationSpecialization[];
    matched_specializations: Array<{ old: ActivationSpecialization; new: ActivationSpecialization }>;
    summary: { added: number; removed: number; matched: number };
  };
  assignment_impact: {
    valid_assignments: number;
    needs_resolution_assignments: number;
    valid: Array<Record<string, string>>;
    requires_admin_resolution: Array<Record<string, string>>;
  };
  virtual_tree_impact: { virtual_trees_to_rebuild: number; affected_lecturers: string[] };
  folder_permission_impact: { active_permissions_to_deprecate: number; will_rebuild_permissions: boolean };
};
type PolicyAssistantAction = {
  action: string;
  node?: string;
  parent?: string;
  new_parent?: string;
  new_name?: string;
  lecturer_code?: string;
  lecturer_name?: string;
  specialization_name?: string;
  specialization_code?: string;
  confirm_blocked_reason?: string | null;
  document_type?: string;
  visibility?: string;
  roles?: string[];
  [key: string]: unknown;
};
type PolicyAssistantPreview = {
  status: "preview" | "need_clarification";
  message?: string;
  action?: PolicyAssistantAction;
  preview?: {
    summary?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact;
    assignment_preview?: AssignmentPreview | null;
    requires_confirmation?: boolean;
    confirm_blocked_reason?: string | null;
    route?: string;
  };
};
type PolicyAssistantConfirmResult = {
  id: string;
  status: string;
  n8n?: { status?: string; reason?: string; message?: string };
  applied?: { status: string; audit_log_id: string; action: PolicyAssistantAction };
};

const emptyMaster: MasterTree = { policy: null, tree: null };
type ImpactSpec = { id?: string; name: string; code?: string };
type AssignmentAgentImpact = {
  lecturer: { code: string; name: string; role: string };
  current_specializations: ImpactSpec[];
  target_specializations: ImpactSpec[];
  assignment_impact: {
    added_specializations: ImpactSpec[];
    removed_specializations: ImpactSpec[];
    unchanged_specializations: ImpactSpec[];
  };
  virtual_tree_impact: { rebuild: boolean; affected_nodes: number };
  folder_permission_impact: { permissions_to_revoke: number; permissions_to_grant: number };
  risk_warnings: string[];
};
type TimeBasedPermissionImpact = {
  rule_id: string;
  rule_type: string;
  document_type: string;
  course: string;
  target_specializations: ImpactSpec[];
  release_at: string;
  before_permission: string;
  after_permission: string;
  permission_impact: { documents_to_open: number; target_lecturers: number; access_grants_to_create: number };
  risk_warnings: string[];
};
type AdvisorAction = {
  priority?: string;
  category?: string;
  title?: string;
  reason?: string;
  recommended_actions?: string[];
  scope?: Record<string, unknown>;
};
type AdvisorRiskArea = {
  specialization_name?: string;
  scope_name?: string;
  knowledge_risk?: string;
  risk?: string;
  document_coverage_percent?: number;
  assigned_lecturer_count?: number;
  reason?: string;
};
type AdvisorCourseGap = {
  course_name?: string;
  specialization_name?: string;
  coverage_percent?: number;
  missing_types?: string[];
};
type AdvisorDependencyWarning = {
  lecturer_code?: string;
  specialization_name?: string;
  dependency_risk?: string;
  owned_document_count?: number;
  owner_concentration_percent?: number;
};
type GovernanceAdvisorImpact = {
  risk_summary: Record<string, unknown>;
  governance_score: number;
  high_risk_areas: AdvisorRiskArea[];
  recommended_actions: AdvisorAction[];
  dependency_warnings: AdvisorDependencyWarning[];
  course_gaps: AdvisorCourseGap[];
  source: Record<string, boolean>;
};
const assistantExamples = [
  "Chuyển GV001 sang IoT",
  "Gán GV002 phụ trách Data Science",
  "Bỏ GV001 khỏi AI",
  "Đề thi Toán chỉ được mở cho AI, Data Science, IoT vào 08:00 ngày 10/09/2026",
  "Hiện tại khoa có rủi ro gì?",
  "Những việc nào nên làm tiếp?",
  "Chuyên ngành nào đang thiếu tri thức?",
  "Thêm AI Agent thuộc AI",
  "Thêm học phần Data Engineering vào Data Science",
  "Đề thi chỉ trưởng bộ môn được xem",
];

export default function PolicyPage() {
  return <PermissionGuard permission="policy.manage"><KnowledgeGovernanceCenter /></PermissionGuard>;
}

function KnowledgeGovernanceCenter() {
  const { user } = useAuth();
  const { data: masterTree, reload: reloadMaster } = useBackendData<MasterTree>("/api/admin/master-tree", emptyMaster);
  const { data: policyFiles, reload: reloadPolicies } = useBackendData<PolicyFile[]>("/api/policies", []);
  const { data: audits, reload: reloadAudits } = useBackendData<PolicyAudit[]>("/api/policy-assistant/audit", []);
  const { data: requests, reload: reloadRequests } = useBackendData<PolicyRequest[]>("/api/policy-assistant/requests", []);
  const { data: assignments, reload: reloadAssignments } = useBackendData<AssignmentList>("/api/lecturer-assignments", { items: [] });
  const { data: users, reload: reloadUsers } = useBackendData<User[]>(user?.role === "admin" ? "/api/admin/users" : "/api/specializations", []);
  const [activeTab, setActiveTab] = useState<GovernanceTab>("import");

  const tabs = useMemo<GovernanceTab[]>(() => {
    if (user?.role === "admin") return ["import", "tree", "assignment", "audit"];
    return ["tree", "assignment", "audit"];
  }, [user?.role]);

  async function refreshAll() {
    await Promise.all([reloadMaster(), reloadPolicies(), reloadAudits(), reloadRequests(), reloadAssignments(), reloadUsers()]);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị tri thức"
        title="Trung tâm Quản trị Tri thức"
        description="Điều phối policy, cây tri thức, phân công giảng viên và nhật ký governance của khoa CNTT."
        actions={<button className="btn-secondary" onClick={refreshAll}><RefreshCw size={15}/>Làm mới</button>}
      />

      <OverviewCards masterTree={masterTree} policyFiles={policyFiles} assignments={assignments.items} audits={audits} users={user?.role === "admin" ? users : []} />

      <div className="mb-5 mt-5 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition ${activeTab === tab ? "border-blue-500 bg-blue-50 text-blue-700" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--soft)]"}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabIcon(tab)}
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {activeTab === "import" && user?.role === "admin" && <ImportPolicyTab policyFiles={policyFiles} masterTree={masterTree} reloadAll={refreshAll} />}
      {activeTab === "tree" && <KnowledgeTreeTab masterTree={masterTree} />}
      {activeTab === "assignment" && <LecturerAssignmentTab assignments={assignments.items} users={user?.role === "admin" ? users : []} canSeeUsers={user?.role === "admin"} reloadAll={refreshAll} />}
      {activeTab === "audit" && <AuditLogTab audits={audits} requests={requests} assignments={assignments.items} reloadAll={refreshAll} />}
    </div>
  );
}

function OverviewCards({ masterTree, policyFiles, assignments, audits, users }: { masterTree: MasterTree; policyFiles: PolicyFile[]; assignments: Assignment[]; audits: PolicyAudit[]; users: User[] }) {
  const activePolicy = policyFiles.find(policy => policy.status === "active") || masterTree.policy;
  const activeAssignments = assignments.filter(item => item.status === "active");
  const lecturerUsers = users.filter(item => item.role === "lecturer" || item.role === "new_lecturer");
  const assignedCodes = new Set(activeAssignments.map(item => item.lecturer_code));
  const unassigned = lecturerUsers.length ? lecturerUsers.filter(item => !assignedCodes.has(item.code)).length : null;

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <OverviewItem title="Chính sách hiện tại" value={activePolicy?.title || "Chưa có"} detail={activePolicy ? `Kích hoạt: ${formatDate(activePolicy.activated_at || activePolicy.created_at)}` : "Admin cần kích hoạt chính sách"} icon={<Shield size={18}/>} />
      <OverviewItem title="Cây tri thức chuẩn" value={masterTree.tree ? "Đang hoạt động" : "Chưa sẵn sàng"} detail={masterTree.tree ? `${activePolicy?.parsed_json?.specializations?.length || 0} nhóm chuyên môn` : masterTree.message || "Chưa có cây active"} icon={<FolderOpen size={18}/>} />
      <OverviewItem title="Phân công hiện tại" value={`${activeAssignments.length}`} detail={unassigned === null ? "Chưa phân công: chưa có dữ liệu" : `GV chưa phân công: ${unassigned}`} icon={<UserCheck size={18}/>} />
      <OverviewItem title="Thay đổi gần nhất" value={audits[0] ? actionLabel(audits[0].action) : "Chưa có"} detail={audits[0] ? `${audits[0].actor} - ${formatDate(audits[0].created_at)}` : "Chưa có audit"} icon={<History size={18}/>} />
    </div>
  );
}

function OverviewItem({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <section className="app-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="muted text-[10px] font-bold uppercase">{title}</p>
          <strong className="mt-1 block text-sm">{value}</strong>
          <span className="muted mt-1 block text-[11px]">{detail}</span>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600">{icon}</div>
      </div>
    </section>
  );
}

// ─── Chat types ──────────────────────────────────────────────────────────────
type UserPerm = { code: string; name: string; role: string; department: string; folder_permissions: { id: string; folder_name: string; folder_path: string; permission: string }[]; specializations: { name: string }[]; grant_rules: { rule_type: string; rule_content: Record<string, unknown>; created_at: string }[] };
type ChatMsg = {
  id: string;
  role: "user" | "bot";
  text: string;
  preview?: PolicyAssistantPreview;
  confirmed?: boolean;
  appliedId?: string;
  permInfo?: UserPerm[];
  error?: boolean;
};

const QUICK_CHIPS = [
  { label: "GV001 có quyền gì?", group: "Tra cứu quyền" },
  { label: "Kiểm tra quyền GVNEW", group: "Tra cứu quyền" },
  { label: "Thêm thư mục NLP vào Khoa học máy tính", group: "Cây tri thức" },
  { label: "Đổi tên NLP thành Natural Language Processing", group: "Cây tri thức" },
  { label: "Xóa thư mục NLP", group: "Cây tri thức" },
  { label: "Cấp quyền cho GV001 ở Khoa học máy tính", group: "Phân quyền" },
  { label: "Thu hồi quyền Khoa học máy tính của GV001", group: "Phân quyền" },
  { label: "Cho GV001 tất cả các quyền trong AI", group: "Phân quyền" },
  { label: "Chuyển Đề thi sang private", group: "Visibility" },
  { label: "Chuyển GV001 sang IoT", group: "Phân công" },
  { label: "Hiện tại khoa có rủi ro gì?", group: "Tư vấn" },
];

function foldVi(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase(); }

function isPermQuery(msg: string) {
  const f = foldVi(msg);
  return /\b(quyen gi|co quyen|quyen nao|kiem tra quyen|xem quyen|quyen hien tai|quyen cua)\b/.test(f)
    || /[A-Za-z]{2,}\d+.*quyen/.test(f)
    || /quyen.*[A-Za-z]{2,}\d+/.test(f);
}
function extractCode(msg: string) {
  const m = msg.match(/\b([A-Za-z]{2,}[0-9]+)\b/);
  return m ? m[1].toUpperCase() : null;
}

function roleLbl(r: string) { return ({ admin: "Quản trị viên", head: "Trưởng bộ môn", lecturer: "Giảng viên", new_lecturer: "Giảng viên mới" } as Record<string,string>)[r] ?? r; }

function PermCard({ u }: { u: UserPerm }) {
  const total = u.folder_permissions.length + u.specializations.length;
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs space-y-2">
      <div className="font-semibold text-blue-800">{u.name} <span className="font-normal text-blue-500">({u.code}) · {roleLbl(u.role)}</span></div>
      {total === 0 && <p className="text-amber-600">⚠ Chưa có quyền folder nào.</p>}
      {u.specializations.length > 0 && (
        <div>
          <p className="font-semibold text-gray-600 mb-1">Chuyên môn ({u.specializations.length}):</p>
          <div className="flex flex-wrap gap-1">{u.specializations.map(s => <span key={s.name} className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{s.name}</span>)}</div>
        </div>
      )}
      {u.folder_permissions.length > 0 && (
        <div>
          <p className="font-semibold text-gray-600 mb-1">Quyền folder ({u.folder_permissions.length}):</p>
          <div className="space-y-1">{u.folder_permissions.map(fp => <div key={fp.id} className="flex gap-2"><span className="text-gray-700">{fp.folder_name}</span><span className="rounded bg-green-100 px-1 text-green-700">{fp.permission}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

function BotBubble({ msg, onConfirm, confirming }: { msg: ChatMsg; onConfirm: (msg: ChatMsg) => void; confirming: boolean }) {
  const p = msg.preview;
  const action = p?.action;
  const canConfirm = p?.status === "preview" && !!action && !p.preview?.confirm_blocked_reason && !isAdvisorAction(action) && !msg.confirmed;

  return (
    <div className="flex gap-2 items-start">
      <div className="h-7 w-7 rounded-full bg-blue-600 text-white grid place-items-center flex-shrink-0 mt-1"><Bot size={14} /></div>
      <div className="max-w-[85%] space-y-2">
        {/* Main text */}
        <div className={`rounded-2xl rounded-tl-none px-4 py-3 text-xs leading-relaxed ${msg.error ? "bg-red-50 text-red-700 border border-red-200" : "bg-white border border-[var(--border)] text-gray-800"}`}>
          {msg.text}
        </div>

        {/* Permission info */}
        {msg.permInfo && msg.permInfo.map(u => <PermCard key={u.code} u={u} />)}

        {/* Preview card */}
        {p?.status === "preview" && action && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-3 space-y-2 text-xs">
            {/* Summary */}
            {p.preview?.summary && <p className="text-gray-700 font-medium">{p.preview.summary}</p>}

            {isAssignmentAction(action) ? (
              <AssignmentAgentPreview impact={p.preview?.impact} blockedReason={p.preview?.confirm_blocked_reason} />
            ) : isTimeBasedPermissionAction(action) ? (
              <TimeBasedPermissionPreview impact={p.preview?.impact} />
            ) : isAdvisorAction(action) ? (
              <GovernanceAdvisorPreview impact={p.preview?.impact} />
            ) : (
              <div className="space-y-1">
                {assistantTreeChanges(action).filter(x => !x.includes("Không có")).map(x => (
                  <div key={x} className="flex gap-2 rounded bg-blue-50 px-2 py-1.5"><span className="text-blue-500">🌿</span><span>{x}</span></div>
                ))}
                {assistantPermissionChanges(action).filter(x => !x.includes("Không có")).map(x => (
                  <div key={x} className="flex gap-2 rounded bg-amber-50 px-2 py-1.5"><span className="text-amber-500">🔑</span><span>{x}</span></div>
                ))}
              </div>
            )}

            {p.preview?.confirm_blocked_reason && (
              <p className="rounded bg-red-50 px-2 py-1.5 text-red-600">⛔ {p.preview.confirm_blocked_reason}</p>
            )}

            {/* Confirm button */}
            {canConfirm && (
              <button
                onClick={() => onConfirm(msg)}
                disabled={confirming}
                className="btn-primary text-xs py-1.5 mt-1 flex items-center gap-1.5 w-full justify-center"
              >
                {confirming ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                Xác nhận thực hiện
              </button>
            )}
            {msg.confirmed && (
              <div className="rounded bg-green-50 px-2 py-1.5 text-green-700 flex items-center gap-1.5">
                <Check size={12} /> Đã thực hiện{msg.appliedId ? ` · audit: ${msg.appliedId}` : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AIGovernanceAssistantTab({ reloadAll }: { reloadAll: () => Promise<void> }) {
  const { request } = useAuth();
  const [msgs, setMsgs] = useState<ChatMsg[]>([{
    id: "welcome",
    role: "bot",
    text: "Xin chào! Tôi là Policy Assistant. Tôi có thể giúp bạn:\n• Tra cứu quyền của tài khoản (vd: \"GV001 có quyền gì?\")\n• Thêm/sửa/xóa thư mục trong cây tri thức\n• Cấp hoặc thu hồi quyền cho giảng viên\n• Thay đổi visibility tài liệu\n• Tư vấn governance\n\nHãy nhập yêu cầu hoặc chọn gợi ý bên dưới.",
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function addMsg(msg: ChatMsg) { setMsgs(prev => [...prev, msg]); }
  function updateMsg(id: string, patch: Partial<ChatMsg>) { setMsgs(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m)); }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setShowChips(false);
    const userId = `u-${Date.now()}`;
    const botId = `b-${Date.now()}`;
    addMsg({ id: userId, role: "user", text: trimmed });
    addMsg({ id: botId, role: "bot", text: "Đang xử lý...", });
    setBusy(true);

    try {
      // Permission query: fetch user permissions
      if (isPermQuery(trimmed)) {
        const code = extractCode(trimmed);
        const data = await request<{ users: UserPerm[] }>("/api/admin/users-with-permissions");
        const matches = code ? data.users.filter(u => u.code === code) : data.users.filter(u => u.role !== "admin");
        if (matches.length === 0) {
          updateMsg(botId, { text: code ? `Không tìm thấy tài khoản "${code}" trong hệ thống.` : "Không có giảng viên nào trong hệ thống." });
        } else {
          const summary = code
            ? `Đây là thông tin quyền của ${matches[0].name} (${code}):`
            : `Danh sách ${matches.length} tài khoản và quyền hiện tại:`;
          updateMsg(botId, { text: summary, permInfo: matches });
        }
        return;
      }

      // Policy command: preview
      const data = await request<PolicyAssistantPreview>("/api/policy-assistant/preview", {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });

      if (data.status === "need_clarification") {
        updateMsg(botId, { text: data.message || "Lệnh chưa rõ, bạn có thể nói rõ hơn không?" });
      } else {
        const summary = data.preview?.summary || `Hệ thống hiểu: ${actionLabel(data.action?.action || "")}`;
        updateMsg(botId, {
          text: isAdvisorAction(data.action!) ? summary : `Tôi đã phân tích yêu cầu của bạn. Xem chi tiết bên dưới và nhấn **Xác nhận** nếu muốn thực hiện.`,
          preview: data,
        });
      }
    } catch (err) {
      updateMsg(botId, { text: err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function confirmMsg(msg: ChatMsg) {
    if (!msg.preview?.action || !msg.preview.preview) return;
    setConfirming(true);
    try {
      const userMsg = [...msgs].reverse().find(m => m.role === "user");
      const data = await request<PolicyAssistantConfirmResult>("/api/policy-assistant/confirm", {
        method: "POST",
        body: JSON.stringify({ message: userMsg?.text || "", action: msg.preview.action, preview: msg.preview.preview, apply_now: true }),
      });
      updateMsg(msg.id, { confirmed: true, appliedId: data.applied?.audit_log_id });
      const successId = `success-${Date.now()}`;
      addMsg({ id: successId, role: "bot", text: data.applied ? "✅ Đã áp dụng thay đổi thành công! Master Tree và Audit Log đã được cập nhật." : "✅ Yêu cầu đã được ghi nhận." });
      await reloadAll();
    } catch (err) {
      const errId = `err-${Date.now()}`;
      addMsg({ id: errId, role: "bot", text: err instanceof Error ? err.message : "Không confirm được thay đổi.", error: true });
    } finally {
      setConfirming(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const chipGroups = [...new Set(QUICK_CHIPS.map(c => c.group))];

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-white overflow-hidden" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {msgs.map(msg => msg.role === "user" ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl rounded-tr-none bg-blue-600 px-4 py-2.5 text-xs text-white leading-relaxed whitespace-pre-wrap">{msg.text}</div>
          </div>
        ) : (
          <BotBubble key={msg.id} msg={msg} onConfirm={confirmMsg} confirming={confirming} />
        ))}
        {busy && (
          <div className="flex gap-2 items-center">
            <div className="h-7 w-7 rounded-full bg-blue-600 text-white grid place-items-center flex-shrink-0"><Bot size={14} /></div>
            <div className="flex gap-1 rounded-2xl rounded-tl-none bg-white border border-[var(--border)] px-4 py-3">
              {[0,1,2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips */}
      {showChips && (
        <div className="border-t border-[var(--border)] px-4 py-3 bg-gray-50">
          <div className="space-y-2">
            {chipGroups.map(grp => (
              <div key={grp} className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-semibold text-gray-400 w-20 flex-shrink-0">{grp}</span>
                {QUICK_CHIPS.filter(c => c.group === grp).map(c => (
                  <button key={c.label} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:border-blue-400 hover:text-blue-600 transition-colors" onClick={() => send(c.label)}>
                    {c.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-[var(--border)] px-4 py-3 flex gap-2 items-end bg-white">
        <textarea
          ref={inputRef}
          className="field flex-1 resize-none text-xs"
          rows={2}
          placeholder="Nhập lệnh hoặc câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={busy}
        />
        <div className="flex flex-col gap-1.5">
          <button className="btn-primary text-xs py-2 px-3" onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
          <button className="btn-secondary text-[10px] py-1.5 px-2" onClick={() => setShowChips(v => !v)} title="Gợi ý">
            <Search size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AssistantSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <strong className="block text-xs">{title}</strong>
      <div className="mt-2 space-y-2">
        {items.map(item => <p key={item} className="rounded-md bg-[var(--soft)] px-3 py-2 text-xs">{item}</p>)}
      </div>
    </div>
  );
}

function isAssignmentAction(action: PolicyAssistantAction) {
  return action.action.startsWith("assignment.");
}

function isTimeBasedPermissionAction(action: PolicyAssistantAction) {
  return action.action === "permission.time_based_release";
}

function isAdvisorAction(action: PolicyAssistantAction) {
  return action.action.startsWith("advisor.");
}

function specList(items?: ImpactSpec[]) {
  if (!items?.length) return "Không có";
  return items.map(item => item.code ? `${item.code} - ${item.name}` : item.name).join(", ");
}

function isTimeBasedPermissionImpact(impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact): impact is TimeBasedPermissionImpact {
  return !!impact && "before_permission" in impact;
}

function TimeBasedPermissionPreview({ impact }: { impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact }) {
  if (!isTimeBasedPermissionImpact(impact)) return <PlaceholderBox title="Permission Impact" text="Chưa có dữ liệu impact." />;
  return (
    <div className="space-y-4">
      <AssistantSection title="Rule ID" items={[impact.rule_id]} />
      <AssistantSection title="Rule Type" items={[impact.rule_type]} />
      <AssistantSection title="Loại tài liệu" items={[impact.document_type]} />
      <AssistantSection title="Học phần" items={[impact.course]} />
      <AssistantSection title="Nhóm được mở quyền" items={[specList(impact.target_specializations)]} />
      <AssistantSection title="Thời điểm mở quyền" items={[impact.release_at]} />
      <AssistantSection title="Quyền trước thời điểm đó" items={[impact.before_permission]} />
      <AssistantSection title="Quyền sau thời điểm đó" items={[impact.after_permission]} />
      <AssistantSection title="Impact" items={[`Tài liệu match: ${impact.permission_impact.documents_to_open}`, `Giảng viên mục tiêu: ${impact.permission_impact.target_lecturers}`, `Access grants sẽ tạo: ${impact.permission_impact.access_grants_to_create}`]} />
      <AssistantSection title="Risk Warning" items={impact.risk_warnings.length ? impact.risk_warnings : ["Không có cảnh báo rủi ro."]} />
    </div>
  );
}

function isAssignmentAgentImpact(impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact): impact is AssignmentAgentImpact {
  return !!impact && "assignment_impact" in impact;
}

function AssignmentAgentPreview({ impact, blockedReason }: { impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact; blockedReason?: string | null }) {
  if (!isAssignmentAgentImpact(impact)) return <PlaceholderBox title="Assignment Impact" text="Chưa có dữ liệu impact." />;
  return (
    <div className="space-y-4">
      <AssistantSection title="Giảng viên" items={[`Mã: ${impact.lecturer.code}`, `Tên: ${impact.lecturer.name}`, `Vai trò: ${impact.lecturer.role}`]} />
      <AssistantSection title="Chuyên môn" items={[`Hiện tại: ${specList(impact.current_specializations)}`, `Sau thay đổi: ${specList(impact.target_specializations)}`]} />
      <AssistantSection title="Assignment Impact" items={[`Thêm: ${specList(impact.assignment_impact.added_specializations)}`, `Gỡ: ${specList(impact.assignment_impact.removed_specializations)}`, `Giữ nguyên: ${specList(impact.assignment_impact.unchanged_specializations)}`]} />
      <AssistantSection title="Virtual Tree Impact" items={[`Rebuild: ${impact.virtual_tree_impact.rebuild ? "Có" : "Không"}`, `Số node bị ảnh hưởng: ${impact.virtual_tree_impact.affected_nodes}`]} />
      <AssistantSection title="Folder Permission Impact" items={[`Quyền sẽ thu hồi: ${impact.folder_permission_impact.permissions_to_revoke}`, `Quyền sẽ cấp mới: ${impact.folder_permission_impact.permissions_to_grant}`]} />
      <AssistantSection title="Risk Warning" items={blockedReason ? [...impact.risk_warnings, blockedReason] : (impact.risk_warnings.length ? impact.risk_warnings : ["Không có cảnh báo rủi ro."])} />
    </div>
  );
}

function isGovernanceAdvisorImpact(impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact): impact is GovernanceAdvisorImpact {
  return !!impact && "governance_score" in impact;
}

function formatRiskSummary(summary: Record<string, unknown>) {
  return [
    `Knowledge risk: ${String(summary.knowledge_risk ?? "unknown")}`,
    `Coverage: ${String(summary.document_coverage_percent ?? 0)}%`,
    `Policy compliance: ${String(summary.policy_compliance_percent ?? 0)}%`,
    `Transfer readiness: ${String(summary.transfer_readiness_score ?? 0)}%`,
    `Critical gaps: ${String(summary.critical_gap_count ?? 0)}`,
  ];
}

function GovernanceAdvisorPreview({ impact }: { impact?: AssignmentAgentImpact | TimeBasedPermissionImpact | GovernanceAdvisorImpact }) {
  if (!isGovernanceAdvisorImpact(impact)) return <PlaceholderBox title="Advisor Impact" text="Chua co du lieu advisor." />;
  const risks = impact.high_risk_areas.length
    ? impact.high_risk_areas.map(item => `${item.specialization_name || item.scope_name || "Khu vuc"} - ${item.knowledge_risk || item.risk || "risk"}${item.reason ? `: ${item.reason}` : ""}`)
    : ["Chua co khu vuc rui ro cao."];
  const actions = impact.recommended_actions.length
    ? impact.recommended_actions.map(item => `${item.priority || "normal"} - ${item.title || item.category || "Action"}${item.reason ? `: ${item.reason}` : ""}`)
    : ["Chua co action khuyen nghi."];
  const dependencies = impact.dependency_warnings.length
    ? impact.dependency_warnings.map(item => `${item.specialization_name || "Chuyen nganh"} phu thuoc ${item.lecturer_code || "N/A"} - risk ${item.dependency_risk || "unknown"} (${item.owned_document_count || 0} tai lieu, ${item.owner_concentration_percent || 0}%)`)
    : ["Chua co canh bao phu thuoc giang vien."];
  const gaps = impact.course_gaps.length
    ? impact.course_gaps.map(item => `${item.specialization_name || "Chuyen nganh"} / ${item.course_name || "Hoc phan"} - coverage ${item.coverage_percent || 0}%, thieu: ${(item.missing_types || []).join(", ") || "khong"}`)
    : ["Chua co hoc phan thieu tri thuc."];
  return (
    <div className="space-y-4">
      <AssistantSection title="Governance Score" items={[`${impact.governance_score}/100`]} />
      <AssistantSection title="Risk Summary" items={formatRiskSummary(impact.risk_summary)} />
      <AssistantSection title="High Risk Areas" items={risks} />
      <AssistantSection title="Recommended Actions" items={actions} />
      <AssistantSection title="Dependency Warnings" items={dependencies} />
      <AssistantSection title="Course Gaps" items={gaps} />
    </div>
  );
}

function assistantInterpretation(action: PolicyAssistantAction, summary?: string) {
  return [
    summary || `Hệ thống nhận diện yêu cầu: ${actionLabel(action.action)}.`,
    `Action: ${actionLabel(action.action)}`,
  ];
}

function assistantTreeChanges(action: PolicyAssistantAction) {
  if (action.action === "add_node") return [`Thêm "${action.node}" vào "${action.parent}".`];
  if (action.action === "add_node_and_grant") return [`Thêm "${action.node}" vào "${action.parent}".`];
  if (action.action === "move_node") return [`Chuyển "${action.node}" sang "${action.new_parent || action.parent}".`];
  if (action.action === "rename_node") return [`Đổi tên "${action.node}" thành "${action.new_name}".`];
  if (action.action === "delete_node") return [`Xóa node "${action.node}" khỏi Master Tree.`];
  return ["Không có thay đổi Master Tree trong lệnh này."];
}

function assistantPermissionChanges(action: PolicyAssistantAction) {
  if (action.action === "add_node_and_grant") {
    const grant = action.grant as PolicyAssistantAction | undefined;
    if (!grant) return ["Không có thay đổi quyền trong lệnh này."];
    const targetLabel = grant.target_type === "user" ? `người dùng ${grant.target}` : `vai trò '${grant.target}'`;
    return [`Trao quyền '${grant.permission || "read"}' trên '${grant.resource || action.node}' cho ${targetLabel}.`];
  }
  if (action.action === "permission.grant") {
    const targetLabel = action.target_type === "user" ? `người dùng ${action.target}` : `vai trò '${action.target}'`;
    return [`Trao quyền '${action.permission || "read"}' trên '${action.resource}' cho ${targetLabel}.`];
  }
  if (action.action === "permission.revoke") {
    const targetLabel = action.target_type === "user" ? `người dùng ${action.target}` : `vai trò '${action.target}'`;
    return [`Thu hồi quyền truy cập '${action.resource}' của ${targetLabel}.`];
  }
  if (action.action === "permission.set_visibility") {
    const visLabel: Record<string, string> = { public: "công khai", private: "nội bộ", confidential: "mật/bí mật" };
    const vis = visLabel[action.visibility as string] || action.visibility || "?";
    const roleNote = action.roles?.length ? ` (chỉ: ${action.roles.join(", ")})` : "";
    return [`Đặt loại tài liệu '${action.document_type}' thành ${vis}${roleNote}.`];
  }
  if (action.action !== "update_permission") return ["Không có thay đổi quyền trong lệnh này."];
  const roles = action.roles?.join(", ") || "chưa xác định";
  return [`${action.document_type || "Tài liệu"} sẽ có visibility "${action.visibility || "confidential"}".`, `Role được xem: ${roles}.`];
}

function PlaceholderBox({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg border border-dashed border-[var(--border)] p-4"><strong className="block text-xs">{title}</strong><p className="muted mt-1 text-xs">{text}</p></div>;
}

function ImportPolicyTab({ policyFiles, masterTree, reloadAll }: { policyFiles: PolicyFile[]; masterTree: MasterTree; reloadAll: () => Promise<void> }) {
  const { request } = useAuth();
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyTitle, setPolicyTitle] = useState("Policy học liệu khoa CNTT");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activationPreview, setActivationPreview] = useState<ActivationPreview | null>(null);
  const [activatingPolicy, setActivatingPolicy] = useState<PolicyFile | null>(null);
  const [activationSummary, setActivationSummary] = useState<ActivationPreview | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activePolicy = policyFiles.find(item => item.status === "active");

  // Auto-expand the active policy
  useEffect(() => {
    if (activePolicy && !expandedId) setExpandedId(activePolicy.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePolicy?.id]);

  async function refresh() {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }

  async function uploadPolicy() {
    if (!policyFile) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/policies/upload", {
        method: "POST",
        headers: { "X-Filename": encodeURIComponent(policyFile.name), "X-Title": encodeURIComponent(policyTitle), "Content-Type": policyFile.type || "text/plain" },
        body: await policyFile.arrayBuffer(),
      });
      setPolicyFile(null);
      setMessage("Đã upload policy. Hãy activate để cập nhật Master Tree.");
      await reloadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không upload được policy.");
    } finally { setBusy(false); }
  }

  async function openActivationPreview(policy: PolicyFile) {
    setBusy(true); setMessage("");
    try {
      const preview = await request<ActivationPreview>(`/api/policies/${policy.id}/activation-preview`);
      setActivatingPolicy(policy);
      setActivationPreview(preview);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không tạo được bản xem trước kích hoạt.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmActivatePolicy() {
    if (!activatingPolicy) return;
    setBusy(true); setMessage("");
    try {
      const activated = await request<PolicyFile & { activation_summary?: ActivationPreview }>(`/api/policies/${activatingPolicy.id}/activate`, { method: "POST" });
      setActivationSummary(activated.activation_summary || activationPreview);
      setActivationPreview(null);
      setActivatingPolicy(null);
      setMessage("Chính sách đã được kích hoạt. Tóm tắt tác động kích hoạt đã được cập nhật.");
      await reloadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không kích hoạt được chính sách.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePolicy(policy: PolicyFile) {
    if (!confirm(`Xóa policy "${policy.title}"?`)) return;
    setBusy(true); setMessage("");
    try {
      await request(`/api/policies/${policy.id}`, { method: "DELETE" });
      setMessage("Đã xóa policy.");
      if (expandedId === policy.id) setExpandedId(null);
      await reloadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không xóa được policy.");
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* Upload bar + Refresh */}
      <div className="mb-5 flex flex-wrap gap-4 items-start">
        <div className="app-card flex-1 min-w-72 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">Tải lên phiên bản mới</strong>
            <button className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1.5" onClick={refresh} disabled={refreshing} title="Làm mới dữ liệu (không cần F5)">
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""}/>Làm mới
            </button>
          </div>
          {message && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}
          {activationSummary && <ActivationSummaryCard preview={activationSummary}/>}
          <input className="field text-xs" value={policyTitle} onChange={e => setPolicyTitle(e.target.value)} placeholder="Tiêu đề policy..."/>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-blue-200 px-4 py-3 hover:border-blue-400 transition-colors">
            <FileUp className="shrink-0 text-blue-500" size={20}/>
            <span className="min-w-0">
              <strong className="block truncate text-xs">{policyFile?.name || "Chọn file policy"}</strong>
              <span className="muted text-[11px]">JSON, YAML, TXT, PDF, DOCX</span>
            </span>
            <input className="hidden" type="file" accept=".pdf,.docx,.txt,.json,.yaml,.yml" onChange={e => setPolicyFile(e.target.files?.[0] || null)}/>
          </label>
          <button className="btn-primary w-full text-xs" disabled={!policyFile || busy} onClick={uploadPolicy}>
            {busy ? <LoaderCircle className="animate-spin" size={14}/> : <UploadCloud size={14}/>}Upload Policy
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 flex-shrink-0">
          <OverviewItem title="Phiên bản hiện tại" value={activePolicy?.title?.slice(0,28) || "Chưa có"} detail={activePolicy ? `Kích hoạt: ${formatDate((activePolicy as PolicyFile & {activated_at?: string}).activated_at || activePolicy.created_at)}` : "Cần activate policy"} icon={<Shield size={18}/>}/>
          <OverviewItem title="Tổng phiên bản" value={`${policyFiles.length}`} detail={`${policyFiles.filter(p => p.status === "archived").length} đã lưu trữ`} icon={<History size={18}/>}/>
        </div>
      </div>

      {/* Policy version cards */}
      <div className="space-y-3">
        {!policyFiles.length && <p className="muted text-center py-10 text-sm">Chưa có policy nào. Hãy upload phiên bản đầu tiên.</p>}
        {policyFiles.map(policy => (
          <PolicyVersionCard
            key={policy.id}
            policy={policy}
            isExpanded={expandedId === policy.id}
            masterTree={masterTree}
            busy={busy}
            onToggle={() => setExpandedId(prev => prev === policy.id ? null : policy.id)}
            onActivate={() => openActivationPreview(policy)}
            onDelete={() => deletePolicy(policy)}
            onNodeChange={reloadAll}
          />
        ))}
      </div>

      {activationPreview && activatingPolicy && (
        <ActivationPreviewDialog
          policy={activatingPolicy}
          preview={activationPreview}
          busy={busy}
          onClose={() => { if (!busy) { setActivationPreview(null); setActivatingPolicy(null); } }}
          onConfirm={confirmActivatePolicy}
        />
      )}
    </>
  );
}

function PolicyVersionCard({ policy, isExpanded, masterTree, busy, onToggle, onActivate, onDelete, onNodeChange }: {
  policy: PolicyFile; isExpanded: boolean; masterTree: MasterTree; busy: boolean;
  onToggle: () => void; onActivate: () => void; onDelete: () => void; onNodeChange: () => Promise<void>;
}) {
  const isActive = policy.status === "active";
  const showLiveTree = isActive && !!masterTree.tree;

  return (
    <div className={`app-card overflow-hidden transition-all ${isExpanded ? "ring-2 ring-blue-300 shadow-md" : "hover:shadow-sm"}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <span className="text-[var(--muted)]">
          {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm truncate">{policy.title}</strong>
            <span className={`badge ${isActive ? "badge-green" : "badge-amber"}`}>{policyStatusLabel(policy.status)}</span>
          </div>
          <span className="muted text-[11px]">
            {policy.parsed_json.faculty || "—"} · {policy.parsed_json.specializations?.length || 0} nhóm chuyên môn · {formatDate(policy.created_at)} · {policy.created_by}
          </span>
        </div>
        <div className="flex shrink-0 gap-2" onClick={e => e.stopPropagation()}>
          {!isActive && (
            <button className="btn-secondary px-2 py-1 text-[11px] flex items-center gap-1" disabled={busy} onClick={onActivate}>
              <Check size={12}/>Activate
            </button>
          )}
          <button className="btn-secondary px-2 py-1 text-[11px] text-red-600 hover:text-red-700 flex items-center gap-1" disabled={busy || isActive} title={isActive ? "Không thể xóa policy đang active" : "Xóa"} onClick={onDelete}>
            <Trash2 size={12}/>Xóa
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {showLiveTree ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <FolderOpen className="text-blue-600" size={15}/>
                <strong className="text-xs text-blue-700">Cây tri thức đang hoạt động</strong>
                <span className="muted text-[10px]">(live từ Master Tree)</span>
              </div>
              <TreePreview node={masterTree.tree!}/>
              <NodeEditPanel onDone={onNodeChange}/>
            </>
          ) : (
            <PolicyJsonPreview policy={policy}/>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyJsonPreview({ policy }: { policy: PolicyFile }) {
  const specs: Array<{ code?: string; name: string; courses?: { name: string; code?: string }[] }> = policy.parsed_json.specializations || [];
  const stdFolders: string[] = (policy.parsed_json as Record<string, unknown>).standard_folders as string[] || [];
  const [openSpec, setOpenSpec] = useState<string | null>(null);

  if (!specs.length) return <p className="muted text-xs py-4 text-center">Không có dữ liệu cấu trúc trong file policy này.</p>;

  return (
    <div className="space-y-2">
      <p className="muted text-[11px]">Cấu trúc từ file policy (preview, chưa kích hoạt)</p>
      {specs.map(spec => {
        const key = spec.code || spec.name;
        const isOpen = openSpec === key;
        return (
          <div key={key} className="rounded-lg border border-[var(--border)]">
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpenSpec(isOpen ? null : key)}>
              {isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
              {isOpen ? <FolderOpen className="text-amber-500" size={14}/> : <Folder className="text-amber-500" size={14}/>}
              <strong className="text-xs flex-1">{spec.name}</strong>
              {spec.code && <span className="muted text-[10px]">{spec.code}</span>}
              {spec.courses && <span className="muted text-[10px]">{spec.courses.length} học phần</span>}
            </button>
            {isOpen && (
              <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
                {stdFolders.length > 0 && (
                  <div>
                    <p className="muted text-[10px] font-bold mb-1">Thư mục chuẩn</p>
                    <div className="flex flex-wrap gap-1.5">
                      {stdFolders.map(f => <span key={f} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">{f}</span>)}
                    </div>
                  </div>
                )}
                {spec.courses && spec.courses.length > 0 && (
                  <div>
                    <p className="muted text-[10px] font-bold mb-1">Học phần</p>
                    <div className="flex flex-wrap gap-1.5">
                      {spec.courses.map(c => <span key={c.code || c.name} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">{c.name}{c.code ? ` (${c.code})` : ""}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type EditMode = "add" | "rename" | "delete";
function NodeEditPanel({ onDone }: { onDone: () => Promise<void> }) {
  const { request } = useAuth();
  const [mode, setMode] = useState<EditMode | null>(null);
  const [nodeName, setNodeName] = useState("");
  const [parentName, setParentName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [preview, setPreview] = useState<PolicyAssistantPreview | null>(null);

  function resetForm() { setNodeName(""); setParentName(""); setNewName(""); setPreview(null); setResultMsg(""); }
  function switchMode(m: EditMode) { setMode(prev => prev === m ? null : m); resetForm(); }

  async function doPreview() {
    let msg = "";
    if (mode === "add" && nodeName && parentName) msg = `thêm thư mục ${nodeName} vào ${parentName}`;
    else if (mode === "rename" && nodeName && newName) msg = `đổi tên ${nodeName} thành ${newName}`;
    else if (mode === "delete" && nodeName) msg = `xóa thư mục ${nodeName}`;
    if (!msg) return;
    setBusy(true); setResultMsg(""); setPreview(null);
    try {
      const data = await request<PolicyAssistantPreview>("/api/policy-assistant/preview", { method: "POST", body: JSON.stringify({ message: msg }) });
      setPreview(data);
      setResultMsg(data.status === "need_clarification" ? data.message || "Cần làm rõ thêm." : data.preview?.summary || "Xem chi tiết phía trên.");
    } catch (err) {
      setResultMsg(err instanceof Error ? err.message : "Lỗi phân tích.");
    } finally { setBusy(false); }
  }

  async function doConfirm() {
    if (!preview?.action || !preview.preview) return;
    setBusy(true);
    try {
      await request("/api/policy-assistant/confirm", { method: "POST", body: JSON.stringify({ message: "", action: preview.action, preview: preview.preview, apply_now: true }) });
      setResultMsg("✅ Đã áp dụng thay đổi vào cây tri thức.");
      resetForm(); setMode(null);
      await onDone();
    } catch (err) {
      setResultMsg(err instanceof Error ? err.message : "Không áp dụng được.");
    } finally { setBusy(false); }
  }

  const modeLabels: Record<EditMode, string> = { add: "+ Thêm thư mục", rename: "✏ Đổi tên", delete: "🗑 Xóa thư mục" };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-3">
      <strong className="text-xs font-bold text-blue-800">Chỉnh sửa cây tri thức</strong>
      <div className="flex flex-wrap gap-2">
        {(["add", "rename", "delete"] as EditMode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition ${mode === m ? "border-blue-500 bg-blue-100 text-blue-700" : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-blue-300"}`}>
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {mode === "add" && (
        <div className="space-y-2">
          <input className="field text-xs" placeholder="Tên thư mục mới" value={nodeName} onChange={e => setNodeName(e.target.value)}/>
          <input className="field text-xs" placeholder="Thuộc thư mục cha (vd: Khoa học máy tính)" value={parentName} onChange={e => setParentName(e.target.value)}/>
        </div>
      )}
      {mode === "rename" && (
        <div className="space-y-2">
          <input className="field text-xs" placeholder="Tên thư mục hiện tại" value={nodeName} onChange={e => setNodeName(e.target.value)}/>
          <input className="field text-xs" placeholder="Tên mới" value={newName} onChange={e => setNewName(e.target.value)}/>
        </div>
      )}
      {mode === "delete" && (
        <input className="field text-xs" placeholder="Tên thư mục cần xóa" value={nodeName} onChange={e => setNodeName(e.target.value)}/>
      )}

      {mode && (
        <div className="flex gap-2">
          <button className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1" disabled={busy} onClick={doPreview}>
            {busy ? <LoaderCircle size={12} className="animate-spin"/> : <Search size={12}/>}Xem trước
          </button>
          {preview?.status === "preview" && preview.action && !preview.preview?.confirm_blocked_reason && (
            <button className="btn-primary text-xs flex-1 flex items-center justify-center gap-1" disabled={busy} onClick={doConfirm}>
              <Check size={12}/>Xác nhận
            </button>
          )}
        </div>
      )}

      {preview?.preview?.confirm_blocked_reason && (
        <p className="text-[11px] rounded bg-red-50 border border-red-200 p-2 text-red-600">⛔ {preview.preview.confirm_blocked_reason}</p>
      )}
      {resultMsg && (
        <p className={`text-[11px] rounded p-2 ${resultMsg.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>{resultMsg}</p>
      )}
    </div>
  );
}

function ActivationSummaryCard({ preview }: { preview: ActivationPreview }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="mb-2 text-xs font-bold text-blue-900">Activation Audit Summary</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ImpactMetric label="Added Specializations" value={preview.tree_impact.summary.added} />
        <ImpactMetric label="Removed Specializations" value={preview.tree_impact.summary.removed} />
        <ImpactMetric label="Valid Assignments" value={preview.assignment_impact.valid_assignments} />
        <ImpactMetric label="Needs Resolution" value={preview.assignment_impact.needs_resolution_assignments} />
      </div>
    </div>
  );
}

function ActivationPreviewDialog({ policy, preview, busy, onClose, onConfirm }: { policy: PolicyFile; preview: ActivationPreview; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const conflicts = preview.assignment_impact.requires_admin_resolution || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="border-b border-[var(--border)] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Policy Activation Preview</p>
          <h3 className="mt-1 text-lg font-bold">{policy.title}</h3>
          <p className="muted text-xs">Review impact before activating this policy.</p>
        </div>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ImpactMetric label="Added Specializations" value={preview.tree_impact.summary.added} />
            <ImpactMetric label="Removed Specializations" value={preview.tree_impact.summary.removed} />
            <ImpactMetric label="Matched Specializations" value={preview.tree_impact.summary.matched} />
            <ImpactMetric label="Virtual Trees" value={preview.virtual_tree_impact.virtual_trees_to_rebuild} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs font-bold">Assignment Impact</p>
              <p className="muted mt-1 text-xs">Valid: {preview.assignment_impact.valid_assignments}</p>
              <p className="muted text-xs">Needs resolution: {preview.assignment_impact.needs_resolution_assignments}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs font-bold">Folder Permission Impact</p>
              <p className="muted mt-1 text-xs">Active permissions to deprecate: {preview.folder_permission_impact.active_permissions_to_deprecate}</p>
              <p className="muted text-xs">Will rebuild permissions: {preview.folder_permission_impact.will_rebuild_permissions ? "Yes" : "No"}</p>
            </div>
          </div>
          {!!preview.tree_impact.added_specializations.length && (
            <ImpactList title="Added" items={preview.tree_impact.added_specializations} />
          )}
          {!!preview.tree_impact.removed_specializations.length && (
            <ImpactList title="Removed" items={preview.tree_impact.removed_specializations} />
          )}
          {!!conflicts.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">Assignments Need Resolution</p>
              <div className="mt-2 space-y-2">
                {conflicts.slice(0, 5).map(item => (
                  <div key={`${item.assignment_id}-${item.lecturer_code}`} className="rounded-md bg-white p-2 text-xs">
                    <strong>{item.lecturer_code}</strong> - {item.old_specialization || item.old_code || "Unknown"}: {item.reason}
                  </div>
                ))}
                {conflicts.length > 5 && <p className="muted text-xs">+{conflicts.length - 5} more</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-4">
          <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="animate-spin" size={15}/> : <Check size={15}/>}Confirm Activate</button>
        </div>
      </div>
    </div>
  );
}

function ImpactMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"><p className="muted text-[11px]">{label}</p><strong className="mt-1 block text-lg">{value}</strong></div>;
}

function ImpactList({ title, items }: { title: string; items: ActivationSpecialization[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <p className="text-xs font-bold">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map(item => <span key={`${item.code || item.key}-${item.name}`} className="badge badge-amber">{item.code ? `${item.code} - ` : ""}{item.name || item.name_en}</span>)}
      </div>
    </div>
  );
}

function KnowledgeTreeTab({ masterTree }: { masterTree: MasterTree }) {
  return (
    <Panel title="Knowledge Tree" description="Master Tree hiện tại, chỉ đọc, dùng dữ liệu backend tree hiện có.">
      <div className="p-4">
        {masterTree.tree ? <TreePreview node={masterTree.tree} /> : <p className="muted text-xs">{masterTree.message || "Chưa có Master Tree active."}</p>}
      </div>
    </Panel>
  );
}

function LecturerAssignmentTab({ assignments, users, canSeeUsers, reloadAll }: { assignments: Assignment[]; users: User[]; canSeeUsers: boolean; reloadAll: () => Promise<void> }) {
  const { request } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeAssignments = assignments.filter(item => item.status === "active");
  const lecturerUsers = users.filter(item => item.role === "lecturer" || item.role === "new_lecturer");
  const assignedCodes = new Set(activeAssignments.map(item => item.lecturer_code));
  const unassignedCount = canSeeUsers ? lecturerUsers.filter(item => !assignedCodes.has(item.code)).length : null;

  async function previewImport() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request<AssignmentPreview>("/api/lecturer-assignments/import/preview", {
        method: "POST",
        headers: { "X-Filename": file.name, "Content-Type": file.type || "text/csv" },
        body: await file.arrayBuffer(),
      });
      setPreview(result);
      setMessage(result.status === "validated" ? "File hợp lệ, có thể confirm để provision." : "File còn lỗi, vui lòng kiểm tra preview.");
      await reloadAll();
    } catch (err) {
      setPreview(null);
      setMessage(err instanceof Error ? err.message : "Không preview được assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      await request("/api/lecturer-assignments/import/confirm", {
        method: "POST",
        body: JSON.stringify({ batch_preview_id: preview.batch_preview_id, apply_mode: "replace_for_listed_lecturers" }),
      });
      setMessage("Đã confirm và provision assignment.");
      setPreview(null);
      setFile(null);
      await reloadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không confirm được assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <OverviewItem title="Assigned Lecturers" value={`${assignedCodes.size}`} detail="Giảng viên đã có assignment active" icon={<UserCheck size={18}/>} />
        <OverviewItem title="Unassigned Lecturers" value={unassignedCount === null ? "N/A" : `${unassignedCount}`} detail={canSeeUsers ? "Tính từ danh sách users" : "Head chưa có API danh sách users"} icon={<Users size={18}/>} />
        <OverviewItem title="Active Assignment Count" value={`${activeAssignments.length}`} detail="Số bản ghi assignment active" icon={<History size={18}/>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <Panel title="Import CSV Assignment" description="Import danh sách phân công, preview trước, confirm sau để provision Virtual Tree và Folder Permission.">
          <div className="space-y-4 p-4">
            {message && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{message}</p>}
            <label className="block rounded-xl border-2 border-dashed border-blue-300 p-6 text-center">
              <FileUp className="mx-auto text-blue-600" size={24}/>
              <strong className="mt-3 block text-sm">{file?.name || "Chọn file CSV"}</strong>
              <span className="muted mt-1 block text-xs">CSV: lecturer_code, lecturer_name, specialization</span>
              <input className="hidden" type="file" accept=".csv,.json" onChange={event => setFile(event.target.files?.[0] || null)} />
            </label>
            <button className="btn-primary w-full" disabled={!file || busy} onClick={previewImport}>{busy ? <LoaderCircle className="animate-spin" size={15}/> : <Search size={15}/>}Preview</button>
            <button className="btn-secondary w-full" disabled={!preview || preview.summary.error_rows > 0 || busy} onClick={confirmImport}><Check size={15}/>Confirm & Provision</button>
          </div>
        </Panel>
        <AssignmentPreviewPanel preview={preview} />
      </div>

      <Panel title="Assigned Lecturers" description="Danh sách assignment đã được ghi nhận từ API hiện có.">
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Lecturer</th><th>Specialization</th><th>Source</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {assignments.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.lecturer_code}</strong><span className="muted block text-[10px]">{item.lecturer_name || item.lecturer_name_snapshot || ""}</span></td>
                  <td>{item.specialization_code_snapshot ? `${item.specialization_code_snapshot} - ` : ""}{item.specialization_name || item.specialization_name_snapshot}</td>
                  <td>{sourceLabel(item.source)}</td>
                  <td><span className={`badge ${item.status === "active" ? "badge-green" : "badge-amber"}`}>{assignmentStatusLabel(item.status)}</span></td>
                  <td>{formatDate(item.updated_at || item.created_at)}</td>
                </tr>
              ))}
              {!assignments.length && <tr><td colSpan={5} className="muted text-center">Chưa có assignment.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AssignmentPreviewPanel({ preview }: { preview: AssignmentPreview | null }) {
  return (
    <Panel title="Preview" description="Kiểm tra lỗi trước khi confirm. Preview chưa provision quyền.">
      <div className="p-4">
        {!preview ? <PlaceholderBox title="Chưa có preview" text="Chọn file CSV rồi bấm Preview." /> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <SummaryBox label="Total" value={preview.summary.total_rows} />
              <SummaryBox label="Valid" value={preview.summary.valid_rows} />
              <SummaryBox label="Errors" value={preview.summary.error_rows} />
              <SummaryBox label="Warnings" value={preview.summary.warning_rows} />
            </div>
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Row</th><th>Lecturer</th><th>Specialization</th><th>Status</th><th>Message</th></tr></thead>
                <tbody>
                  {preview.assignments.map(item => (
                    <tr key={item.row}>
                      <td>{item.row}</td>
                      <td><strong>{item.lecturer_code}</strong><span className="muted block text-[10px]">{item.lecturer_name}</span></td>
                      <td>{item.specialization_code ? `${item.specialization_code} - ` : ""}{item.specialization_name || item.specialization_input}</td>
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
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--border)] p-3"><span className="muted block text-[10px] font-bold uppercase">{label}</span><strong className="text-lg">{value}</strong></div>;
}

function AuditLogTab({ audits, requests, assignments, reloadAll }: { audits: PolicyAudit[]; requests: PolicyRequest[]; assignments: Assignment[]; reloadAll: () => Promise<void> }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Panel title="Nhật ký Chính sách" description="Nhật ký chính sách hiện có.">
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Người thực hiện</th><th>Thao tác</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
            <tbody>
              {audits.map(item => <tr key={item.id}><td>{item.actor}</td><td>{actionLabel(item.action)}</td><td>{item.status}</td><td>{formatDate(item.created_at)}</td></tr>)}
              {!audits.length && <tr><td colSpan={4} className="muted text-center">Chưa có nhật ký chính sách.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Nhật ký Phân công" description="Ghi nhận lịch sử phân công và các yêu cầu xử lý công việc.">
        <div className="max-h-[560px] space-y-3 overflow-auto p-4">
          <button className="btn-secondary w-full" onClick={reloadAll}><RefreshCw size={14}/>Làm mới</button>
          {assignments.slice(0, 20).map(item => (
            <div key={item.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center gap-2"><UserCheck size={15} className="text-blue-600"/><strong className="text-xs">{item.lecturer_code}</strong><span className="badge badge-amber ml-auto">{assignmentStatusLabel(item.status)}</span></div>
              <p className="muted mt-2 text-[11px]">{sourceLabel(item.source)} - {formatDate(item.updated_at || item.created_at)}</p>
              <p className="mt-2 text-xs">{item.specialization_code_snapshot ? `${item.specialization_code_snapshot} - ` : ""}{item.specialization_name || item.specialization_name_snapshot}</p>
            </div>
          ))}
          {requests.slice(0, 10).map(item => (
            <div key={item.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center gap-2"><History size={15} className="text-blue-600"/><strong className="text-xs">Yêu cầu từ chính sách</strong><span className="badge badge-amber ml-auto">{item.status}</span></div>
              <p className="muted mt-2 text-[11px]">{item.actor} - {formatDate(item.created_at)}</p>
              <p className="mt-2 text-xs">{item.message}</p>
            </div>
          ))}
          {!assignments.length && !requests.length && <p className="muted text-xs">Chưa có hoạt động hay thay đổi nào được ghi nhận.</p>}
        </div>
      </Panel>
    </div>
  );
}

function TreePreview({ node }: { node: FolderNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([node.path]));
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("vi");

  function matches(item: FolderNode): boolean {
    return !normalized || item.name.toLocaleLowerCase("vi").includes(normalized) || item.children.some(matches);
  }

  function collectAll(item: FolderNode, acc = new Set<string>()) {
    acc.add(item.path);
    item.children.forEach(child => collectAll(child, acc));
    return acc;
  }

  function render(item: FolderNode, depth = 0): ReactNode {
    if (!matches(item)) return null;
    const open = expanded.has(item.path) || !!normalized;
    return (
      <div key={item.id}>
        <button type="button" className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-xs hover:bg-[var(--soft)]" style={{ paddingLeft: `${6 + depth * 16}px` }} onClick={() => setExpanded(cur => {
          const next = new Set(cur);
          if (next.has(item.path)) next.delete(item.path); else next.add(item.path);
          return next;
        })}>
          {item.children.length ? (open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span className="w-[14px]"/>}
          {open ? <FolderOpen className="text-amber-500" size={15}/> : <Folder className="text-amber-500" size={15}/>}
          <span className="truncate font-semibold">{item.name}</span>
        </button>
        {open && item.children.map(child => render(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-72 flex-1"><Search className="muted absolute left-3 top-2.5" size={14}/><input className="field" style={{ paddingLeft: "2.25rem" }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ví dụ: Chuyển GV001 sang IoT" /></div>
        <button className="btn-secondary" onClick={() => setExpanded(collectAll(node))}>Mở rộng</button>
        <button className="btn-secondary" onClick={() => setExpanded(new Set([node.path]))}>Thu gọn</button>
      </div>
      <div role="tree" className="max-h-[62vh] overflow-auto rounded-lg border border-[var(--border)] p-2">{render(node)}</div>
    </div>
  );
}

function tabIcon(tab: GovernanceTab) {
  if (tab === "import") return <Shield size={15}/>;
  if (tab === "tree") return <FolderOpen size={15}/>;
  if (tab === "assignment") return <UserCheck size={15}/>;
  return <History size={15}/>;
}

function tabLabel(tab: GovernanceTab) {
  return ({
    import: "Phiên bản Chính sách",
    tree: "Cây tri thức",
    assignment: "Phân công Giảng viên",
    audit: "Nhật ký Audit",
  } as Record<GovernanceTab, string>)[tab];
}

function policyStatusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return status;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    add_node: "Thêm node",
    add_node_and_grant: "Thêm node & trao quyền",
    move_node: "Chuyển node",
    rename_node: "Đổi tên node",
    delete_node: "Xóa node",
    update_permission: "Cập nhật quyền",
    "permission.grant": "Trao quyền",
    "permission.revoke": "Thu hồi quyền",
    "permission.set_visibility": "Thay đổi visibility",
    "assignment.move": "Chuyển chuyên môn giảng viên",
    "assignment.assign": "Gán thêm chuyên môn",
    "assignment.remove": "Bỏ chuyên môn",
    "permission.time_based_release": "Mở quyền theo thời gian",
    "advisor.risk_analysis": "Phan tich rui ro",
    "advisor.recommendations": "Khuyen nghi governance",
    "advisor.course_gap": "Hoc phan thieu tri thuc",
    "advisor.specialization_risk": "Rui ro chuyen nganh",
  };
  return labels[action] || action;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    csv_import: "CSV Import",
    json_import: "JSON Import",
    governance_assignment_agent: "Knowledge Governance Agent",
    legacy_self_selected: "Legacy",
    admin_manual: "Admin",
  };
  return labels[source] || source;
}

function assignmentStatusLabel(status: string) {
  if (status === "active") return "Hoạt động";
  if (status === "validated") return "Hợp lệ";
  if (status === "inactive") return "Vô hiệu hóa";
  if (status === "revoked") return "Thu hồi";
  return status;
}
