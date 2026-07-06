# Hệ thống kho lưu trữ tri thức EduVault

EduVault là hệ thống quản lý tài liệu học thuật cho khoa/bộ môn, gồm:

- backend `FastAPI`
- frontend `Next.js`
- desktop agent đồng bộ tài liệu
- chatbot hỏi đáp có truy xuất tài liệu và trích dẫn nguồn
- hạ tầng chạy bằng Docker Compose

## Tổng quan nhanh

Repo ứng dụng thực tế nằm trong thư mục:

```text
he_thong_kho_luu_tru_tri_thuc/
```

Lưu ý:

- Git root hiện tại của workspace lớn hơn thư mục ứng dụng.
- Sau khi clone, hãy `cd` vào đúng `he_thong_kho_luu_tru_tri_thuc/` trước khi chạy lệnh của dự án này.
- `n8n` là tích hợp tùy chọn, không phải thành phần bắt buộc để chatbot và nền tảng chính hoạt động.

## Yêu cầu môi trường

Để chạy theo cách khuyến nghị, máy cần có:

- `Docker Desktop` hoặc Docker Engine + Docker Compose
- `Git`

Để chạy benchmark hoặc chạy một số script local, nên có thêm:

- `Python 3.12`
- `Node.js 20`
- `npm`

## Clone và vào đúng thư mục

```powershell
git clone https://github.com/AI20K-Build-Cohort-2/C2-App-012.git
cd C2-App-012\he_thong_kho_luu_tru_tri_thuc
```

Nếu bạn đang mở workspace ở root `C2-App-012`, hãy nhớ mọi lệnh bên dưới đều giả định bạn đang đứng trong:

```text
he_thong_kho_luu_tru_tri_thuc/
```

## Khởi động nhanh sau khi clone

### 1. Tạo file môi trường

Chọn một file mẫu phù hợp rồi copy thành `.env`.

Ví dụ môi trường local/demo:

```powershell
Copy-Item config\env\.env.demo.example .env
```

Ví dụ môi trường production:

```powershell
Copy-Item config\env\.env.production.example .env
```

Sau đó cập nhật các biến quan trọng trong `.env`:

- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `OPENAI_API_KEY`
- `EDUVAULT_SEED_PASSWORD_GV001`
- `EDUVAULT_SEED_PASSWORD_GVNEW`
- `EDUVAULT_SEED_PASSWORD_TBM01`
- `EDUVAULT_SEED_PASSWORD_ADMIN`

### 2. Khởi động stack Docker chuẩn

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml up -d --build
```

### 3. Kiểm tra trạng thái

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml ps
```

Khi mọi thứ ổn, bạn sẽ có:

- Frontend: `http://127.0.0.1:3000`
- Backend API docs: `http://127.0.0.1:8080/docs`
- Backend health: `http://127.0.0.1:8080/api/health`
- MinIO console: `http://127.0.0.1:9001`

## Tài khoản demo/bootstrap

Theo cấu hình hiện tại, hệ thống seed sẵn một số tài khoản:

- `GV001`
- `GVNEW`
- `TBM01`
- `ADMIN`

Mật khẩu thực tế lấy từ `.env` thông qua các biến:

- `EDUVAULT_SEED_PASSWORD_GV001`
- `EDUVAULT_SEED_PASSWORD_GVNEW`
- `EDUVAULT_SEED_PASSWORD_TBM01`
- `EDUVAULT_SEED_PASSWORD_ADMIN`

## Cách dừng hệ thống

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml down
```

Nếu chỉ cần xem trạng thái hoặc log:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml ps
docker compose --env-file .env -f infra/compose/docker-compose.production.yml logs -f
```

## Chạy local/demo

Ngoài stack Docker chuẩn, repo có script demo local:

```powershell
.\run_v2_demo.ps1
```

Script này phù hợp khi cần:

- demo nhanh trên máy phát triển
- chạy backend/frontend local mà không cần full hạ tầng production

Không nên xem đây là cách chạy production chính thức.

## Benchmark chatbot

Chạy benchmark bằng pipeline hiện tại:

```powershell
python scripts/run_chatbot_eval.py
```

Kết quả được lưu tại:

```text
var/reports/
```

Test/evaluator liên quan nằm ở:

- `tests/run_chatbot_eval.py`
- `tests/test_chatbot_eval_suite.py`
- `tests/chatbot_eval_cases_200.csv`
- `docs/evaluation/`

## Cấu trúc repo

```text
he_thong_kho_luu_tru_tri_thuc/
├─ src/                 # Backend code đang chạy
├─ frontend/            # Frontend Next.js
├─ desktop-agent/       # Desktop sync agent
├─ tests/               # Test backend, security, evaluator
├─ scripts/             # Script nghiệp vụ/dev còn dùng trực tiếp
├─ infra/               # Docker, compose, nginx, tunnel, script vận hành
├─ config/              # Env example, policy seed, app config an toàn để commit
├─ docs/                # Tài liệu đã nhóm theo chủ đề
├─ var/                 # Report, log, tmp, artifact sinh ra khi chạy
└─ ...
```

## Source Of Truth Hiện Tại

Những thư mục nên xem là nguồn chính của hệ thống hiện tại:

- `src/`
- `frontend/`
- `desktop-agent/`
- `infra/`
- `config/`

Những thư mục trong `var/` là dữ liệu sinh ra khi chạy, thường không phải nơi chỉnh sửa logic:

- `var/reports/`
- `var/logs/`
- `var/tmp/`
- `var/artifacts/`

## Ý nghĩa từng thư mục chính

### `src/`

Mã nguồn backend hiện tại. Điểm vào chính:

- `src/eduvault/main.py`
- `src/eduvault/services.py`
- `src/eduvault/database.py`

### `frontend/`

Ứng dụng web dành cho giảng viên, trưởng bộ môn, quản trị viên.

### `desktop-agent/`

Agent chạy trên máy người dùng để đồng bộ thư mục tài liệu về hệ thống.

### `infra/`

Toàn bộ phần vận hành:

- `infra/compose/`: Docker Compose
- `infra/docker/`: Dockerfile
- `infra/nginx/`: cấu hình Nginx
- `infra/tunnel/`: Cloudflare tunnel
- `infra/scripts/`: script deploy, stop, logs, check
- `infra/database/`: schema/tài liệu database

### `config/`

Chứa file mẫu và seed an toàn để commit:

- `config/env/`
- `config/policy/`

Không đặt secret thật vào đây.

### `docs/`

Tài liệu được chia nhóm để dễ tìm:

- `docs/architecture/`
- `docs/deployment/`
- `docs/evaluation/`
- `docs/operations/`
- `docs/security/`
- `docs/decisions/`

Xem chỉ mục nhanh ở [docs/README.md](docs/README.md).

## Tài liệu nên đọc trước

Nếu mới vào dự án, nên đọc theo thứ tự:

1. [docs/README.md](docs/README.md)
2. [docs/REPO_STRUCTURE_TARGET.md](docs/REPO_STRUCTURE_TARGET.md)
3. [docs/architecture/SYSTEM_ARCHITECTURE_FULL.md](docs/architecture/SYSTEM_ARCHITECTURE_FULL.md)
4. [docs/deployment/DEPLOY_DOCKER_PRODUCTION.md](docs/deployment/DEPLOY_DOCKER_PRODUCTION.md)
5. [docs/evaluation/CHATBOT_200_EVAL_SUITE.md](docs/evaluation/CHATBOT_200_EVAL_SUITE.md)

## Lỗi thường gặp

### Cổng đã bị chiếm

Các cổng hay dùng:

- `3000` cho frontend
- `8080` cho backend
- `9001` cho MinIO console

Nếu container không lên, hãy kiểm tra xem có stack cũ đang chạy hay không:

```powershell
docker ps
```

### Thiếu file `.env`

Nếu chưa có `.env`, Docker Compose sẽ không chạy được đúng cách. Hãy copy từ `config/env/` trước.

### Backend `unhealthy`

Kiểm tra nhanh:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml ps
docker compose --env-file .env -f infra/compose/docker-compose.production.yml logs backend
```

### Git báo `dubious ownership`

Trên Windows có thể gặp cảnh báo quyền sở hữu khi thư mục do user khác tạo. Khi đó cần cấu hình `safe.directory` cho repo trước khi commit/push.

## Quy ước quan trọng

- Secret thật nằm trong `.env`, `.env.demo` hoặc secret store, không commit công khai.
- File mẫu môi trường nằm trong `config/env/`.
- Không để report, log, build artifact ở root repo.
- Script vận hành ưu tiên dùng trong `infra/scripts/`.
- `n8n` là tùy chọn; nếu không cấu hình webhook thì hệ thống lõi vẫn chạy bình thường.
