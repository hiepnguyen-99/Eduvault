# Tóm tắt các thay đổi tối ưu Chatbot EduVault

## 1. Phân loại intent mở rộng — `classify_query_intent()` (services.py)

**Trước:** 5 intent cứng (`document_location`, `create_document`, `document_lookup`, `topic_search`, `question_answer`)

**Sau:** Thêm 10 intent mới, tổng cộng **15 intent**:

| Intent mới | Kích hoạt khi người dùng hỏi về |
|---|---|
| `upload_help` | Cách tải lên tài liệu, hướng dẫn upload |
| `own_document_lookup` | Tài liệu của chính mình đã upload |
| `knowledge_gap_analysis` | Khoảng trống tri thức, môn học còn thiếu tài liệu |
| `onboarding_guide` | Hướng dẫn làm quen hệ thống cho giảng viên mới |
| `user_management` | Thêm/xoá tài khoản, phân quyền người dùng |
| `policy_management` | Cấu hình policy, cây thư mục chuyên ngành |
| `system_status` | Trạng thái hệ thống, tiến trình xử lý |
| `analytics_query` | Thống kê, báo cáo, biểu đồ |
| `knowledge_transfer` | Chuyển giao tri thức giữa giảng viên |
| `version_management` | Phiên bản tài liệu, lịch sử chỉnh sửa |

---

## 2. System prompt theo vai trò — `ROLE_SYSTEM_PROMPTS` (services.py)

Thêm dict `ROLE_SYSTEM_PROMPTS` với prompt riêng cho từng role:

- **admin**: Tập trung vào quản trị hệ thống, gợi ý thao tác quản trị
- **head**: Tập trung vào tổng quan bộ môn, khoảng trống tri thức, chuyển giao
- **lecturer**: Tập trung vào tài liệu môn học cá nhân, upload và tìm kiếm
- **new_lecturer**: Hướng dẫn từng bước, khuyến khích bắt đầu với tính năng cơ bản

---

## 3. Context injection theo role — `build_role_context()` (services.py)

Hàm mới `build_role_context(db, user)` tự động lấy thông tin ngữ cảnh của người dùng:

- **Giảng viên / mới**: Chuyên ngành phụ trách, số tài liệu đã upload
- **Trưởng bộ môn / admin**: Tổng số tài liệu hệ thống, số giảng viên

Context này được inject vào system prompt của LLM cùng với `current_page` (trang hiện tại người dùng đang xem).

---

## 4. `clean_answer_instructions()` nhận role (services.py)

**Signature mới:** `clean_answer_instructions(instructions, role=None, role_context=None)`

Ghép theo thứ tự: `[role_prompt] + [role_context] + [custom_instructions] + [guardrail]`

Role-specific system prompt luôn đứng đầu để định hướng LLM trước khi đọc nội dung tài liệu.

---

## 5. `ask()` nhận `current_page` (services.py)

**Signature mới:** `ask(db, user, question, filters=None, current_page=None)`

- Tự động build `role_ctx` từ `build_role_context()`
- Append `current_page` vào context nếu có
- Truyền `role` và `role_context` vào `clean_answer_instructions()`
- Mỗi response trả về thêm field `suggested_actions`

---

## 6. `suggested_actions` trong response (services.py)

Thêm dict `_SUGGESTED_ACTIONS_BY_INTENT` mapping `intent → role → actions`.

Mỗi action gồm: `{ label, route, action? }` — frontend có thể render thành button shortcut.

Ví dụ:
- Intent `upload_help` → `[{ label: "Tải lên tài liệu", route: "/repository", action: "open_upload" }]`
- Intent `knowledge_gap_analysis` + role `head` → `[{ label: "Xem báo cáo khoảng trống", route: "/knowledge-transfer" }]`

---

## 7. `Question` model thêm `current_page` (main.py)

```python
class Question(BaseModel):
    question: str
    filters: dict | None = None
    current_page: str | None = None  # ← mới
```

Truyền vào `ask()` ở cả `/api/search` và `/api/search/stream`.

---

## Files đã thay đổi

| File | Thay đổi |
|---|---|
| `src/eduvault/services.py` | `classify_query_intent`, `ROLE_SYSTEM_PROMPTS`, `build_role_context`, `_SUGGESTED_ACTIONS_BY_INTENT`, `_suggested_actions_for`, `clean_answer_instructions`, `ask` |
| `src/eduvault/main.py` | `Question` model, `/api/search`, `/api/search/stream` |
