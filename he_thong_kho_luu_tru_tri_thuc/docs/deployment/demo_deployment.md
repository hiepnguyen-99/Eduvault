# EduVault Demo Deployment via Docker Compose + Cloudflare Tunnel

Tài liệu này hướng dẫn dựng bản demo Internet-facing mà không thay đổi business logic, API hay frontend của EduVault.

## 1. Cài Docker Desktop

Trên Windows hoặc macOS, cài Docker Desktop. Trên Linux, cài Docker Engine + Docker Compose plugin.

## 2. Cài cloudflared

Tải và cài `cloudflared`:

- Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
- Linux/macOS: dùng package chính thức của Cloudflare

Kiểm tra:

```bash
cloudflared --version
docker --version
docker compose version
```

## 3. Chuẩn bị biến môi trường

Từ thư mục `he_thong_kho_luu_tru_tri_thuc`:

```bash
cp .env.demo.example .env.demo
```

Điền tối thiểu:

- `FRONTEND_URL`
- `BACKEND_URL`
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
- `CLOUDFLARE_TUNNEL_ID`
- `CLOUDFLARE_CREDENTIALS_FILE`
- `CLOUDFLARE_FRONTEND_HOSTNAME`
- `CLOUDFLARE_BACKEND_HOSTNAME`
- `CLOUDFLARE_FRONTEND_HOSTNAME_ALT`
- `CLOUDFLARE_BACKEND_HOSTNAME_ALT`

`CLOUDFLARE_CREDENTIALS_FILE` phải là absolute path đúng theo máy chạy tunnel:
- Windows: `C:\Users\<User>\.cloudflared\<TunnelID>.json`
- Linux: `/home/<user>/.cloudflared/<TunnelID>.json`

## 4. Đăng nhập Cloudflare

```bash
cloudflared tunnel login
```

Lệnh này sẽ mở trình duyệt để bạn chọn zone/domain.

## 5. Tạo Tunnel

```bash
cloudflared tunnel create eduvault-demo
```

Sau khi tạo xong, lấy:

- Tunnel ID
- file credentials JSON

Rồi điền:

- `CLOUDFLARE_TUNNEL_ID`
- `CLOUDFLARE_CREDENTIALS_FILE`

vào `.env.demo`.

## 6. Tạo DNS

Ví dụ:

```bash
cloudflared tunnel route dns eduvault-demo eduvault-demo.example.com
cloudflared tunnel route dns eduvault-demo api.eduvault-demo.example.com
cloudflared tunnel route dns eduvault-demo c2-app-012.eduvinuni.io.vn
cloudflared tunnel route dns eduvault-demo c2-app-012-api.eduvinuni.io.vn
```

## 7. Copy file credentials

Đảm bảo file credentials JSON tồn tại đúng path đã điền trong `.env.demo`.
Script render chỉ dùng đúng giá trị từ `.env.demo`, không tự giả định Windows hay Linux.

Ví dụ:

```bash
~/.cloudflared/<TUNNEL_ID>.json
```

## 8. Chạy Docker Compose

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
```

Hoặc dùng script:

```bash
./deploy-demo.sh
```

Trên Windows PowerShell, dùng:

```powershell
.\deploy-demo.ps1
```

## 9. Render config và chạy Cloudflare Tunnel

Cloudflared không nên chạy trực tiếp với file YAML còn placeholder `${...}`.
Hãy dùng script đã có sẵn để render file config thật từ `.env.demo` rồi chạy tunnel:

```bash
chmod +x run-demo-tunnel.sh cloudflared/render-demo-config.sh
./run-demo-tunnel.sh
```

Trên Windows PowerShell:

```powershell
.\run-demo-tunnel.ps1
```

Nếu muốn chỉ render trước để kiểm tra:

```bash
./cloudflared/render-demo-config.sh
cat cloudflared/config.demo.generated.yml
```

## 10. Kiểm tra

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml ps
curl http://127.0.0.1:${BACKEND_PORT}/api/health
curl http://127.0.0.1:${FRONTEND_PORT}
```

Sau đó kiểm tra public URL:

- `https://eduvault-demo.example.com`
- `https://api.eduvault-demo.example.com/api/health`
- `https://c2-app-012.eduvinuni.io.vn`
- `https://c2-app-012-api.eduvinuni.io.vn/api/health`

## 11. Logs và stop

```bash
./logs.sh
./stop-demo.sh
```

Trên Windows PowerShell:

```powershell
.\logs-demo.ps1
.\stop-demo.ps1
```

## 12. Ghi chú

- MySQL, MinIO, Qdrant chỉ nằm trong Docker bridge network và không cần public ra Internet.
- Cloudflare Tunnel chỉ forward frontend/backend.
- `nginx.conf` được cung cấp cho trường hợp bạn muốn đặt thêm reverse proxy cục bộ hoặc cùng-host.
- File cấu hình tunnel mẫu nằm ở:
  - `cloudflared/config.demo.template.yml`
  - `cloudflared/config.demo.generated.yml` sau khi render

