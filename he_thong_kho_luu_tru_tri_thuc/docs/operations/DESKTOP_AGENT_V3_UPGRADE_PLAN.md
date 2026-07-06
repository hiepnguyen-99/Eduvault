# Ke hoach kien truc nang cap V3 de tich hop Desktop Agent

## 1. Muc tieu tai lieu

Tai lieu nay mo ta kien truc dich va lo trinh trien khai de dua chuc nang tai tu dong tu desktop vao `he_thong_kho_luu_tru_tri_thuc_v3` ma khong pha vo kien truc hien tai cua V3.

Muc tieu chinh:

- Giu V3 la he thong loi quan tri tri thuc va repository.
- Dua Desktop Agent thanh mot kenh ingestion chuan hoa, khong phai mot nhanh nghiep vu song song.
- Tai su dung toi da cac thanh phan da co cua V3.
- Giam no ky thuat, giam duplicate flow, de mo rong them cloud sync, bulk import, API import sau nay.

---

## 2. Ket luan kien truc

### 2.1 Quy dinh kien truc cap cao

Khong nen dua nguyen cum `import_tickets`, `desktop_agent_files`, `processing_jobs` tu ban cu vao V3.

Huong dung la:

- Giu `documents`, `folder_nodes`, `policy`, `permission`, `processing` cua V3 lam source of truth.
- Chuyen Desktop Agent thanh mot producer ben ngoai, gui file vao mot ingestion flow thong nhat.
- Dung `upload_tasks` va `document_classification_tickets` hien co cua V3 lam nen cho draft review flow.
- Xem desktop upload la mot `source channel`, khong xem la mot domain rieng.

### 2.2 Tuyen bo kien truc dich

Kien truc dich cua V3 se co 4 lop ro rang:

1. `Source Adapters`
   - Desktop Agent
   - Web Upload
   - Cloud Sync trong tuong lai
   - Bulk Import / API Import trong tuong lai

2. `Unified Ingestion Layer`
   - Tao ingestion job
   - Nhan binary
   - Quan ly temp storage
   - Kich hoat AI classification
   - Tao draft review ticket

3. `Repository Governance Core`
   - Policy tree
   - Folder permission
   - Validate destination
   - Confirm va commit document/version/file asset

4. `Async Processing Layer`
   - OCR / text extraction
   - chunk / embed / index
   - sync / replica / thong bao
   - audit / telemetry / retry

Desktop Agent chi duoc phep di toi lop 2. V3 core se quyet dinh lop 3 va lop 4.

---

## 3. Danh gia hien trang V3

### 3.1 Nhung khoi da co san va nen giu lai

V3 da co san nhieu thanh phan rat phu hop:

- `upload_tasks`
  - dong vai tro ingestion task cho web upload
- `document_classification_tickets`
  - dong vai tro draft review truoc khi commit
- `document_processing_jobs`
  - dong vai tro async processing sau khi confirm
- `outbox_events`
  - la nen tang de chuyen sang event-driven orchestration sau nay
- `confirm_upload()`
  - da co logic validate `folder_node_id`, `document_type`, `policy`, `specialization`, `course`
- `validate_folder_access()`
  - da la chokepoint quan trong de bao ve permission model

### 3.2 Van de neu tich hop sai

Neu copy flow cu vao V3 theo kieu "them cho chay" thi se gap 6 van de lon:

1. Hai lifecycle song song
   - `upload_tasks` cua V3
   - `import_tickets` cua ban cu

2. Hai ticket model song song
   - classification ticket
   - import ticket

3. Hai queue / processing model song song
   - `document_processing_jobs`
   - `processing_jobs` cu

4. Tang duplicate trong validate destination
   - V3 da validate bang `folder_node_id`
   - flow cu con logic fallback theo AI placement

5. Main backend se tiep tuc phinh ra
   - `src/eduvault/main.py` da dang lon
   - neu cong them flow cu se thanh god file

6. Kho mo rong cho cac source khac
   - sau nay cloud sync, email, bulk import lai can them flow rieng nua

---

## 4. Nguyen tac kien truc bat buoc

## 4.1 Source of truth duy nhat

Chi V3 core duoc phep:

- tao `documents`
- tao `versions`
- ghi `file_assets`
- quyet dinh `folder_node_id` cuoi cung
- enqueue `document_processing_jobs`

Desktop Agent khong duoc commit truc tiep vao repository.

## 4.2 AI la tro ly, khong la authority

AI chi duoc:

- de xuat course
- de xuat document type
- de xuat folder
- dua confidence va reasoning

AI khong duoc:

- vuot qua `validate_folder_access`
- tu commit file vao final repository
- tu quyet dinh destination cuoi cung neu user khong xac nhan

## 4.3 Ingestion va repository la hai bounded context

Can tach ro:

- `Ingestion`
  - tiep nhan file
  - temp storage
  - metadata draft
  - review state

- `Repository`
  - folder governance
  - ownership
  - versioning
  - processing

## 4.4 Mot ingestion contract cho moi source

Moi source moi trong tuong lai deu phai di qua cung contract:

1. `create ingestion job`
2. `upload/attach binary`
3. `analyze`
4. `create draft review`
5. `confirm or reject`
6. `commit into repository`
7. `async processing`

---

## 5. Kien truc dich chi tiet

## 5.1 Topology cap cao

```text
Desktop Agent / Web UI / Cloud Sync / API Import
                    |
                    v
           Unified Ingestion Layer
                    |
        +-----------+-----------+
        |                       |
        v                       v
  Draft Classification     Ingestion Tracking
        |                       |
        +-----------+-----------+
                    |
                    v
         Repository Governance Core
                    |
                    v
          Document Commit + Versioning
                    |
                    v
           Async Processing Pipeline
                    |
                    v
       Search / Embedding / Sync / Audit / Notification
```

## 5.2 Domain model de xuat

Khong can rewrite het database ngay lap tuc, nhung kien truc dich nen huong toi 3 domain object ro:

### A. `ingestion_jobs`

Trach nhiem:

- luu thong tin file vao
- theo doi upload state
- luu source metadata
- quan ly temp file
- doi sang review state

Toi thieu can co:

- `id`
- `source_type`
- `source_path`
- `device_id`
- `user_code`
- `filename`
- `mime_type`
- `sha256`
- `total_bytes`
- `uploaded_bytes`
- `status`
- `temp_path`
- `metadata_json`
- `created_at`
- `updated_at`

### B. `draft_documents`

Trach nhiem:

- luu AI suggestion
- luu reasoning
- luu confidence
- luu selection cua user
- luu trang thai chua confirm / da confirm / rejected

Toi thieu can co:

- `id`
- `ingestion_job_id`
- `suggested_specialization_id`
- `suggested_course_id`
- `suggested_document_type`
- `suggested_visibility`
- `suggested_folder_node_id`
- `reasoning`
- `confidence`
- `suggestions_json`
- `selected_specialization_id`
- `selected_course_id`
- `selected_document_type`
- `selected_visibility`
- `selected_folder_node_id`
- `status`
- `document_id`

### C. `documents`

Trach nhiem:

- ban chinh thuc trong repository
- thuoc policy tree
- co version va file asset
- duoc index va sync sau commit

V3 da co domain nay, can giu nguyen.

## 5.3 Mapping voi schema hien tai

De tranh refactor qua lon, giai doan dau co the map nhu sau:

- `upload_tasks` hien tai dong vai `ingestion_jobs`
- `document_classification_tickets` hien tai dong vai `draft_documents`
- `documents` giu nguyen
- `document_processing_jobs` giu nguyen

Nghia la:

- khong can doi ten bang ngay
- nhung service va tai lieu phai goi dung vai tro kien truc cua chung

---

## 6. Thiet ke cho Desktop Agent trong V3

## 6.1 Vai tro moi cua Desktop Agent

Desktop Agent khong con la mot flow business rieng.

Desktop Agent chi la:

- local watcher
- local queue manager
- upload client
- retry/backoff worker
- review status poller

Desktop Agent khong duoc:

- tao document
- commit version
- quyet dinh final folder
- chay processing job

## 6.2 API contract cho Desktop Agent

Desktop Agent nen goi cung ingestion contract cua V3.

### Phase 1: tai su dung API hien co

Desktop Agent co the goi:

1. `POST /api/uploads/init`
2. `POST /api/uploads/{task_id}/file`
3. `POST /api/uploads/{task_id}/analyze`
4. `GET /api/uploads/{task_id}`
5. neu can, endpoint doc draft review status

Can bo sung metadata nguon:

- `source_type = desktop_agent`
- `source_path`
- `device_id`
- `observed_at`
- `sha256`

### Phase 2: API clean hon cho adapter

Sau khi on dinh, co the them namespace rieng:

- `POST /api/ingestion/desktop/init`
- `POST /api/ingestion/desktop/{job_id}/file`
- `POST /api/ingestion/desktop/{job_id}/analyze`
- `GET /api/ingestion/desktop/{job_id}`

Nhung namespace nay ben trong van phai dung chung `ingestion_service`.

## 6.3 Local queue cua Desktop Agent

Phan nay nen giu tu ban cu vi gia tri rat cao:

- local SQLite queue
- dedupe bang `sha256`
- retry/backoff
- offline tolerant
- re-auth khi 401

Kien truc nay rat phu hop va khong can dua vao V3 backend.

---

## 7. Refactor backend de dung kien truc

## 7.1 Muc tieu refactor

Khong tiep tuc de nghiep vu upload, ingestion, classification, commit nam dan trong `main.py`.

Can tach thanh service va router ro rang.

## 7.2 Cau truc de xuat

```text
src/eduvault/
  routers/
    uploads.py
    ingestion.py
    repository.py
    desktop_agent.py
  services/
    ingestion_service.py
    classification_service.py
    draft_review_service.py
    repository_commit_service.py
    processing_service.py
  schemas/
    ingestion.py
    classification.py
    repository.py
```

Neu chua muon doi folder lon, co the bat dau bang cach tao file service truoc, roi moi tach router.

## 7.3 Service boundary can co

### `ingestion_service.py`

Trach nhiem:

- tao upload/ingestion job
- ghi temp file
- luu metadata source
- doc trang thai ingestion

### `classification_service.py`

Trach nhiem:

- preview text
- extract text
- guess metadata
- suggest course / folder / document type
- tao classification draft

### `draft_review_service.py`

Trach nhiem:

- load draft cho UI
- cho phep confirm / reject / refresh analysis
- ghi de len selection cua user

### `repository_commit_service.py`

Trach nhiem:

- validate `folder_node_id`
- validate `document_type`
- map specialization / course / folder
- tao / update document
- tao version + file asset

### `processing_service.py`

Trach nhiem:

- enqueue processing jobs
- run jobs
- retry / fail / finalize

---

## 8. Event-driven direction

## 8.1 Vi sao can huong event-driven

V3 da co `outbox_events`. Day la diem rat quy de nang cap kien truc.

Neu tiep tuc dung request-response day nghiep vu trong mot route:

- kho retry
- kho scale worker
- kho audit end-to-end
- kho them notification

## 8.2 Event flow de xuat

Sau nay nen huong toi cac event:

- `ingestion.job_created`
- `ingestion.file_uploaded`
- `ingestion.analysis_requested`
- `draft.created`
- `draft.confirmed`
- `document.committed`
- `document.processing_started`
- `document.processing_completed`
- `document.processing_failed`

## 8.3 Cach ap dung thuc te

Khong can dung message broker ngay lap tuc.

Giai doan 1:

- Ghi `outbox_events` khi tao / doi state quan trong
- worker noi bo poll `outbox_events`

Giai doan 2:

- tach worker rieng
- them retry / dead-letter / observability

---

## 9. UX dich cho V3

## 9.1 Doi ten nghiep vu

Khong nen de nguoi dung thay ten `Import Ticket` theo logic ban cu.

Nen dung ngon ngu thong nhat:

- `Ban nhap tai lieu cho xac nhan`
- `Tai lieu cho phe duyet`
- `Goi y AI`
- `Nguon tai lieu: Desktop / Web / Cloud`

## 9.2 Nguyen tac UX

- AI suggestion la thong tin tham khao.
- Manual selection la authority.
- Folder picker cua Master Tree la diem chot cuoi.
- Luon hien ly do AI de xuat.
- Luon cho user override de dang.

## 9.3 Man hinh de xuat

1. `Ingestion Inbox`
   - hien cac draft tu moi nguon
   - filter theo source
   - filter theo status

2. `Draft Review Detail`
   - preview file
   - AI suggestion
   - confidence
   - reasoning
   - manual destination selector
   - confirm / reject

3. `Processing Monitor`
   - sau confirm, theo doi processing state
   - tich hop voi `document_processing_jobs`

---

## 10. Roadmap trien khai theo phase

## Phase 0 - Chot kien truc va boundary

Muc tieu:

- thong nhat team rang khong import nguyen flow cu vao V3
- thong nhat V3 dung `upload_tasks + classification_tickets` lam ingestion foundation
- thong nhat Desktop Agent chi la source adapter

Deliverables:

- tai lieu nay
- architecture review
- danh sach file se refactor

## Phase 1 - Adapter Desktop Agent vao flow hien co cua V3

Muc tieu:

- cho Desktop Agent upload file vao V3 bang API upload hien co
- luu them desktop source metadata

Viec can lam:

- mo rong `upload_tasks.metadata`
- bo sung `source_type`, `source_path`, `device_id`, `sha256`
- cap nhat Desktop Agent de goi API V3
- bo sung API status cho agent poll

Khong lam trong phase nay:

- doi ten bang
- rewrite UI lon
- event bus day du

Do uu tien: rat cao

## Phase 2 - Tach service trong backend V3

Muc tieu:

- giam tai cho `main.py`
- dua upload/analysis/confirm vao service ro rang

Viec can lam:

- tao `ingestion_service.py`
- tao `classification_service.py`
- tao `repository_commit_service.py`
- route chi con vai tro HTTP mapping

Do uu tien: rat cao

## Phase 3 - Thong nhat draft review UX

Muc tieu:

- khong de desktop co UI rieng kieu import-tickets cu
- tat ca nguon deu vao mot inbox chung

Viec can lam:

- bo sung source badge trong frontend
- tao draft review list
- tao detail panel cho classification draft
- cho desktop va web upload dung chung review experience

Do uu tien: cao

## Phase 4 - Event hoa cac state quan trong

Muc tieu:

- chuyen cac transition quan trong thanh outbox events
- tao worker orchestration gon gang hon

Viec can lam:

- ghi `outbox_events` khi create/analyze/confirm/commit/process
- bo sung worker xu ly event
- them telemetry cho latency va failure

Do uu tien: trung binh cao

## Phase 5 - Doi ten domain cho dung nghia kien truc

Muc tieu:

- neu can, doi `upload_tasks` thanh `ingestion_jobs`
- doi `document_classification_tickets` thanh `draft_documents`

Luu y:

- phase nay chi nen lam sau khi flow da on dinh
- neu doi ten som se ton cong migration va test rat lon

Do uu tien: trung binh

---

## 11. Ke hoach migration database

## 11.1 Muc tieu migration toi thieu

Khong lam migration pha schema lon ngay.

Can uu tien migration toi thieu:

- them source metadata
- them auditability
- them link giua ingestion va final document neu chua ro

## 11.2 De xuat migration phase 1

Lua chon A:

- giu nguyen `upload_tasks`
- bo sung metadata JSON co:
  - `source_type`
  - `source_path`
  - `device_id`
  - `sha256`
  - `observed_at`

Lua chon B, sach hon:

- tao bang `ingestion_sources`

```text
ingestion_sources
- ingestion_job_id
- source_type
- source_path
- device_id
- source_sha256
- observed_at
- created_at
```

De xuat:

- Phase 1 dung Lua chon A de nhanh
- Phase 3 hoac 4 moi tach sang bang rieng neu can query nhieu

---

## 12. Ke hoach testing

## 12.1 Test levels bat buoc

1. Unit test
   - service ingestion
   - service classification
   - service commit

2. Integration test
   - desktop upload -> analyze -> confirm -> processing
   - desktop upload -> reject
   - desktop upload file trung `sha256`
   - desktop upload file mat ket noi -> retry

3. Permission test
   - Desktop Agent khong the commit vao folder khong duoc quyen
   - AI suggestion sai nhung user manual chon dung van confirm duoc

4. Regression test
   - web upload cu van chay
   - processing jobs cu van chay
   - policy tree cu van chay

## 12.2 Test scenarios quan trong nhat

- Upload tu desktop voi file dung course
- Upload tu desktop voi file AI de xuat sai course
- Upload tu desktop voi file khong trich xuat du text
- Upload update version cho document da co
- Upload duplicated file bang cung `sha256`
- User het session giua luc agent upload
- User confirm vao folder khong hop le
- Processing fail sau confirm

---

## 13. Quan sat he thong va telemetry

Can theo doi:

- thoi gian upload
- thoi gian analyze
- thoi gian cho confirm
- thoi gian processing
- ty le AI suggestion dung / sai
- ty le user override AI suggestion
- ty le file bi reject
- ty le worker retry

KPI de danh gia:

- `desktop_to_draft_latency`
- `draft_to_confirm_latency`
- `confirm_to_indexed_latency`
- `ai_destination_acceptance_rate`
- `retry_success_rate`

---

## 14. Rui ro va giam thieu

## Rui ro 1: duplicate lifecycle

Mo ta:

- team de y tuong "them import_tickets cho desktop"

Giam thieu:

- kiem soat boundary ngay tu phase 0
- chi cho desktop di qua ingestion flow cua V3

## Rui ro 2: main.py tiep tuc phinh to

Mo ta:

- route upload/analyze/confirm tiep tuc tang do phuc tap

Giam thieu:

- tach service tu phase 2

## Rui ro 3: AI placement lan quyen manual

Mo ta:

- de xuat AI co the tro thanh final decision

Giam thieu:

- giu `validate_folder_access()` va `folder_node_id` manual la authority

## Rui ro 4: Desktop Agent buoc phai biet logic tree noi bo

Mo ta:

- agent bi buoc map tree, policy, folder type

Giam thieu:

- agent chi upload va poll
- UI web xu ly review/confirm

## Rui ro 5: migration schema qua som

Mo ta:

- doi ten bang va domain object khi chua on dinh flow

Giam thieu:

- map role kien truc truoc, rename schema sau

---

## 15. Danh sach cong viec uu tien theo file hien tai

## Backend

- `src/eduvault/main.py`
  - tach logic upload, analyze, confirm ra service
- `src/eduvault/services.py`
  - dua boundary ro hon cho commit/processing/validation
- `src/eduvault/database.py`
  - them metadata migration nhe cho ingestion source

## Frontend

- `frontend/app/repository/page.tsx`
  - bo sung source badge va draft review flow neu can
- `frontend/components/upload-task-provider.tsx`
  - dong bo status tu desktop ingestion neu can

## Desktop Agent

- tai repo desktop hien tai
  - doi API target tu flow cu sang V3 upload flow
  - giu local queue, retry, re-auth

---

## 16. Quyet dinh kien truc de chot voi team

Can chot 6 quyet dinh sau truoc khi code:

1. Desktop Agent khong duoc mang `import_tickets` domain cu vao V3.
2. `upload_tasks` va `document_classification_tickets` se la ingestion foundation cua V3.
3. `folder_node_id` manual va policy validation la authority cuoi cung.
4. `main.py` phai duoc tach service trong qua trinh trien khai, khong cong them logic theo kieu chong chat.
5. `outbox_events` se la huong nang cap chinh cho orchestration va telemetry.
6. Schema rename chi lam sau khi flow da on dinh va test da day du.

---

## 17. Khuyen nghi trien khai thuc te

Neu muc tieu la an toan, nhanh, dung kien truc, thu tu thuc hien tot nhat la:

1. Adapter Desktop Agent vao flow upload hien co cua V3.
2. Them metadata source cho ingestion.
3. Tach service khoi `main.py`.
4. Thong nhat draft review UI cho desktop va web.
5. Them outbox-based orchestration.
6. Chi sau do moi can nhac rename schema/domain.

Day la huong co chi phi hop ly nhat, it rui ro nhat, va dep nhat ve kien truc cho V3.

---

## 18. Phase implementation plan theo file va thu tu sua

Phan nay liet ke chinh xac file nao can sua trong V3, sua theo thu tu nao, va vi sao phai sua theo thu tu do.

## 18.1 Nguyen tac sap thu tu

Thu tu sua phai di theo dependency that:

1. Database / schema support truoc
2. Backend service boundary truoc
3. Backend route wiring sau
4. Frontend consume API sau khi contract on dinh
5. Test cap nhat cuoi moi phase de khoa regression

Khong nen sua frontend truoc khi backend contract on dinh.
Khong nen dua Desktop Agent vao truoc khi V3 co source metadata va service boundary ro rang.

## 18.2 Danh sach file uu tien cap 1

Day la nhung file can sua som nhat, vi chung la skeleton cua implementation:

1. `src/eduvault/database.py`
2. `src/eduvault/main.py`
3. `src/eduvault/services.py`
4. `tests/test_mvp_api.py`

Day la nhung file uu tien cap 2:

5. `frontend/lib/api.ts`
6. `frontend/components/upload-task-provider.tsx`
7. `frontend/app/repository/page.tsx`

Day la nhung file nen them moi:

8. `src/eduvault/ingestion_service.py`
9. `src/eduvault/classification_service.py`
10. `src/eduvault/repository_commit_service.py`

Neu muon tach router som hon:

11. `src/eduvault/uploads_router.py` hoac `src/eduvault/routers/uploads.py`
12. `src/eduvault/desktop_ingestion_router.py` hoac `src/eduvault/routers/desktop_ingestion.py`

## 18.3 Thu tu sua de xuat chi tiet

### Buoc 1 - Mo rong data contract cho ingestion source

#### Sua truoc: `src/eduvault/database.py`

Muc tieu:

- cho V3 biet file nao den tu desktop
- luu du tracing source ngay tu phase dau

Can sua:

- bo sung metadata source cho `upload_tasks`
- neu giu huong JSON metadata:
  - chuan hoa cac key `source_type`, `source_path`, `device_id`, `source_sha256`, `observed_at`
- neu can migration helper:
  - them helper normalize metadata cu -> metadata moi

Tai sao sua truoc:

- moi service va route sau do deu phai dua vao data contract nay

Output mong muon:

- moi upload task deu co kha nang mang source metadata
- web upload va desktop upload dung chung mot ingestion envelope

#### Sua ngay sau do: `tests/test_mvp_api.py`

Can them test cho:

- init upload co source metadata
- metadata duoc luu va doc lai dung

Khong can doi UI o buoc nay.

---

### Buoc 2 - Tach nghiep vu ingestion khoi `main.py`

#### Tao moi: `src/eduvault/ingestion_service.py`

Muc tieu:

- rut phan nghiep vu sau ra khoi route:
  - tao upload task
  - append chunk
  - load status
  - xoa task

Nen dua vao service:

- logic tu `init_upload()`
- logic tu `upload_chunk()`
- logic doc / update `upload_tasks`
- helper `upload_task_public()`

#### Sua song song: `src/eduvault/main.py`

Muc tieu:

- route chi con vai tro HTTP adapter

Can refactor cac route:

- `POST /api/uploads/init`
- `POST /api/uploads/{task_id}/file`
- `GET /api/uploads`
- `GET /api/uploads/{task_id}`
- `DELETE /api/uploads/{task_id}`

Tai sao day la buoc 2:

- neu chua tach ingestion state ra khoi `main.py` thi cac buoc analyze/confirm sau se rat kho mo rong cho desktop

#### Cap nhat test: `tests/test_mvp_api.py`

Can reroute test de dam bao:

- upload init van pass
- chunk upload van pass
- delete upload task van pass

---

### Buoc 3 - Tach classification draft flow

#### Tao moi: `src/eduvault/classification_service.py`

Muc tieu:

- gom logic AI phan loai va tao draft ve mot noi

Nen chuyen vao file nay:

- `classification_ticket_public()`
- `create_classification_ticket()`
- logic doc `quick_preview_text`
- logic `active_course_suggestions()`
- logic xac dinh `suggested_document_type`
- logic merge metadata classification vao `upload_tasks.metadata`

#### Sua tiep: `src/eduvault/main.py`

Can refactor:

- `POST /api/uploads/{task_id}/analyze`
- cac helper lien quan trong process upload

Neu giu route analyze cho web upload va desktop upload dung chung:

- route nay phai chi goi `classification_service.analyze_and_create_draft(...)`

#### Bo sung test: `tests/test_mvp_api.py`

Can test:

- analyze tao `document_classification_tickets`
- metadata cua task chua `classification_ticket`
- confidence va suggestion tra ve dung structure
- desktop source metadata khong bi mat sau analyze

Tai sao day la buoc 3:

- desktop upload can dung chung draft review flow
- neu khong tach classification som, sau nay se de duplicate logic tu ban cu vao

---

### Buoc 4 - Tach confirm va commit thanh service rieng

#### Tao moi: `src/eduvault/repository_commit_service.py`

Muc tieu:

- gom logic confirm vao mot service ro boundary giua draft va repository core

Nen dua vao service:

- phan logic trong `confirm_upload()`
- resolve `specialization_id`, `course_id`, `document_type`
- `validate_folder_access()`
- `folder_assignment_from_metadata()`
- `create_document()` / `update_document()`
- `save_file_asset()`
- `enqueue_processing_jobs()`

Khong dua vao service nay:

- HTTP parsing
- auth header handling

#### Sua tiep: `src/eduvault/main.py`

Can refactor:

- `POST /api/uploads/{task_id}/confirm`
- `process_document_background()`

Muc tieu:

- route `confirm` chi con:
  - doc payload
  - goi service
  - tra response
  - add background task neu can

#### Sua tiep: `src/eduvault/services.py`

Muc tieu:

- giam coupling
- chi giu reusable domain functions

Can lam:

- giu `validate_folder_access()`, `folder_assignment_from_metadata()`, `enqueue_processing_jobs()`
- neu can, bo sung helper public cho commit service dung

#### Cap nhat test: `tests/test_mvp_api.py`

Can test:

- confirm manual destination van la authority
- AI suggestion chi la suggestion
- confirm vao folder khong hop le bi chan
- confirm tao document, asset, processing jobs dung
- update version flow van dung

Tai sao day la buoc 4:

- day la diem phan cach quan trong nhat giua ingestion va repository governance

---

### Buoc 5 - Dua source awareness vao frontend data layer

#### Sua: `frontend/lib/api.ts`

Muc tieu:

- cap nhat type cho upload task va classification ticket

Can them type:

- `source_type`
- `source_path`
- `device_id`
- `source_sha256`
- neu can them `ingestion_origin_label`

Tai sao sua file nay truoc frontend component:

- day la typed contract cho cac component khac

#### Sua: `frontend/components/upload-task-provider.tsx`

Muc tieu:

- provider phai hieu desktop ingestion task nhu mot task hop le

Can sua:

- merge task co source metadata
- khong lam mat `classification_ticket`
- neu desktop task khong bat dau tu local browser upload, provider van co the render dung status

Neu chua lam live desktop feed ngay:

- toi thieu provider phai dung duoc voi task co `source_type = desktop_agent`

#### Cap nhat test / smoke expectation

- provider khong vo type
- khong lam hong web upload cu

---

### Buoc 6 - Chinh UX review tai repository page

#### Sua: `frontend/app/repository/page.tsx`

Day la file frontend quan trong nhat cua phase integration.

Muc tieu:

- thong nhat UX review cho web upload va desktop upload

Can sua:

- hien `source badge`
  - `Desktop`
  - `Web`
  - sau nay `Cloud`
- tach ro "AI de xuat" va "Ban da chon"
- hien source-aware message
  - vi du: "Tai lieu duoc phat hien tu Desktop Agent"
- bo sung filter hoac section `Cho xac nhan`
- giu `finalDestination` manual la authority

Can dac biet uu tien sua cac vung:

- logic `classificationTicket`
- logic `finalDestination`
- logic auto-apply AI suggestion
- logic `confirmUpload()`
- khu vuc modal upload/review

Tai sao sua file nay sau backend:

- file nay dang gom rat nhieu state
- neu backend contract chua on dinh, sua som se rat de phai doi lai

#### Neu can tach nho tiep

Nen tach sau nay:

- `components/repository/upload-review-modal.tsx`
- `components/repository/destination-picker.tsx`
- `components/repository/source-badge.tsx`

Nhung day khong phai viec can lam truoc nhat cua phase dau.

---

### Buoc 7 - Them desktop-specific backend adapter neu can

#### Tao moi sau cung cua phase 1: `src/eduvault/desktop_ingestion_router.py`

Chi tao file nay khi:

- muon co endpoint ro hon cho Desktop Agent
- khong muon agent goi truc tiep web-upload naming

File nay chi nen:

- nhan request desktop
- map vao `ingestion_service`
- khong chua business logic rieng

Neu can tao sau:

- `POST /api/ingestion/desktop/init`
- `POST /api/ingestion/desktop/{job_id}/file`
- `POST /api/ingestion/desktop/{job_id}/analyze`
- `GET /api/ingestion/desktop/{job_id}`

Tai sao khong tao dau tien:

- tao som qua se nhan doi route khi service con chua on dinh

---

### Buoc 8 - Telemetry va outbox orchestration

#### Sua: `src/eduvault/database.py`

Can bo sung neu can:

- event types cho ingestion lifecycle

#### Sua: `src/eduvault/services.py` hoac service moi

Can ghi `outbox_events` tai cac moc:

- ingestion created
- analysis completed
- draft confirmed
- document committed
- processing completed / failed

#### Sua: `tests/test_mvp_api.py`

Can test:

- event duoc ghi ra outbox dung lifecycle

Tai sao day la buoc 8:

- day la nang cap chat luong kien truc
- nhung khong nen chan phase adapter + review flow ban dau

---

## 18.4 Thu tu commit/release de xuat

Neu lam theo nhanh nho, thu tu nen la:

1. `database.py` + `tests/test_mvp_api.py`
   - source metadata groundwork

2. `ingestion_service.py` + `main.py` + tests
   - tach upload task lifecycle

3. `classification_service.py` + `main.py` + tests
   - tach analyze / draft creation

4. `repository_commit_service.py` + `main.py` + `services.py` + tests
   - tach confirm / commit

5. `frontend/lib/api.ts` + `upload-task-provider.tsx`
   - frontend contract update

6. `frontend/app/repository/page.tsx`
   - UX integration cho desktop source

7. `desktop_ingestion_router.py` neu can
   - adapter route dep hon cho Desktop Agent

8. `outbox_events` enhancement
   - event-driven hardening

---

## 18.5 File-by-file checklist thuc thi

### `src/eduvault/database.py`

- [ ] Chot source metadata schema cho upload task
- [ ] Them helper migration / normalize neu can
- [ ] Chot data contract de service dung chung

### `src/eduvault/main.py`

- [ ] Rut upload init/file/get/delete sang service
- [ ] Rut analyze sang classification service
- [ ] Rut confirm sang repository commit service
- [ ] Giam route-level business logic

### `src/eduvault/services.py`

- [ ] Giu reusable domain functions
- [ ] Khong de logic HTTP-specific lot vao
- [ ] Bo sung helper cho commit service neu thieu

### `src/eduvault/ingestion_service.py`

- [ ] Tao / doc / cap nhat / xoa ingestion task
- [ ] Quan ly temp storage va metadata source

### `src/eduvault/classification_service.py`

- [ ] Preview text
- [ ] AI metadata
- [ ] Suggest destination
- [ ] Tao classification draft

### `src/eduvault/repository_commit_service.py`

- [ ] Validate destination
- [ ] Commit document/version/file asset
- [ ] Enqueue processing jobs

### `frontend/lib/api.ts`

- [ ] Cap nhat upload task types
- [ ] Cap nhat classification ticket types

### `frontend/components/upload-task-provider.tsx`

- [ ] Render dung task co source desktop
- [ ] Giu task merge logic on dinh
- [ ] Khong pha web upload cu

### `frontend/app/repository/page.tsx`

- [ ] Hien source badge
- [ ] Hien draft review thong nhat
- [ ] Giu manual destination la authority
- [ ] Tach AI suggestion khoi final decision

### `tests/test_mvp_api.py`

- [ ] Cover source metadata
- [ ] Cover analyze flow
- [ ] Cover confirm flow
- [ ] Cover permission guard
- [ ] Cover regression cho web upload cu

---

## 18.6 Thu tu sua nhanh nhat neu chi co mot sprint ngan

Neu chi co 1 sprint ngan va can de co ban chay duoc nhanh nhat, thu tu toi uu la:

1. `src/eduvault/database.py`
2. `src/eduvault/main.py`
3. `src/eduvault/ingestion_service.py`
4. `src/eduvault/classification_service.py`
5. `src/eduvault/repository_commit_service.py`
6. `tests/test_mvp_api.py`
7. `frontend/lib/api.ts`
8. `frontend/components/upload-task-provider.tsx`
9. `frontend/app/repository/page.tsx`

Ly do:

- backend contract phai on dinh truoc
- test gate phai khoa truoc khi chinh frontend lon
- frontend chi consume flow da chot

---

## 18.7 Thu tu sua de dep nhat neu muon lam dung chuan

Neu uu tien kien truc dep va de bao tri:

1. `database.py`
2. `ingestion_service.py`
3. `classification_service.py`
4. `repository_commit_service.py`
5. `main.py`
6. `tests/test_mvp_api.py`
7. `frontend/lib/api.ts`
8. `upload-task-provider.tsx`
9. `repository/page.tsx`
10. `desktop_ingestion_router.py`
11. outbox event enhancement

Day la thu tu dep nhat vi:

- service duoc dinh hinh truoc route
- route tro thanh adapter mong
- frontend khong bi rang buoc boi business logic rot trong `main.py`

---

## 18.8 Recommendation chot

Thu tu de team thuc hien ngay:

1. Sua `src/eduvault/database.py`
2. Tao `src/eduvault/ingestion_service.py`
3. Tao `src/eduvault/classification_service.py`
4. Tao `src/eduvault/repository_commit_service.py`
5. Refactor `src/eduvault/main.py` de goi 3 service tren
6. Cap nhat `tests/test_mvp_api.py`
7. Cap nhat `frontend/lib/api.ts`
8. Cap nhat `frontend/components/upload-task-provider.tsx`
9. Cap nhat `frontend/app/repository/page.tsx`
10. Chi sau do moi tao `desktop_ingestion_router.py` neu can namespace rieng

Neu team di dung thu tu nay, V3 se dat duoc:

- it rui ro regression nhat
- tach boundary kien truc ro nhat
- de dua Desktop Agent vao ma khong lam hong core hien tai

---

## 19. Tuyen bo cuoi cung

Ban nang cap dung cho V3 khong phai la "them desktop upload".

Ban nang cap dung la:

**bien V3 thanh mot nen tang Unified Ingestion + Repository Governance, trong do Desktop Agent chi la adapter dau vao dau tien.**

Neu thuc hien dung theo huong nay, V3 se:

- sach hon
- de bao tri hon
- it duplicate flow hon
- de mo rong hon
- va san sang hon cho production-scale architecture
