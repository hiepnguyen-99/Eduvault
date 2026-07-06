# KẾ HOẠCH NÂNG CẤP HỆ THỐNG v3
## Tích hợp luồng tự động upload file từ `he_thong_kho_luu_tru_tri_thuc` vào `he_thong_kho_luu_tru_tri_thuc_v3`

> **Tài liệu này được viết theo quan điểm CTO đang review production system.**
> Ngày lập kế hoạch: 2026-06-27
> Phiên bản: 1.0
> Trạng thái: Chờ duyệt

---

## TÓM TẮT EXECUTIVE

Bản cũ (`he_thong_kho_luu_tru_tri_thuc`) có Desktop Agent là một process Python độc lập, watch folder trên máy tính người dùng, tự động upload file lên backend qua endpoint riêng `/api/desktop-agent/files/detect`. Bản v3 (`he_thong_kho_luu_tru_tri_thuc_v3`) đã thiết kế sẵn kiến trúc **Unified Ingestion Layer** với `upload_tasks + document_classification_tickets`, và đã có namespace `/api/ingestion/desktop/*` được viết sẵn nhưng chưa có Desktop Agent client để gọi đến.

**Vấn đề cần giải quyết:** Desktop Agent cũ vẫn đang gọi endpoint cũ `/api/desktop-agent/files/detect` — endpoint này KHÔNG tồn tại trong v3. Cần cập nhật Desktop Agent để gọi đúng API của v3, đồng thời bổ sung một số API phụ trợ còn thiếu (watch folder config, upload status poll).

**Giải pháp được đề xuất:** Thay đổi tối thiểu, không rewrite, không phá kiến trúc v3. Chỉ:
1. Cập nhật Desktop Agent để gọi đúng API v3
2. Thêm 2-3 endpoint hỗ trợ còn thiếu vào v3 backend
3. Thêm bảng `desktop_sync_folders` vào database v3
4. Cập nhật UI Settings để quản lý watch folder

---

## A. MỤC TIÊU NÂNG CẤP

### A.1 Mục tiêu chính
- **Cho phép Desktop Agent tự động detect + upload file** từ máy tính người dùng vào kho tri thức v3.
- **Tái sử dụng toàn bộ Ingestion Layer của v3**: `upload_tasks`, `document_classification_tickets`, `document_processing_jobs`, `outbox_events` — không tạo flow song song.
- **Giữ nguyên trải nghiệm xác nhận phân loại trên Web UI** của v3 (review ticket sau khi Desktop Agent upload).

### A.2 Mục tiêu kỹ thuật
- Desktop Agent gọi `/api/ingestion/desktop/*` thay vì `/api/desktop-agent/files/detect` cũ.
- Backend v3 cung cấp thêm endpoint config watch folder và poll status.
- Không tạo `import_tickets`, `processing_jobs` song song với v3.
- Toàn bộ lifecycle sau khi Desktop Agent upload phải đi qua `confirm_upload_task()` của v3.

### A.3 Non-goals (KHÔNG làm)
- Không rewrite Desktop Agent từ đầu.
- Không đổi tên bảng `upload_tasks` hay `document_classification_tickets`.
- Không thêm event bus / message broker thật.
- Không thay đổi UI review confirmation của v3 hiện tại.

---

## B. PHẠM VI THAY ĐỔI

### B.1 Thay đổi Backend v3 (THÊM, không sửa logic cũ)

| Loại | File | Mô tả |
|------|------|--------|
| THÊM endpoint | `src/eduvault/main.py` | `GET /api/desktop-agent/config` — trả về watch folders của user |
| THÊM endpoint | `src/eduvault/main.py` | `GET /api/desktop-sync/folders` — list watch folders |
| THÊM endpoint | `src/eduvault/main.py` | `PUT /api/desktop-sync/folders` — save watch folders |
| THÊM schema | `src/eduvault/database.py` | Bảng `desktop_sync_folders` (SQLite + MySQL) |
| THÊM function | `src/eduvault/services.py` | `desktop_agent_sync_config()`, `list_desktop_sync_folders()`, `replace_desktop_sync_folders()` |

### B.2 Thay đổi Desktop Agent (CẬP NHẬT endpoint, giữ logic)

| File | Thay đổi |
|------|----------|
| `desktop-agent/agent.py` | Đổi upload endpoint từ `/api/desktop-agent/files/detect` sang flow mới (init + chunk + analyze) |
| `desktop-agent/agent.py` | Đổi config fetch endpoint sang `/api/desktop-agent/config` (v3 mới) |
| `desktop-agent/agent.py` | Đổi poll endpoint từ `/api/import-tickets/{id}` sang `/api/ingestion/desktop/{task_id}` |
| `desktop-agent/agent.py` | Thêm metadata: `source_type="desktop_agent"`, `source_path`, `device_id`, `source_sha256` |
| `desktop-agent/state.py` | Giữ nguyên — không cần thay đổi |

### B.3 Thay đổi Frontend v3 (THÊM UI quản lý watch folder)

| File | Thay đổi |
|------|----------|
| `frontend/app/settings/page.tsx` | Thêm section "Desktop Agent — Watch Folders" |
| `frontend/components/app-shell.tsx` | Thêm badge/status cho desktop agent nếu cần |

### B.4 KHÔNG thay đổi
- Toàn bộ `classification_service.py`
- Toàn bộ `ingestion_service.py`
- Toàn bộ `repository_commit_service.py`
- Toàn bộ `upload-task-provider.tsx`
- Toàn bộ `repository/page.tsx` (UI confirm ticket)
- Toàn bộ flow confirm/reject của v3

---

## C. NHỮNG PHẦN TUYỆT ĐỐI KHÔNG ĐƯỢC PHÁ

### C.1 Bảo vệ tuyệt đối (ZERO TOUCH)

| Module | Lý do |
|--------|-------|
| `validate_folder_access()` trong `services.py` | Đây là chokepoint bảo mật duy nhất cho permission model |
| `confirm_upload_task()` trong `repository_commit_service.py` | Logic commit document cuối cùng — sai là mất data |
| `document_processing_jobs` table và worker | Processing pipeline đang chạy ổn định |
| `outbox_events` table | Foundation cho event-driven architecture |
| `SCHEMA` và `MYSQL_SCHEMA` trong `database.py` | Chỉ THÊM bảng mới, không sửa bảng cũ |
| `/api/uploads/*` endpoints hiện tại | Web Upload vẫn phải hoạt động bình thường |
| Tất cả routes policy/admin | Không liên quan |

### C.2 Invariants phải giữ
1. **Desktop Agent KHÔNG được commit document trực tiếp** — chỉ được tạo `upload_task` và poll status.
2. **AI suggestion KHÔNG phải final decision** — user phải confirm qua Web UI.
3. **`validate_folder_access()` phải được gọi** trước khi confirm.
4. **Source of truth của document phải là `documents` table** — không có bảng shadow.
5. **`source_type = "desktop_agent"` phải được ghi vào `upload_tasks.metadata`** để audit.

---

## D. KIẾN TRÚC HIỆN TẠI v3 CẦN KIỂM TRA

### D.1 Database Schema (v3 đã có)
```
upload_tasks
  id, user_code, filename, mime_type, total_bytes, uploaded_bytes,
  status, metadata (JSON), temp_path, document_id, error,
  created_at, updated_at

document_classification_tickets
  id, upload_task_id, user_code, filename,
  suggested_specialization_id, suggested_specialization,
  suggested_course_id, suggested_course, suggested_document_type,
  suggested_visibility, confidence, reasoning, suggestions (JSON),
  selected_*, status, document_id, created_at, updated_at

document_processing_jobs
  id, document_id, job_type, status, created_at, started_at,
  completed_at, error_message

outbox_events
  id, event_type, aggregate_id, payload (JSON), status,
  attempts, created_at, published_at
```

### D.2 Service Layer (v3 đã có)
```
ingestion_service.py
  create_upload_task()        tao task, validate permission, ghi temp file
  append_upload_chunk()       nhan chunk, ghi vao temp file
  delete_upload_task()        xoa task va temp file
  list_upload_tasks()         list tasks cua user
  get_upload_task_public()    get task public (an temp_path)
  normalize_upload_metadata() validate source_type, source_path, etc.

classification_service.py
  create_classification_ticket()  AI phan tich, tao draft ticket
  analyze_upload_task()           trigger phan tich sau upload

repository_commit_service.py
  confirm_upload_task()                    validate + commit vao repository
  process_document_background_task()       background processing
```

### D.3 API Routes (v3 đã có)
```
POST /api/uploads/init                 tao upload task
POST /api/uploads/{task_id}/file       upload chunk
POST /api/uploads/{task_id}/analyze    trigger AI analysis
POST /api/uploads/{task_id}/confirm    confirm + commit
GET  /api/uploads                      list user tasks
GET  /api/uploads/{task_id}            get task status
DELETE /api/uploads/{task_id}          cancel task

# Desktop-specific aliases (da co trong v3 nhung chua co client)
POST /api/ingestion/desktop/init
POST /api/ingestion/desktop/{task_id}/file
POST /api/ingestion/desktop/{task_id}/analyze
GET  /api/ingestion/desktop/{task_id}
```

### D.4 Những gì v3 CHƯA có (cần thêm)
```
GET  /api/desktop-agent/config          watch folder config
GET  /api/desktop-sync/folders          list watch folders cua user
PUT  /api/desktop-sync/folders          save watch folders
Table: desktop_sync_folders             luu cau hinh watch folder per user
```

### D.5 Trạng thái upload_tasks.status trong v3
```
uploading -> uploaded -> analyzing -> pending_confirmation
                                             |
                                       (user confirm)
                                             |
                                         processing -> completed
                                             |
                                           failed
```

---

## E. LUỒNG UPLOAD FILE CŨ CẦN TRÍCH XUẤT

### E.1 Luồng hiện tại của bản cũ
```
Desktop Agent (agent.py)
  1. Watchdog detect file moi trong watch folder
  2. wait_until_stable()  doi file on dinh
  3. file_sha256()  tinh hash, kiem tra dedupe
  4. LocalQueue.enqueue_file()  dua vao SQLite local queue
  5. AgentWorker.upload_item():
     a. _current_token()  lay JWT token
     b. Mo file binary
     c. POST /api/desktop-agent/files/detect
        multipart form: file + source_path + sync_metadata_json
        Nhan response: {id, status="WAIT_CONFIRM", ...}
     d. Neu status="WAIT_CONFIRM":
        LocalStateStore.transition(sha256, STATUS_WAITING_CONFIRMATION)
     e. Queue: QUEUE_SUCCESS
  6. AgentWorker.sync_active_states():
     a. GET /api/import-tickets/{ticket_id}
     b. _map_ticket_to_local_state() -> STATUS_*
     c. Update local state machine
  7. Neu STATUS_COMPLETED -> done
```

### E.2 Backend cũ xử lý `/api/desktop-agent/files/detect`
```python
# Old flow trong main.py (simplified)
async def detect_desktop_agent_file(file, source_path, sync_metadata_json, user):
    raw = await file.read()
    created = create_import_ticket_from_agent_file(db, user, filename, content_type, raw, ...)
    return created  # {id, status="WAIT_CONFIRM", ...}
```
Backend cũ tạo `import_ticket` riêng, KHÔNG dùng `upload_tasks`.

### E.3 Những thứ có giá trị để port sang v3

**GIỮ NGUYÊN (không port, không cần thiết):**
- `import_tickets` table logic -> v3 đã có `document_classification_tickets`
- `processing_jobs` table logic -> v3 đã có `document_processing_jobs`
- `create_import_ticket_from_agent_file()` -> v3 đã có `ingestion_service.create_upload_task()`

**PORT/ADAPT những thứ này:**
- `LocalQueue` (SQLite local) -> giữ nguyên, chỉ thay đổi endpoint gọi
- `LocalStateStore` -> giữ nguyên logic state machine
- `AgentWorker.upload_item()` -> thay chunked upload flow thay vì multipart
- `AgentWorker.sync_active_states()` -> đổi poll endpoint
- `desktop_sync_folders` table -> thêm vào v3
- `desktop_agent_sync_config()` function -> thêm vào v3 services
- `GET /api/desktop-agent/config` endpoint -> thêm vào v3
- `GET /api/desktop-sync/folders` + `PUT` -> thêm vào v3
- Watch folder config trong Settings UI -> thêm vào v3 frontend

---

## F. PHƯƠNG ÁN TÍCH HỢP VÀO BẢN v3

### F.1 Nguyên tắc tích hợp
- KHÔNG import flow cũ (`import_tickets`, `processing_jobs`) vào v3.
- KHÔNG tạo endpoint mới nếu v3 đã có endpoint tương đương.
- CHỈ thêm những gì v3 thực sự thiếu để Desktop Agent hoạt động được.
- Desktop Agent được cập nhật để nói chuyện với API của v3.

### F.2 Mapping luồng cũ → v3

| Bước cũ | API cũ | API v3 tương đương |
|---------|--------|---------------------|
| Upload file | `POST /api/desktop-agent/files/detect` (multipart) | `POST /api/ingestion/desktop/init` + `POST /api/ingestion/desktop/{id}/file` (chunked) |
| Trigger AI | Tự động trong detect | `POST /api/ingestion/desktop/{id}/analyze` |
| Poll status | `GET /api/import-tickets/{id}` | `GET /api/ingestion/desktop/{task_id}` |
| Get config | `GET /api/desktop-agent/config` | `GET /api/desktop-agent/config` **(THÊM VÀO v3)** |
| Save folders | `PUT /api/desktop-sync/folders` | `PUT /api/desktop-sync/folders` **(THÊM VÀO v3)** |

### F.3 Giải pháp bổ sung API còn thiếu
Thêm vào `main.py` của v3 (KHÔNG đụng các routes hiện có):

```python
GET  /api/desktop-agent/config    -> desktop_agent_sync_config(db, user_code)
GET  /api/desktop-sync/folders    -> list_desktop_sync_folders(db, user_code)
PUT  /api/desktop-sync/folders    -> replace_desktop_sync_folders(db, user_code, folders)
```

### F.4 Cập nhật Desktop Agent
- Đổi `upload_item()` sang flow 3 bước: init -> chunk -> analyze
- Đổi poll endpoint từ `/api/import-tickets/{id}` sang `/api/ingestion/desktop/{task_id}`
- Đổi mapping state từ `import_ticket.status` sang `upload_task.status`
- Giữ nguyên: LocalQueue, LocalStateStore, watchdog, retry/backoff, sha256 dedupe

---

## G. THIẾT KẾ LUỒNG UPLOAD FILE TỰ ĐỘNG MỚI

### G.1 Flow tổng thể

```
Desktop Agent (Local)
  Watchdog -> LocalQueue -> AgentWorker
         |
         | HTTPS
         v
v3 Backend (Unified Ingestion)
  Step 1: POST /api/ingestion/desktop/init
    -> create upload_task (source_type=desktop_agent, source_path, sha256)

  Step 2: POST /api/ingestion/desktop/{task_id}/file (chunked)
    -> append_upload_chunk()
    -> emit outbox: ingestion.file_uploaded

  Step 3: POST /api/ingestion/desktop/{task_id}/analyze
    -> create_classification_ticket()
    -> AI suggest course/specialization
    -> status: pending_confirmation
    -> emit outbox: draft.created
         |
         | Poll
         v
Desktop Agent polls:
  GET /api/ingestion/desktop/{task_id}
  Status mapping:
    uploading            -> Uploading
    analyzing            -> AI Metadata
    pending_confirmation -> Waiting Confirm
    processing           -> Moving Repository
    completed            -> Completed
    failed               -> Failed (retry?)
         |
         | Web UI
         v
v3 Web UI (repository/page.tsx)
  User thay task trong "Upload gan day" (badge: Desktop Agent)
  User xem AI suggestion: Hoc phan goi y, Document type, Do tin cay
  User chon destination (manual hoac AI)
    -> POST /api/uploads/{task_id}/confirm
    -> confirm_upload_task()
    -> validate_folder_access()
    -> create document + version + file_asset
    -> enqueue document_processing_jobs
    -> emit outbox: draft.confirmed
```

### G.2 Mapping trạng thái mới

```python
# Upload task status -> Desktop Agent local status
STATUS_MAP = {
    "uploading":              STATUS_UPLOADED,
    "uploaded":               STATUS_UPLOADED,
    "analyzing":              STATUS_PROCESSING,
    "pending_confirmation":   STATUS_WAITING_CONFIRMATION,
    "processing":             STATUS_CONFIRMED,
    "completed":              STATUS_COMPLETED,
    "failed":                 STATUS_FAILED,
}
```

### G.3 Metadata payload từ Desktop Agent

```json
{
  "filename": "CTDT_CNTT_2026.pdf",
  "mime_type": "application/pdf",
  "total_bytes": 2097152,
  "title": "CTDT_CNTT_2026",
  "visibility": "private",
  "source_type": "desktop_agent",
  "source_path": "D:/Teaching/CTDT_CNTT_2026.pdf",
  "device_id": "DESKTOP-ABC123",
  "source_sha256": "a3f9c...",
  "observed_at": "2026-06-27T22:10:00+07:00"
}
```

### G.4 Watch Folder Config Flow

```
User dang nhap v3 Web UI
  -> Settings -> Desktop Agent Watch Folders
  -> Them/xoa folder paths
  -> PUT /api/desktop-sync/folders

Desktop Agent khoi dong
  -> GET /api/desktop-agent/config
  -> Nhan danh sach watch_folders tu server
  -> Ap dung vao watchdog observers
  -> Cap nhat local config.json
```

---

## H. DANH SÁCH FILE/MODULE DỰ KIẾN CẦN SỬA

### H.1 v3 Backend

```
src/eduvault/database.py
  + Them bang desktop_sync_folders vao SCHEMA (SQLite)
  + Them bang desktop_sync_folders vao MYSQL_SCHEMA (MySQL)
  + Them migration check trong init_database()

src/eduvault/services.py
  + Them hang so DEFAULT_DESKTOP_SYNC_FOLDER
  + Them list_desktop_sync_folders(db, user_code)
  + Them replace_desktop_sync_folders(db, user_code, folders)
  + Them desktop_agent_sync_config(db, user_code)

src/eduvault/main.py
  + Them Pydantic model: DesktopSyncFolderItem, DesktopSyncFoldersInput
  + Them GET /api/desktop-agent/config
  + Them GET /api/desktop-sync/folders
  + Them PUT /api/desktop-sync/folders
  (Khong sua bat ky route nao dang ton tai)
```

### H.2 Desktop Agent

```
desktop-agent/agent.py
  ~ Sua upload_item(): multipart -> chunked 3-step flow
  ~ Sua _fetch_ticket_detail(): doi endpoint poll
  ~ Sua _map_ticket_to_local_state(): doi status mapping
  ~ Sua DEFAULT_CONFIG: them chunk_size, device_id
  + Them _get_device_id(): stable identifier per machine
  + Them upload_file_chunked(): 3-step upload
  + Them _map_upload_task_to_local_state()
  (Khong sua: LocalQueue, LocalStateStore, watchdog, auth)

desktop-agent/state.py
  (Khong thay doi)

desktop-agent/requirements.txt
  (Khong thay doi - requests da co)
```

### H.3 v3 Frontend

```
frontend/app/settings/page.tsx
  + Them section "Cau hinh Desktop Agent"
  + Component quan ly watch folders
  + API calls den GET/PUT /api/desktop-sync/folders
  (Khong sua phan Policy, Master Tree, Specializations)
```

### H.4 Files KHÔNG thay đổi

```
src/eduvault/ingestion_service.py         khong doi
src/eduvault/classification_service.py    khong doi
src/eduvault/repository_commit_service.py khong doi
src/eduvault/ai.py                        khong doi
src/eduvault/cloud.py                     khong doi
src/eduvault/policy_management.py         khong doi
frontend/components/upload-task-provider.tsx  khong doi
frontend/app/repository/page.tsx          khong doi
desktop-agent/state.py                   khong doi
```

---

## I. RỦI RO KỸ THUẬT VÀ CÁCH PHÒNG TRÁNH

### I.1 Rủi ro CAO

#### R1: Chunked upload thất bại giữa chừng
- **Mô tả**: Agent upload 5MB chunk, mạng ngắt, chunk bị mất.
- **Tác động**: File corrupt, task bị stuck ở trạng thái `uploading`.
- **Phòng tránh**:
  - Desktop Agent đã có retry/backoff logic.
  - v3 `append_upload_chunk()` có offset validation — agent resume từ `uploaded_bytes`.
  - Thêm logic resume trong `upload_file_chunked()` của agent.
- **Phát hiện**: Status = `uploading` quá 30 phút → alert.

#### R2: Desktop Agent poll loop không dừng
- **Mô tả**: Task bị stuck ở `pending_confirmation` mãi vì user không confirm.
- **Tác động**: Tốn bandwidth, log flooding.
- **Phòng tránh**:
  - Exponential backoff khi poll: 5s → 10s → 30s → 60s → ngừng sau 24h.
  - Local state machine xử lý timeout.

#### R3: SHA256 dedupe conflict
- **Mô tả**: User upload cùng file từ hai máy khác nhau.
- **Tác động**: Hai `upload_tasks` tạo ra — một bị dư thừa.
- **Phòng tránh**:
  - Agent check local `desktop_file_states` trước (đã có `should_skip_detection()`).
  - TODO Phase 2: Backend trả 409 nếu sha256 duplicate trong cùng user.

#### R4: Token hết hạn giữa chunked upload
- **Mô tả**: Upload file lớn, session expire trong khi upload.
- **Tác động**: Chunk cuối bị 401, upload fail.
- **Phòng tránh**: Agent đã có `_recover_from_unauthorized()`. Áp dụng trong chunked loop mới.

### I.2 Rủi ro TRUNG BÌNH

#### R5: `temp_path` đầy disk
- `delete_upload_task()` phải xóa temp file. Monitor disk usage.

#### R6: Migration thiếu bảng `desktop_sync_folders`
- Dùng `CREATE TABLE IF NOT EXISTS` — an toàn idempotent.

#### R7: Desktop Agent cũ vẫn chạy song song
- Không ảnh hưởng v3 vì khác backend URL. Đổi `backend_url` trong `config.json`.

### I.3 Rủi ro THẤP

#### R8: Chunked upload chậm hơn multipart
- Chunk size 5MB mặc định. Có thể config nhỏ hơn cho mạng chậm.

#### R9: Watch folder path Windows vs Linux không nhất quán
- `normalize_windows_folder_path()` đã có trong agent.py. Áp dụng khi save lên server.

---

## J. TEST PLAN CHI TIẾT

### J.1 Pre-Integration Tests (Kiểm tra trước khi tích hợp)

#### J.1.1 Smoke Tests — v3 hiện tại phải PASS
```bash
# 1. Web Upload flow - init
curl -X POST http://localhost:8000/api/uploads/init \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"filename":"test.pdf","mime_type":"application/pdf","total_bytes":1024}'
# Expected: 201, task_id tra ve

# 2. Upload chunk
curl -X POST http://localhost:8000/api/uploads/{task_id}/file \
  -H "X-Upload-Offset: 0" --data-binary @test.pdf
# Expected: 200, status="uploaded"

# 3. Analyze
curl -X POST http://localhost:8000/api/uploads/{task_id}/analyze
# Expected: 202, status="analyzing" hoac "pending_confirmation"

# 4. Confirm
curl -X POST http://localhost:8000/api/uploads/{task_id}/confirm \
  -d '{"document_type":"De cuong mon hoc","visibility":"private"}'
# Expected: 201, document created
```

#### J.1.2 Desktop Ingestion API Tests — v3 đã có
```bash
curl -X POST http://localhost:8000/api/ingestion/desktop/init ...
curl -X POST http://localhost:8000/api/ingestion/desktop/{id}/file ...
curl -X POST http://localhost:8000/api/ingestion/desktop/{id}/analyze ...
curl -X GET  http://localhost:8000/api/ingestion/desktop/{id}
```

### J.2 Integration Tests (Sau khi thêm code mới)

#### J.2.1 Database Migration Tests
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name='desktop_sync_folders';
-- Expected: 1 row returned

INSERT INTO desktop_sync_folders VALUES(...);
-- Second insert with same user+path -> Error (UNIQUE constraint) OK
```

#### J.2.2 New API Endpoint Tests
```bash
# Test GET /api/desktop-agent/config
curl -X GET http://localhost:8000/api/desktop-agent/config \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"user_code":..., "watch_folders":[...], ...}

# Test PUT /api/desktop-sync/folders
curl -X PUT http://localhost:8000/api/desktop-sync/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folders":[{"folder_path":"D:/Teaching","folder_label":"Tai lieu","enabled":true}]}'
# Expected: config object voi folders da save

# Test GET /api/desktop-sync/folders
curl -X GET http://localhost:8000/api/desktop-sync/folders \
  -H "Authorization: Bearer $TOKEN"
# Expected: cung config
```

#### J.2.3 Desktop Agent Integration Tests
```bash
# 1. Agent login
python agent.py --login

# 2. Copy 1 file nho vao watch folder
# Expected:
#   Task tao voi source_type="desktop_agent"
#   source_path ghi dung
#   source_sha256 khop file

# 3. Verify ticket tao sau analyze
# Expected: document_classification_tickets co record moi

# 4. Verify poll status
# Expected: Agent nhan "pending_confirmation", cap nhat local state

# 5. Web UI confirm ticket
# Expected: document_processing_jobs tao, status="completed"

# 6. Agent nhan "completed"
# Expected: local state = STATUS_COMPLETED, khong poll tiep
```

#### J.2.4 Regression Tests — Web Upload KHÔNG bị ảnh hưởng
```bash
# Toan bo web upload flow thu lai sau khi them code moi
# Phai PASS 100% nhu truoc khi them
```

### J.3 Edge Case Tests

```
1. Upload file trung SHA256 (dedupe)
   -> Agent khong upload lai (local check)

2. Network ngat giua chunk upload
   -> Resume tu uploaded_bytes dung

3. Session expire giua upload
   -> Agent re-auth, retry

4. User DELETE task "pending_confirmation"
   -> Task xoa, temp file xoa, agent poll nhan 404 -> STATUS_FAILED

5. Folder path khong ton tai tren disk
   -> Agent log warning, bo qua folder

6. File dang duoc ghi (chua stable)
   -> wait_until_stable() doi, khong upload som

7. Upload vao folder khong co quyen
   -> validate_folder_access() raise 403
   -> Task status=failed

8. Concurrent upload tu 2 agent (cung user, khac may)
   -> 2 task rieng biet, khong conflict
```

### J.4 Performance Tests

```bash
# Upload file 25MB (MAX_UPLOAD_BYTES)
# Expected: < 30s tren LAN 100Mbps

# 10 file small (< 1MB) upload dong thoi
# Expected: tat ca complete trong 60s
```

---

## K. ROLLBACK PLAN

### K.1 Điều kiện trigger rollback
- Upload task không tạo được (500 từ `/api/ingestion/desktop/init`)
- `confirm_upload_task()` raise unhandled exception
- `document_processing_jobs` bị stuck sau confirm
- Web Upload cũ bị broken (regression)
- Database corruption

### K.2 Rollback Backend v3

```bash
# K.2.1 Revert code changes
git stash  # hoac git checkout HEAD~1

# K.2.2 Rollback database (chi bang moi, khong dung bang cu)
# SQLite:
sqlite3 data/mvp/eduvault.db "DROP TABLE IF EXISTS desktop_sync_folders;"
# MySQL:
mysql -u eduvault -p eduvault -e "DROP TABLE IF EXISTS desktop_sync_folders;"

# K.2.3 Restart backend
python run_mvp.py

# K.2.4 Verify health
curl http://localhost:8000/api/health
```

### K.3 Rollback Desktop Agent

```bash
git checkout HEAD~1 -- desktop-agent/agent.py
```

### K.4 Bảo vệ dữ liệu đã upload
- Tất cả `upload_tasks` đã tạo vẫn còn trong database.
- Temp files vẫn còn trong `data/mvp/uploads/`.
- Không có data loss khi rollback — chỉ mất feature Desktop Agent.
- Các document đã được confirm vẫn nguyên vẹn.

### K.5 Rollback không ảnh hưởng
- Web Upload qua Browser vẫn hoạt động bình thường.
- Policy, Master Tree, Permission system không liên quan.
- Cloud Sync không liên quan.

---

## L. CHECKLIST TRƯỚC KHI TRIỂN KHAI

### L.1 Code Review
- [ ] `database.py` — bảng `desktop_sync_folders` dùng `CREATE TABLE IF NOT EXISTS`
- [ ] `services.py` — 3 hàm mới không đụng hàm cũ
- [ ] `main.py` — 3 route mới không conflict với route cũ
- [ ] `main.py` — KHÔNG sửa bất kỳ route đang tồn tại
- [ ] `agent.py` — chunked upload có retry đúng offset
- [ ] `agent.py` — `source_type="desktop_agent"` được gửi đúng
- [ ] `agent.py` — poll endpoint trỏ đúng v3 API
- [ ] `agent.py` — re-auth logic hoạt động trong chunked loop

### L.2 Database
- [ ] Backup database v3 hiện tại trước khi deploy
- [ ] Kiểm tra `init_database()` idempotent (chạy 2 lần không lỗi)
- [ ] Test migration trên môi trường staging trước

### L.3 Environment
- [ ] `backend_url` trong `config.json` của agent đã trỏ đúng v3
- [ ] Token v3 hoạt động (test login)
- [ ] `MAX_UPLOAD_MB` env var đã set phù hợp
- [ ] Disk space đủ cho temp uploads

### L.4 Testing
- [ ] Tất cả smoke tests v3 hiện tại đều PASS
- [ ] New API endpoint tests PASS
- [ ] Desktop Agent integration test PASS
- [ ] Regression tests web upload PASS
- [ ] Edge case: large file (> 10MB) PASS
- [ ] Edge case: network retry PASS

### L.5 Documentation
- [ ] README v3 cập nhật Desktop Agent setup instructions
- [ ] `config.json.example` có `backend_url` mới

---

## M. CHECKLIST SAU KHI TRIỂN KHAI

### M.1 Monitoring (trong 24h đầu)
- [ ] `upload_tasks` table — có record mới với `source_type="desktop_agent"`
- [ ] `outbox_events` table — có events `ingestion.job_created`, `draft.created`
- [ ] `document_classification_tickets` — ticket được tạo sau analyze
- [ ] `audit_logs` — có `upload.started` và `upload.classification_ticket`
- [ ] Không có 500 error trong v3 backend logs
- [ ] Không có unhandled exception trong agent logs

### M.2 Functional Verification
- [ ] Upload 1 file thật → ticket tạo → user confirm → document xuất hiện trong repository
- [ ] Desktop Agent poll và nhận status đúng: `pending_confirmation`
- [ ] Sau confirm, agent nhận `processing` → `completed`
- [ ] Web Upload qua browser vẫn hoạt động bình thường
- [ ] Watch folder config được lưu và load đúng

### M.3 Performance Check
- [ ] Upload latency không tăng đáng kể so với trước
- [ ] v3 backend response time < 500ms cho health check
- [ ] Không có memory leak sau 1h agent chạy liên tục

### M.4 Cleanup
- [ ] Xóa temp files cũ trong `data/mvp/uploads/`
- [ ] Xóa orphaned `upload_tasks` (status=uploading > 24h)

---

## N. KẾ HOẠCH THỰC HIỆN THEO TỪNG BƯỚC NHỎ, AN TOÀN

> **Mỗi bước phải có trạng thái "xanh" (rollback-safe) trước khi sang bước tiếp.**
> Không merge nếu test của bước hiện tại chưa pass.

---

### BƯỚC 0 — Chuẩn bị & Baseline (Không thay đổi code)
```
Thoi gian uoc tinh: 30 phut

0.1. Backup database v3:
     cp data/mvp/eduvault.db data/mvp/eduvault.db.backup-YYYYMMDD

0.2. Chay toan bo smoke tests v3 hien tai -> phai PASS 100%

0.3. Tao git branch: feature/desktop-agent-v3-integration

0.4. Verify agent.py ban cu chay duoc (voi backend cu neu con)
```

**Gate**: Database đã backup, baseline tests PASS → sang Bước 1

---

### BƯỚC 1 — Thêm Database Schema
```
Thoi gian uoc tinh: 1 gio
Files: src/eduvault/database.py

1.1. Them desktop_sync_folders vao SCHEMA (SQLite block):
     CREATE TABLE IF NOT EXISTS desktop_sync_folders (
       id TEXT PRIMARY KEY,
       user_code TEXT NOT NULL,
       folder_path TEXT NOT NULL,
       folder_label TEXT NOT NULL DEFAULT '',
       enabled INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       UNIQUE(user_code, folder_path),
       FOREIGN KEY(user_code) REFERENCES users(code)
     );

1.2. Them desktop_sync_folders vao MYSQL_SCHEMA (MySQL block)
     (Schema tuong duong, dung VARCHAR, UNIQUE KEY, INDEX)

1.3. Them migration check vao init_database()

1.4. Test: sqlite3 data/mvp/eduvault.db ".tables" | grep desktop_sync
```

**Gate**: Table tồn tại, `init_database()` idempotent → sang Bước 2

---

### BƯỚC 2 — Thêm Service Functions
```
Thoi gian uoc tinh: 2 gio
Files: src/eduvault/services.py

2.1. Them list_desktop_sync_folders(db, user_code, include_disabled=False)
     SELECT * FROM desktop_sync_folders WHERE user_code=?

2.2. Them replace_desktop_sync_folders(db, user_code, folders: list[dict])
     DELETE + UPSERT (INSERT OR REPLACE)

2.3. Them desktop_agent_sync_config(db, user_code)
     Goi list_desktop_sync_folders(), tra ve cau truc config cho agent

2.4. Unit test trong Python shell
```

**Gate**: 3 hàm hoạt động đúng, không side effect → sang Bước 3

---

### BƯỚC 3 — Thêm API Routes Backend
```
Thoi gian uoc tinh: 2 gio
Files: src/eduvault/main.py

3.1. Them Pydantic models:
     class DesktopSyncFolderItem(BaseModel):
         folder_path: str
         folder_label: str = ""
         enabled: bool = True

     class DesktopSyncFoldersInput(BaseModel):
         folders: list[DesktopSyncFolderItem]

3.2. Them GET /api/desktop-agent/config
3.3. Them GET /api/desktop-sync/folders
3.4. Them PUT /api/desktop-sync/folders

3.5. Test voi curl (xem J.2.2)
```

**Gate**: 3 routes hoạt động, web upload cũ vẫn PASS → sang Bước 4

---

### BƯỚC 4 — Cập nhật Desktop Agent (Core change)
```
Thoi gian uoc tinh: 4 gio
Files: desktop-agent/agent.py

4.1. Them _get_device_id(): platform.node() hoac MAC address

4.2. Them upload_file_chunked(token, path, metadata):
     Step 1: POST /api/ingestion/desktop/init
     Step 2: Loop upload chunks (5MB) voi retry
     Step 3: POST /api/ingestion/desktop/{task_id}/analyze
     Return: task_id

4.3. Sua upload_item() de dung upload_file_chunked()
     Giu nguyen: auth, logging, local state update, notifications

4.4. Them _map_upload_task_to_local_state(upload_task_payload):
     Mapping tu upload_task.status -> STATUS_*

4.5. Sua _fetch_ticket_detail():
     /api/import-tickets/{id} -> /api/ingestion/desktop/{task_id}

4.6. Sua _map_ticket_to_local_state():
     Dung _map_upload_task_to_local_state() moi

4.7. Test tich hop co ban (xem J.2.3)
```

**Gate**: 1 file upload end-to-end thành công, ticket tạo → sang Bước 5

---

### BƯỚC 5 — Cập nhật Frontend Settings
```
Thoi gian uoc tinh: 3 gio
Files: frontend/app/settings/page.tsx

5.1. Them state: watchFolders, newFolderPath

5.2. Them API calls:
     GET /api/desktop-sync/folders -> load
     PUT /api/desktop-sync/folders -> save

5.3. Them UI section:
     - Danh sach watch folders
     - Them/xoa folder path
     - Enable/disable tung folder
     - Huong dan chay Desktop Agent

5.4. Test UI: them -> save -> reload -> verify
```

**Gate**: UI settings hoạt động, backend sync đúng → sang Bước 6

---

### BƯỚC 6 — Full Integration Test & Cleanup
```
Thoi gian uoc tinh: 2 gio

6.1. Chay toan bo test plan (J.1 den J.4)
6.2. Fix bat ky loi nao phat sinh
6.3. Review code lan cuoi
6.4. Merge vao main branch
6.5. Deploy len staging (neu co)
6.6. Monitor 24h (theo M.1)
```

**Gate**: Toàn bộ tests PASS, monitoring 24h sạch → DONE

---

## TÓM TẮT CÔNG VIỆC

| Bước | Thời gian | Rủi ro | Rollback dễ? |
|------|-----------|--------|-------------|
| 0. Chuẩn bị | 30 phút | Không | N/A |
| 1. Database Schema | 1 giờ | Thấp | Dễ (DROP TABLE) |
| 2. Service Functions | 2 giờ | Thấp | Dễ (code only) |
| 3. API Routes | 2 giờ | Thấp | Dễ (code only) |
| 4. Desktop Agent | 4 giờ | Trung bình | Dễ (git revert) |
| 5. Frontend UI | 3 giờ | Thấp | Dễ (code only) |
| 6. Integration Test | 2 giờ | Thấp | N/A |
| **Tổng** | **~14 giờ** | | |

---

## PHỤ LỤC: QUYẾT ĐỊNH KIẾN TRÚC (ADRs)

### ADR-001: Giữ nguyên `upload_tasks` thay vì tạo `ingestion_jobs`
**Quyết định**: Dùng `upload_tasks` hiện có, không rename.
**Lý do**: v3 đã stable, UI đang dùng. Rename gây migration lớn không cần thiết.
**Trade-off**: Tên bảng không phản ánh đúng domain concept — chấp nhận được vì có document.

### ADR-002: Chunked upload thay vì multipart
**Quyết định**: Dùng chunked upload (3 bước) thay vì multipart 1 request.
**Lý do**: v3 backend đã thiết kế sẵn chunked flow. Resume sau network failure. Progress tracking.
**Trade-off**: Phức tạp hơn ở agent side — worth it.

### ADR-003: Desktop Agent KHÔNG tự confirm ticket
**Quyết định**: Agent chỉ upload và poll. User phải confirm qua Web UI.
**Lý do**: Security boundary của v3. AI không phải authority cuối.
**Trade-off**: Cần user action — tốt vì đảm bảo governance.

### ADR-004: SHA256 dedupe chỉ ở client side (Phase 1)
**Quyết định**: Phase 1 chỉ dedupe trong LocalStateStore của agent. Server chưa enforce.
**Lý do**: Giảm scope Phase 1. Server-side dedupe có thể thêm sau.
**Trade-off**: Race condition khi 2 agent upload cùng file — rare, acceptable for now.

---

*Tài liệu này sẽ được cập nhật sau mỗi bước thực hiện.*
*Mọi thay đổi so với kế hoạch phải được ghi chú lý do.*
