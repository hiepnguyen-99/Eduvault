# EduVault V3 Docker Production Deploy

Tài liệu này giả định bạn deploy lên một máy Linux/Ubuntu có Docker Engine và Docker Compose plugin.

## 1. Chuẩn bị cấu hình

1. Tạo file `.env` production từ [.env.production.example](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc_v3/.env.production.example:1).
2. Đổi toàn bộ secret mẫu.
3. Bắt buộc chỉnh các giá trị này trước khi chạy:
   - `PUBLIC_BASE_URL`
   - `ALLOWED_ORIGINS`
   - `DATABASE_PROVIDER=mysql`
   - `DATABASE_FALLBACK_SQLITE=false`
   - `MYSQL_PASSWORD`
   - `MYSQL_ROOT_PASSWORD`
   - `MINIO_ROOT_USER`
   - `MINIO_ROOT_PASSWORD`
   - `MINIO_ACCESS_KEY`
   - `MINIO_SECRET_KEY`
   - `TOKEN_ENCRYPTION_KEY`
   - `N8N_POLICY_SECRET`
   - `EDUVAULT_SEED_PASSWORD_*`
5. Backend production đã có retry kết nối MySQL với exponential backoff, không dùng `sleep` cố định.
   Bạn có thể tinh chỉnh bằng các biến:
   - `MYSQL_CONNECT_TIMEOUT_SECONDS`
   - `MYSQL_STARTUP_MAX_WAIT_SECONDS`
   - `MYSQL_STARTUP_BACKOFF_BASE_SECONDS`
   - `MYSQL_STARTUP_BACKOFF_MAX_SECONDS`
4. Không dùng file `.env` local/dev hiện tại để deploy production.

## 2. Build và chạy stack

Từ thư mục `he_thong_kho_luu_tru_tri_thuc_v3`:

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

## 3. Các cổng mặc định

- Frontend: `3000`
- Backend API: `8081`
- MinIO Console: `9001`

Khuyến nghị đặt reverse proxy/Nginx hoặc Cloudflare Tunnel phía trước frontend, và chỉ mở trực tiếp cổng backend khi thực sự cần.

## 4. Kiểm tra sau deploy

```bash
curl http://127.0.0.1:8081/api/health
curl http://127.0.0.1:3000
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs backend --tail 100
docker compose -f docker-compose.production.yml logs frontend --tail 100
```

Kỳ vọng log startup sạch:
- Không còn spam `Can't connect to MySQL server on 'mysql'`
- Backend chỉ chuyển sang `healthy` sau khi MySQL thật sự sẵn sàng

## 5. Cập nhật phiên bản

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

## 6. Rollback nhanh

Nếu bạn deploy bằng image tag riêng, rollback nhanh nhất là pin lại tag cũ rồi chạy lại:

```bash
docker compose -f docker-compose.production.yml up -d
```

## 7. Ghi chú vận hành

- Backend container đã bind `0.0.0.0:8081`, không dùng `run_mvp.py` trong production.
- Compose production giữ `depends_on` theo `service_healthy` cho MySQL, MinIO, Redis, Qdrant và có healthcheck riêng cho backend/frontend.
- Frontend build dùng `BACKEND_URL=http://backend:8081` để proxy `/api/*` nội bộ trong Docker network.
- Dữ liệu runtime local của app vẫn được mount ở volume `app_data` cho backup/manifests/temp files.
- Nếu dùng HTTPS public domain, hãy giữ `SESSION_COOKIE_SECURE=true`.
- Nếu public bằng Cloudflare Tunnel, dùng:
  - `cloudflared/render-production-config.sh`
  - `run-production-tunnel.sh`
  thay vì chạy trực tiếp file YAML còn placeholder.
