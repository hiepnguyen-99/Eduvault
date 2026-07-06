"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  FolderCheck,
  FolderSync,
  GripVertical,
  Image as ImageIcon,
  LoaderCircle,
  Save,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { labelForUploadSource, UploadTask, useUploadTasks } from "@/components/upload-task-provider";
import { PageHeader, Panel } from "@/components/ui";
import { API_URL, FolderNode, MyFolderTree } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";

const emptyMyTree: MyFolderTree = { policy: null, name: "Kho của tôi", children: [] };
const DOCUMENT_TYPES = [
  "Đề cương môn học",
  "Kế hoạch giảng dạy",
  "Bài giảng",
  "Slide",
  "Giáo trình",
  "Sách tham khảo",
  "Tài liệu tham khảo",
  "Lab",
  "Bài tập",
  "Đồ án",
  "Đề thi",
  "Đáp án",
  "Ngân hàng câu hỏi",
  "Nghiên cứu khoa học",
  "Tài liệu khác",
] as const;

type DestinationForm = {
  course_id: string;
  folder_node_id: string;
  folder_path: string;
  document_type: string;
  visibility: "public" | "private";
};

type FolderOption = FolderNode & { depth: number };

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "pdf"; url: string; name: string }
  | { kind: "image"; url: string; name: string }
  | { kind: "text"; name: string; text: string }
  | { kind: "unsupported"; url: string; name: string; mime: string };

function statusTone(status: UploadTask["status"]) {
  if (status === "completed") return "badge-green";
  if (status === "failed") return "badge-red";
  if (status === "pending_confirmation") return "badge-amber";
  return "badge-blue";
}

function statusLabel(status: UploadTask["status"]) {
  switch (status) {
    case "uploading":
      return "Đang tải lên";
    case "uploaded":
      return "Đã tải file gốc";
    case "analyzing":
      return "Đang chuẩn bị";
    case "saving_metadata":
      return "Đang lưu thông tin";
    case "pending_confirmation":
      return "Chờ xác nhận";
    case "processing":
      return "Đang đưa vào kho";
    case "completed":
      return "Hoàn tất";
    case "failed":
      return "Thất bại";
  }
}

function flattenFolderNodes(nodes: FolderNode[], depth = 0): FolderOption[] {
  return nodes.flatMap(node => [{ ...node, depth }, ...flattenFolderNodes(node.children, depth + 1)]);
}

function buildInitialForm(task: UploadTask): DestinationForm {
  return {
    course_id: "",
    folder_node_id: task.metadata.folder_node_id || "",
    folder_path: task.metadata.folder_path || "",
    document_type: task.metadata.doc_type || "Tài liệu khác",
    visibility: task.metadata.visibility || "private",
  };
}

function isPdfTask(task: UploadTask) {
  const mime = (task.mime_type || "").toLowerCase();
  const name = (task.filename || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

function isImageTask(task: UploadTask) {
  return (task.mime_type || "").toLowerCase().startsWith("image/");
}

function isTextTask(task: UploadTask) {
  const mime = (task.mime_type || "").toLowerCase();
  const name = (task.filename || "").toLowerCase();
  return mime.startsWith("text/")
    || name.endsWith(".txt")
    || name.endsWith(".md")
    || name.endsWith(".csv")
    || name.endsWith(".json");
}

export default function AutoIngestionPage() {
  const { request, token } = useAuth();
  const { tasks, removeTask } = useUploadTasks();
  const { data: myFolderTree } = useBackendData<MyFolderTree>("/api/my-folder-tree", emptyMyTree);

  const desktopTasks = tasks.filter(task => task.metadata.source_type === "desktop_agent");
  const pendingTasks = desktopTasks.filter(task => task.status === "pending_confirmation");
  const folderOptions = useMemo(
    () => flattenFolderNodes(myFolderTree.children).filter(node =>
      ["course", "standard_folder", "folder", "document_type_folder"].includes(node.type),
    ),
    [myFolderTree.children],
  );

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [form, setForm] = useState<DestinationForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [downloadingPreview, setDownloadingPreview] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(38);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });

  const splitRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!pendingTasks.length) {
      setSelectedTaskId("");
      setForm(null);
      return;
    }
    if (!pendingTasks.some(task => task.id === selectedTaskId)) {
      setSelectedTaskId(pendingTasks[0].id);
    }
  }, [pendingTasks, selectedTaskId]);

  const selectedTask = pendingTasks.find(task => task.id === selectedTaskId) || null;
  const selectedTaskPreviewKey = selectedTask ? `${selectedTask.id}:${selectedTask.filename}:${selectedTask.mime_type}` : "";

  useEffect(() => {
    if (!selectedTask) {
      setForm(null);
      return;
    }
    setForm(buildInitialForm(selectedTask));
    setMessage("");
    setError("");
  }, [selectedTaskId]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!draggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setLeftPanelWidth(Math.max(26, Math.min(58, next)));
    }

    function stopDragging() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    async function loadPreview() {
      if (!selectedTask?.id) {
        setPreview({ kind: "idle" });
        return;
      }

      setPreview({ kind: "loading" });
      try {
        const response = await fetch(`${API_URL}/api/uploads/${selectedTask.id}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Không tải được file xem nhanh (HTTP ${response.status})`);

        const blob = await response.blob();
        if (cancelled) return;

        if (isTextTask(selectedTask)) {
          const text = await blob.text();
          if (!cancelled) {
            setPreview({ kind: "text", name: selectedTask.filename, text });
          }
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        if (isPdfTask(selectedTask)) {
          if (!cancelled) setPreview({ kind: "pdf", url: objectUrl, name: selectedTask.filename });
          return;
        }
        if (isImageTask(selectedTask)) {
          if (!cancelled) setPreview({ kind: "image", url: objectUrl, name: selectedTask.filename });
          return;
        }
        if (!cancelled) {
          setPreview({
            kind: "unsupported",
            url: objectUrl,
            name: selectedTask.filename,
            mime: selectedTask.mime_type || "application/octet-stream",
          });
        }
      } catch (previewError) {
        if (!cancelled) {
          setPreview({
            kind: "error",
            message: previewError instanceof Error ? previewError.message : "Không thể xem nhanh tài liệu này.",
          });
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedTaskPreviewKey, token]);

  const selectedNode = form?.folder_node_id
    ? folderOptions.find(option => option.id === form.folder_node_id)
    : undefined;

  function handleSelectNode(optionId: string) {
    const option = folderOptions.find(item => item.id === optionId);
    if (!option) {
      setForm(current => (current ? { ...current, course_id: "", folder_node_id: "" } : current));
      return;
    }
    if (option.type === "course") {
      setForm(current => (current ? {
        ...current,
        course_id: option.id,
        folder_node_id: "",
        folder_path: "",
      } : current));
      return;
    }
    setForm(current => (current ? {
      ...current,
      course_id: option.parent_id || "",
      folder_node_id: option.id,
      folder_path: "",
      document_type: option.type === "standard_folder" ? option.name : current.document_type,
    } : current));
  }

  async function submitConfirmation() {
    if (!selectedTask || !form) return;
    if (!form.folder_node_id && !form.course_id && !form.folder_path.trim()) {
      setError("Hãy chọn nơi lưu hoặc nhập đường dẫn lưu thủ công.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await request(`/api/uploads/${selectedTask.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          course_id: form.course_id || null,
          folder_node_id: form.folder_node_id || null,
          folder_path: form.folder_path.trim() || null,
          document_type: form.document_type,
          visibility: form.visibility,
          final_destination_source: "manual",
        }),
      });
      setMessage("Đã lưu tài liệu vào kho tri thức.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể lưu tài liệu.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedTask() {
    if (!selectedTask) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await removeTask(selectedTask.id);
      setMessage("Đã xóa tác vụ tải lên.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa tài liệu này.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelectedTask() {
    if (!selectedTask) return;
    setDownloadingPreview(true);
    try {
      const response = await fetch(`${API_URL}/api/uploads/${selectedTask.id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Không tải được file (HTTP ${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = selectedTask.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Không thể tải file này.");
    } finally {
      setDownloadingPreview(false);
    }
  }

  function startDragging() {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function renderPreview() {
    if (!selectedTask) {
      return (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm">
          <strong className="block">Chưa chọn tài liệu</strong>
          <p className="muted mt-1 text-xs">Chọn một file ở danh sách bên trái để xem nhanh nội dung trước khi lưu hoặc xóa.</p>
        </div>
      );
    }
    if (preview.kind === "loading") {
      return <p className="muted flex items-center gap-2 text-xs"><LoaderCircle className="animate-spin" size={14}/>Đang tải bản xem nhanh...</p>;
    }
    if (preview.kind === "error") {
      return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{preview.message}</div>;
    }
    if (preview.kind === "pdf") {
      return <iframe src={preview.url} title={preview.name} className="h-[68vh] w-full rounded-xl border border-[var(--border)] bg-white" />;
    }
    if (preview.kind === "image") {
      return <img src={preview.url} alt={preview.name} className="max-h-[68vh] w-full rounded-xl border border-[var(--border)] bg-white object-contain" />;
    }
    if (preview.kind === "text") {
      return (
        <pre className="h-[68vh] overflow-auto rounded-xl border border-[var(--border)] bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
          {preview.text}
        </pre>
      );
    }
    if (preview.kind === "unsupported") {
      return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft)] p-4">
          <div className="flex items-start gap-3">
            <FileText size={22} className="mt-0.5 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{preview.name}</strong>
              <p className="muted mt-1 text-xs">Định dạng `{preview.mime}` chưa hỗ trợ xem trực tiếp trong trình duyệt.</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhập liệu tự động"
        description="Theo dõi Desktop Agent, xem nhanh tài liệu và xác nhận nơi lưu ngay trên một màn hình, không dùng gợi ý AI."
      />

      <div
        ref={splitRef}
        className="grid items-start"
        style={{ gridTemplateColumns: `${leftPanelWidth}% 12px minmax(0, 1fr)` }}
      >
        <div className="min-w-0 pr-3">
          <Panel
            title="Tài liệu chờ xử lý"
            description="Chọn một tài liệu ở cột trái để xác nhận nơi lưu hoặc xóa nếu không cần nữa."
          >
            <div className="space-y-3 p-4">
              {!pendingTasks.length && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
                  <strong className="block">Không còn tài liệu nào cần xác nhận</strong>
                  <p className="muted mt-1 text-xs">Khi Desktop Agent tải file mới lên, danh sách sẽ tự cập nhật tại đây.</p>
                </div>
              )}
              {pendingTasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedTaskId === task.id
                      ? "border-blue-400 bg-blue-50"
                      : "border-[var(--border)] hover:bg-[var(--soft)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">{task.filename}</strong>
                      <p className="muted mt-1 truncate text-[11px]">
                        {task.metadata.source_path || "Desktop Agent"}
                      </p>
                    </div>
                    <span className="badge badge-amber shrink-0">Chờ xác nhận</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <button
          type="button"
          aria-label="Kéo giãn hai cột"
          onPointerDown={startDragging}
          className="group flex h-full min-h-[620px] items-center justify-center"
        >
          <span className="flex h-full w-[10px] items-center justify-center rounded-full bg-transparent transition group-hover:bg-blue-50">
            <GripVertical size={18} className="text-slate-400 group-hover:text-blue-600" />
          </span>
        </button>

        <div className="min-w-0 pl-3">
          <Panel
            title="Xem nhanh và lưu tài liệu"
            description="Cột phải cho phép xem nội dung gốc và điền form lưu thủ công ngay tại chỗ."
          >
            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{selectedTask?.filename || "Chưa chọn tài liệu"}</strong>
                    <div className="mt-2 space-y-1 text-[11px] text-[var(--muted)]">
                      <p>Nguồn: {selectedTask?.metadata.source_path || "Desktop Agent"}</p>
                      <p>Tiêu đề hiện tại: {selectedTask?.metadata.title || selectedTask?.filename || "Chưa có"}</p>
                      <p>Loại tài liệu hiện tại: {selectedTask?.metadata.doc_type || "Tài liệu khác"}</p>
                    </div>
                  </div>
                  {selectedTask && (
                    <button
                      type="button"
                      onClick={downloadSelectedTask}
                      disabled={downloadingPreview}
                      className="btn-secondary text-xs"
                    >
                      <Download size={14} />
                      {downloadingPreview ? "Đang tải..." : "Tải xuống"}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {preview.kind === "image" ? <ImageIcon size={16} /> : <FileText size={16} />}
                  Xem nhanh tài liệu
                </div>
                {renderPreview()}
              </div>

              {!selectedTask || !form ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm">
                  <strong className="block">Chưa có biểu mẫu để lưu</strong>
                  <p className="muted mt-1 text-xs">Chọn một file ở danh sách bên trái để hiện form lưu hoặc xóa.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Chọn nơi lưu trong cây tri thức</span>
                      <select
                        className="field"
                        value={form.folder_node_id || form.course_id}
                        onChange={event => handleSelectNode(event.target.value)}
                      >
                        <option value="">Chọn học phần hoặc thư mục</option>
                        {folderOptions.map(option => (
                          <option key={option.id} value={option.id}>
                            {"--".repeat(option.depth)} {option.path}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Loại tài liệu</span>
                      <select
                        className="field"
                        value={form.document_type}
                        onChange={event => setForm(current => (current ? { ...current, document_type: event.target.value } : current))}
                        disabled={selectedNode?.type === "standard_folder"}
                      >
                        {DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Quyền hiển thị</span>
                      <select
                        className="field"
                        value={form.visibility}
                        onChange={event => setForm(current => (current ? {
                          ...current,
                          visibility: event.target.value as DestinationForm["visibility"],
                        } : current))}
                      >
                        <option value="public">Công khai</option>
                        <option value="private">Riêng tư</option>
                      </select>
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-semibold">Hoặc nhập đường dẫn lưu thủ công</span>
                      <input
                        className="field"
                        value={form.folder_path}
                        onChange={event => setForm(current => (current ? {
                          ...current,
                          folder_path: event.target.value,
                          course_id: event.target.value.trim() ? "" : current.course_id,
                          folder_node_id: event.target.value.trim() ? "" : current.folder_node_id,
                        } : current))}
                        placeholder="Ví dụ: Khoa CNTT / Trí tuệ nhân tạo / Học phần / Bài giảng"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-4 text-xs">
                    <strong className="flex items-center gap-2 text-sm">
                      <FolderCheck size={15} />
                      Điểm lưu cuối cùng
                    </strong>
                    <p className="muted mt-2">
                      {form.folder_path.trim() ? form.folder_path : selectedNode?.path || "Chưa chọn nơi lưu"}
                    </p>
                  </div>

                  {message && <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</div>}
                  {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

                  <div className="flex flex-wrap gap-3">
                    <button className="btn-primary" disabled={busy} onClick={submitConfirmation}>
                      <Save size={15} />
                      Lưu vào kho
                    </button>
                    <button className="btn-secondary text-red-600" disabled={busy} onClick={deleteSelectedTask}>
                      <Trash2 size={15} />
                      Xóa tài liệu này
                    </button>
                    <Link href="/repository" className="btn-secondary">
                      Xem trong Kho tài liệu
                    </Link>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title="Tác vụ gần đây"
        description="Các file do Desktop Agent gửi lên và trạng thái xử lý hiện tại. Cấu hình theo dõi thư mục đã được chuyển sang trang Settings."
      >
        <div className="space-y-3 p-4">
          {!desktopTasks.length && (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
              <strong className="block">Chưa có file nào từ Desktop Agent</strong>
              <p className="muted mt-1 text-xs">Khi có file mới trong watch folder, tác vụ sẽ xuất hiện ở đây.</p>
            </div>
          )}
          {desktopTasks.slice(0, 8).map(task => (
            <div key={task.id} className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{task.filename}</strong>
                <span className={`badge ${statusTone(task.status)}`}>{statusLabel(task.status)}</span>
                <span className="badge badge-blue">{labelForUploadSource(task.metadata.source_type)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[var(--muted)]">
                <span>{task.uploaded_bytes} / {task.total_bytes} bytes</span>
                {task.metadata.source_path && <span className="truncate">Nguồn: {task.metadata.source_path}</span>}
                {task.metadata.device_id && <span>Thiết bị: {task.metadata.device_id}</span>}
              </div>
              {task.error && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {task.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
