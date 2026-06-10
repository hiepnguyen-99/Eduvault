export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";

export type User = {
  code: string;
  name: string;
  role: "lecturer" | "new_lecturer" | "head" | "admin";
  department: string;
};

export type Document = {
  id: string;
  title: string;
  doc_type: string;
  topic: string;
  owner_code: string;
  visibility: "public" | "private";
  current_version: number;
  created_at: string;
  updated_at: string;
  folder_path: string;
  owner_anonymous?: boolean;
};

export type DocumentDetail = Document & {
  content: string;
};

export type DashboardData = {
  user: User;
  stats: { documents: number; private: number; topics: number };
  documents: Document[];
  requests: AccessRequest[];
  backups: Backup[];
  audit: Audit[];
};

export type AccessRequest = {
  id: string;
  document_id: string;
  requester_code: string;
  owner_code: string;
  status: string;
  created_at: string;
};

export type Backup = {
  id: string;
  storage_path: string;
  status: string;
  created_by: string;
  created_at: string;
};

export type Audit = {
  id: number;
  actor_code: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  created_at: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = "Không thể kết nối với máy chủ.";
    try {
      const data = await response.json();
      message = data.detail || data.error || message;
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export function formatDate(value?: string) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
