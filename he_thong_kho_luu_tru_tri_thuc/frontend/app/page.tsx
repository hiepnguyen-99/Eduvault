"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileClock,
  FolderKanban,
  GraduationCap,
  History,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

type Feature = {
  id: string;
  title: string;
  short: string;
  detail: string;
  href: string;
  icon: React.ReactNode;
  accent: string;
  steps: string[];
};

const features: Feature[] = [
  {
    id: "repository",
    title: "Kho tài liệu",
    short: "Lưu trữ giáo trình, bài giảng, tài liệu tham khảo, bài tập, đề thi và tài liệu nghiên cứu theo từng học phần.",
    detail: "Chức năng này là nơi tập trung toàn bộ tài liệu học thuật của khoa. Người dùng có thể tìm thư mục phù hợp, tải tệp lên, tạo tài liệu mới và theo dõi trạng thái xử lý của tài liệu trong hệ thống.",
    href: "/repository",
    icon: <FolderKanban size={22} />,
    accent: "from-sky-600 to-cyan-500",
    steps: [
      "Click chọn 'Kho tài liệu' trên menu chính. Hệ thống sẽ trả về giao diện cây thư mục học phần bên trái và danh sách tài liệu bên phải.",
      "Nhấp vào mã môn học cụ thể (ví dụ: COMP2010) ở cây thư mục. Hệ thống sẽ lọc và trả về toàn bộ tệp bài giảng, tài liệu lab hiện có của môn học đó.",
      "Nhấp nút 'Tải tệp lên' ở góc trên phải. Hệ thống hiển thị hộp thoại (Dialog) yêu cầu chọn tệp từ máy tính, chọn định dạng và học phần liên kết.",
      "Nhấp 'Xác nhận'. Hệ thống tải file lên, thực hiện phân loại bằng AI và trả về thông báo 'Tải lên thành công', đồng thời cập nhật tệp vào danh sách hiển thị."
    ],
  },
  {
    id: "assistant",
    title: "Trợ lý AI",
    short: "Hỗ trợ tìm kiếm tài liệu thông minh dựa trên phân tích ngữ nghĩa câu hỏi và trả về file tài liệu cần tìm.",
    detail: "Trợ lý giúp sinh viên và giảng viên tra cứu nhanh tài liệu học thuật bằng ngôn ngữ tự nhiên. Hệ thống phân tích ngữ nghĩa câu hỏi để tìm kiếm và trả về trực tiếp tệp tin chính xác mà người dùng cần tìm trong kho lưu trữ.",
    href: "/assistant",
    icon: <Sparkles size={22} />,
    accent: "from-indigo-600 to-violet-500",
    steps: [
      "Click chọn 'Trợ lý AI' ở menu điều hướng hoặc click biểu tượng chat tìm kiếm nổi ở góc dưới bên phải màn hình. Hệ thống sẽ hiển thị giao diện hộp thoại tìm kiếm thông minh.",
      "Nhập câu hỏi hoặc từ khóa diễn đạt nhu cầu tài liệu bằng ngôn ngữ tự nhiên (ví dụ: 'tài liệu ôn tập về thuật toán Dijkstra') rồi nhấn nút Gửi (hoặc Enter).",
      "Hệ thống sẽ kết nối cơ sở dữ liệu Vector (Vector Database) để phân tích ngữ nghĩa câu truy vấn và đối chiếu với toàn bộ tệp tài liệu trong kho.",
      "Hệ thống sẽ xử lý và trả về trực tiếp danh sách các file tài liệu phù hợp nhất kèm liên kết tải xuống hoặc xem trực tiếp trên màn hình."
    ],
  },
  {
    id: "knowledge-transfer",
    title: "Chuyển giao tri thức",
    short: "Hỗ trợ bàn giao tài liệu, thư mục học phần và quyền quản lý giữa các giảng viên.",
    detail: "Chức năng này giúp việc tiếp nhận môn học diễn ra liền mạch. Tài liệu, cấu trúc thư mục và quyền sở hữu được chuyển giao có kiểm soát, hạn chế thất lạc học liệu qua các học kỳ.",
    href: "/knowledge-transfer",
    icon: <GraduationCap size={22} />,
    accent: "from-emerald-600 to-teal-500",
    steps: [
      "Nhấp chọn 'Chuyển giao tri thức' ở thanh menu điều hướng. Hệ thống sẽ trả về danh sách các học môn học bạn sở hữu và lịch sử chuyển giao trước đó.",
      "Click chọn nút 'Chuyển giao mới' ở góc phải. Hệ thống hiển thị Form điền thông tin bàn giao học phần.",
      "Lựa chọn môn học cần chuyển giao và điền 'Mã giảng viên' nhận tiếp quản (ví dụ: GVNEW) vào ô thông tin, sau đó bấm 'Xác nhận chuyển giao'.",
      "Hệ thống tiến hành xác thực giảng viên và chuyển toàn bộ quyền quản trị thư mục học liệu, sau đó trả về thông báo 'Chuyển giao thành công'."
    ],
  },
  {
    id: "reports",
    title: "Báo cáo và phân tích",
    short: "Theo dõi số lượng tài liệu, tình trạng cập nhật và hoạt động sử dụng kho dữ liệu.",
    detail: "Trang báo cáo cung cấp các số liệu phục vụ quản trị học thuật, đánh giá mức độ đầy đủ của học liệu và hỗ trợ công tác tổng hợp thông tin cho khoa.",
    href: "/reports",
    icon: <BarChart3 size={22} />,
    accent: "from-amber-600 to-orange-500",
    steps: [
      "Click chọn 'Báo cáo và phân tích' trên menu điều hướng. Hệ thống sẽ trả về màn hình hiển thị các biểu đồ thống kê học vụ thời gian thực.",
      "Sử dụng bộ lọc ở góc trên để lựa chọn phạm vi thống kê theo Học kỳ, Năm học hoặc theo mã Học phần môn học cụ thể.",
      "Hệ thống lập tức tính toán lại dữ liệu và trả về biểu đồ tròn phân bổ định dạng tệp, biểu đồ cột biểu thị tần suất truy cập học liệu.",
      "Nhấp chọn nút 'Xuất báo cáo' ở góc gia diện. Hệ thống sẽ kết xuất dữ liệu và tải xuống máy tính file tài liệu Excel thống kê chi tiết phục vụ kiểm định khoa."
    ],
  },
  {
    id: "permissions",
    title: "Phân quyền truy cập",
    short: "Quản lý quyền xem, chỉnh sửa và phê duyệt tài liệu theo vai trò người dùng.",
    detail: "Phân quyền giúp bảo vệ tài liệu nội bộ, đề thi, đáp án và các tài nguyên cần kiểm soát. Quản trị viên có thể xem yêu cầu truy cập và điều chỉnh quyền phù hợp.",
    href: "/permissions",
    icon: <ShieldCheck size={22} />,
    accent: "from-rose-600 to-red-500",
    steps: [
      "Click chọn 'Phân quyền' trên menu chính của hệ thống. Hệ thống sẽ trả về danh sách các tệp tin cùng trạng thái phân quyền tương ứng.",
      "Nhấp vào biểu tượng 'Sửa quyền' ở bên phải dòng của tài liệu cần thiết lập. Hệ thống sẽ hiển thị hộp thoại (Dialog) thiết lập quyền hạn.",
      "Thay đổi trạng thái hiển thị (Public, Internal, Private) hoặc gán quyền đọc/ghi riêng biệt cho Giảng viên hoặc Trợ giảng.",
      "Nhấp nút 'Lưu'. Hệ thống cập nhật cơ sở dữ liệu phân quyền và trả về thông báo 'Cập nhật quyền thành công' trên giao diện."
    ],
  },
  {
    id: "policy",
    title: "Chính sách lưu trữ",
    short: "Thiết lập quy định về cách tổ chức, đặt tên, lưu giữ và kiểm soát tài liệu.",
    detail: "Chính sách lưu trữ giúp toàn khoa sử dụng một chuẩn chung khi quản lý tài liệu. Nhờ đó, dữ liệu dễ tìm hơn, dễ kiểm tra hơn và phù hợp hơn với yêu cầu quản trị học thuật.",
    href: "/policy",
    icon: <Scale size={22} />,
    accent: "from-blue-700 to-indigo-500",
    steps: [
      "Click chọn mục 'Chính sách lưu trữ' ở menu phụ. Hệ thống hiển thị danh sách các chính sách quy chuẩn học thuật đang được áp dụng.",
      "Nhấp chuột vào một dòng chính sách bất kỳ. Hệ thống sẽ mở rộng và trả về chi tiết các quy tắc ràng buộc (định dạng, dung lượng tối đa).",
      "(Quyền Admin) Nhấp nút 'Tạo quy tắc mới', nhập các tham số ràng buộc và click chọn nút 'Áp dụng chính sách'.",
      "Hệ thống sẽ cập nhật quy chuẩn và trả về thông báo 'Chính sách mới đã được áp dụng', đồng thời kích hoạt trình quét lỗi vi phạm trên toàn khoa."
    ],
  },
  {
    id: "versions",
    title: "Quản lý phiên bản",
    short: "Theo dõi lịch sử cập nhật tài liệu và khôi phục phiên bản khi cần.",
    detail: "Mỗi lần tài liệu được cập nhật, hệ thống có thể ghi nhận phiên bản mới. Chức năng này hỗ trợ giảng viên và quản trị viên kiểm tra thay đổi, tránh mất nội dung quan trọng.",
    href: "/versions",
    icon: <History size={22} />,
    accent: "from-cyan-600 to-blue-600",
    steps: [
      "Tại giao diện 'Kho tài liệu', rê chuột vào tài liệu cần xem và nhấp nút 'Lịch sử phiên bản'. Hệ thống sẽ trả về bảng danh sách các phiên bản cũ.",
      "Xem thông tin chi tiết về: Mốc thời gian sửa đổi, Dung lượng file, và Giảng viên thực hiện thay đổi tương ứng với mỗi phiên bản.",
      "Nhấp chọn nút 'So sánh' hoặc 'Tải xuống' bên cạnh phiên bản cũ để xem lại nội dung cũ của giáo án.",
      "Nhấp nút 'Khôi phục'. Hệ thống ghi đè phiên bản cũ đó làm phiên bản chính hiện tại và trả về thông báo 'Khôi phục phiên bản thành công'."
    ],
  },
  {
    id: "audit-logs",
    title: "Nhật ký hệ thống",
    short: "Ghi nhận các hoạt động quan trọng như đăng nhập, tải tệp, chỉnh sửa, phân quyền và xóa tài liệu.",
    detail: "Nhật ký hệ thống giúp quản trị viên truy vết hoạt động, kiểm tra sự cố và bảo đảm tính minh bạch trong quá trình vận hành kho dữ liệu.",
    href: "/audit-logs",
    icon: <FileClock size={22} />,
    accent: "from-slate-700 to-slate-500",
    steps: [
      "Click chọn 'Nhật ký hệ thống' trên menu chính. Hệ thống sẽ trả về danh sách các bản ghi hoạt động sắp xếp theo thời gian thực.",
      "Nhập từ khóa tìm kiếm (tên giảng viên hoặc mã môn) vào ô bộ lọc, chọn loại hành động cần kiểm toán (ví dụ: 'Xóa dữ liệu').",
      "Hệ thống tiến hành lọc trong cơ sở dữ liệu nhật ký bất biến và trả về danh sách các log khớp với điều kiện lọc.",
      "Click vào một bản ghi log cụ thể. Hệ thống hiển thị chi tiết thông tin kỹ thuật: Địa chỉ IP, Trình duyệt, Thời gian chính xác và mã Hash bảo mật."
    ],
  },
  {
    id: "settings",
    title: "Cấu hình cá nhân",
    short: "Quản lý thông tin tài khoản, giao diện và các thiết lập sử dụng cá nhân.",
    detail: "Người dùng có thể điều chỉnh một số thông tin và lựa chọn hiển thị phù hợp với nhu cầu làm việc, trong phạm vi quyền được cấp.",
    href: "/settings",
    icon: <Settings2 size={22} />,
    accent: "from-lime-600 to-emerald-500",
    steps: [
      "Click chọn biểu tượng 'Cài đặt' (hình bánh răng) ở thanh menu dưới. Hệ thống sẽ hiển thị trang tùy chỉnh thiết lập tài khoản cá nhân.",
      "Tích chọn để thay đổi giao diện (Sáng/Tối) hoặc bật/tắt tính năng nhận email thông báo tự động khi học phần có tài liệu mới tải lên.",
      "Nhấp nút 'Lưu cài đặt'. Hệ thống lưu trữ các tùy chọn hiển thị và thiết lập thông báo riêng của bạn vào tài khoản.",
      "Giao diện hệ thống ngay lập tức đổi màu sắc/chế độ theo cài đặt và trả về thông báo 'Cập nhật cấu hình tài khoản thành công'."
    ],
  },
  {
    id: "trash",
    title: "Thùng rác",
    short: "Lưu tạm tài liệu đã xóa và hỗ trợ khôi phục trước khi xóa vĩnh viễn.",
    detail: "Thùng rác giúp giảm rủi ro mất dữ liệu do thao tác nhầm. Người dùng có quyền phù hợp có thể xem lại tài liệu đã xóa và phục hồi khi cần.",
    href: "/trash",
    icon: <Trash2 size={22} />,
    accent: "from-red-600 to-orange-500",
    steps: [
      "Click chọn 'Thùng rác' trên menu chính. Hệ thống sẽ hiển thị danh sách các tệp tin, giáo trình môn học đã bị xóa mềm trước đó.",
      "Để phục hồi, click chọn nút 'Khôi phục' bên cạnh tài liệu mong muốn. Hệ thống đưa tệp về lại đúng thư mục cũ và trả về thông báo 'Phục hồi thành công'.",
      "Để xóa hoàn toàn, click chọn nút 'Xóa vĩnh viễn' bên cạnh tệp tin và xác nhận trên hộp thoại (Dialog) cảnh báo nguy cơ.",
      "Hệ thống xóa sạch tệp khỏi vector database học thuật, giải phóng không gian ổ cứng và trả về thông báo 'Xóa vĩnh viễn thành công'."
    ],
  },
];

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!window.IntersectionObserver) {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add("is-visible");
        } else {
          node.classList.remove("is-visible");
        }
      },
      { threshold: 0.01, rootMargin: "0px 0px -10px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal-on-scroll ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const BG_IMAGES = ["/vinuni.jpg", "/vinuni_hall.jpg", "/vinuni_library.jpg"];

export default function HomePage() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string>(features[0].id);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBgIndex((prevIndex) => (prevIndex + 1) % BG_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  function scrollToFeature(id: string) {
    setActiveGuideId(id);
    document.getElementById("huong-dan-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="home-experience -mx-4 -my-4 overflow-hidden md:-mx-7 md:-my-7">
      <section className="relative overflow-hidden bg-[#102451] text-white rounded-3xl px-6 py-24 md:px-12 md:py-36 lg:py-48 shadow-xl">
        <div className="absolute inset-0 z-0">
          {BG_IMAGES.map((img, idx) => (
            <div 
              key={img} 
              className={`absolute inset-0 bg-cover bg-center transition-all duration-[1500ms] ease-in-out transform ${idx === currentBgIndex ? "opacity-35 scale-100" : "opacity-0 scale-105"}`} 
              style={{ backgroundImage: `url('${img}')` }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-[#08132e]/95 via-[#102451]/75 to-[#102451]/60" />
        </div>

        <Reveal className="relative z-10 mx-auto max-w-5xl text-white">
          <div className="max-w-4xl text-center md:text-left">
            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
              <span className="drop-shadow-md text-white">Kho lưu trữ dữ liệu</span>
              <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-sky-300 drop-shadow-sm">Khoa Công nghệ Thông tin</span>
            </h1>
            <div className="mt-12 flex flex-wrap gap-3 justify-center md:justify-start">
              <Link href="/repository" className="btn-primary h-11 rounded-lg bg-white px-5 text-[#102451] hover:border-white hover:bg-cyan-100">
                Truy cập kho tài liệu <ArrowRight size={16} />
              </Link>
              <button onClick={() => scrollToFeature("repository")} className="btn-secondary h-11 rounded-lg border-white/20 bg-white/10 px-5 text-white backdrop-blur hover:bg-white/20">
                Xem hướng dẫn
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-white px-6 py-16 dark:bg-slate-950 md:px-12 lg:px-16 border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl space-y-12">
          {/* Top text row */}
          <Reveal className="max-w-4xl space-y-6" delay={100}>
            <h2 className="text-3xl font-black tracking-tight text-[var(--text)] drop-shadow-sm md:text-4xl">
              Tiên phong kiến tạo & chuyển giao tri thức số
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <p className="text-sm leading-7 text-[var(--muted)]">
                Khoa Công nghệ Thông tin là trung tâm xuất sắc trong giáo dục đại học, phát triển các giải pháp đột phá về trí tuệ nhân tạo, khoa học dữ liệu và công nghệ phần mềm. Chúng tôi định hướng đào tạo thế hệ kỹ sư có tư duy toàn cầu, kết hợp chặt chẽ giữa nghiên cứu học thuật đỉnh cao và ứng dụng thực tiễn.
              </p>
              <p className="text-sm leading-7 text-[var(--muted)]">
                Để thực hiện mục tiêu đó, hệ thống Lưu trữ Tri thức ra đời như một hạ tầng số hóa cốt lõi, phục vụ đắc lực cho công tác quản trị đào tạo, tự đánh giá và nâng cao liên tục chất lượng giảng dạy.
              </p>
            </div>
          </Reveal>

          {/* Vertical Stacked Banners */}
          <div className="space-y-8 mt-12">
            <Reveal className="relative overflow-hidden rounded-3xl bg-slate-950 p-8 md:p-16 min-h-[260px] flex items-center shadow-lg group" delay={150}>
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-in-out opacity-40 filter blur-[2px] scale-100 group-hover:opacity-80 group-hover:blur-0 group-hover:scale-103"
                style={{ backgroundImage: "url('/intro_library.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 to-transparent z-0" />
              <div className="relative z-10 max-w-2xl text-white space-y-3">
                <span className="block font-black text-[#ff4d5a] text-xl md:text-2xl">Học liệu số tập trung</span>
                <p className="text-sm md:text-base leading-7 text-gray-200 font-medium">
                  Lưu trữ có cấu trúc toàn bộ giáo án, đề thi, đáp án và tài liệu tham khảo theo từng học phần, tránh thất lạc qua các học kỳ giảng dạy.
                </p>
              </div>
            </Reveal>

            <Reveal className="relative overflow-hidden rounded-3xl bg-slate-950 p-8 md:p-16 min-h-[260px] flex items-center shadow-lg group" delay={200}>
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-in-out opacity-40 filter blur-[2px] scale-100 group-hover:opacity-80 group-hover:blur-0 group-hover:scale-103"
                style={{ backgroundImage: "url('/intro_ai_search.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 to-transparent z-0" />
              <div className="relative z-10 max-w-2xl text-white space-y-3">
                <span className="block font-black text-[#ff4d5a] text-xl md:text-2xl">Truy xuất thông minh</span>
                <p className="text-sm md:text-base leading-7 text-gray-200 font-medium">
                  Tích hợp trợ lý AI hiểu ngữ nghĩa câu truy vấn, giúp tìm kiếm và định vị chính xác tệp tin đích chỉ trong vài giây mà không cần tra cứu thủ công.
                </p>
              </div>
            </Reveal>

            <Reveal className="relative overflow-hidden rounded-3xl bg-slate-950 p-8 md:p-16 min-h-[260px] flex items-center shadow-lg group" delay={250}>
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-in-out opacity-40 filter blur-[2px] scale-100 group-hover:opacity-80 group-hover:blur-0 group-hover:scale-103"
                style={{ backgroundImage: "url('/intro_transfer.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 to-transparent z-0" />
              <div className="relative z-10 max-w-2xl text-white space-y-3">
                <span className="block font-black text-[#ff4d5a] text-xl md:text-2xl">Bàn giao liền mạch</span>
                <p className="text-sm md:text-base leading-7 text-gray-200 font-medium">
                  Chuyển giao quyền quản lý thư mục học phần và toàn bộ kho tri thức tích lũy giữa các giảng viên tiếp quản môn học một cách minh bạch.
                </p>
              </div>
            </Reveal>

            <Reveal className="relative overflow-hidden rounded-3xl bg-slate-950 p-8 md:p-16 min-h-[260px] flex items-center shadow-lg group" delay={300}>
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-in-out opacity-40 filter blur-[2px] scale-100 group-hover:opacity-80 group-hover:blur-0 group-hover:scale-103"
                style={{ backgroundImage: "url('/intro_security.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 to-transparent z-0" />
              <div className="relative z-10 max-w-2xl text-white space-y-3">
                <span className="block font-black text-[#ff4d5a] text-xl md:text-2xl">Phiên bản & An toàn</span>
                <p className="text-sm md:text-base leading-7 text-gray-200 font-medium">
                  Lưu vết lịch sử thay đổi tài liệu, hỗ trợ khôi phục phiên bản cùng cơ chế phân quyền bảo mật chặt chẽ theo vai trò người dùng.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg)] px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-6 max-w-3xl">
            <h2 className="text-2xl font-black tracking-tight text-[var(--text)] drop-shadow-sm md:text-3xl">Tổng quan chức năng</h2>
          </Reveal>
          <div className="feature-grid">
            {features.map((feature, index) => (
              <Reveal key={feature.id} delay={index * 50}>
                <button
                  onMouseEnter={() => setHoveredId(feature.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(feature.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => scrollToFeature(feature.id)}
                  className={`feature-card w-full ${hoveredId === feature.id ? "is-active" : ""}`}
                >
                  <div className="feature-card-header">
                    <span className="text-[#C92027] block mx-auto mb-2">
                      {feature.icon}
                    </span>
                    <span className="mt-2 block text-sm font-black text-[var(--text)]">{feature.title}</span>
                    <span className="feature-card-short mt-2 block text-xs leading-5 text-[var(--muted)]">{feature.short}</span>
                  </div>
                  <span className="feature-card-detail">
                    {feature.detail}
                    <span className="mt-3 inline-flex items-center gap-1 font-bold text-[#C92027] mx-auto justify-center">
                      Xem hướng dẫn <ArrowRight size={13} />
                    </span>
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="huong-dan-section" className="bg-[#f1f5f9] px-4 py-20 dark:bg-[#0a0f1c] border-t border-[var(--border)] overflow-hidden relative">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes pageTurn {
            0% { transform: perspective(1500px) rotateY(30deg); opacity: 0; transform-origin: left center; }
            100% { transform: perspective(1500px) rotateY(0deg); opacity: 1; transform-origin: left center; }
          }
          .animate-page-turn {
            animation: pageTurn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }
          .book-shadow {
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 -5px 20px -10px rgba(0,0,0,0.1);
          }
          .book-spine-gradient {
            background: linear-gradient(to right, 
              rgba(0,0,0,0.02) 0%, 
              rgba(0,0,0,0.1) 20%, 
              rgba(0,0,0,0.15) 50%, 
              rgba(0,0,0,0.1) 80%, 
              rgba(0,0,0,0.02) 100%
            );
          }
          .dark .book-spine-gradient {
            background: linear-gradient(to right, 
              rgba(255,255,255,0.02) 0%, 
              rgba(255,255,255,0.05) 20%, 
              rgba(255,255,255,0.08) 50%, 
              rgba(255,255,255,0.05) 80%, 
              rgba(255,255,255,0.02) 100%
            );
          }
        `}} />

        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-black text-[var(--text)] drop-shadow-md md:text-5xl">Cẩm Nang Điện Tử</h2>
            <p className="mt-4 text-[var(--muted)] max-w-2xl mx-auto text-lg font-medium">Mở sách để khám phá chi tiết các chức năng. Trải nghiệm tương tác sinh động, trực quan.</p>
          </Reveal>

          {/* Cuốn sách */}
          <div className="relative mx-auto max-w-[920px] rounded-[18px] book-shadow bg-[#fdfdfd] dark:bg-slate-900 flex flex-col md:flex-row min-h-[560px] border border-black/5 dark:border-white/10">
            {/* Bìa sách / Spine (Gáy sách) */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-12 book-spine-gradient z-20 pointer-events-none hidden md:block"></div>
            
            {/* Đường kẻ nếp gấp giữa */}
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-black/10 dark:bg-white/10 z-20 pointer-events-none hidden md:block"></div>

            {/* TRANG BÊN TRÁI: MỤC LỤC */}
            <div className="w-full md:w-1/2 p-6 md:p-9 relative z-10 bg-gradient-to-l from-[#f1f5f9]/50 to-white dark:from-slate-800/50 dark:to-slate-900 rounded-l-[18px]">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-amber-500/30">
                <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                  <BookOpen size={18} />
                </div>
                <h3 className="text-[1.8rem] font-serif font-black text-[#102451] dark:text-amber-400">Mục lục</h3>
              </div>
              
              <nav className="space-y-2.5 relative z-30">
                {features.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveGuideId(f.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-300 group ${
                      activeGuideId === f.id 
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-[1.02] -translate-y-0.5" 
                        : "text-[var(--text)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent font-medium"
                    }`}
                  >
                    <span className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-sm transition-all duration-300 font-bold ${activeGuideId === f.id ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:scale-110"}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-bold">{f.title}</span>
                    {activeGuideId === f.id && <ChevronRight size={16} className="ml-auto text-white/80 animate-pulse" />}
                  </button>
                ))}
              </nav>

              {/* Trang trí góc trang giấy */}
              <div className="absolute bottom-6 left-8 text-xs font-bold text-slate-400 tracking-widest">TRANG 1</div>
            </div>

            {/* TRANG BÊN PHẢI: NỘI DUNG */}
            <div className="w-full md:w-1/2 relative z-10 bg-gradient-to-r from-[#f1f5f9]/50 to-white dark:from-slate-800/50 dark:to-slate-900 rounded-r-[18px] perspective-[1500px]">
              {features.filter(f => f.id === activeGuideId).map((feature) => (
                <div key={feature.id} className="w-full h-full flex flex-col animate-page-turn origin-left">
                  <div className="p-6 md:p-9 flex-1 flex flex-col">
                    {/* Header */}
                    <div className="mb-6">
                       <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[11px] font-black tracking-wider uppercase mb-3">
                         {feature.title}
                       </span>
                       <h3 className="text-[1.9rem] md:text-[2.2rem] font-black text-[#102451] dark:text-white leading-tight">{feature.short}</h3>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none mb-6">
                       <p className="text-[15px] leading-relaxed font-medium text-slate-600 dark:text-slate-300">
                         {feature.detail}
                       </p>
                    </div>

                    <div className="space-y-4 flex-1">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                         <span className="w-6 h-px bg-slate-300 dark:bg-slate-700"></span>
                         Thao tác thực hiện
                         <span className="flex-1 h-px bg-slate-300 dark:bg-slate-700"></span>
                      </h4>
                      
                      <div className="space-y-4">
                        {feature.steps.map((step, idx) => (
                          <div key={idx} className="flex gap-4 items-start group">
                            <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-sm bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold border-2 border-white dark:border-slate-900 shadow-sm group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors">
                              {idx + 1}
                            </div>
                            <p className="text-[13px] pt-1 leading-relaxed text-[var(--text)] group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors font-medium">
                              {step.replace(/^Bước \d+:\s*/, "")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer của trang (Nút hành động) */}
                    <div className="mt-6 pt-5 border-t-2 border-dashed border-slate-200 dark:border-slate-800">
                      <Link href={feature.href} className="w-full flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#102451] to-blue-800 px-5 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.02] hover:shadow-xl dark:from-blue-700 dark:to-cyan-600">
                        {feature.icon}
                        Truy cập chức năng
                      </Link>
                    </div>
                  </div>

                  {/* Trang trí góc trang giấy */}
                  <div className="absolute bottom-6 right-8 text-xs font-bold text-slate-400 tracking-widest">TRANG 2</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-[var(--border)] bg-[#102451] text-white rounded-t-3xl px-6 py-12 md:px-12">
        <Reveal className="mx-auto max-w-6xl grid gap-8 md:grid-cols-3">
          <div>
            <span className="block text-lg font-black text-white">Kho lưu trữ tri thức</span>
            <p className="mt-3 text-xs leading-5 text-gray-300">
              Hệ thống quản lý học liệu và chuyển giao tri thức số hóa dành riêng cho Giảng viên, Trợ giảng và Sinh viên Khoa Công nghệ Thông tin.
            </p>
          </div>
          <div>
            <span className="block text-sm font-bold text-white uppercase tracking-wider">Thông tin liên hệ</span>
            <ul className="mt-3 space-y-2 text-xs text-gray-300">
              <li>Địa chỉ: Văn phòng Khoa CNTT, Trường Đại học VinUni, Gia Lâm, Hà Nội</li>
              <li>Điện thoại: (+84) 24 7108 9779</li>
              <li>Email: fit.support@vinuni.edu.vn</li>
            </ul>
          </div>
          <div>
            <span className="block text-sm font-bold text-white uppercase tracking-wider">Hỗ trợ kỹ thuật</span>
            <p className="mt-3 text-xs leading-5 text-gray-300">
              Mọi thắc mắc về phân quyền truy cập, tài khoản hoặc yêu cầu tích hợp học liệu mới, vui lòng liên hệ Ban Quản trị Hệ thống để được giải quyết nhanh nhất.
            </p>
            <p className="mt-4 text-[10px] text-gray-400">
              © 2026 Khoa Công nghệ Thông tin. All rights reserved.
            </p>
          </div>
        </Reveal>
      </footer>
    </div>
  );
}
