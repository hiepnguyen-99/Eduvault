# 📥 Phân tích Tool `download_document` — Chatbot Agent EduVault V1

> **Phạm vi:** Phân tool `download_document` trong pipeline chatbot RAG  
> **Phiên bản phân tích:** V1 (`he_thong_kho_luu_tru_tri_thuc`)  
> **Ngày:** 2026-07-01  

---

## 1. Tổng quan kiến trúc

```
Người dùng nhắn tin
        │
        ▼
┌─────────────────────┐
│  Keyword Pre-check  │  ← _keyword_route() — bỏ qua LLM nếu khớp
│  (services.py:4803) │    "tai ve", "download", "lay file", ...
└────────┬────────────┘
         │ không khớp
         ▼
┌─────────────────────┐
│   LLM Router        │  ← llm_route() + prompt INTENT_META
│  (services.py:4721) │    intent = "download_document"
│                     │    action_params = {"titles": [...]}
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Intent Handler     │  ← services.py:6048
│  download_document  │    1. Lấy titles từ action_params
│                     │    2. Query DB lấy tài liệu có quyền
│                     │    3. Fuzzy match title
│                     │    4. Trả citations[] + answer text
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Frontend           │  ← assistant-chat.tsx: <DocActions>
│  DocActions         │    • 1 tài liệu → nút "Tải về" (trực tiếp)
│                     │    • ≥2 tài liệu → checkbox + "Tải tất cả (.zip)"
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Backend API        │  ← main.py
│  /api/documents/    │    GET  /{id}/download      → FileResponse
│  batch-download     │    POST /batch-download     → StreamingResponse (ZIP)
└─────────────────────┘
```

---

## 2. Luồng xử lý theo số lượng file

### 2.1 Tải 1 file — Direct Download

**Ví dụ người dùng nhắn:**
> *"Tải cho tôi đề cương môn Lập trình Python"*

**Pipeline:**
1. Keyword pre-check: `"tai"` → không khớp download_signals nguyên vẹn → đẩy lên LLM
2. LLM phân loại: `intent = "download_document"`, `action_params = {"titles": ["đề cương môn Lập trình Python"]}`
3. Backend tìm DB → khớp 1 tài liệu → trả `citations = [{"id": "doc-001", "title": "Đề cương Lập trình Python", ...}]`
4. Frontend render **1 citation** → chỉ hiện nút **"Tải về"** (không có nút ZIP)
5. Click → `GET /api/documents/doc-001/download` → trả `FileResponse` với tên gốc file

**Tên file nhận được:** `de-cuong-lap-trinh-python.pdf` ✅

---

### 2.2 Tải ≥2 file — ZIP Download

**Ví dụ người dùng nhắn:**
> *"Tôi muốn tải đề cương Python và bài giảng Tuần 1"*

**Pipeline:**
1. LLM phân loại: `intent = "download_document"`, `action_params = {"titles": ["đề cương Python", "bài giảng Tuần 1"]}`
2. Backend tìm DB → khớp 2 tài liệu → trả `citations = [doc-001, doc-007]`
3. Frontend render **2 citations** → hiện checkbox + nút **"Tải tất cả (.zip)"**
4. User chọn tất cả → `POST /api/documents/batch-download` với `{"document_ids": ["doc-001", "doc-007"]}`
5. Backend tạo ZIP trong bộ nhớ → `StreamingResponse`

**Tên file ZIP nhận được hiện tại:** `tai-lieu.zip` ⚠️ **— Vô nghĩa!**

---

## 3. Vấn đề phát hiện

### ❌ Vấn đề A — Tên ZIP không có nghĩa (Quan trọng nhất)

**Code hiện tại:**

```python
# main.py:1937
headers={"Content-Disposition": 'attachment; filename="tai-lieu.zip"'}
```

```ts
// assistant-chat.tsx:226
a.download = "tai-lieu.zip";
```

**Hậu quả:** Người dùng tải nhiều lần → thư mục Download đầy file `tai-lieu.zip`, `tai-lieu (1).zip`, `tai-lieu (2).zip`... hoàn toàn không phân biệt được nội dung.

**Giải pháp — Đặt tên ZIP thông minh:**

Tên ZIP nên phản ánh **nội dung** hoặc **ngữ cảnh** của yêu cầu:

| Tình huống | Tên ZIP hiện tại | Tên ZIP đề xuất |
|-----------|-----------------|----------------|
| Tải 2 tài liệu cùng topic Python | `tai-lieu.zip` | `Python-co-ban_2-tai-lieu_20260701.zip` |
| Tải tài liệu ML và Python hỗn hợp | `tai-lieu.zip` | `EduVault_ML-Python_3-file_20260701.zip` |
| Tải tất cả tài liệu của mình | `tai-lieu.zip` | `tai-lieu-cua-toi_20260701.zip` |
| Tải theo chủ đề cụ thể | `tai-lieu.zip` | `Machine-Learning_5-tai-lieu_20260701.zip` |

**Hiện thực — Backend trả thêm `zip_name`:**

```python
# services.py — hàm _build_zip_name
def _build_zip_name(titles: list[str], matched: list[dict], query: str) -> str:
    """Tạo tên ZIP có nghĩa dựa trên tài liệu tìm được."""
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    n = len(matched)

    # Ưu tiên: dùng topic chung nếu tất cả cùng topic
    topics = {m.get("topic", "") for m in matched if m.get("topic")}
    if len(topics) == 1:
        topic_slug = _slugify(topics.pop())[:40]
        return f"{topic_slug}_{n}-tai-lieu_{today}.zip"

    # Thứ hai: dùng tên tài liệu đầu tiên nếu chỉ có ít tài liệu
    if n <= 2:
        slug = _slugify(matched[0]["title"])[:50]
        return f"{slug}_{today}.zip"

    # Fallback: dùng từ khóa tìm kiếm
    if titles:
        kw = _slugify(" ".join(titles[:2]))[:40]
        return f"EduVault_{kw}_{n}-file_{today}.zip"

    return f"EduVault_tai-lieu_{n}-file_{today}.zip"


def _slugify(text: str) -> str:
    """Chuyển text tiếng Việt thành slug an toàn cho tên file."""
    import unicodedata, re
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s-]", "", text).strip()
    text = re.sub(r"[\s_]+", "-", text)
    return text
```

**Backend endpoint nhận tên từ query param:**

```python
# main.py:1910 — batch_download_documents
@app.post("/api/documents/batch-download")
def batch_download_documents(body: BatchDownloadInput, user: dict = Depends(current_user)):
    zip_name = body.zip_name or "EduVault-tai-lieu.zip"
    # ...
    headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
```

**Frontend truyền `zip_name` từ response chatbot:**

```ts
// assistant-chat.tsx — DocActions nhận thêm prop zipName
const a = document.createElement("a");
a.href = url;
a.download = zipName || "EduVault-tai-lieu.zip";  // thay vì "tai-lieu.zip" cứng
a.click();
```

---

### ❌ Vấn đề B — Frontend không nhận ra `download_document` intent

`INTENT_META` trong `assistant-chat.tsx:14-30` thiếu entry → header chatbot luôn hiện fallback "Mình đã tìm thấy nội dung phù hợp".

```ts
// Hiện tại — THIẾU entry
const INTENT_META: Record<string, { title: string; emoji: string }> = {
  topic_search: ...,
  document_lookup: ...,
  // ❌ không có download_document
};

// Sửa — THÊM
download_document: { title: "Tài liệu để tải về", emoji: "📥" },
```

---

### ❌ Vấn đề C — LLM không extract được titles → fuzzy match quá rộng

**Ví dụ lỗi:**

| Bước | Giá trị |
|------|---------|
| User nhắn | `"Tải cho tôi file đề thi cuối kỳ"` |
| LLM trả | `action_params = {}` (không rõ tên cụ thể) |
| Backend fallback | titles = `["Tải cho tôi file đề thi cuối kỳ"]` (toàn câu) |
| Kết quả | Match sai — mọi doc có "đề thi" hoặc "cuối kỳ" đều xuất hiện |

**Sửa — Regex extract từ query khi `titles` rỗng:**

```python
# services.py:6050 — thêm vào sau khi lấy titles từ action_params
if not titles and retrieval_query:
    _extracted = _extract_doc_titles_from_query(retrieval_query)
    titles = _extracted if _extracted else [retrieval_query]

def _extract_doc_titles_from_query(query: str) -> list[str]:
    """
    "tải đề cương Python và bài giảng tuần 1"
    → ["đề cương Python", "bài giảng tuần 1"]
    """
    import re
    cleaned = re.sub(
        r"(?i)(tải|tải về|tải xuống|download|cho tôi|hãy|giúp tôi|muốn tải|lấy)\s+",
        "", query
    ).strip()
    parts = re.split(r"\s+(?:và|với|,)\s+", cleaned)
    return [p.strip() for p in parts if len(p.strip()) >= 3]
```

---

### ⚠️ Vấn đề D — Dead code gây nhầm lẫn

Trong `services.py:4643-4650`, nhánh `document_lookup` chứa `"tai ve"` và `"download"` — đây là dead code vì `_keyword_route` đã intercept trước.

```python
# Xóa 2 từ này khỏi document_lookup branch:
# "tai ve", "download",   ← REMOVE
```

---

## 4. Ví dụ đầy đủ — Trước và Sau khi sửa

### Case 1: Tải 1 file — Direct

| | Trước | Sau |
|---|---|---|
| User nhắn | `"tải đề cương Python"` | same |
| Intent header | *"Mình đã tìm thấy nội dung phù hợp"* | *"📥 Tài liệu để tải về"* |
| Nút UI | "Tải về" (1 nút) | "Tải về" (1 nút) — không đổi |
| Tên file nhận | `de-cuong-lap-trinh-python.pdf` | `de-cuong-lap-trinh-python.pdf` — không đổi |

### Case 2: Tải 2 file cùng topic

| | Trước | Sau |
|---|---|---|
| User nhắn | `"tải đề cương và bài giảng tuần 1 Python"` | same |
| Số citations | 2 | 2 |
| UI | Checkbox + "Tải tất cả (.zip)" | Checkbox + "Tải tất cả (.zip)" |
| Tên ZIP | `tai-lieu.zip` ❌ | `Python-co-ban_2-tai-lieu_20260701.zip` ✅ |

### Case 3: Tải nhiều file hỗn hợp

| | Trước | Sau |
|---|---|---|
| User nhắn | `"tải đề cương Python, slide ML tuần 3 và đề thi giữa kỳ"` | same |
| Số citations | 3 | 3 |
| Tên ZIP | `tai-lieu.zip` ❌ | `EduVault_de-cuong-Python-slide-ML_3-file_20260701.zip` ✅ |

### Case 4: LLM không extract được title

| | Trước | Sau |
|---|---|---|
| User nhắn | `"cho tôi tải file đề thi cuối kỳ"` | same |
| action_params | `{}` | `{}` |
| titles used | `["cho tôi tải file đề thi cuối kỳ"]` (toàn câu) | `["đề thi cuối kỳ"]` (regex cleaned) ✅ |
| Match quality | Quá rộng, sai | Chính xác hơn |

### Case 5: User chỉ chọn 1 trong 3 kết quả để tải ZIP

| | Hiện tại | Mong đợi |
|---|---|---|
| Citations trả về | 3 tài liệu | 3 tài liệu |
| User tick chọn | 1 trong 3 | 1 trong 3 |
| Nút ZIP hiện | "Tải 1 file (.zip)" | "Tải 1 file (.zip)" ✅ đã đúng |
| Tên ZIP | `tai-lieu.zip` ❌ | `Ten-tai-lieu-chon_1-file_20260701.zip` ✅ |

> **Quy tắc UX:**
> - Chọn **1 file** → ZIP vẫn tạo, nhưng nên gợi ý dùng "Tải về" trực tiếp thay thế
> - Chọn **≥2 file** → ZIP với tên có nghĩa
> - Không chọn gì + "Tải tất cả" → ZIP toàn bộ citations

---

## 5. Metrics đề xuất

### 5.1 Router Quality — Nhận diện intent

| Metric | Định nghĩa | Target |
|--------|-----------|--------|
| **Download Intent Precision** | % lần phân loại `download_document` là đúng | ≥ 95% |
| **Download Intent Recall** | % câu hỏi download thực sự được bắt đúng intent | ≥ 90% |
| **False Positive Rate** | % câu không download bị phân loại nhầm | ≤ 3% |
| **Keyword Precheck Hit Rate** | % download intent bắt được qua keyword (không cần LLM) | ≥ 60% |

### 5.2 Retrieval Quality — Tra cứu tài liệu

| Metric | Định nghĩa | Target |
|--------|-----------|--------|
| **Title Match Rate** | % yêu cầu có ≥1 citation trả về | ≥ 80% |
| **Exact Title Match Rate** | % citation đúng tài liệu user muốn | ≥ 70% |
| **Empty Result Rate** | % yêu cầu trả về 0 kết quả | ≤ 15% |
| **False Match Rate** | % citation không liên quan | ≤ 10% |
| **Avg Citations Returned** | Trung bình số kết quả khi có match | 1–3 |

### 5.3 Download Action Quality — Hành động tải

| Metric | Định nghĩa | Target |
|--------|-----------|--------|
| **Single File Download Success Rate** | % bấm "Tải về" thành công (HTTP 200) | ≥ 98% |
| **ZIP Download Success Rate** | % bấm "Tải tất cả (.zip)" thành công | ≥ 95% |
| **Permission Error Rate** | % gặp lỗi 403 khi tải | ≤ 5% |
| **ZIP Name Meaningfulness** | % tên ZIP chứa keyword có nghĩa (không phải `tai-lieu.zip`) | ≥ 85% (sau fix) |
| **Single File → Direct Rate** | % user tải 1 file đi thẳng (không qua ZIP) | 100% |

### 5.4 UX & Trải nghiệm người dùng

| Metric | Định nghĩa | Target |
|--------|-----------|--------|
| **Time to First Download** | Từ lúc nhắn đến lúc file bắt đầu tải | ≤ 3 giây |
| **Chat→Download Conversion** | % conversation có download intent mà user thực sự bấm tải | ≥ 60% |
| **Retry Rate** | % user hỏi lại lần 2 sau khi không tìm được file | ≤ 20% |
| **Negative Feedback Rate** | % message download nhận "Sai nguồn" | ≤ 8% |

### 5.5 Bộ test cases tối thiểu

```
# Phân loại ĐÚNG là download_document:
1.  "tải về đề cương Python"                           → download_document ✓
2.  "cho tôi tải bài giảng tuần 1"                     → download_document ✓
3.  "download tài liệu machine learning"                → download_document ✓
4.  "tôi muốn tải đề cương Python và bài giảng ML"     → download_document ✓
5.  "lấy file đề thi cuối kỳ"                          → download_document ✓
6.  "tải xuống bài tập lập trình"                      → download_document ✓
7.  "tai ve slide tuan 3"                              → download_document ✓ (không dấu)
8.  "download de cuong"                                → download_document ✓ (keyword)

# KHÔNG phải download (không được classify sai):
9.  "tìm tài liệu về Python"                           → document_lookup  ✓
10. "bài giảng tuần 1 nói về gì"                       → question_answer  ✓
11. "có tài liệu nào về AI không"                      → topic_search     ✓
12. "làm sao upload file"                              → upload_help      ✓
```

---

## 6. Tóm tắt Backlog

| # | Việc làm | File cần sửa | Ưu tiên | Effort |
|---|----------|-------------|---------|--------|
| 1 | Thêm `download_document` vào `INTENT_META` | `assistant-chat.tsx:29` | 🔴 P0 | 5 phút |
| 2 | Hàm `_build_zip_name()` + `_slugify()` — tên ZIP thông minh | `services.py`, `main.py`, `assistant-chat.tsx` | 🔴 P0 | 2 giờ |
| 3 | Thêm `zip_name` vào `BatchDownloadInput` (backend nhận từ frontend) | `main.py:1906` | 🔴 P0 | 30 phút |
| 4 | Regex extract titles khi `action_params.titles` rỗng | `services.py:6050` | 🟡 P1 | 1 giờ |
| 5 | Gợi ý dùng "Tải về" trực tiếp khi user chọn ZIP cho 1 file | `assistant-chat.tsx` | 🟡 P1 | 30 phút |
| 6 | Xóa dead code `"tai ve"`, `"download"` trong `document_lookup` | `services.py:4646` | 🟢 P2 | 5 phút |
| 7 | Log download events để tính metrics (audit trail) | `main.py` | 🟡 P1 | 1 giờ |
| 8 | Viết test cases tự động (12 cases ở mục 5.5) | `tests/` | 🟡 P1 | 2 giờ |

---

## 7. Điểm mạnh hiện tại (giữ nguyên)

- ✅ **Hai tầng phát hiện intent**: keyword pre-check + LLM → không bỏ sót
- ✅ **Kiểm tra quyền truy cập** tại DB query trước khi trả citations
- ✅ **Fuzzy fallback** khi exact match không tìm được gì
- ✅ **Checkbox multi-select** cho phép user chọn file cụ thể trước khi ZIP
- ✅ **Dedup tên file** trong ZIP (`base_1.pdf`, `base_2.pdf`) tránh ghi đè
- ✅ **Loading state** per-file và per-zip giữ UX phản hồi tốt
