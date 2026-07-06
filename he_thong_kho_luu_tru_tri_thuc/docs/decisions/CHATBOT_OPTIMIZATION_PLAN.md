# Kế hoạch tối ưu Chatbot EduVault theo từng vai trò & kịch bản

## 1. Tổng quan hệ thống phân quyền

| Role | Label | Mô tả |
|------|-------|-------|
| `admin` | Quản trị viên | Toàn quyền hệ thống |
| `head` | Trưởng bộ môn | Quản lý tri thức, báo cáo, chuyển giao |
| `lecturer` | Giảng viên | Upload, quản lý tài liệu cá nhân |
| `new_lecturer` | Giảng viên mới | Tiếp cận, học hỏi, nhận chuyển giao |

---

## 2. Chức năng theo từng vai trò

### 2.1 ADMIN — Quản trị viên
| Trang | Route | Chức năng |
|-------|-------|-----------|
| Vận hành | `/operations` | Theo dõi hệ thống, backup, n8n workflows |
| Tổng quan | `/` | Dashboard thống kê toàn hệ thống |
| Tìm kiếm | `/search` | Tìm tài liệu toàn kho |
| Kho tri thức | `/repository` | Xem/quản lý toàn bộ tài liệu |
| Thùng rác | `/trash` | Khôi phục / xóa vĩnh viễn tài liệu |
| Quản trị tri thức | `/policy` | Upload/activate policy (cây chuyên ngành-học phần) |
| Quy tắc quản trị | `/governance-rules` | Cấu hình quy tắc phân loại, visibility |
| Người dùng | `/users` | Tạo/sửa/xóa tài khoản |
| Phân quyền | `/permissions` | Assign giảng viên vào chuyên ngành |
| Sao lưu | `/backup` | Cấu hình cloud sync, lịch sử backup |
| Báo cáo | `/reports` | Thống kê tài liệu, hoạt động người dùng |
| Nhật ký hệ thống | `/audit-logs` | Xem toàn bộ log hệ thống |

### 2.2 HEAD — Trưởng bộ môn
| Trang | Route | Chức năng |
|-------|-------|-----------|
| Tổng quan | `/` | Dashboard tri thức bộ môn |
| Tìm kiếm | `/search` | Tìm tài liệu trong phạm vi bộ môn |
| Kho tri thức | `/repository` | Xem tài liệu của toàn bộ môn |
| Thùng rác | `/trash` | Quản lý tài liệu đã xóa |
| Quản trị tri thức | `/policy` | Cập nhật cây tri thức |
| Quy tắc quản trị | `/governance-rules` | Xem/đề xuất quy tắc |
| Đồng bộ | `/backup` | Sync Google Drive / OneDrive |
| Chuyển giao tri thức | `/knowledge-transfer` | Phân tích gap, lập kế hoạch chuyển giao |
| Trợ lý AI | `/assistant` | Hỏi đáp, phân tích tri thức bộ môn |
| Báo cáo | `/reports` | Báo cáo chất lượng tri thức |

### 2.3 LECTURER — Giảng viên
| Trang | Route | Chức năng |
|-------|-------|-----------|
| Tổng quan | `/` | Dashboard tài liệu cá nhân |
| Tìm kiếm | `/search` | Tìm trong phạm vi được phép |
| Kho tri thức | `/repository` | Upload, quản lý tài liệu cá nhân |
| Thùng rác | `/trash` | Khôi phục tài liệu đã xóa |
| Đồng bộ | `/backup` | Sync tài liệu từ cloud cá nhân |
| Phiên bản | `/versions` | Xem lịch sử phiên bản tài liệu |
| Trợ lý AI | `/assistant` | Hỏi đáp, tóm tắt tài liệu |
| Hồ sơ | `/profile` | Cập nhật thông tin cá nhân |

### 2.4 NEW_LECTURER — Giảng viên mới
| Trang | Route | Chức năng |
|-------|-------|-----------|
| Tổng quan | `/` | Dashboard onboarding |
| Tìm kiếm | `/search` | Tìm tài liệu công khai |
| Chuyển giao tri thức | `/knowledge-transfer` | Xem tài liệu được chuyển giao |
| Đồng bộ | `/backup` | Sync tài liệu cá nhân |
| Trợ lý AI | `/assistant` | Hỏi đáp, hỗ trợ onboarding |
| Hồ sơ | `/profile` | Cập nhật thông tin |

---

## 3. Kiến trúc chatbot hiện tại

### Pipeline hiện tại (`ask()` trong `services.py`):
```
Câu hỏi → rewrite_query → decompose_query → expand_terms
        → classify_query_intent → hybrid_retrieval (vector + BM25)
        → rerank → filter_by_intent → ai_provider.answer()
```

### Các intent hiện có:
| Intent | Trigger | Xử lý |
|--------|---------|-------|
| `document_location` | "tài liệu X ở đâu", "tìm file" | Trả metadata trực tiếp |
| `document_lookup` | "mở tài liệu", "pdf", "file" | Tìm tài liệu cụ thể |
| `topic_search` | "chủ đề", "liên quan đến", "tổng hợp" | Tìm theo chủ đề |
| `create_document` | "tạo mẫu", "soạn", "template" | Tạo nội dung |
| `question_answer` | Mặc định | RAG Q&A |

### Vấn đề hiện tại:
1. **Không phân biệt role** — chatbot trả lời giống nhau cho mọi vai trò
2. **Không có context theo trang** — hỏi khi đang ở `/repository` vs `/policy` không khác nhau
3. **Intent quá đơn giản** — thiếu intent cho upload, governance, phân quyền, báo cáo
4. **Không gợi ý action** — trả lời xong không hướng dẫn bước tiếp theo

---

## 4. Kế hoạch tối ưu theo vai trò & kịch bản

### 4.1 ADMIN — Các kịch bản cần tối ưu

#### Kịch bản A1: Hỏi về quản lý người dùng
- **Ví dụ**: "Tạo tài khoản cho giảng viên mới như thế nào?", "GV001 có quyền gì?"
- **Cần thêm intent**: `user_management`
- **Tối ưu**: Trả về hướng dẫn cụ thể + link `/users`, kèm danh sách user hiện tại nếu hỏi về quyền
- **Context inject**: Danh sách users, role hiện tại của từng người

#### Kịch bản A2: Hỏi về policy/cây tri thức
- **Ví dụ**: "Upload policy mới như thế nào?", "Thêm học phần vào Data Science"
- **Cần thêm intent**: `policy_management`
- **Tối ưu**: Hướng dẫn từng bước + gợi ý dùng Policy Assistant
- **Context inject**: Policy đang active, danh sách chuyên ngành hiện tại

#### Kịch bản A3: Hỏi về hệ thống / audit
- **Ví dụ**: "Hôm nay có lỗi gì không?", "Ai đã xóa tài liệu X?"
- **Cần thêm intent**: `system_status`, `audit_query`
- **Tối ưu**: Query thẳng vào audit_logs + trả kết quả có cấu trúc
- **Context inject**: Recent audit logs (N=20), lỗi hệ thống gần nhất

#### Kịch bản A4: Báo cáo thống kê
- **Ví dụ**: "Tuần này upload bao nhiêu tài liệu?", "Chuyên ngành nào có ít tài liệu nhất?"
- **Cần thêm intent**: `analytics_query`
- **Tối ưu**: Query DB → trả bảng thống kê có format
- **Context inject**: Snapshot thống kê dashboard

---

### 4.2 HEAD — Các kịch bản cần tối ưu

#### Kịch bản H1: Phân tích tri thức bộ môn
- **Ví dụ**: "Học phần nào đang thiếu tài liệu?", "Chất lượng kho tri thức thế nào?"
- **Cần thêm intent**: `knowledge_gap_analysis`
- **Tối ưu**: Gọi `knowledge_transfer_course_gaps()` → format kết quả rõ ràng
- **Context inject**: Kết quả gap analysis theo chuyên ngành của user

#### Kịch bản H2: Chuyển giao tri thức
- **Ví dụ**: "GV001 sắp nghỉ, cần bàn giao những gì?", "Ai đang nắm giữ tri thức quan trọng nhất?"
- **Cần thêm intent**: `knowledge_transfer`
- **Tối ưu**: Phân tích dependency, gợi ý danh sách tài liệu cần bàn giao
- **Context inject**: `knowledge_transfer_lecturer_dependency()` kết quả

#### Kịch bản H3: Governance / quy tắc
- **Ví dụ**: "Đề thi có được phép xem trước khi thi không?", "Quy tắc visibility cho tài liệu riêng tư?"
- **Cần thêm intent**: `governance_query`
- **Tối ưu**: Trả quy tắc từ policy hiện tại + giải thích
- **Context inject**: Active policy rules, governance rules

#### Kịch bản H4: Báo cáo cho ban lãnh đạo
- **Ví dụ**: "Tóm tắt tình trạng kho tri thức tháng này"
- **Cần thêm intent**: `summary_report`
- **Tối ưu**: Generate báo cáo tổng hợp dạng bullet points có số liệu

---

### 4.3 LECTURER — Các kịch bản cần tối ưu

#### Kịch bản L1: Upload tài liệu
- **Ví dụ**: "Upload file lên đâu?", "Tôi không có quyền lưu vào Deep Learning"
- **Cần thêm intent**: `upload_help`
- **Tối ưu**: Hướng dẫn từng bước + kiểm tra assignment của user → gợi ý đúng folder
- **Context inject**: `user_specializations()`, `allowed_folder_node_ids()`

#### Kịch bản L2: Tìm tài liệu của mình
- **Ví dụ**: "Tài liệu tôi đã upload ở đâu?", "Phiên bản cũ của file AI bài giảng"
- **Cần thêm intent**: `own_document_lookup`
- **Tối ưu**: Filter thẳng theo `owner_code = user.code` → trả danh sách
- **Context inject**: Danh sách tài liệu của user (title, version, path, date)

#### Kịch bản L3: Hỏi về nội dung tài liệu
- **Ví dụ**: "Tóm tắt bài giảng Trí tuệ nhân tạo cho tôi"
- **Cần thêm intent**: `document_summarize` (nếu chỉ có 1 tài liệu khớp)
- **Tối ưu**: Nếu 1 tài liệu khớp → tóm tắt toàn bộ; nhiều tài liệu → liệt kê để chọn
- **Context inject**: Nội dung tài liệu nếu score cao (>0.8)

#### Kịch bản L4: Phiên bản & lịch sử
- **Ví dụ**: "File này có bao nhiêu phiên bản?", "Khôi phục phiên bản cũ"
- **Cần thêm intent**: `version_management`
- **Tối ưu**: Query `versions` table → trả timeline + link khôi phục
- **Context inject**: Lịch sử phiên bản tài liệu đang xem

---

### 4.4 NEW_LECTURER — Các kịch bản cần tối ưu

#### Kịch bản N1: Onboarding / làm quen hệ thống
- **Ví dụ**: "Tôi mới vào, cần làm gì trước?", "Hệ thống này dùng để làm gì?"
- **Cần thêm intent**: `onboarding_guide`
- **Tối ưu**: Trả checklist onboarding có thứ tự ưu tiên + link từng bước
- **System prompt riêng**: Friendly, hướng dẫn từng bước nhỏ

#### Kịch bản N2: Tìm tài liệu được chuyển giao
- **Ví dụ**: "Tôi được bàn giao những tài liệu nào?", "Giảng viên cũ để lại gì?"
- **Cần thêm intent**: `handover_lookup`
- **Tối ưu**: Query `lecturer_assignments` + handover packages → trả danh sách
- **Context inject**: Danh sách tài liệu được chuyển giao cho user

#### Kịch bản N3: Hỏi về nội dung học thuật
- **Ví dụ**: "Đề cương môn AI gồm những gì?"
- **Tối ưu**: Ưu tiên tài liệu công khai (visibility=public) → tóm tắt
- **System prompt**: Giải thích kỹ hơn, dùng ngôn ngữ thân thiện hơn

---

## 5. Thay đổi kỹ thuật cần thực hiện

### 5.1 Thêm role-aware system prompt
```python
SYSTEM_PROMPTS = {
    "admin": "Bạn là trợ lý cho Quản trị viên EduVault. Ưu tiên thông tin hệ thống, audit, quản lý người dùng.",
    "head": "Bạn là trợ lý cho Trưởng bộ môn. Ưu tiên phân tích tri thức, gap analysis, báo cáo.",
    "lecturer": "Bạn là trợ lý cho Giảng viên. Ưu tiên tài liệu cá nhân, upload, tóm tắt nội dung.",
    "new_lecturer": "Bạn là trợ lý cho Giảng viên mới. Ngôn ngữ thân thiện, hướng dẫn từng bước, tập trung vào onboarding.",
}
```

### 5.2 Thêm context injection theo role
```python
def build_user_context(db, user: dict) -> str:
    role = user["role"]
    if role == "admin":
        # Inject: user count, recent errors, system status
    elif role == "head":
        # Inject: knowledge gaps, lecturer assignments, recent uploads
    elif role == "lecturer":
        # Inject: own documents, specializations, recent uploads
    elif role == "new_lecturer":
        # Inject: handover documents, onboarding checklist
```

### 5.3 Thêm page context (trang hiện tại)
- Frontend gửi thêm `current_page` trong request
- Backend dùng để filter intent và context:
  - Đang ở `/repository` → ưu tiên intent liên quan đến tài liệu
  - Đang ở `/policy` → ưu tiên intent liên quan đến governance
  - Đang ở `/knowledge-transfer` → ưu tiên intent gap analysis

### 5.4 Mở rộng intent classifier
Thêm các intent mới vào `classify_query_intent()`:
```python
new_intents = [
    "user_management",      # admin: hỏi về user/quyền
    "policy_management",    # admin/head: hỏi về policy/tree
    "system_status",        # admin: hỏi về lỗi/vận hành
    "analytics_query",      # admin/head: thống kê số liệu
    "knowledge_gap_analysis",# head: gap analysis
    "knowledge_transfer",   # head: chuyển giao
    "upload_help",          # lecturer: trợ giúp upload
    "own_document_lookup",  # lecturer: tài liệu của mình
    "version_management",   # lecturer: phiên bản
    "onboarding_guide",     # new_lecturer: hướng dẫn mới
    "handover_lookup",      # new_lecturer: tài liệu bàn giao
]
```

### 5.5 Thêm action suggestions vào response
Mỗi câu trả lời nên kèm `suggested_actions`:
```json
{
  "answer": "...",
  "citations": [...],
  "suggested_actions": [
    {"label": "Đi đến Kho tri thức", "href": "/repository"},
    {"label": "Upload tài liệu mới", "href": "/repository?upload=1"}
  ]
}
```

---

## 6. Thứ tự ưu tiên triển khai

| Ưu tiên | Thay đổi | Impact | Effort |
|---------|----------|--------|--------|
| P0 | Role-aware system prompt | Cao | Thấp |
| P0 | Context injection cơ bản theo role | Cao | Thấp |
| P1 | Intent: `upload_help` + `own_document_lookup` | Cao | Trung bình |
| P1 | Intent: `knowledge_gap_analysis` cho head | Cao | Trung bình |
| P1 | Intent: `onboarding_guide` cho new_lecturer | Trung bình | Thấp |
| P2 | Page context từ frontend | Trung bình | Trung bình |
| P2 | Intent: `analytics_query` cho admin | Trung bình | Cao |
| P2 | Suggested actions trong response | Trung bình | Trung bình |
| P3 | Intent: `audit_query` cho admin | Thấp | Cao |
| P3 | Intent: `version_management` cho lecturer | Thấp | Thấp |

---

## 7. File cần sửa

| File | Thay đổi |
|------|----------|
| `src/eduvault/services.py` | `ask()`, `classify_query_intent()`, `build_user_context()` (mới) |
| `src/eduvault/main.py` | Endpoint `/api/search` — thêm `current_page` param |
| `frontend/app/assistant/page.tsx` | Gửi `current_page` + render `suggested_actions` |
| `frontend/components/assistant-chat.tsx` | Hiển thị action buttons trong response |
