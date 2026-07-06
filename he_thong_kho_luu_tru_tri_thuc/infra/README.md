# Hạ tầng và vận hành

Thư mục `infra/` gom toàn bộ phần không thuộc business code:

- `compose/`: Docker Compose cho demo, production, v2, mysql
- `docker/`: Dockerfile backend
- `nginx/`: cấu hình reverse proxy
- `tunnel/`: Cloudflare tunnel
- `scripts/`: script deploy, logs, status, stop
- `database/`: schema và tài liệu database

## Lệnh thường dùng

Chạy production:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml up -d --build
```

Kiểm tra trạng thái:

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.production.yml ps
```

Xem log:

```powershell
.\infra\scripts\logs-production.ps1
```
