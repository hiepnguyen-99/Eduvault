"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, Download, HardDriveDownload, Save } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useBackendData } from "@/lib/hooks";
import { API_URL, DesktopAgentStatus, DesktopSyncFolder, DesktopSyncFoldersResponse } from "@/lib/api";
import { PageHeader, Panel } from "@/components/ui";
import { statusLabel } from "@/src/constants/ui-text";

type Storage = { id: string; name: string; provider: string; location: string; last_status: string };
const emptyDesktopSync: DesktopSyncFoldersResponse = { folders: [] };
const emptyAgentStatus: DesktopAgentStatus = {
  installed: false,
  online: false,
  version: "1.0.0",
  watch_folders: ["D:\\Teaching"],
  last_sync: "",
  last_seen_at: "",
  connection_status: "Offline",
  status: "offline",
  status_text: "Desktop Agent is not installed.",
  device_id: "",
  last_error: "",
};

function formatStatusTime(value?: string) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function Settings() {
  const { request } = useAuth();
  const { data: storages } = useBackendData<Storage[]>("/api/admin/storages", []);
  const { data: desktopSync, reload: reloadDesktopSync } = useBackendData<DesktopSyncFoldersResponse>("/api/desktop-sync/folders", emptyDesktopSync);
  const { data: agentStatus, reload: reloadAgentStatus } = useBackendData<DesktopAgentStatus>("/api/desktop-agent/status", emptyAgentStatus);

  const [message, setMessage] = useState("");
  const [watchFolder, setWatchFolder] = useState("D:\\Teaching");
  const [savingFolder, setSavingFolder] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    const enabledFolder = (desktopSync.folders || []).find(item => item.enabled)?.folder_path;
    setWatchFolder(enabledFolder || "D:\\Teaching");
  }, [desktopSync.folders]);

  const installerHref = useMemo(() => `${API_URL}/api/desktop-agent/installer`, []);
  const effectiveWatchFolder = agentStatus.watch_folders[0] || watchFolder || "D:\\Teaching";
  const hasSavedConfig = savedOnce || (desktopSync.folders?.length || 0) > 0;

  async function saveWatchFolder() {
    const normalized = watchFolder.trim() || "D:\\Teaching";
    setSavingFolder(true);
    setMessage("");
    try {
      const payloadFolder: DesktopSyncFolder = {
        folder_path: normalized,
        folder_label: normalized.split(/[\\/]/).filter(Boolean).pop() || "Teaching",
        enabled: true,
      };
      await request<DesktopSyncFoldersResponse>("/api/desktop-sync/folders", {
        method: "PUT",
        body: JSON.stringify({ folders: [payloadFolder] }),
      });
      setWatchFolder(normalized);
      setSavedOnce(true);
      setMessage("Đã lưu thư mục theo dõi. Nếu máy chưa có Desktop Agent, hãy tải và đăng nhập một lần.");
      await Promise.all([reloadDesktopSync(), reloadAgentStatus()]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không lưu được thư mục theo dõi.");
    } finally {
      setSavingFolder(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Cài đặt hệ thống"
        title="Cấu hình hệ thống"
        description="Chọn thư mục mà Desktop Agent sẽ tự theo dõi trên máy của giảng viên."
        actions={<button className="btn-primary"><Save size={15}/>Đã kết nối</button>}
      />

      {message && (
        <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-800">
          {message}
        </p>
      )}

      <Panel title="Kho lưu trữ ngoài" description="Phần này chỉ dùng để cập nhật trạng thái và đường dẫn kết nối tới các kho lưu trữ ngoài.">
        <div className="space-y-3 p-4">
          {storages.map(storage => (
            <div key={storage.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center gap-2">
                <Cloud size={15} className="text-blue-600"/>
                <strong className="text-xs">{storage.name}</strong>
                <span className="badge badge-green ml-auto">{statusLabel(storage.last_status)}</span>
              </div>
              <p className="muted mt-2 text-[10px]">{storage.provider} - {storage.location}</p>
            </div>
          ))}
          {!storages.length && <p className="muted text-xs">Chưa có kết nối lưu trữ ngoài nào được cấu hình.</p>}
        </div>
      </Panel>

      <Panel title="Desktop Agent" description="Giảng viên chỉ cần cài Desktop Agent một lần, đăng nhập một lần, sau đó bỏ tài liệu vào thư mục đã chọn." className="mt-5">
        <div className="space-y-5 p-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <div className="flex items-center gap-2 font-semibold">
              <HardDriveDownload size={16}/>
              Chọn thư mục theo dõi
            </div>
            <p className="mt-2 text-xs leading-5">
              Mặc định hệ thống dùng <strong>D:\Teaching</strong>. Sau khi lưu, nếu máy chưa cài Desktop Agent, giảng viên chỉ cần tải ứng dụng và đăng nhập một lần.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="field"
              value={watchFolder}
              onChange={event => setWatchFolder(event.target.value)}
              placeholder="Ví dụ: D:\\Teaching"
            />
            <button className="btn-primary" type="button" disabled={savingFolder} onClick={saveWatchFolder}>
              <Save size={15}/>{savingFolder ? "Đang lưu..." : "Lưu"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="muted text-[11px] uppercase tracking-[0.24em]">Desktop Agent</p>
              <p className={`mt-2 text-base font-semibold ${agentStatus.online ? "text-emerald-600" : "text-slate-900"}`}>
                {agentStatus.online ? "Online" : "Offline"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="muted text-[11px] uppercase tracking-[0.24em]">Version</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{agentStatus.version || "Chưa có"}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="muted text-[11px] uppercase tracking-[0.24em]">Watch Folder</p>
              <p className="mt-2 break-all text-sm font-semibold text-slate-900">{effectiveWatchFolder}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="muted text-[11px] uppercase tracking-[0.24em]">Last Sync</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatStatusTime(agentStatus.last_sync)}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="muted text-[11px] uppercase tracking-[0.24em]">Connection Status</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{agentStatus.connection_status || "Offline"}</p>
            </div>
          </div>

          {agentStatus.last_error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              {agentStatus.last_error}
            </div>
          )}

          {hasSavedConfig && !agentStatus.installed && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Desktop Agent is not installed.</p>
              <p className="muted mt-2 text-xs">
                Hãy tải ứng dụng về máy, mở file cài đặt, rồi đăng nhập một lần để hệ thống tự theo dõi thư mục này.
              </p>
            </div>
          )}

          {hasSavedConfig && !agentStatus.installed && (
            <div className="flex flex-wrap items-center gap-3">
              <a className="btn-primary" href={installerHref}>
                <Download size={15}/>Download Desktop Agent
              </a>
              <p className="muted text-[11px]">
                Sau khi cài xong, ứng dụng sẽ tự chạy lại cùng Windows và tiếp tục theo dõi thư mục đã lưu.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
