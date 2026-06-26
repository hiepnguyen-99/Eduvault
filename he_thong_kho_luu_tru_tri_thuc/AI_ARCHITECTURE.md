# Kiến trúc AI trong EduVault

> Cập nhật: 2026-06-27

---

## 1. Tổng quan

EduVault dùng **LangGraph StateGraph** để điều phối một multi-agent pipeline. Mỗi câu hỏi đi qua đúng một luồng trong 5 luồng xử lý:

```
preprocess → router ──┬──► retrieve → rerank → rag_answer ──┐
                      ├──► system_answer                     │
                      ├──► action_answer                     ├──► memory_update → END
                      ├──► oos_answer                        │
                      └──► conversational_answer ────────────┘
```

---

## 2. Các node trong graph

| Node | Vai trò |
|---|---|
| `preprocess` | Tách câu hỏi thực từ prefix memory, load short/long-term memory, build role context |
| `router` | Kiểm tra out-of-scope, phân loại intent, chọn route |
| `retrieve` | Hybrid retrieval: Qdrant vector + BM25 lexical + access control |
| `rerank` | Rerank + lọc theo intent (wants_books / wants_exam / wants_ai) + confidence threshold |
| `rag_answer` | Sinh câu trả lời có trích dẫn từ kết quả retrieve, inject memory vào LLM |
| `system_answer` | Trả lời hướng dẫn hệ thống (upload, policy, user, onboarding…) bằng text tĩnh + LLM |
| `action_answer` | Truy vấn DB trực tiếp (tài liệu của tôi, thống kê, version, gap, gợi ý…) |
| `oos_answer` | Từ chối các câu xin ý kiến / meta / ngoài chủ đề |
| `conversational_answer` | Chào hỏi / chitchat — hash-based random, có role-aware hints |
| `memory_update` | Lưu Q&A vào `conversation_memory` (SQLite) |

---

## 3. Phân loại Intent (20 nhãn)

Thứ tự kiểm tra trong `classify_query_intent()` **quan trọng** — nhãn đầu tiên khớp thắng:

```
1.  greeting               — "xin chào", "hello", "hi"
2.  chitchat               — "bạn là ai", "bạn tên gì", "bạn giỏi"
3.  analytics_query        — "báo cáo", "thống kê", "phân tích", "số liệu"
4.  version_management     — "phiên bản", "lịch sử sửa", "bản mới nhất"   ← trước own_document_lookup
5.  knowledge_gap_analysis — "khoảng trống", "còn ít tài liệu", "chủ đề nào thiếu"  ← trước storage_suggestion
6.  storage_suggestion     — "nên lưu", "lưu vào đâu", "đặt vào folder nào"  ← trước is_location_query
7.  own_document_lookup    — "tài liệu của tôi", "file của tôi", "đã upload"
8.  document_recommendation — "đề xuất tài liệu", "gợi ý tài liệu phù hợp"
9.  knowledge_transfer     — "chuyển giao", "bàn giao", "handover", "kế thừa"
10. upload_help            — "cách upload", "hướng dẫn tải lên"
11. document_location      — is_location_query() = True (không phải upload intent)
12. create_document        — "tạo mẫu", "template", "soạn tài liệu mới"
13. system_status          — "hệ thống lỗi", "đang indexing", "trạng thái"
14. policy_management      — "chính sách", "cây thư mục", "thêm chuyên ngành"
15. user_management        — "thêm giảng viên", "cấp quyền", "quản lý tài khoản"
16. permission_request     — "xin quyền", "không có quyền truy cập"
17. onboarding_guide       — "mới vào", "làm quen", "bước đầu sử dụng"
18. document_lookup        — "tìm tài liệu", "file PDF/DOCX", "tải về"
19. topic_search           — "chủ đề", "tổng hợp", "ôn tập", "nói về"
20. question_answer        — fallback (confidence 0.75)
```

**Metadata intent bổ sung** từ `_query_intent()` — không routing nhưng ảnh hưởng rerank:
- `wants_books` — "sách", "giáo trình", "tham khảo"
- `wants_exam` — "đề thi", "đáp án", "kiểm tra"
- `wants_ai` — "AI", "machine learning", "LLM", "trí tuệ nhân tạo"

---

## 4. Routing Table

| Intent group | Route | Handler node |
|---|---|---|
| `greeting`, `chitchat` | `conversational` | `conversational_answer` |
| `upload_help`, `policy_management`, `user_management`, `system_status`, `onboarding_guide`, `permission_request` | `system` | `system_answer` |
| `own_document_lookup`, `analytics_query`, `knowledge_gap_analysis`, `version_management`, `storage_suggestion`, `document_recommendation` | `action` | `action_answer` |
| Out-of-scope (opinion / meta / off-topic) | `out_of_scope` | `oos_answer` |
| Tất cả còn lại | `rag` | `retrieve → rerank → rag_answer` |

---

## 5. Out-of-Scope Check

`_is_out_of_scope_query()` chạy **trước** mọi phân loại intent:

| Loại | Signals | Phản hồi |
|---|---|---|
| `opinion` | "theo bạn", "bạn nghĩ", "ý kiến của bạn" | Không cho ý kiến cá nhân |
| `meta` | "có chính xác không", "chắc chắn không" | Kiểm tra tài liệu gốc |
| `off_topic` | "bóng đá", "thời tiết", "tin tức hôm nay" | Ngoài phạm vi học thuật |

---

## 6. Retrieval Pipeline (RAG route)

```
Query
  │
  ├─ rewrite_query()          ← chuẩn hoá dấu, sửa typo
  ├─ decompose_query()        ← tách query dài (>120 chars) thành sub-questions
  ├─ expanded_query_terms()   ← mở rộng từ đồng nghĩa từ config
  │
  ├─ rag_documents(db, user)  ← access control: PUBLIC + tài liệu của chính user
  │
  ├─ Vector Search (Qdrant)
  │    embed(query) → search top_k=100 → filter allowed docs → hybrid score
  │    score = similarity × 4.0 × vector_weight + lexical_score × lexical_weight
  │    (default: vector_weight=0.38, lexical_weight=0.62)
  │
  ├─ DB Fallback (nếu Qdrant down)
  │    local embedding dot-product per chunk
  │
  └─ Lexical Fallback
       title_bonus=+4.0, title_hit=+3.0/từ, body_hit=+0.8/từ
       → merge_ranked_matches() → top 8 candidates
```

---

## 7. Rerank Pipeline

```
candidates
  │
  ├─ rerank_score()            ← base score + title hits + snippet quality
  ├─ _matches_query_intent()   ← lọc theo wants_books / wants_exam / wants_ai
  ├─ doc_type filter           ← loại "cv", "hồ sơ" khỏi topic_search / document_lookup
  └─ confidence threshold      ← max(0.3, top_score × 0.35)
       → top 3 matches
```

---

## 8. RAG Answer Generation

```
matches + question_with_memory
  │
  ├─ _build_memory_question()       ← inject long-term (6) + short-term (4) entries
  │
  ├─ Không có matches               → "⚠️ Tài liệu chưa tìm thấy" + gợi ý
  ├─ intent = document_location     → format_document_location_answer() — link /documents/<id>
  ├─ intent = topic_search          → format_topic_search_answer()
  └─ Mặc định                       → ai_provider.answer(question, context_chunks)
         ↓
       verification: confidence check + grounding check
       citations: {title, owner, timestamp, /documents/<id>}
```

---

## 9. Action Answer — Các handler DB trực tiếp

| Intent | Truy vấn / Hành động |
|---|---|
| `own_document_lookup` | `SELECT * FROM documents WHERE owner_code=? AND deleted_at IS NULL` → liệt kê |
| `analytics_query` | Lecturer: thống kê của mình. Admin+Head: toàn hệ thống theo type & topic |
| `knowledge_gap_analysis` | `SELECT topic, COUNT(*) GROUP BY topic HAVING COUNT(*) < 3` → chủ đề thiếu tài liệu |
| `version_management` | `SELECT * FROM document_versions WHERE document_id=?` → lịch sử phiên bản |
| `storage_suggestion` | `_score_text_vs_name()` → so khớp với `folder_nodes` (word-boundary + bigram) → đề xuất folder |
| `document_recommendation` | Keyword match trên title/topic → nếu không có: "chưa tìm thấy tài liệu phù hợp" |

**Hàm `_score_text_vs_name()` (dùng cho storage_suggestion & suggest_upload_destination):**

```
+3  exact substring match ("deep learning" in text)
+1  per token từ tên môn trong text (max 3)
+1  per bigram từ tên môn trong text (max 2)
```

---

## 10. System Answer

Mỗi system intent có **text tĩnh** (hoạt động không cần API key) + tuỳ chọn **LLM enrichment**:

| Intent | Nội dung |
|---|---|
| `upload_help` | Hướng dẫn 5 bước tải tài liệu lên kho |
| `policy_management` | Cách quản lý chuyên ngành / học phần / thư mục chuẩn |
| `user_management` | Thêm giảng viên, phân quyền, quản lý tài khoản |
| `system_status` | Kiểm tra indexing, trạng thái xử lý file |
| `onboarding_guide` | 5 bước làm quen hệ thống cho người mới |
| `permission_request` | Không có đăng ký công khai — liên hệ admin |

---

## 11. Memory System

**Lưu trữ:** SQLite — bảng `conversation_memory(user_code, short_term JSON, long_term JSON, updated_at)`

```
short_term  ← 8 entries gần nhất — mọi Q&A
long_term   ← 12 entries — chỉ entries factual/điều hướng
              (lọc theo: "tài liệu", "đường dẫn", "folder", "kho", "file"…)
```

**Inject vào LLM:**
```
[Bộ nhớ dài hạn]    ← 6 entries
Q: ...  →  A: ...

[Bộ nhớ ngắn hạn]   ← 4 entries
Q: ...  →  A: ...

Câu hỏi: <actual question>
```

---

## 12. Role-Aware Behavior

| Role | Greeting hint | Quyền action |
|---|---|---|
| `admin` | Quản lý tài khoản, thống kê toàn hệ thống, cấu hình policy | Full analytics + user management |
| `head` | Báo cáo khoảng trống tri thức, theo dõi chuyển giao | Analytics + knowledge transfer |
| `lecturer` | Tìm tài liệu, xem danh sách của bạn, tải lên | Own docs + search |
| `new_lecturer` | Làm quen hệ thống, tải lên tài liệu đầu tiên | Onboarding + upload |

---

## 13. Suggested Actions (Role-Aware)

Sau mỗi câu trả lời, hệ thống đề xuất action tiếp theo phù hợp intent + role:

| Intent | Suggested action |
|---|---|
| `upload_help` | → `/repository` (Tải lên) |
| `analytics_query` (admin/head) | → `/` (Xem thống kê) |
| `knowledge_transfer` (head) | → `/knowledge-transfer` |
| `document_recommendation` | → `/search` (Tìm kiếm) |
| `storage_suggestion` | → `/repository` (Tải lên) |
| `version_management` | → `/versions` (Xem phiên bản) |
| `permission_request` | → `/permissions` (Yêu cầu quyền) |
| `document_location` | → `/documents/<id>` |

---

## 14. ChatState — Dữ liệu truyền qua graph

```python
class ChatState(TypedDict):
    # ── Input (set một lần) ──────────────────────────────────
    question: str          # câu hỏi gốc (có thể có memory prefix)
    user: dict             # {code, name, role, department, permissions}
    db: Any                # SQLite connection
    filters: dict | None   # metadata filters tuỳ chọn
    current_page: str | None

    # ── Derived — preprocess ──────────────────────────────────
    retrieval_query: str   # câu hỏi sạch (bỏ memory prefix)
    role: str
    role_ctx: str          # context chuyên ngành/học phần của user
    short_term: list[str]  # bộ nhớ ngắn hạn
    long_term: list[str]   # bộ nhớ dài hạn

    # ── Router output ─────────────────────────────────────────
    intent: str
    intent_meta: dict      # {label, confidence, wants_books, wants_exam, wants_ai}
    agent_route: Literal["rag","system","action","out_of_scope","conversational"]
    oos_reason: str | None

    # ── Retrieve / Rerank ─────────────────────────────────────
    candidates: list       # (score, doc, content) trước rerank
    matches: list          # (score, doc, content) sau rerank
    config: dict           # search policy: weights, thresholds, synonyms

    # ── Output ────────────────────────────────────────────────
    answer: str
    citations: list[dict]
    trace_id: str
    trace: dict            # debug: rewritten_query, expanded_terms, pipeline steps
    verification: dict     # confidence + grounding check
    pipeline: list[str]    # ["rewrite","expand","route","bm25","vector","hybrid",...]
    suggested_actions: list[dict]
```

---

## 15. API Endpoints liên quan đến AI

| Endpoint | Mô tả |
|---|---|
| `POST /api/search/stream` | Chat chính — streaming NDJSON (`{type:"delta"}` + `{type:"complete"}`) |
| `POST /api/documents/analyze-file` | AI đọc file → metadata + `folder_node_id` gợi ý |
| `POST /api/folders/suggest-course` | Gợi ý học phần phù hợp từ mô tả văn bản |
| `POST /api/folders/suggest` | Gợi ý folder path theo template naming |
| `POST /api/folders/request-create` | Gửi yêu cầu tạo thư mục mới (audit log → admin duyệt) |

---

## 16. Luồng ví dụ end-to-end

```
User (lecturer): "tìm slide về deep learning"
        │
preprocess ──── retrieval_query = "tìm slide về deep learning"
                role = "lecturer", short_term = [3 Q&A gần nhất]
        │
router ─────── out_of_scope? No
               classify_intent  → "topic_search"
               _query_intent    → {wants_ai: True}
               agent_route      = "rag"
        │
retrieve ────── allowed_docs = PUBLIC + tài liệu của GV này
                rewrite  → "tim slide ve deep learning"
                expand   → ["deep learning", "học sâu", "neural network"]
                Qdrant   → 8 candidates
        │
rerank ─────── rerank_score mỗi candidate
               filter wants_ai=True → giữ lại tài liệu AI/ML
               → top 3
        │
rag_answer ─── inject memory → ai_provider.answer()
               → answer = "Tìm thấy 3 tài liệu về Deep Learning: ..."
               → citations = [{title, owner, /documents/xxx}]
        │
memory_update ─ short_term += Q&A (max 8)
                long_term  += nếu factual (max 12)
        │
Response: {answer, citations, suggested_actions:[{label:"Tìm kiếm", route:"/search"}]}
```

---

## 17. AI Provider

Module trừu tượng hoá LLM — cấu hình qua biến môi trường:

| Hàm | Dùng ở đâu |
|---|---|
| `ai_provider.embed(text)` | Vector search (Qdrant indexing + query embedding) |
| `ai_provider.answer(question, context)` | rag_answer + system_answer |
| `ai_provider.status()` | Health check — {provider, model, embedding_model, configured} |

---

*File này được sinh từ phân tích code thực tế. Cập nhật khi có thay đổi kiến trúc.*
