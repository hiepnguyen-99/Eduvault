"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChartColumn,
  FileSearch,
  FolderKanban,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useUploadTasks } from "@/components/upload-task-provider";
import { DashboardData, formatDate } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { permissionsForRole } from "@/src/config/role-menu";

type QuickAction = {
  href: string;
  title: string;
  description: string;
  permissions: string[];
  icon: React.ReactNode;
  accent: string;
};

const quickActions: QuickAction[] = [
  {
    href: "/search",
    title: "Tìm kiếm tài liệu",
    description: "Tra cứu theo chủ đề hoặc từ khóa trong hệ thống.",
    permissions: ["dashboard.view"],
    icon: <FileSearch size={18} />,
    accent: "blue",
  },
  {
    href: "/repository",
    title: "Tải tài liệu lên",
    description: "Đưa giáo trình, slide, đề cương vào kho tri thức.",
    permissions: ["repository.view", "repository.own", "repository.upload"],
    icon: <Upload size={18} />,
    accent: "green",
  },
  {
    href: "/policy",
    title: "Quyền quản trị",
    description: "Thiết lập cấu trúc kho và phân quyền truy cập.",
    permissions: ["policy.manage"],
    icon: <ShieldCheck size={18} />,
    accent: "violet",
  },
  {
    href: "/reports",
    title: "Thống kê báo cáo",
    description: "Theo dõi mức độ sử dụng và khoảng trống dữ liệu.",
    permissions: ["reports.view", "quality.view"],
    icon: <ChartColumn size={18} />,
    accent: "amber",
  },
];

const featurePanels = [
  {
    title: "Học liệu số tập trung",
    description:
      "Lưu trữ có cấu trúc toàn bộ giáo án, đề thi, đáp án và tài liệu tham khảo theo từng học phần, tránh thất lạc qua các học kỳ giảng dạy.",
    image: "/intro_library.jpg",
    href: "/repository",
  },
  {
    title: "Truy xuất thông minh",
    description:
      "Tích hợp trợ lý AI hiểu ngữ nghĩa câu truy vấn, giúp tìm kiếm và định vị chính xác tệp tin đích chỉ trong vài giây mà không cần tra cứu thủ công.",
    image: "/intro_ai_search.jpg",
    href: "/search",
  },
  {
    title: "Chuyển giao tri thức",
    description:
      "Hỗ trợ giảng viên mới tiếp nhận học phần nhanh hơn nhờ có lộ trình tài liệu, lịch sử phiên bản và ngữ cảnh bàn giao rõ ràng.",
    image: "/intro_transfer.jpg",
    href: "/knowledge-transfer",
  },
];

const fallbackDashboard: DashboardData = {
  user: { code: "", name: "", role: "lecturer", department: "", permissions: [] },
  stats: { documents: 0, private: 0, topics: 0 },
  documents: [],
  requests: [],
  backups: [],
  audit: [],
};

function PressableLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Link
      href={href}
      className={className}
      data-pressed={pressed ? "true" : "false"}
      onClick={() => {
        setPressed(true);
        window.setTimeout(() => setPressed(false), 220);
      }}
    >
      {children}
    </Link>
  );
}

export function HomeWorkspace() {
  const { user } = useAuth();
  const { tasks } = useUploadTasks();
  const { data, error } = useBackendData("/api/dashboard", fallbackDashboard);

  const effectivePermissions = user
    ? Array.from(new Set([...(user.permissions || []), ...permissionsForRole(user.role)]))
    : [];

  const availableActions = quickActions.filter((item) =>
    item.permissions.some((permission) => effectivePermissions.includes(permission)),
  );

  const recentDocuments = data.documents.slice(0, 4);
  const recentUploads = tasks.slice(0, 3);

  return (
    <div className="reference-home">
      <section className="reference-hero interactive-card">
        <div
          className="reference-hero-media"
          style={{ backgroundImage: "linear-gradient(rgba(16,36,81,.78), rgba(11,20,45,.86)), url('/vinuni_hall.jpg')" }}
        />
        <div className="reference-hero-content">
          <h1>
            Kho lưu trữ dữ liệu
            <span>Khoa Công nghệ Thông tin</span>
          </h1>
          <div className="reference-hero-actions">
            <Link href="/repository" className="btn-primary reference-primary-btn">
              Truy cập kho tài liệu
              <ArrowRight size={15} />
            </Link>
            <Link href="/support" className="btn-secondary reference-secondary-btn">
              Xem hướng dẫn
            </Link>
          </div>
        </div>
      </section>

      <section className="reference-intro">
        <h2>Tiên phong kiến tạo & chuyển giao tri thức số</h2>
        <div className="reference-intro-grid">
          <p>
            Khoa Công nghệ Thông tin là trung tâm xuất sắc trong giáo dục đại học, phát triển các giải pháp đột phá về trí tuệ
            nhân tạo, khoa học dữ liệu và công nghệ phần mềm. Chúng tôi định hướng đào tạo thế hệ kỹ sư có tư duy toàn cầu,
            kết hợp chặt chẽ giữa nghiên cứu học thuật đỉnh cao và ứng dụng thực tiễn.
          </p>
          <p>
            Để thực hiện mục tiêu đó, hệ thống Lưu trữ Tri thức ra đời như một hạ tầng số hóa cốt lõi, phục vụ đắc lực cho
            công tác quản trị đào tạo, tự đánh giá và nâng cao liên tục chất lượng giảng dạy.
          </p>
        </div>
      </section>

      <section className="reference-feature-stack">
        {featurePanels.map((item) => (
          <PressableLink key={item.title} href={item.href} className="reference-feature-banner interactive-card">
            <div className="reference-feature-image" style={{ backgroundImage: `linear-gradient(rgba(9,15,35,.72), rgba(9,15,35,.72)), url('${item.image}')` }} />
            <div className="reference-feature-copy">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          </PressableLink>
        ))}
      </section>

      {availableActions.length > 0 && (
        <section className="reference-action-row">
          {availableActions.map((action) => (
            <PressableLink key={action.title} href={action.href} className={`reference-chip-card interactive-card accent-${action.accent}`}>
              <div className="reference-chip-icon">{action.icon}</div>
              <div>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </div>
            </PressableLink>
          ))}
        </section>
      )}

      <section className="reference-lower-grid">
        <article className="reference-panel">
          <div className="reference-panel-head">
            <div>
              <span>Tài liệu gần đây</span>
              <h3>Cập nhật mới trong kho tri thức</h3>
            </div>
            <Link href="/repository">Mở kho</Link>
          </div>
          <div className="reference-doc-list">
            {recentDocuments.map((item) => (
              <Link key={item.id} href={`/documents/${item.id}`} className="reference-doc-row interactive-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.topic} · {item.doc_type}
                  </p>
                </div>
                <small>{formatDate(item.updated_at || item.created_at)}</small>
              </Link>
            ))}
            {!recentDocuments.length && <p className="reference-empty">Chưa có tài liệu nào để hiển thị.</p>}
          </div>
        </article>

        <article className="reference-panel">
          <div className="reference-panel-head">
            <div>
              <span>Tác vụ nổi bật</span>
              <h3>Làm việc nhanh hơn trong ngày</h3>
            </div>
          </div>
          <div className="reference-mini-list">
            <div className="reference-mini-item interactive-card">
              <FolderKanban size={16} />
              <div>
                <strong>{data.stats.documents}</strong>
                <p>Tài liệu đang sẵn sàng tra cứu</p>
              </div>
            </div>
            <div className="reference-mini-item interactive-card">
              <BookOpen size={16} />
              <div>
                <strong>{data.stats.topics}</strong>
                <p>Chủ đề đang được quản lý trong kho</p>
              </div>
            </div>
            <div className="reference-mini-item interactive-card">
              <Bot size={16} />
              <div>
                <strong>{recentUploads.length}</strong>
                <p>Phiên upload gần đây từ Desktop Agent</p>
              </div>
            </div>
            <div className="reference-mini-item interactive-card">
              <GraduationCap size={16} />
              <div>
                <strong>{data.requests.length}</strong>
                <p>Yêu cầu cần theo dõi hoặc phê duyệt</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="reference-footer-note">
        <Sparkles size={16} />
        <p>Giữ lại hiệu ứng hover và click cho các box để phản hồi tương tác tốt hơn, nhưng bố cục tổng thể đã được kéo về gần mẫu bạn gửi.</p>
      </section>
    </div>
  );
}
