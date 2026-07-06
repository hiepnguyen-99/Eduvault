"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  History,
  Trash2,
  Search,
  FolderOpen,
  FolderSync,
  Server,
  Shield,
  Scale,
  Users,
  KeyRound,
  DatabaseBackup,
  BarChart3,
  ScrollText,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ROLE_MENUS, toAppRole } from "@/src/config/role-menu";
import { PageHeader } from "@/components/ui";

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
    id: "search",
    title: "Tìm kiếm",
    short: "Tra cứu tài liệu, học phần, giảng viên và các thông tin quản trị trong hệ thống.",
    detail: "Chức năng giúp người dùng nhanh chóng tìm kiếm các tài nguyên học thuật và thông tin quản trị trong phạm vi quyền hạn.",
    href: "/search",
    icon: <Search size={22} />,
    accent: "from-blue-600 to-indigo-500",
    steps: [
      "Truy cập vào mục 'Tổng quan' trên thanh điều hướng để sử dụng ô tìm kiếm nhanh, hoặc nhấp vào trang 'Tìm kiếm' ở thanh trên.",
      "Nhập từ khóa liên quan đến tên tài liệu, mã học phần, tên môn học hoặc tên giảng viên cần tra cứu vào ô tìm kiếm.",
      "Nhấn nút 'Tìm kiếm' hoặc nhấn phím Enter để hệ thống tiến hành rà soát dữ liệu trên toàn bộ kho lưu trữ.",
      "Xem danh sách kết quả được phân chia rõ ràng theo từng danh mục (Tài liệu, Học phần, Giảng viên...) và nhấp chọn để xem chi tiết hoặc tải xuống."
    ],
  },
  {
    id: "repository",
    title: "Kho tri thức",
    short: "Lưu trữ, tổ chức giáo trình, bài giảng và tài liệu học thuật theo cây thư mục môn học.",
    detail: "Nơi tập trung lưu trữ toàn bộ tài liệu của khoa, hỗ trợ tải lên, phân loại tự động bằng AI và quản lý tài liệu.",
    href: "/repository",
    icon: <FolderOpen size={22} />,
    accent: "from-sky-600 to-cyan-500",
    steps: [
      "[Luồng 1: Tải tệp tài liệu lên (Hỗ trợ phân loại tự động bằng AI)]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Kho tài liệu' trên thanh điều hướng chính, sau đó nhấp vào mục 'Kho tri thức' để mở giao diện quản lý.",
      "Chọn học phần hoặc môn học cụ thể ở cây danh mục bên trái để xác định ngữ cảnh lưu trữ.",
      "Nhấp nút 'Tải tệp lên', chọn tệp từ máy tính. Hệ thống AI sẽ tự động đọc nội dung và đề xuất môn học phù hợp.",
      "Tài liệu tự động lưu vào đúng thư mục học phần nếu độ chính xác cao. Bạn cũng có thể tự chọn lại vị trí hoặc trò chuyện với trợ lý AI để xếp tài liệu vào vị trí mong muốn.",
      "[Luồng 2: Soạn thảo và tạo tài liệu trực tuyến]",
      "Nhấp nút 'Tạo tài liệu mới' (biểu tượng soạn thảo) ở góc trên bên phải màn hình để mở khung soạn thảo trực tuyến.",
      "Nhập các thông tin bắt buộc gồm: Tiêu đề, Chủ đề, chọn Loại tài liệu và thiết lập quyền hiển thị (Công khai/Riêng tư).",
      "Soạn thảo hoặc dán nội dung văn bản trực tiếp vào ô nội dung tài liệu.",
      "Nhấn nút 'Lưu tài liệu' để hệ thống tiến hành lưu trữ và đồng bộ vào kho tri thức của môn học."
    ],
  },
  {
    id: "auto-ingestion",
    title: "Nhập liệu tự động",
    short: "Giám sát thư mục cục bộ và tự động đẩy tài liệu từ máy tính lên hệ thống.",
    detail: "Hỗ trợ tự động tải tài liệu từ cấu hình Desktop Agent và lưu tạm tại vùng chờ để xác nhận đưa vào kho.",
    href: "/auto-ingestion",
    icon: <FolderSync size={22} />,
    accent: "from-indigo-600 to-violet-500",
    steps: [
      "Nhấp chọn trực tiếp vào nút 'Desktop Agent' ngay trên thanh điều hướng chính (hoặc trỏ chuột vào nhóm 'Kho tài liệu' và chọn 'Nhập liệu tự động').",
      "Xem danh sách các tệp đang ở trạng thái 'Chờ xác nhận' được đồng bộ lên từ cấu hình Desktop Agent trên máy tính, không phải ứng dụng.",
      "Nhấp chọn một tài liệu để xem trước nội dung trực tiếp (PDF, hình ảnh hoặc văn bản) ở khung bên phải.",
      "Lựa chọn học phần/thư mục môn học đích mà bạn muốn lưu trữ chính thức tài liệu này.",
      "Nhấn nút 'Xác nhận' để đưa tài liệu vào kho tri thức chuẩn (hoặc nhấn 'Hủy bỏ' để xóa tệp khỏi danh sách chờ)."
    ],
  },
  {
    id: "trash",
    title: "Thùng rác",
    short: "Quản lý tài liệu đã bị xóa tạm thời, hỗ trợ khôi phục hoặc xóa vĩnh viễn.",
    detail: "Giúp khôi phục tài liệu đã xóa nhầm hoặc tiến hành xóa hoàn toàn tệp tin khỏi đĩa cứng và chỉ mục AI.",
    href: "/trash",
    icon: <Trash2 size={22} />,
    accent: "from-red-600 to-orange-500",
    steps: [
      "[Luồng 1: Khôi phục tài liệu đã xóa tạm thời]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Kho tài liệu' trên thanh điều hướng chính, sau đó nhấp vào mục 'Thùng rác' để mở giao diện quản lý.",
      "Tìm tài liệu bạn muốn khôi phục trong danh sách các tệp tin đã xóa.",
      "Nhấp nút 'Khôi phục' (biểu tượng mũi tên khôi phục) bên cạnh tài liệu tương ứng.",
      "Hệ thống sẽ đưa tài liệu trở lại đúng thư mục học phần ban đầu với đầy đủ lịch sử phiên bản.",
      "[Luồng 2: Xóa vĩnh viễn tài liệu khỏi hệ thống]",
      "Tìm tài liệu cần loại bỏ hoàn toàn trong danh sách Thùng rác.",
      "Nhấp nút 'Xóa vĩnh viễn' (biểu tượng thùng rác màu đỏ) bên cạnh tài liệu.",
      "Xác nhận trên hộp thoại cảnh báo. Tài liệu sẽ bị xóa hoàn toàn khỏi máy chủ và không thể khôi phục."
    ],
  },
  {
    id: "versions",
    title: "Phiên bản",
    short: "Theo dõi lịch sử cập nhật, so sánh thay đổi và khôi phục các phiên bản tài liệu.",
    detail: "Ghi nhận mọi lần sửa đổi tài liệu, hỗ trợ so sánh khác biệt trực quan và khôi phục về nội dung cũ.",
    href: "/versions",
    icon: <History size={22} />,
    accent: "from-emerald-600 to-teal-500",
    steps: [
      "[Luồng 1: So sánh sự khác biệt giữa hai phiên bản tài liệu]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Kho tài liệu' trên thanh điều hướng chính, sau đó nhấp vào mục 'Phiên bản' để mở giao diện quản lý.",
      "Chọn tài liệu cần kiểm tra lịch sử từ danh mục tài liệu ở khung bên trái.",
      "Lựa chọn hai mốc phiên bản (Bản cũ và Bản mới) ở khung so sánh để đối chiếu nội dung.",
      "Hệ thống hiển thị trực quan các dòng được thêm mới (màu xanh) và dòng bị xóa bỏ (màu đỏ) giữa hai phiên bản.",
      "[Luồng 2: Phục hồi tài liệu về phiên bản cũ]",
      "Xem danh sách lịch sử các phiên bản của tài liệu ở khung bên phải.",
      "Tìm phiên bản cũ bạn muốn khôi phục lại trong danh sách.",
      "Nhấn nút 'Khôi phục thành phiên bản mới' bên cạnh phiên bản cũ đó.",
      "Hệ thống sẽ tạo ra một phiên bản mới nhất có nội dung sao chép nguyên vẹn từ phiên bản cũ được chọn."
    ],
  },
  {
    id: "operations",
    title: "Vận hành",
    short: "Giám sát sức khỏe hệ thống, dung lượng lưu trữ, hoạt động của các luồng tự động hóa.",
    detail: "Bảng điều khiển trung tâm giúp quản trị viên theo dõi trạng thái vận hành của toàn bộ hạ tầng cơ sở dữ liệu, sao lưu và kiểm tra tính an toàn của dữ liệu.",
    href: "/operations",
    icon: <Server size={22} />,
    accent: "from-slate-700 to-slate-500",
    steps: [
      "[Luồng 1: Kiểm tra tình trạng hoạt động và dung lượng hệ thống]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Vận hành' để mở giao diện quản lý.",
      "Xem các chỉ số sức khỏe của API, cơ sở dữ liệu, kho lưu trữ và các thông báo cảnh báo sớm.",
      "Kiểm tra thông số dung lượng ổ đĩa đã sử dụng, số lượng tài liệu và số lượng phiên bản đang lưu trữ trên hệ thống.",
      "[Luồng 2: Thực hiện kiểm tra khôi phục dữ liệu từ bản sao lưu]",
      "Ở mục 'Kiểm tra khôi phục', xem thông tin về bản sao lưu gần nhất.",
      "Nhấp nút 'Kiểm tra khôi phục' để hệ thống tiến hành chạy thử nghiệm quy trình khôi phục dữ liệu.",
      "Hệ thống sẽ tự động xác minh tình trạng an toàn của dữ liệu và trả về kết quả trạng thái trên màn hình."
    ],
  },
  {
    id: "policy",
    title: "Quản trị tri thức",
    short: "Thiết lập cấu trúc sơ đồ cây môn học chuẩn, quản lý phân công giảng dạy thông qua AI.",
    detail: "Quản trị chương trình đào tạo của toàn bộ khoa, hỗ trợ phân công môn học thông qua trò chuyện với trợ lý AI hoặc nhập dữ liệu chính sách mới.",
    href: "/policy",
    icon: <Shield size={22} />,
    accent: "from-blue-700 to-indigo-500",
    steps: [
      "[Luồng 1: Sử dụng Trợ lý AI để cập nhật cơ cấu giảng dạy]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Quản trị tri thức' để mở giao diện quản lý.",
      "Tại thẻ 'Trợ lý quy tắc', nhập yêu cầu bằng ngôn ngữ tự nhiên (ví dụ: 'Phân công giảng viên GV001 dạy học phần COMP2010').",
      "Trợ lý AI sẽ tự động phân tích và hiển thị bảng mô phỏng tác động đến quyền truy cập thư mục của giảng viên.",
      "Kiểm tra kỹ thông tin mô phỏng và nhấn 'Xác nhận áp dụng' để hệ thống cập nhật phân quyền tự động.",
      "[Luồng 2: Nhập sơ đồ chính sách môn học từ bên ngoài]",
      "Tại thẻ 'Nhập chính sách', tải lên file tài liệu cấu trúc chương trình đào tạo của khoa.",
      "Hệ thống sẽ phân tích sự thay đổi so với cấu trúc cũ và hiển thị các học phần được thêm mới hoặc bị bãi bỏ.",
      "Bấm nút 'Kích hoạt chính sách mới' để đồng bộ lại cây thư mục chuẩn của toàn bộ hệ thống."
    ],
  },
  {
    id: "governance-rules",
    title: "Quy tắc quản trị",
    short: "Theo dõi các quy tắc chính sách học thuật được áp dụng và truy vết mức độ ảnh hưởng.",
    detail: "Giúp quản trị viên kiểm tra mức độ tuân thủ quy chế, theo dõi các quy định về lưu trữ tài liệu đang hoạt động và tầm ảnh hưởng của chúng.",
    href: "/governance-rules",
    icon: <Scale size={22} />,
    accent: "from-neutral-600 to-neutral-500",
    steps: [
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Quy tắc quản trị' để mở giao diện quản lý.",
      "Nhấp chọn một quy tắc cụ thể trong danh sách ở bảng bên trái.",
      "Ở khung chi tiết bên phải, xem thống kê mức độ ảnh hưởng (số lượng tài liệu bị tác động, số lượng giảng viên chịu ảnh hưởng).",
      "Xem danh sách chi tiết các quyền truy cập được tạo ra hoặc bị thu hồi tương ứng với quy tắc đó ở mục truy vết."
    ],
  },
  {
    id: "users",
    title: "Người dùng",
    short: "Quản lý danh mục tài khoản của cán bộ, giảng viên và phê duyệt yêu cầu thay đổi thông tin.",
    detail: "Nơi quản trị viên cấp mới tài khoản, điều chỉnh thông tin vai trò, quản lý bộ môn giảng dạy và xử lý các yêu cầu cập nhật hồ sơ giảng viên.",
    href: "/users",
    icon: <Users size={22} />,
    accent: "from-purple-600 to-indigo-500",
    steps: [
      "[Luồng 1: Tạo mới và quản lý thông tin tài khoản giảng viên]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Người dùng' để mở giao diện quản lý.",
      "Nhấn nút 'Thêm tài khoản', điền các thông tin bao gồm: Họ tên, Mã giảng viên, Mật khẩu, bộ môn và vai trò tương ứng.",
      "Nhấn 'Tạo tài khoản' để hoàn tất. Bạn có thể nhấn nút chỉnh sửa bên cạnh mỗi tài khoản trong danh sách để thay đổi thông tin hoặc khóa/mở khóa tài khoản.",
      "[Luồng 2: Phê duyệt yêu cầu thay đổi thông tin cá nhân]",
      "Cuộn xuống phần 'Yêu cầu cập nhật hồ sơ' để xem danh sách các yêu cầu sửa đổi họ tên hoặc bộ môn do giảng viên tự gửi lên.",
      "Nhấp chọn 'Phê duyệt' hoặc 'Từ chối' đối với từng yêu cầu sau khi đã xác thực thông tin."
    ],
  },
  {
    id: "permissions",
    title: "Phân quyền",
    short: "Giám sát quyền truy cập tài liệu và xử lý yêu cầu phê duyệt xin quyền.",
    detail: "Giúp người dùng theo dõi các tài liệu mình có quyền đọc/sửa, gửi yêu cầu truy cập tài liệu bị hạn chế và duyệt quyền cho người khác.",
    href: "/permissions",
    icon: <KeyRound size={22} />,
    accent: "from-amber-600 to-yellow-500",
    steps: [
      "[Luồng 1: Gửi yêu cầu xin quyền truy cập tài liệu bị hạn chế]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Phân quyền' để mở giao diện quản lý.",
      "Tại bảng 'Tài liệu bị hạn chế', tìm tài liệu bạn chưa có quyền đọc và nhấn nút 'Xin quyền'.",
      "Hệ thống sẽ gửi yêu cầu phê duyệt trực tiếp đến giảng viên sở hữu tài liệu đó.",
      "[Luồng 2: Phê duyệt hoặc thu hồi yêu cầu xin quyền]",
      "Tại bảng 'Yêu cầu truy cập liên quan', xem các yêu cầu xin quyền từ giảng viên khác đối với tài liệu do bạn sở hữu.",
      "Nhấn nút 'Duyệt' để cấp quyền hoặc 'Từ chối' để bác bỏ yêu cầu.",
      "Đối với các yêu cầu đã duyệt thành công, bạn có thể nhấn nút 'Thu hồi quyền' bất cứ lúc nào để đóng quyền truy cập của họ."
    ],
  },
  {
    id: "backup",
    title: "Sao lưu",
    short: "Đồng bộ tài liệu lên cloud cá nhân và quản lý sao lưu, khôi phục hệ thống.",
    detail: "Hỗ trợ giảng viên kết nối Google Drive/OneDrive để tự động đồng bộ tài liệu, và cung cấp công cụ sao lưu toàn diện cho quản trị viên.",
    href: "/backup",
    icon: <DatabaseBackup size={22} />,
    accent: "from-blue-600 to-sky-500",
    steps: [
      "[Luồng 1: Kết nối và tự động đồng bộ lên Cloud cá nhân]",
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Sao lưu' để mở giao diện quản lý.",
      "Tại mục 'Cloud cá nhân', nhấn nút 'Kết nối' bên cạnh dịch vụ Google Drive hoặc OneDrive và đăng nhập tài khoản của bạn.",
      "Sau khi kết nối thành công, nhấn nút 'Đồng bộ ngay' để sao lưu toàn bộ tài liệu do bạn sở hữu lên tài khoản đám mây cá nhân.",
      "[Luồng 2: Tạo bản sao lưu và khôi phục hệ thống (Dành cho Quản trị viên)]",
      "Xem các chỉ số tuân thủ sao lưu (Chiến lược 3-2-1) và trạng thái hoạt động của các kho lưu trữ hệ thống.",
      "Nhấn nút 'Sao lưu ngay' trên thanh tiêu đề để tạo một bản sao lưu toàn diện hệ thống hiện tại.",
      "Trong danh sách 'Các bản sao lưu hệ thống', nhấn nút 'Khôi phục' bên cạnh một bản ghi cũ để đưa hệ thống quay lại trạng thái cũ."
    ],
  },
  {
    id: "reports",
    title: "Báo cáo",
    short: "Thống kê mức độ sử dụng, tương tác hỏi đáp và đánh giá chất lượng tài liệu.",
    detail: "Bảng phân tích chuyên sâu về tần suất hoạt động của kho tri thức, các lỗi trùng lặp dữ liệu và xuất báo cáo kiểm toán khoa.",
    href: "/reports",
    icon: <BarChart3 size={22} />,
    accent: "from-teal-600 to-emerald-500",
    steps: [
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Báo cáo' để mở giao diện quản lý.",
      "Xem các chỉ số tổng quan gồm lượt hỏi đáp, tổng tài liệu, số tài khoản hoạt động và biểu đồ hoạt động theo loại hành động.",
      "Kiểm tra mục 'Chất lượng kho tri thức' để biết số lượng tài liệu lỗi thời hoặc học phần đang bị thiếu tài liệu.",
      "Nhấp nút 'Xuất báo cáo' ở thanh tiêu đề để tải về tệp dữ liệu báo cáo chi tiết dưới dạng JSON phục vụ phân tích chuyên sâu."
    ],
  },
  {
    id: "audit-logs",
    title: "Nhật ký hệ thống",
    short: "Truy vết và kiểm toán lịch sử hoạt động của người dùng trên toàn bộ hệ thống.",
    detail: "Ghi nhận chi tiết mọi hành động thêm, sửa, xóa tài liệu hoặc thay đổi cấu hình hệ thống của tất cả các tài khoản.",
    href: "/audit-logs",
    icon: <ScrollText size={22} />,
    accent: "from-rose-600 to-red-500",
    steps: [
      "Trỏ chuột vào hoặc nhấp chọn nhóm 'Quản trị' trên thanh điều hướng chính, sau đó nhấp vào mục 'Nhật ký hệ thống' để mở giao diện quản lý.",
      "Nhập mã người dùng, chọn hành động hoặc loại tài nguyên ở bảng 'Bộ lọc nhật ký' để giới hạn phạm vi tìm kiếm.",
      "Xem chi tiết các sự kiện được sắp xếp theo thời gian tại 'Dòng thời gian nhật ký' hoặc xem dưới dạng bảng danh sách kiểm toán ở dưới cùng."
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

export default function GuidePage() {
  const { user } = useAuth();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string>("");

  // Lọc và đổi tên tính năng dựa trên danh sách menu thực tế của tài khoản đăng nhập
  const userMenu = user ? ROLE_MENUS[toAppRole(user.role)] : [];
  const userFeatures = features
    .map((feature) => {
      const menuItem = userMenu.find((item) => item.href.split("?")[0] === feature.href.split("?")[0]);
      if (menuItem) {
        return { ...feature, title: menuItem.label };
      }
      return feature;
    })
    .filter((feature) =>
      userMenu.some((menuItem) => menuItem.href.split("?")[0] === feature.href.split("?")[0])
    );

  // Đặt tính năng đầu tiên làm mặc định khi tải trang
  useEffect(() => {
    if (userFeatures.length > 0 && !activeGuideId) {
      setActiveGuideId(userFeatures[0].id);
    }
  }, [userFeatures, activeGuideId]);

  function selectFeature(id: string) {
    setActiveGuideId(id);
    document.getElementById("huong-dan-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-6">
      <PageHeader
        eyebrow="Tài liệu hỗ trợ"
        title="Hướng dẫn sử dụng hệ thống"
        description="Tổng quan chức năng và hướng dẫn chi tiết cách sử dụng các tính năng trong hệ thống lưu trữ tri thức EduVault."
      />

      {/* Grid Chức năng */}
      <section className="py-4">
        <Reveal className="mb-6 max-w-3xl">
          <h2 className="text-xl font-black tracking-tight text-[var(--text)] md:text-2xl">Tổng quan chức năng</h2>
        </Reveal>
        <div className="feature-grid">
          {userFeatures.map((feature, index) => (
            <Reveal key={feature.id} delay={index * 50}>
              <button
                onMouseEnter={() => setHoveredId(feature.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(feature.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => selectFeature(feature.id)}
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
      </section>

      {/* Hướng dẫn chi tiết */}
      <section id="huong-dan-section" className="py-4">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mb-6 text-center">
            <h2 className="text-xl font-black text-[var(--text)]">Hướng dẫn sử dụng chi tiết</h2>
          </Reveal>

          <div className="space-y-5">
            {userFeatures.filter(f => f.id === activeGuideId).map((feature) => (
              <Reveal key={feature.id} delay={0}>
                <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
                  <div className="flex w-full items-center gap-4 p-5 border-b border-[var(--border)]">
                    <span className="text-[var(--text)] shrink-0">
                      {feature.icon}
                    </span>
                    <div>
                      <span className="block text-base font-black text-[var(--text)]">{feature.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{feature.short}</span>
                    </div>
                  </div>
                  <div className="p-5 space-y-6">
                    <div>
                      <p className="text-sm leading-7 text-[var(--muted)]">{feature.detail}</p>
                    </div>
                    {feature.steps.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Quy trình thực hiện:</h4>
                        <div className="grid gap-3 md:grid-cols-3">
                          {feature.steps.map((step, idx) => {
                            const isHeader = step.startsWith("[") && step.endsWith("]");
                            if (isHeader) {
                              return (
                                <div key={idx} className="col-span-full mt-3 first:mt-0 mb-1">
                                  <h5 className="text-xs font-bold text-[#C92027] dark:text-red-400 uppercase tracking-wider">{step.slice(1, -1)}</h5>
                                </div>
                              );
                            }
                            const stepNum = feature.steps.slice(0, idx).filter(s => !(s.startsWith("[") && s.endsWith("]"))).length + 1;
                            return (
                              <div key={idx} className="rounded-lg border border-[var(--border)] bg-[var(--soft)] p-4">
                                <span className="inline-block text-[11px] font-black text-[#C92027] mb-2">BƯỚC {stepNum}</span>
                                <p className="text-xs font-semibold leading-5 text-[var(--text)]">{step}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[var(--border)]">
                      <Link href={feature.href} className="inline-flex items-center gap-1 text-sm font-bold text-[#102451] hover:text-[#C92027] dark:text-cyan-200">
                        Mở chức năng này <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
