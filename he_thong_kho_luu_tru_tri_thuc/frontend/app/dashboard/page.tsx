"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, BookOpen, Boxes, CheckCircle2, Clock3, Database, FileText, FolderSync, GraduationCap, ServerCog, Upload, Users, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { DashboardData, formatDate, V2Status } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { Bars, Metric, PageHeader, Panel } from "@/components/ui";
import { UploadTask } from "@/components/upload-task-provider";

const empty: DashboardData = { user: { code:"",name:"",role:"lecturer",department:"",permissions:[] }, stats:{documents:0,private:0,topics:0}, documents:[], requests:[], backups:[], audit:[] };
const emptyV2: V2Status = { architecture:"v2-hybrid",database:"",ready:false,scope:"single-faculty",capacity_target_gb:100,rpo_target_minutes:60,rto_target_hours:4,services:{},objects:[],outbox:[] };
const emptyTasks: UploadTask[] = [];

export default function Dashboard() {
  const { data, loading, error } = useBackendData("/api/dashboard", empty);
  const { data:v2 } = useBackendData("/api/v2/status", emptyV2);
  const { data: uploadTasks } = useBackendData("/api/uploads", emptyTasks);
  const [showDetails, setShowDetails] = useState(false);
  const desktopTasks = uploadTasks.filter(task => task.metadata.source_type === "desktop_agent");
  const desktopPending = desktopTasks.filter(task => task.status === "pending_confirmation").length;
  const desktopCompleted = desktopTasks.filter(task => task.status === "completed").length;
  const desktopActive = desktopTasks.filter(task => !["completed", "failed"].includes(task.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Tổng quan" 
        actions={<Link href="/repository" className="btn-primary"><Upload size={15}/>Tải tài liệu</Link>}
      />
      
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      
      {/* 3 Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Tài liệu khả dụng" value={loading ? "..." : String(data.stats.documents)} detail={`${data.stats.private} tài liệu riêng tư`} icon={<FileText size={18}/>}/>
        <Metric label="Chủ đề hoạt động" value={loading ? "..." : String(data.stats.topics)} detail="Đang được cập nhật liên tục" icon={<BookOpen size={18}/>}/>
        <Metric label="Yêu cầu cần xử lý" value={loading ? "..." : String(data.requests.filter(x=>x.status==="pending").length)} detail="Yêu cầu quyền truy cập thư mục" icon={<Users size={18}/>}/>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Left: Recent Documents Table */}
        <Panel 
          title="Tài liệu cập nhật gần đây" 
          description="Danh sách tài liệu mới được tải lên hệ thống."
          action={<Link href="/repository" className="btn-secondary text-xs">Xem toàn bộ kho</Link>}
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tài liệu</th>
                  <th>Chủ sở hữu</th>
                  <th>Phiên bản</th>
                  <th>Quyền</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.slice(0, 5).map(d => (
                  <tr key={d.id}>
                    <td>
                      <strong className="text-slate-900 dark:text-slate-100 font-bold block">{d.title}</strong>
                      <span className="muted block text-xs mt-0.5">{d.topic} · {d.doc_type}</span>
                    </td>
                    <td className="text-slate-600 dark:text-slate-300 text-sm">{d.owner_code}</td>
                    <td className="text-slate-600 dark:text-slate-300 text-sm">v{d.current_version}</td>
                    <td>
                      <span className={`badge ${d.visibility === "public" ? "badge-green" : "badge-amber"}`}>
                        {d.visibility}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data.documents.length && (
                  <tr>
                    <td colSpan={4} className="muted text-center py-6 text-xs">Chưa có tài liệu nào được cập nhật.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Right: Quick shortcuts */}
        <div className="space-y-6">
          <Panel title="Luồng tự động từ Desktop Agent" description="Theo dõi nhanh file đang được đồng bộ từ máy cá nhân lên hệ thống.">
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-900/30 p-3">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <FolderSync size={15} />
                    <span className="text-[11px] font-semibold">Đang chạy</span>
                  </div>
                  <strong className="mt-2 block text-2xl font-black text-[#102451] dark:text-blue-50">{desktopActive}</strong>
                </div>
                <div className="rounded-2xl border border-amber-100 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-900/20 p-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Clock3 size={15} />
                    <span className="text-[11px] font-semibold">Chờ xác nhận</span>
                  </div>
                  <strong className="mt-2 block text-2xl font-black text-[#102451] dark:text-amber-50">{desktopPending}</strong>
                </div>
                <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-900/20 p-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={15} />
                    <span className="text-[11px] font-semibold">Hoàn tất</span>
                  </div>
                  <strong className="mt-2 block text-2xl font-black text-[#102451] dark:text-emerald-50">{desktopCompleted}</strong>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--soft)] p-4 text-xs text-slate-600 dark:text-slate-400">
                Desktop Agent giúp kéo file từ thư mục làm việc trên máy tính lên kho tri thức, tự gắn metadata AI và đưa về bước xác nhận cuối cùng trên web.
              </div>
              <Link href="/auto-ingestion" className="btn-secondary w-full justify-center text-xs">
                <FolderSync size={14} />
                Mở trung tâm nhập liệu tự động
              </Link>
            </div>
          </Panel>
          <Panel title="Liên kết nhanh" description="Truy cập nhanh các chức năng chính.">
            <div className="p-4 space-y-3">
              <Link href="/assistant" className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--soft)] border border-transparent hover:border-[var(--border)] transition-all duration-200">
                <div className="h-9 w-9 rounded-lg bg-red-50 text-[#C92027] flex items-center justify-center shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="text-left">
                  <strong className="text-xs text-slate-900 dark:text-slate-100 block">Hỏi đáp với Trợ lý AI</strong>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Tra cứu tri thức học thuật tức thì</span>
                </div>
              </Link>

              <Link href="/knowledge-transfer" className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--soft)] border border-transparent hover:border-[var(--border)] transition-all duration-200">
                <div className="h-9 w-9 rounded-lg bg-red-50 text-[#C92027] flex items-center justify-center shrink-0">
                  <GraduationCap size={16} />
                </div>
                <div className="text-left">
                  <strong className="text-xs text-slate-900 dark:text-slate-100 block">Chuyển giao tri thức</strong>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Quy trình bàn giao học phần giảng dạy</span>
                </div>
              </Link>
            </div>
          </Panel>

          <Panel title="Thông tin phiên làm việc" description="Thông tin tài khoản hiện tại.">
            <div className="p-4 space-y-2 text-xs">
              {[
                ["Giảng viên", data.user.name],
                ["Đơn vị", data.user.department],
                ["Mã tài khoản", data.user.code]
              ].map(x => (
                <div key={x[0]} className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="muted">{x[0]}</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-bold">{x[1]}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Collapse detailed system statistics and logs */}
      <div className="pt-2">
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="btn-secondary w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#C92027]"
        >
          {showDetails ? (
            <>Thu gọn chi tiết hệ thống <ChevronUp size={14}/></>
          ) : (
            <>Xem chi tiết vận hành & trạng thái hạ tầng <ChevronDown size={14}/></>
          )}
        </button>

        {showDetails && (
          <div className="mt-6 space-y-6 animate-fade-in">
            <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
              <Panel title="Hoạt động lưu trữ tri thức" description="Số lượng thao tác cập nhật theo thời gian.">
                <div className="p-5"><Bars values={[35,52,41,68,58,75,62,84,72,65,91,78,88,96]} color="bg-[#102451]"/></div>
              </Panel>
              <Panel title="Nhật ký hoạt động gần đây" description="Lịch sử thao tác trên hệ thống.">
                <div className="p-2">
                  {data.audit.slice(0, 5).map(a => (
                    <div className="rounded-lg p-2.5 hover:bg-[var(--bg)]" key={a.id}>
                      <strong className="block text-[12px] text-gray-800">{a.action}</strong>
                      <span className="muted text-[11px]">{a.actor_code} · {formatDate(a.created_at)}</span>
                    </div>
                  ))}
                  {!data.audit.length && <p className="muted p-4 text-center text-xs">Chỉ hiển thị cho quản trị viên.</p>}
                </div>
              </Panel>
            </div>

            <Panel title="Trạng thái hạ tầng hệ thống V2" description="Báo cáo tình trạng hoạt động của cơ sở dữ liệu và các cổng lưu trữ phụ trợ.">
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <V2Service label="Database" provider={v2.database || "đang kết nối..."} available={true}/>
                {Object.entries(v2.services).map(([key, item]) => (
                  <V2Service key={key} label={key.replaceAll("_", " ")} provider={item.provider} available={item.available}/>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function V2Service({label, provider, available}:{label:string;provider:string;available:boolean}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4 bg-white">
      <ServerCog size={18} className={available ? "text-emerald-600" : "text-amber-600"}/>
      <strong className="mt-3 block text-xs capitalize text-gray-800">{label}</strong>
      <span className="muted mt-1 block text-[11px]">{provider}</span>
      <span className={`badge mt-3 ${available ? "badge-green" : "badge-amber"}`}>
        {available ? "Sẵn sàng" : "Không khả dụng"}
      </span>
    </div>
  );
}
