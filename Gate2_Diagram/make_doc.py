from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import os

FOLDER = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(FOLDER, "EduVault_Architecture_v2.docx")

doc = Document()

# ── Page margins ──────────────────────────────────────────
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
section = doc.sections[0]
section.top_margin    = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin   = Inches(1.1)
section.right_margin  = Inches(1.1)

# ── Helpers ───────────────────────────────────────────────
def add_title(doc, text):
    p = doc.add_heading(text, level=1)
    p.runs[0].font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
    p.runs[0].font.size = Pt(15)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(6)

def add_label(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(0x37, 0x51, 0x8C)
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(2)

def add_body(doc, text):
    p = doc.add_paragraph(text)
    p.runs[0].font.size = Pt(11)
    p.paragraph_format.space_after  = Pt(4)
    p.paragraph_format.left_indent  = Inches(0.2)

def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.add_run(text).font.size = Pt(11)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Inches(0.3)

def add_divider(doc):
    doc.add_paragraph("")

# ══════════════════════════════════════════════════════════
#  COVER
# ══════════════════════════════════════════════════════════
h = doc.add_heading("EduVault", 0)
h.alignment = WD_ALIGN_PARAGRAPH.CENTER

sub = doc.add_paragraph("Architecture Diagrams — Gate 2 Deliverable")
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sub.runs[0].font.size = Pt(14)
sub.runs[0].bold = True

info = doc.add_paragraph()
info.alignment = WD_ALIGN_PARAGRAPH.CENTER
info.add_run("\nHệ thống kho lưu trữ tri thức học thuật\n")
info.add_run("Stack: Next.js 15  ·  FastAPI  ·  SQLite  ·  OpenAI API\n")
info.add_run("Team C2-App-012  ·  Nguyễn Đức Hiệu")
for run in info.runs:
    run.font.size = Pt(12)

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 1 — System Architecture Overview
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 1 — System Architecture Overview")

add_body(doc,
    "Sơ đồ tổng quan kiến trúc toàn hệ thống EduVault, thể hiện mối liên hệ "
    "giữa ba tầng chính: Frontend, Backend và Storage/External Services."
)

add_label(doc, "Frontend — Next.js 15 (port 3000)")
add_bullet(doc, "10 trang chức năng: Dashboard, Kho tài liệu, Chi tiết tài liệu + AI Chat, "
                "Trợ lý AI, Hồ sơ, Quản lý người dùng, Policy, Backup, Báo cáo, Chuyển giao tri thức.")
add_bullet(doc, "4 component cốt lõi: AuthProvider (quản lý JWT + session), AppShell "
                "(navigation, upload notifications, dark mode), UploadTaskProvider "
                "(trạng thái upload bất đồng bộ), PermissionGuard (kiểm soát truy cập route).")
add_bullet(doc, "localStorage lưu lịch sử hội thoại AI theo key riêng từng người dùng.")

add_label(doc, "Backend — FastAPI (port 8000) · ~80 endpoints")
add_bullet(doc, "Auth: đăng nhập / đăng xuất bằng JWT.")
add_bullet(doc, "Documents: CRUD tài liệu, upload async 3 bước, search, versioning, trash.")
add_bullet(doc, "AI/RAG: POST /api/ask — hybrid search + LLM answer generation.")
add_bullet(doc, "Folder & Policy: cây thư mục theo policy, gợi ý folder tự động.")
add_bullet(doc, "Profile: đổi mật khẩu, yêu cầu cập nhật hồ sơ, admin duyệt/từ chối.")
add_bullet(doc, "Admin: quản lý users, policies, backup, storages.")
add_bullet(doc, "Cloud Sync: kết nối và đồng bộ Google Drive / OneDrive qua OAuth2.")
add_bullet(doc, "Reports: usage report, compliance report, quality report, dashboard.")

add_label(doc, "Backend Core Modules")
add_bullet(doc, "services.py — RAG pipeline, chunking, policy tree, folder tree, knowledge summary.")
add_bullet(doc, "ai.py (AIProvider) — OCR ảnh, embedding văn bản, sinh câu trả lời, phân loại metadata.")
add_bullet(doc, "database.py — khởi tạo SQLite, connection pool, hash password.")
add_bullet(doc, "infrastructure.py — MinIO (object storage), Qdrant (vector DB), RabbitMQ (event bus).")
add_bullet(doc, "cloud.py — OAuth2 flow, upload file lên Google Drive / OneDrive.")

add_label(doc, "Storage & External Services")
add_bullet(doc, "SQLite: 29 bảng — lưu toàn bộ dữ liệu nghiệp vụ.")
add_bullet(doc, "Local Filesystem: STORAGE_DIR (file gốc), BACKUP_DIR (bản sao lưu).")
add_bullet(doc, "MinIO, Qdrant, RabbitMQ: optional — hệ thống fallback về local khi chưa cấu hình.")
add_bullet(doc, "OpenAI API: gpt-5.4-mini (chat/answer), gpt-4o-mini (OCR), text-embedding-3-small.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 2 — RBAC & Permission Matrix
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 2 — RBAC & Permission Matrix")

add_body(doc,
    "Sơ đồ ma trận phân quyền theo vai trò (Role-Based Access Control). "
    "Hệ thống có 4 vai trò, mỗi vai trò được gán một tập permissions cụ thể. "
    "Permissions được kiểm tra tại 2 tầng: route guard trên frontend "
    "và SQL WHERE clause trên backend."
)

add_label(doc, "ADMIN — Quản trị viên")
add_bullet(doc, "Quyền: dashboard.view, repository.view, policy.manage, users.manage, "
                "permissions.manage, backup.manage, cloud.sync, reports.view, audit.view.")
add_bullet(doc, "Có thể xem toàn bộ kho tài liệu, quản lý người dùng, duyệt yêu cầu hồ sơ, "
                "cấu hình policy, xem audit log.")

add_label(doc, "HEAD_OF_DEPARTMENT — Trưởng bộ môn")
add_bullet(doc, "Quyền: dashboard.view, repository.view, cloud.sync, transfer.manage, "
                "quality.view, reports.view.")
add_bullet(doc, "Xem kho tài liệu toàn khoa, theo dõi chất lượng, quản lý chuyển giao tri thức, "
                "đồng bộ cloud.")

add_label(doc, "LECTURER — Giảng viên")
add_bullet(doc, "Quyền: dashboard.view, repository.own, repository.upload, cloud.sync, "
                "versions.view, chatbot.use, profile.manage.")
add_bullet(doc, "Chỉ xem và upload tài liệu của mình, dùng chatbot AI, "
                "xem lịch sử phiên bản, cập nhật hồ sơ cá nhân.")

add_label(doc, "NEW_LECTURER — Giảng viên mới")
add_bullet(doc, "Quyền: dashboard.view, cloud.sync, handover.view, knowledge.summary, "
                "chatbot.use, profile.manage.")
add_bullet(doc, "Chỉ xem kho bàn giao, dùng chatbot và tóm tắt tri thức để onboarding nhanh.")

add_label(doc, "Cơ chế enforce")
add_bullet(doc, "Frontend: PermissionGuard kiểm tra permissions trước khi render route.")
add_bullet(doc, "Backend: mỗi endpoint dùng Depends(require_roles(...)) hoặc "
                "SQL WHERE owner_code = user.code để đảm bảo dữ liệu không bị lộ.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 3 — Database Schema
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 3 — Database Schema (ER Diagram)")

add_body(doc,
    "Sơ đồ quan hệ thực thể (ER) của 14 bảng chính trong SQLite (tổng 29 bảng). "
    "Các bảng được tổ chức theo 4 nhóm chức năng chính."
)

add_label(doc, "Nhóm User & Auth")
add_bullet(doc, "users: lưu thông tin người dùng (code, name, role, department, password_hash).")
add_bullet(doc, "sessions: JWT session token theo từng user, có thời hạn.")
add_bullet(doc, "profile_update_requests: yêu cầu cập nhật tên/khoa do admin duyệt, "
                "lưu trạng thái pending/approved/rejected.")

add_label(doc, "Nhóm Documents & Versioning")
add_bullet(doc, "documents: tài liệu chính (title, topic, doc_type, visibility, owner, folder, status).")
add_bullet(doc, "versions: lịch sử phiên bản của tài liệu (version_no, content_hash, created_by).")
add_bullet(doc, "file_assets: file vật lý gắn với từng version (filename, mime_type, storage_uri).")
add_bullet(doc, "chunks: đoạn văn bản sau khi chunking, kèm vector JSON để tìm kiếm ngữ nghĩa.")
add_bullet(doc, "upload_tasks: task upload bất đồng bộ 3 bước (init → file → confirm).")
add_bullet(doc, "document_processing_jobs: theo dõi tiến trình OCR/chunking/embedding.")
add_bullet(doc, "access_requests: yêu cầu truy cập tài liệu private.")

add_label(doc, "Nhóm Folder & Policy")
add_bullet(doc, "folder_nodes: cây thư mục phân cấp theo policy (parent_id, name, node_type).")
add_bullet(doc, "specializations: nhóm chuyên môn trong policy, liên kết giảng viên vào chuyên ngành.")
add_bullet(doc, "lecturer_specializations: mapping giảng viên ↔ chuyên môn (N-N).")

add_label(doc, "Nhóm Operations & Cloud")
add_bullet(doc, "audit_logs: ghi lại mọi hành động (actor, action, resource_type, resource_id, detail_json).")
add_bullet(doc, "cloud_connections: thông tin kết nối OAuth2 Google Drive/OneDrive theo từng user.")
add_bullet(doc, "backup_logs, transfers, external_storages: quản lý sao lưu và chuyển giao tài liệu.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 4 — RAG Query Pipeline
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 4 — RAG Query Pipeline (Data Flow)")

add_body(doc,
    "Luồng xử lý câu hỏi của người dùng theo pipeline RAG (Retrieval-Augmented Generation). "
    "Toàn bộ pipeline chạy trong hàm ask() của services.py, gồm 7 bước tuần tự."
)

add_label(doc, "Bước 1 — Nhận câu hỏi & xác thực")
add_bullet(doc, "Frontend gửi POST /api/ask {question} kèm Bearer JWT.")
add_bullet(doc, "Backend xác thực token qua current_user(), xác định quyền của người dùng.")

add_label(doc, "Bước 2 — Intent Classification")
add_bullet(doc, "Hàm _query_intent(question) phân loại câu hỏi thành 3 loại: "
                "keyword (tìm tài liệu cụ thể), semantic (hỏi về chủ đề), mixed (kết hợp).")
add_bullet(doc, "Loại intent quyết định trọng số giữa lexical score và vector score ở bước sau.")

add_label(doc, "Bước 3 — Permission Filter")
add_bullet(doc, "rag_documents(db, user) truy vấn SQL lấy danh sách tài liệu được phép xem:")
add_bullet(doc, "  → visibility = 'public'  HOẶC  owner_code = user.code  "
                "HOẶC  có access_request được approved.")
add_bullet(doc, "Tuyệt đối không dùng LLM để kiểm soát quyền — enforce tại tầng SQL.")

add_label(doc, "Bước 4 — Lexical Search (BM25-like)")
add_bullet(doc, "lexical_score() tính điểm dựa trên số từ khóa của câu hỏi xuất hiện "
                "trong title, topic và content của từng tài liệu.")

add_label(doc, "Bước 5 — Vector Search")
add_bullet(doc, "ai.py embed(question) gọi OpenAI text-embedding-3-small → vector 1536 chiều.")
add_bullet(doc, "Tính cosine similarity giữa query vector và vector_json của từng chunk trong SQLite.")
add_bullet(doc, "Nếu Qdrant configured → dùng Qdrant ANN search thay cho full-scan.")

add_label(doc, "Bước 6 — Merge & Rerank")
add_bullet(doc, "merge_ranked_matches() kết hợp điểm lexical + vector theo trọng số intent.")
add_bullet(doc, "Chọn Top-K chunks có điểm cao nhất làm context cho LLM.")

add_label(doc, "Bước 7 — Answer Generation")
add_bullet(doc, "ai.py answer() gọi gpt-5.4-mini với:")
add_bullet(doc, "  → System prompt: trả lời thẳng, không mở đầu bằng 'Nguồn tài liệu', "
                "không thêm gợi ý câu hỏi.")
add_bullet(doc, "  → Context: nội dung top chunks (tối đa 6000 chars mỗi chunk).")
add_bullet(doc, "  → Question: câu hỏi gốc của người dùng.")

add_label(doc, "Bước 8 — Post-process & Response")
add_bullet(doc, "ensure_conversational_format() strip phần nguồn tham khảo tự phát sinh "
                "trong câu trả lời.")
add_bullet(doc, "Trả về JSON: {answer, citations[], pipeline[], scope}.")
add_bullet(doc, "Frontend hiển thị câu trả lời + citations dạng collapsible, "
                "đồng thời lưu vào localStorage theo key riêng từng user.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 5 — Upload & Processing Pipeline
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 5 — Document Upload & Processing Pipeline")

add_body(doc,
    "Luồng upload và xử lý tài liệu theo quy trình bất đồng bộ 4 bước + background processing. "
    "Thiết kế theo pattern async upload để không block UI trong khi AI phân tích."
)

add_label(doc, "Bước 1 — Init Upload Task")
add_bullet(doc, "POST /api/uploads/init — tạo upload_task record trong DB, status: pending.")
add_bullet(doc, "Trả về task_id để frontend tracking tiến trình.")

add_label(doc, "Bước 2 — Upload File")
add_bullet(doc, "POST /api/uploads/{task_id}/file — nhận raw bytes, lưu vào STORAGE_DIR.")
add_bullet(doc, "quick_preview_text() extract ~1000 ký tự đầu để AI phân tích nhanh.")

add_label(doc, "Bước 3 — AI Analyze")
add_bullet(doc, "POST /api/uploads/{task_id}/analyze — gọi guess_metadata() dùng gpt-5.4-mini "
                "để phân loại: title, topic, doc_type, keywords, summary.")
add_bullet(doc, "suggest_upload_destination() + folder_assignment_from_metadata() "
                "gợi ý vị trí lưu trong cây thư mục dựa theo policy hiện tại.")
add_bullet(doc, "Frontend hiển thị kết quả AI để user xem trước và chỉnh sửa nếu cần.")

add_label(doc, "Bước 4 — Confirm & Create")
add_bullet(doc, "POST /api/uploads/{task_id}/confirm — user xác nhận metadata và folder.")
add_bullet(doc, "create_document() tạo document record + version record trong DB.")
add_bullet(doc, "Trigger background processing pipeline.")

add_label(doc, "Background Processing Pipeline")
add_bullet(doc, "extract_text(): parse nội dung từ PDF (PyPDF), DOCX (python-docx), "
                "PPTX (python-pptx).")
add_bullet(doc, "meaningful_text_score() đánh giá chất lượng text trích xuất được:")
add_bullet(doc, "  → Score > 30: có đủ text, bỏ qua OCR.")
add_bullet(doc, "  → Score ≤ 30: tài liệu dạng scan/ảnh → gọi gpt-4o-mini OCR "
                "để trích xuất text từ từng trang ảnh (tối đa 10 trang).")
add_bullet(doc, "Chunking: chia text thành các đoạn ~1200 ký tự, tối đa 100 chunks/tài liệu.")
add_bullet(doc, "Embed: gọi text-embedding-3-small cho từng chunk → vector 1536 chiều.")
add_bullet(doc, "Lưu vào chunks table (SQLite) + upsert vào Qdrant nếu configured.")
add_bullet(doc, "set_v2_state(status=indexed) + emit_outbox(document.indexed) → "
                "tài liệu sẵn sàng tìm kiếm.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 6 — Authentication & Session Flow
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 6 — Authentication & Session Flow")

add_body(doc,
    "Luồng xác thực người dùng và quản lý phiên làm việc, "
    "bao gồm restore session khi reload trang và xử lý token hết hạn."
)

add_label(doc, "Khởi động app — Restore Session")
add_bullet(doc, "AuthProvider kiểm tra sessionStorage trước (key: eduvault_session) "
                "→ nếu có, restore ngay mà không cần gọi API.")
add_bullet(doc, "Nếu không có trong sessionStorage, kiểm tra localStorage "
                "(key: eduvault_token) → gọi GET /api/dashboard để verify token còn hiệu lực.")
add_bullet(doc, "Nếu cả hai đều trống → user chưa đăng nhập, hiện trang login.")

add_label(doc, "Login Flow")
add_bullet(doc, "User nhập mã giảng viên (code) + mật khẩu → POST /api/auth/login.")
add_bullet(doc, "Backend: hash_secret(password) → so sánh với DB → tạo JWT token mới "
                "→ insert vào bảng sessions.")
add_bullet(doc, "Trả về {token: JWT, user: {code, name, role, department, ...}}.")
add_bullet(doc, "Frontend: lưu token vào localStorage (persistent cross-tab), "
                "lưu {token, user} vào sessionStorage (tab hiện tại).")
add_bullet(doc, "normalizeUser() + permissionsForRole(user.role) → "
                "tính danh sách permissions → redirect về trang phù hợp theo role.")

add_label(doc, "Mỗi API Request")
add_bullet(doc, "AuthProvider gắn Authorization: Bearer <token> vào mọi request qua "
                "hàm request() wrapper.")
add_bullet(doc, "Backend current_user(): decode JWT, query sessions table xác nhận token tồn tại.")

add_label(doc, "Xử lý Token Hết Hạn / Invalid")
add_bullet(doc, "API trả về 401 Unauthorized → AuthProvider bắt lỗi trong request().")
add_bullet(doc, "Xóa localStorage và sessionStorage → setUser(null) → "
                "tự động redirect về trang login.")
add_bullet(doc, "Không cần user thao tác thêm — toàn bộ flow tự động.")

doc.add_page_break()

# ══════════════════════════════════════════════════════════
#  DIAGRAM 7 — Cloud Sync Flow
# ══════════════════════════════════════════════════════════
add_title(doc, "Diagram 7 — Cloud Sync Flow (Google Drive / OneDrive)")

add_body(doc,
    "Luồng đồng bộ tài liệu lên cloud storage qua chuẩn OAuth2. "
    "Hỗ trợ cả Google Drive API và OneDrive API với cùng một giao diện thống nhất."
)

add_label(doc, "Kết nối Cloud (Connect)")
add_bullet(doc, "User vào /backup → tab Cloud Sync → bấm Connect Google Drive / OneDrive.")
add_bullet(doc, "POST /api/cloud/connect: cloud.py tạo authorization_url() "
                "→ lưu oauth_states record (state token để chống CSRF) "
                "→ trả về URL redirect.")
add_bullet(doc, "Frontend redirect user đến trang đăng nhập Google / Microsoft.")
add_bullet(doc, "User cấp quyền → Google/Microsoft redirect về "
                "GET /api/cloud/callback/{provider}?code=...&state=...")

add_label(doc, "Xử lý Callback")
add_bullet(doc, "exchange_code(): xác minh state token trong oauth_states table "
                "(chống CSRF attack).")
add_bullet(doc, "Đổi authorization code lấy access_token + refresh_token từ Google/Microsoft.")
add_bullet(doc, "Lưu vào bảng cloud_connections (user_code, provider, account_email, "
                "access_token encrypted, refresh_token encrypted, status: connected).")

add_label(doc, "Đồng bộ tài liệu (Sync)")
add_bullet(doc, "User chọn tài liệu → bấm Sync → "
                "POST /api/cloud/connections/{provider}/sync.")
add_bullet(doc, "sync_user_document(): đọc file từ STORAGE_DIR, gọi _upload() "
                "để upload lên Google Drive / OneDrive qua API.")
add_bullet(doc, "Nếu access_token hết hạn → _refresh_access_token() tự động làm mới "
                "trước khi upload.")
add_bullet(doc, "Ghi kết quả vào cloud_sync_logs (status, detail, created_at).")
add_bullet(doc, "Trả về danh sách sync_logs để frontend cập nhật trạng thái.")

add_label(doc, "Bảo mật")
add_bullet(doc, "access_token và refresh_token được mã hóa bằng Fernet "
                "trước khi lưu vào DB (_protect() / _unprotect()).")
add_bullet(doc, "State token xác minh một lần, xóa sau khi callback thành công.")

# ══════════════════════════════════════════════════════════
#  SAVE
# ══════════════════════════════════════════════════════════
doc.save(OUTPUT)
print(f"Done: {OUTPUT}")
