# EduVault V4 Production Internet Deployment

Tài liệu này gom lại flow production hoàn chỉnh nhất cho `he_thong_kho_luu_tru_tri_thuc` khi public hệ thống ra Internet bằng Docker Compose và Cloudflare Tunnel hoặc reverse proxy.

## 1. Chuẩn bị server

- Ubuntu/Linux có Docker Engine và Docker Compose plugin, hoặc Windows có Docker Desktop.
- Nếu dùng Cloudflare Tunnel, không cần mở public trực tiếp `3000` hoặc `8081`.
- Copy source code lên máy deploy.

## 2. Chuẩn bị cấu hình

1. Tạo `.env` từ `.env.production.example`.
2. Điền đầy đủ:
   - `PUBLIC_BASE_URL`
   - `ALLOWED_ORIGINS`
   - `MYSQL_PASSWORD`
   - `MYSQL_ROOT_PASSWORD`
   - `MINIO_ROOT_USER`
   - `MINIO_ROOT_PASSWORD`
   - `MINIO_ACCESS_KEY`
   - `MINIO_SECRET_KEY`
   - `TOKEN_ENCRYPTION_KEY`
   - `N8N_POLICY_SECRET`
   - `EDUVAULT_SEED_PASSWORD_*`
   - `OPENAI_API_KEY`
3. Nếu dùng Tunnel, điền thêm:
   - `CLOUDFLARE_TUNNEL_ID`
   - `CLOUDFLARE_CREDENTIALS_FILE`
   - `CLOUDFLARE_FRONTEND_HOSTNAME`
   - `CLOUDFLARE_BACKEND_HOSTNAME`

`CLOUDFLARE_CREDENTIALS_FILE` phải là absolute path đúng theo máy chạy tunnel:
- Windows: `C:\Users\<User>\.cloudflared\<TunnelID>.json`
- Linux: `/home/<user>/.cloudflared/<TunnelID>.json`

## 3. Build và chạy production

Linux/macOS:

```bash
chmod +x deploy-production.sh stop-production.sh logs-production.sh status-production.sh check-production.sh
./deploy-production.sh
```

Windows PowerShell:

```powershell
.\deploy-production.ps1
```

## 4. Kiểm tra sau khi lên stack

Linux/macOS:

```bash
./status-production.sh
./check-production.sh
./logs-production.sh
```

Windows PowerShell:

```powershell
.\status-production.ps1
.\check-production.ps1
.\logs-production.ps1
```

Kỳ vọng:
- `mysql`, `minio`, `redis`, `qdrant` đều `healthy`
- `backend` `healthy`
- `frontend` `healthy`
- `GET /api/health` trả `200`

## 5. Public qua Cloudflare Tunnel

1. Cài `cloudflared`
2. Login:

```bash
cloudflared tunnel login
```

3. Tạo tunnel:

```bash
cloudflared tunnel create eduvault-production
```

4. Route DNS:

```bash
cloudflared tunnel route dns eduvault-production ${CLOUDFLARE_FRONTEND_HOSTNAME}
cloudflared tunnel route dns eduvault-production ${CLOUDFLARE_BACKEND_HOSTNAME}
```

5. Render file config thật từ template:

```bash
chmod +x run-production-tunnel.sh cloudflared/render-production-config.sh
./cloudflared/render-production-config.sh
cat cloudflared/config.production.generated.yml
```

Trên Windows PowerShell:

```powershell
.\cloudflared\render-production-config.ps1
Get-Content .\cloudflared\config.production.generated.yml
```

6. Đảm bảo file credentials JSON nằm đúng đường dẫn trong `CLOUDFLARE_CREDENTIALS_FILE`
7. Chạy tunnel:

Linux/macOS:

```bash
./run-production-tunnel.sh
```

Windows PowerShell:

```powershell
.\run-production-tunnel.ps1
```

## 6. Public qua reverse proxy thay vì Tunnel

- Dùng `nginx.conf` làm base nếu bạn muốn đặt Nginx/Caddy trước frontend và backend.
- Giữ `SESSION_COOKIE_SECURE=true` nếu public bằng HTTPS.

## 7. Cutover checklist ngắn

- `docker compose -f docker-compose.production.yml config` pass
- `.env` không còn secret mẫu
- backend log không còn spam lỗi kết nối MySQL lúc boot
- frontend truy cập được
- `/api/health` trả `ok`
- tunnel hoặc reverse proxy route đúng domain thật
- rotate seed password sau bàn giao
- không chạy trực tiếp file YAML còn placeholder; luôn render config trước bằng script

