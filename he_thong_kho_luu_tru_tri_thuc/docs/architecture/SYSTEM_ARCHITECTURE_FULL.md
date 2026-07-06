# EduVault V3 - Kien truc he thong va phan tich cac luong chinh

## 1. Muc tieu tai lieu

Tai lieu nay tong hop toan bo kien truc he thong EduVault V3 theo dung codebase hien tai, gom:

- kien truc tong the
- cac thanh phan ky thuat chinh
- mo hinh du lieu va luu tru
- cac luong nghiep vu quan trong
- cac luong AI, Desktop Agent, cloud sync, governance, backup va public deployment

Pham vi tai lieu bam theo repo:

- `src/eduvault/`
- `frontend/`
- `desktop-agent/`
- `docker-compose.demo.yml`
- `docker-compose.production.yml`
- `cloudflared/`

## 2. Tong quan he thong

EduVault V3 la he thong kho tri thuc cho khoa/bomon, ket hop 4 lop nang luc:

1. Web application cho giang vien, truong bo mon va admin.
2. Backend FastAPI xu ly nghiep vu, phan quyen, ingestion, chatbot, cloud sync va governance.
3. AI layer ho tro phan tich tai lieu, goi y metadata, tim kiem ngu nghia va hoi dap RAG.
4. Ha tang luu tru va trien khai gom MySQL, MinIO, Qdrant, Desktop Agent va Cloudflare Tunnel.

Gia tri cot loi cua he thong:

- tap trung hoa tai lieu cua khoa
- tu dong hoa viec nap lieu va phan loai
- hoi dap tren kho tri thuc co kiem soat quyen
- bao toan tri thuc khi chuyen giao nhan su
- ho tro backup, dong bo cloud va van hanh public

## 3. Kien truc tong the

### 3.1 So do logic

```text
Nguoi dung Web / Desktop Agent
        |
        v
Frontend Next.js / Desktop Agent GUI
        |
        v
FastAPI Backend (src.eduvault.main)
        |
        +-- Auth / RBAC / Session
        +-- Document & Repository Services
        +-- Unified Ingestion
        +-- AI Metadata & Folder Suggestion
        +-- Chatbot RAG
        +-- Policy / Governance / Assignment
        +-- Cloud Sync / Backup / Reports
        +-- Desktop Agent APIs
        |
        +-------------------+-------------------+-------------------+
        |                   |                   |                   |
        v                   v                   v                   v
      MySQL              MinIO               Qdrant          Local fallback data
   system of record    object storage      vector search       SQLite / storage
```

### 3.2 So do deployment public demo

```text
Internet User
    |
    v
Cloudflare DNS
    |
    v
Cloudflare Tunnel
    |
    +--> Frontend container :3000
    |
    +--> Backend container  :8080
            |
            +--> MySQL
            +--> MinIO
            +--> Qdrant
```

### 3.3 Kien truc theo lop

#### Lop 1 - Presentation

- `frontend/app/*`: giao dien theo module
- `frontend/components/*`: widget dung chung
- `desktop-agent/gui.py`: giao dien Desktop Agent tren Windows

#### Lop 2 - API va orchestration

- `src/eduvault/main.py`: entrypoint FastAPI, route layer, auth dependency, API grouping

#### Lop 3 - Domain va service

- `src/eduvault/services.py`: nghiep vu chinh
- `src/eduvault/repository_commit_service.py`: ghi tai lieu vao kho
- `src/eduvault/ingestion_service.py`: luong upload chunk/unified ingestion
- `src/eduvault/cloud.py`: cloud connection va sync
- `src/eduvault/classification_service.py`: logic phan tich/goi y metadata
- `src/eduvault/policy_management.py`: policy va governance support

#### Lop 4 - Data va infrastructure

- `src/eduvault/database.py`: ket noi DB, fallback, seed, hash password
- `docker-compose.demo.yml`: stack demo
- `cloudflared/*`: public tunnel config

## 4. Cac thanh phan chinh

### 4.1 Frontend

Cong nghe:

- Next.js
- React
- TypeScript

Phan he giao dien chinh:

- `app/dashboard`: tong quan he thong
- `app/repository`: kho tai lieu va cay thu muc
- `app/assistant`: tro ly AI
- `app/auto-ingestion`: nhap lieu tu Desktop Agent
- `app/backup`: cloud sync va backup center
- `app/settings`: cau hinh Desktop Agent / watch folder
- `app/policy`: governance va policy assistant
- `app/profile`: ho so ca nhan
- `app/support`: trang ho tro

Vai tro cua frontend:

- trinh bay nghiep vu
- goi API backend
- xu ly session phia trinh duyet
- hien trang thai upload / ingestion / sync / chatbot

### 4.2 Backend

Cong nghe:

- FastAPI
- Pydantic
- Python service modules

Backend dong vai tro:

- API gateway noi bo cua he thong
- xu ly business logic
- auth va authorization
- trung tam dieu phoi document lifecycle
- xu ly chatbot, access request, backup, cloud sync

File trung tam:

- `src/eduvault/main.py`

### 4.3 Database layer

Backend ho tro 2 che do:

- MySQL la system of record khi deploy demo/public
- SQLite la fallback/local mode

Trong `database.py`, he thong co:

- load bien moi truong
- hash password bang `pbkdf2_sha256`
- verify va rehash password cu
- ket noi MySQL co retry/backoff
- fallback khi ha tang ngoai chua san sang

Y nghia kien truc:

- repo co the chay local nhanh
- khi len demo/prod, backend uu tien MySQL de on dinh hon

### 4.4 Object storage

He thong luu file qua 2 lop:

- MinIO khi che do object storage duoc bat
- local storage trong `data/mvp/storage` khi fallback/demo noi bo

Du lieu luu:

- file goc
- cac version cua tai lieu
- file da commit vao repository path
- backup snapshot

### 4.5 Vector search

He thong dung Qdrant trong stack demo/prod de:

- luu embeddings
- semantic retrieval cho chatbot
- ho tro hybrid search cung lexical search

Neu vector stack khong san sang, he thong van co cac fallback de tranh sap toan bo nghiep vu.

### 4.6 Desktop Agent

Desktop Agent la mot ung dung Windows rieng cho tung may nguoi dung.

Vai tro:

- theo doi watch folder, mac dinh `D:\Teaching`
- phat hien file moi
- ghi queue local vao SQLite cuc bo
- upload file theo luong unified ingestion
- dong bo cau hinh tu backend
- gui heartbeat de web biet agent online/offline

Thanh phan:

- `desktop-agent/agent.py`: worker chinh
- `desktop-agent/gui.py`: giao dien dang nhap/trang thai
- `desktop-agent/state.py`: trang thai cuc bo
- `desktop-agent/run-agent.ps1`: runner
- `scripts/setup-desktop-agent.ps1`: setup tren may moi
- `scripts/install-desktop-agent-task.ps1`: auto-start cung Windows

### 4.7 Cloud sync

He thong co lop ket noi cloud de dong bo ra kho luu tru ngoai:

- Google Drive
- OneDrive

API nhom nay nam trong:

- `/api/cloud/connections`
- `/api/cloud/connect`
- `/api/cloud/callback/{provider}`
- `/api/cloud/connections/{provider}/sync`

### 4.8 Public deployment

Public deployment cua demo V3 hien theo huong:

- Docker Compose cho service app
- Cloudflare Tunnel cho public Internet

File lien quan:

- `docker-compose.demo.yml`
- `run-demo-tunnel.ps1`
- `cloudflared/config.demo.template.yml`
- `cloudflared/config.demo.generated.yml`

## 5. Mo hinh du lieu va trang thai

## 5.1 Thuc the nghiep vu chinh

Duoi goc nhin logic, he thong xoay quanh cac nhom thuc the:

- User
- Role / Permission
- Document
- Document Version
- File Asset
- Folder Node / Policy Tree
- Upload Task / Ingestion Task
- Access Request
- Cloud Connection
- Backup Record
- Audit Log
- Lecturer Assignment
- Transfer Session
- Conversation Memory

## 5.2 Trang thai vong doi tai lieu

Mot tai lieu co the di qua cac trang thai nghiep vu:

1. File moi duoc tao hoac upload
2. Duoc analyze de rut metadata / folder suggestion
3. Duoc dua vao pending confirmation
4. Nguoi dung xac nhan noi luu
5. He thong commit vao repository
6. Sinh version, chunks, embeddings, provenance
7. Tro thanh tai lieu co the tim / hoi dap
8. Co the bi xoa mem vao trash
9. Co the restore hoac rollback version

## 5.3 Nguon du lieu chinh va nguon du lieu phu

Nguon du lieu chinh:

- MySQL hoac SQLite fallback cho metadata va nghiep vu

Nguon du lieu phu:

- MinIO/local storage cho binary file
- Qdrant cho vector
- Desktop Agent SQLite cho queue local tren may nguoi dung

## 6. Bao mat va phan quyen

## 6.1 Xac thuc

He thong ho tro:

- dang nhap bang ma nguoi dung + mat khau
- session cookie cho browser
- token cho Desktop Agent / API usage khi can

Route chinh:

- `POST /api/auth/login`
- `POST /api/auth/logout`

## 6.2 Authorization

He thong dung RBAC + kiem tra theo document ownership / folder policy.

Quyen tieu bieu:

- `dashboard.view`
- `repository.upload`
- `chatbot.use`
- `cloud.sync`
- `profile.manage`

Ngoai RBAC, backend con kiem tra:

- tai lieu private thuoc ai
- nguoi dung co quyen doc folder / tree nay khong
- tai lieu co nam trong branch chuyen mon duoc phep khong

## 6.3 Bao mat du lieu private

Nguyen tac quan trong:

- chatbot khong duoc lo du lieu private neu nguoi hoi khong co quyen
- access request la luong chinh thuc de xin phep
- file download, provenance, version compare deu bi chan boi backend permission check

## 7. Kien truc AI

## 7.1 Vai tro AI trong he thong

AI khong phai mot service tach rieng ma duoc nhung vao nghiep vu qua cac nang luc:

- phan tich tai lieu
- goi y metadata
- goi y folder / hoc phan
- hoi dap tren kho tri thuc
- support governance assistant

## 7.2 Chatbot RAG

Route chatbot chinh:

- `POST /api/search`
- `POST /api/search/stream`
- `POST /api/search/feedback`
- `GET /api/assistant/memory`

Ham trung tam:

- `services.ask(...)`

Pipeline logic:

1. Nhan cau hoi
2. Xac dinh pham vi va intent
3. Tim tai lieu lien quan
4. Loc theo quyen
5. Tong hop cau tra loi
6. Tra ve citation, trace, scope, verification

Chatbot co 2 dang:

- response thong thuong
- response streaming NDJSON

## 7.3 AI metadata va folder suggestion

Nhom route:

- `POST /api/documents/analyze`
- `POST /api/documents/analyze-file`
- `POST /api/folders/suggest`
- `POST /api/folders/suggest-course`

Muc dich:

- doc noi dung file
- nhan dang loai tai lieu
- goi y metadata
- goi y hoc phan / branch / folder

Nguyen tac hien tai cua V3:

- AI chi de xuat
- nguoi dung hoac luong governance van xac nhan noi luu
- khong de AI tu commit vao kho ma bo qua business rule

## 8. Cac luong nghiep vu chinh

Phan nay la trong tam cua tai lieu.

## 8.1 Luong 1 - Dang nhap va khoi tao phien

### Muc tieu

Xac thuc nguoi dung va nap bo quyen de hien thi dung giao dien.

### Dau vao

- user code
- password

### Trinh tu xu ly

1. Frontend gui `POST /api/auth/login`.
2. Backend verify password.
3. Backend xac dinh role va permissions.
4. Backend tao session/token.
5. Frontend lay dashboard, permissions, trang thai agent/cloud sync.

### Dau ra

- session hop le
- user profile
- role
- permission set

### Rui ro / diem nhay cam

- mat khau cu can rehash
- session het han
- cookie secure phai dung khi public

## 8.2 Luong 2 - Upload tai lieu thu cong qua web

### Muc tieu

Cho giang vien tai file len he thong va dua vao quy trinh xu ly co kiem soat.

### Cac API lien quan

- `POST /api/uploads/init`
- `POST /api/uploads/{task_id}/file`
- `POST /api/uploads/{task_id}/analyze`
- `POST /api/uploads/{task_id}/confirm`
- `GET /api/uploads`

### Trinh tu xu ly

1. Frontend tao upload task.
2. Backend sinh `task_id`.
3. Frontend upload file theo chunk.
4. Backend ghep chunk, kiem tra offset, size, retry.
5. Frontend yeu cau analyze.
6. Backend rut metadata, folder suggestion, source info.
7. Task xuat hien trong danh sach cho xac nhan.
8. Nguoi dung chon noi luu va confirm.
9. Backend commit vao repository.

### Ket qua

- file duoc luu an toan
- metadata duoc tao
- tai lieu vao kho chinh thuc

### Y nghia kien truc

Luong nay tach upload khoi confirm, giup:

- upload file lon on dinh hon
- ho tro AI de xuat truoc khi commit
- co the chen them Desktop Agent vao cung pipeline

## 8.3 Luong 3 - Unified Ingestion va pending confirmation

Day la luong xuyen suot quan trong nhat cua V3.

### Muc tieu

Thong nhat moi nguon nap lieu vao cung mot pipeline.

### Nguon vao

- web upload
- Desktop Agent
- ve sau co the mo rong cloud import

### Pha xu ly

1. `init`: tao task va metadata ban dau
2. `file`: nhan binary
3. `analyze`: AI + rule engine
4. `pending_confirmation`: cho nguoi dung duyet
5. `confirm`: commit vao repository

### Loi ich kien truc

- giam duplicate code
- cung mot giao dien xac nhan
- co chung audit va provenance
- de mo rong cho nhieu source adapter

## 8.4 Luong 4 - Desktop Agent tu dong nap lieu

### Muc tieu

Giang vien chi can bo file vao thu muc local, he thong tu dua file len web.

### API lien quan

- `GET /api/desktop-agent/config`
- `GET /api/desktop-agent/status`
- `POST /api/desktop-agent/heartbeat`
- `PUT /api/desktop-sync/folders`
- `POST /api/ingestion/desktop/init`
- `POST /api/ingestion/desktop/{task_id}/file`
- `POST /api/ingestion/desktop/{task_id}/analyze`

### Trinh tu xu ly

1. Nguoi dung cai Desktop Agent va dang nhap mot lan.
2. Agent luu token tren may.
3. Agent lay config watch folders tu backend.
4. Agent theo doi `D:\Teaching` hoac folder da cau hinh.
5. Khi co file moi, agent ghi vao local queue.
6. Worker upload file len backend qua desktop ingestion APIs.
7. Backend phan tich va tao task pending confirmation.
8. Nguoi dung len trang `Nhập liệu tự động` de duyet noi luu.
9. Sau khi confirm, tai lieu vao kho chinh thuc.

### Diem quan trong

- Desktop Agent chi giai bai toan "file tren may nao thi may do phai co agent"
- watch folder la local per-machine, khong phai watch folder toan he thong
- heartbeat cho phep web hien `Online/Offline`

## 8.5 Luong 5 - Goi y noi luu va commit vao repository

### Muc tieu

Dam bao tai lieu duoc dat dung hoc phan, dung nhanh tri thuc va dung loai thu muc.

### API lien quan

- `POST /api/folders/suggest`
- `POST /api/folders/suggest-course`
- `POST /api/folders/request-create`
- `GET /api/folders/tree`
- `POST /api/uploads/{task_id}/confirm`

### Trinh tu xu ly

1. Backend/AI goi y folder path.
2. Frontend hien de xuat va cay thu muc.
3. Neu khong co nhanh phu hop, nguoi dung co the request tao folder.
4. Khi confirm, backend goi repository commit service.
5. Service validate:
   - folder hop le
   - document type hop le
   - nguoi dung co quyen
6. He thong ghi tai lieu vao kho, sinh version va provenance.

### Nguyen tac kien truc

- source of truth la folder tree + document type business rules
- AI khong thay the governance

## 8.6 Luong 6 - Chatbot RAG

### Muc tieu

Tra loi cau hoi tren kho tri thuc co citation va ton trong phan quyen.

### API lien quan

- `POST /api/search`
- `POST /api/search/stream`
- `POST /api/search/feedback`
- `GET /api/search/global`
- `GET /api/assistant/memory`

### Trinh tu xu ly

1. Nguoi dung nhap cau hoi trong `Trợ lý AI`.
2. Frontend gui body `question`, optional `filters`, `current_page`.
3. Backend validate payload.
4. `services.ask()` phan tich intent.
5. He thong truy xuat tai lieu lien quan.
6. Loc tai lieu theo quyen doc.
7. Tao cau tra loi va citation.
8. Frontend render streaming hoặc full response.
9. Nguoi dung co the gui feedback.

### Dau ra

- answer
- citations
- trace_id
- scope
- verification metadata

### Tinh chat an toan

- `422` xay ra khi payload chatbot sai schema
- `401/403` xay ra khi phien hoac quyen khong hop le
- chatbot khong duoc doc private documents ngoai quyen

## 8.7 Luong 7 - Xin quyen tai lieu private

### Muc tieu

Cho nguoi dung xin doc tai lieu private cua nguoi khac theo quy trinh kiem soat.

### API lien quan

- `POST /api/access-requests/{document_id}`
- `POST /api/access-requests/{request_id}/revoke`
- `POST /api/access-requests/{request_id}/{decision}`

### Trinh tu xu ly

1. Nguoi dung gap tai lieu private.
2. Gui access request.
3. Chu so huu tai lieu nhan yeu cau.
4. Chu so huu approve hoac reject.
5. Backend cap nhat quyen hieu luc.
6. Nguoi duoc cap phep moi co the xem/tai file.

### Gia tri

Luong nay la cau noi giua governance va chatbot/repository.

## 8.8 Luong 8 - Quan ly policy va governance

### Muc tieu

Cho admin dinh nghia va kich hoat chinh sach cay thu muc, permission va backup.

### API lien quan

- `POST /api/policies/upload`
- `GET /api/policies`
- `POST /api/policies/{policy_id}/activate`
- `GET /api/policies/{policy_id}/activation-preview`
- `POST /api/policy-assistant/preview`
- `POST /api/policy-assistant/confirm`
- `GET /api/governance-rules`

### Trinh tu xu ly

1. Admin upload policy.
2. Backend parse va preview tac dong.
3. Admin review tree / permission changes.
4. Kich hoat policy.
5. He thong sync folder nodes, specializations, rules.
6. Audit log duoc ghi lai.

### Diem kien truc quan trong

- policy la lop governance truoc repository
- activation co preview va audit
- co internal endpoints cho apply/rollback

## 8.9 Luong 9 - Chuyen giao tri thuc va phan cong giang vien

### Muc tieu

Dam bao tri thuc hoc phan khong mat khi doi ngu phu trach thay doi.

### API lien quan

- `POST /api/lecturer-assignments/import/preview`
- `POST /api/lecturer-assignments/import/confirm`
- `GET /api/lecturer-assignments`
- `GET /api/my-assignment`
- `POST /api/transfers`
- `PUT /api/transfers/{transfer_id}/progress`
- `GET /api/knowledge-transfer/insights*`

### Trinh tu xu ly

1. Admin import danh sach phan cong.
2. He thong cap nhat specialization / folder tree theo giang vien.
3. Khi co chuyen giao, transfer session duoc tao.
4. Giang vien cap nhat progress.
5. Dashboard / insight tinh dependency, gap va muc do hoan thanh.

### Vai tro nghiep vu

Day la lop "quan ly tri thuc theo nhan su", mo rong vuot ra ngoai luu file don thuan.

## 8.10 Luong 10 - Cloud sync va backup

### Muc tieu

Dong bo tai lieu ra kho luu tru ngoai va kiem tra compliance backup.

### API lien quan

- `GET /api/cloud/connections`
- `POST /api/cloud/connect`
- `GET /api/cloud/callback/{provider}`
- `POST /api/cloud/connections/{provider}/sync`
- `GET /api/backups/compliance`
- `POST /api/admin/backups`
- `POST /api/admin/backups/{backup_id}/restore`

### Trinh tu xu ly

1. Nguoi dung/admin ket noi provider cloud.
2. Backend luu connection state.
3. Khi sync, backend day file metadata/asset sang provider.
4. Trang backup hien last sync, thanh cong/that bai.
5. Admin co the tao backup va restore.

### Kien truc du lieu

- cloud sync khong thay the repository chinh
- no la lop replica / offsite / external storage

## 8.11 Luong 11 - Versioning, trash va rollback

### Muc tieu

Cho phep quan ly vong doi tai lieu sau khi da commit.

### API lien quan

- `PUT /api/documents/{document_id}`
- `GET /api/documents/{document_id}/versions`
- `GET /api/documents/{document_id}/versions/compare`
- `POST /api/documents/{document_id}/rollback/{version_no}`
- `GET /api/trash`
- `POST /api/trash/{document_id}/restore`

### Trinh tu xu ly

1. Tai lieu duoc cap nhat tao version moi.
2. Nguoi dung xem lich su version.
3. Co the compare hoac rollback.
4. Xoa mem dua vao trash.
5. Co the restore hoac xoa han.

### Gia tri

- giu dau vet thay doi
- ho tro phuc hoi khi sua nham
- phu hop yeu cau governance va audit

## 8.12 Luong 12 - Public deployment va truy cap Internet

### Muc tieu

Cong khai frontend/backend ma khong phai expose truc tiep ha tang noi bo.

### Thanh phan

- `docker-compose.demo.yml`
- `run-demo-tunnel.ps1`
- `cloudflared/config.demo.template.yml`

### Trinh tu xu ly

1. Docker Compose khoi dong frontend, backend, mysql, minio, qdrant.
2. Script render tunnel config tu `.env.demo`.
3. Cloudflared mo ingress:
   - frontend host -> `127.0.0.1:3000`
   - backend host -> `127.0.0.1:8080`
4. DNS Cloudflare tro vao tunnel.
5. User Internet truy cap qua HTTPS public domain.

### Ghi chu van hanh

- frontend va backend public qua tunnel
- service du lieu van nam private sau backend

## 9. Mapping API theo nhom chuc nang

## 9.1 Nhom auth va profile

- `/api/auth/*`
- `/api/profile/*`
- `/api/permissions`

## 9.2 Nhom repository va documents

- `/api/documents*`
- `/api/files/*`
- `/api/trash*`
- `/api/uploads*`

## 9.3 Nhom chatbot va search

- `/api/search*`
- `/api/assistant/memory`

## 9.4 Nhom desktop ingestion

- `/api/desktop-agent/*`
- `/api/desktop-sync/*`
- `/api/ingestion/desktop/*`

## 9.5 Nhom governance / policy

- `/api/policies*`
- `/api/policy-assistant/*`
- `/api/governance-rules*`
- `/internal/policy/*`

## 9.6 Nhom cloud / backup / reports

- `/api/cloud/*`
- `/api/backups/*`
- `/api/reports/*`
- `/api/audit-logs`

## 10. Thanh phan source code quan trong

## 10.1 Backend

- `src/eduvault/main.py`
  - route layer va dependency injection
- `src/eduvault/services.py`
  - nghiep vu tong hop lon nhat
- `src/eduvault/database.py`
  - db backend, auth hash, seed, retry
- `src/eduvault/cloud.py`
  - cloud connectors va sync
- `src/eduvault/ingestion_service.py`
  - upload task, chunk, analyze
- `src/eduvault/repository_commit_service.py`
  - commit tai lieu vao kho

## 10.2 Frontend

- `frontend/app/repository/page.tsx`
- `frontend/app/assistant/page.tsx`
- `frontend/components/assistant-chat.tsx`
- `frontend/app/auto-ingestion/page.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/lib/api.ts`

## 10.3 Desktop Agent

- `desktop-agent/agent.py`
- `desktop-agent/gui.py`
- `desktop-agent/state.py`
- `desktop-agent/run-agent.ps1`

## 11. Diem manh kien truc hien tai

- mot backend trung tam, de kiem soat governance
- unified ingestion giup thong nhat moi nguon upload
- Desktop Agent mo rong duoc UX tu dong cho giang vien
- chatbot duoc dat trong boundary phan quyen
- deployment demo/public khong can expose server truc tiep
- policy, assignment, transfer va backup da duoc xem la mot phan cua he thong, khong chi la "file storage"

## 12. Gioi han va canh bao hien tai

- watch folder cua Desktop Agent la local theo tung may, khong the "tu dong watch moi may" neu may do chua cai agent
- cloud sync can provider OAuth duoc cau hinh dung o môi truong public
- chatbot phu thuoc chat luong metadata/chunk/index cua tai lieu
- deployment public qua Cloudflare Tunnel can DNS, ingress va certificate hostnames dung
- trong local mode/fallback, mot so nang luc ha tang se nhe hon so voi demo/public stack day du

## 13. Ket luan

EduVault V3 khong chi la mot web app luu tai lieu, ma la mot nen tang quan tri tri thuc theo huong "document governance + AI assistance + ingestion automation".

Xet theo kien truc hien tai, 3 truc xuyen suot cua he thong la:

1. Repository governance
   - moi tai lieu phai di qua cay thu muc, quyen va policy
2. Unified ingestion
   - web upload va Desktop Agent deu quy ve mot pipeline chung
3. AI under control
   - AI ho tro metadata, retrieval va hoi dap, nhung khong vuot qua governance va permission boundary

Neu can mo rong tiep, he thong nay co the phat trien theo 3 huong lon:

- multi-tenant cap khoa/truong
- cloud sync hai chieu hoan chinh
- desktop onboarding production-grade voi installer, auto-update va signed release
