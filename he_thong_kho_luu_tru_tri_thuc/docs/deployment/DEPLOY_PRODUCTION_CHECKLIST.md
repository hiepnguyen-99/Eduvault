# EduVault V3 Production Deploy Checklist

## 1. Chốt cấu hình trước deploy

- Tạo file backend `.env` từ [.env.production.example](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc_v3/.env.production.example:1) và thay toàn bộ giá trị mẫu.
- Tạo file frontend `.env` hoặc `.env.local` từ [frontend/.env.example](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc_v3/frontend/.env.example:1).
- Đảm bảo `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, `BACKEND_URL` cùng trỏ đúng domain/route production.
- Đảm bảo `DATABASE_PROVIDER=mysql` và `DATABASE_FALLBACK_SQLITE=false`.
- Nếu muốn tinh chỉnh startup khi MySQL chậm sẵn sàng, cấu hình thêm:
  `MYSQL_CONNECT_TIMEOUT_SECONDS`, `MYSQL_STARTUP_MAX_WAIT_SECONDS`, `MYSQL_STARTUP_BACKOFF_BASE_SECONDS`, `MYSQL_STARTUP_BACKOFF_MAX_SECONDS`.
- Đảm bảo toàn bộ secret không còn giá trị demo như `change-me`, `ADMIN`, `GV001`, `GVNEW`, `TBM01`.
- Nếu dùng MinIO qua Docker, cấu hình cả `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.
- Nếu dùng MySQL qua Docker, cấu hình cả `MYSQL_PASSWORD` và `MYSQL_ROOT_PASSWORD`.
- Nếu bật cloud sync, điền `GOOGLE_*` và/hoặc `MICROSOFT_*`, rồi xác nhận callback dùng đúng `PUBLIC_BASE_URL`.
- Nếu dùng webhook phê duyệt policy qua n8n, cấu hình thêm `N8N_POLICY_WEBHOOK_URL`.

## 2. Chuẩn bị hạ tầng

- Khởi tạo MySQL 8.4, Redis, Qdrant, MinIO bằng [docker-compose.v2.yml](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc_v3/docker-compose.v2.yml:1) hoặc stack tương đương.
- Nếu muốn deploy nguyên stack bằng Docker trên một máy, dùng [docker-compose.production.yml](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc_v3/docker-compose.production.yml:1).
- Xác nhận persistence volume đã bật cho MySQL, Redis, Qdrant, MinIO.
- Bật HTTPS ở reverse proxy trước khi public hệ thống.
- Giới hạn firewall để chỉ mở các cổng cần thiết cho frontend/API.
- Xác nhận DNS trỏ về đúng máy chủ production.

## 3. Build và chạy ứng dụng

- Backend:
  `python run_mvp.py`
- Frontend:
  `npm run build`
- Frontend production runtime:
  `npm start`
- Nếu chạy frontend sau reverse proxy, kiểm tra route `/api/*` đã rewrite đúng về `BACKEND_URL`.
- Nếu deploy bằng Docker Compose:
  `docker compose -f docker-compose.production.yml build`
- Khởi chạy stack Docker:
  `docker compose -f docker-compose.production.yml up -d`
- Kiểm tra `docker compose -f docker-compose.production.yml ps` cho tới khi backend/frontend đều `healthy`.

## 4. Smoke test tối thiểu sau deploy

- Mở trang chủ frontend và đăng nhập được bằng tài khoản seed.
- Gọi `GET /api/health` hoặc truy cập `/docs` để xác nhận backend lên bình thường.
- Kiểm tra log backend không còn spam `Can't connect to MySQL server on 'mysql'` trong lúc boot.
- Kiểm tra đăng nhập tạo cookie session và cookie có cờ `Secure` trong môi trường HTTPS.
- Upload một file nhỏ và xác nhận tài liệu đi qua các trạng thái `UPLOADED` -> `PROCESSING` -> `INDEXED`.
- Mở chatbot/assistant và xác nhận truy vấn có phản hồi.
- Tạo một bản backup và xác nhận manifest/checksum được ghi.
- Nếu bật MinIO/Qdrant/Redis, kiểm tra dashboard operations hiển thị `available`.
- Nếu bật OAuth cloud sync, hoàn tất một vòng connect/callback/disconnect.

## 5. Kiểm thử trước release

- Backend test:
  `python -m pytest -q`
- Frontend build test:
  `npm run build`
- Nếu thay đổi hạ tầng hoặc env production, chạy thêm một lượt upload, search, backup, restore dry-run.

## 6. Hậu deploy

- Đổi hoặc vô hiệu hóa mật khẩu seed bootstrap sau khi bàn giao tài khoản thật.
- Sao lưu file `.env` trong secret manager hoặc vault, không lưu vào git.
- Chụp lại phiên bản cấu hình đã triển khai: domain, commit, image tag, ngày deploy.
- Theo dõi log 15-30 phút đầu để phát hiện lỗi CORS, OAuth callback, timeout OCR hoặc mất kết nối Qdrant/MinIO.
