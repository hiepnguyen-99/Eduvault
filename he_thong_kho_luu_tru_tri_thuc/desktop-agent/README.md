# EduVault Desktop Agent

Desktop Agent theo doi folder local tren tung may Windows, ghi file moi vao SQLite queue cuc bo, sau do worker rieng upload len EduVault v3 qua luong Unified Ingestion `init -> chunk -> analyze`.

## Muc tieu trien khai

- Moi may nguoi dung co mot Desktop Agent rieng.
- Agent tu khoi dong cung Windows.
- Nguoi dung chi viec bo file vao `D:\Teaching`.
- File se len `pending_confirmation` theo tai khoan da dang nhap trong agent.

## Cai nhanh tren may moi

Chay 1 lenh tu thu muc repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-desktop-agent.ps1 -BackendUrl "https://c2-app-012-api.eduvinuni.io.vn" -WatchFolder "D:\Teaching" -UserCode "GV001"
```

Script nay se:

- tao virtualenv trong `desktop-agent\.venv`
- cai dependency
- tao `desktop-agent\config.json` tu `desktop-agent\config.example.json` neu chua co
- dat `backend_url`, `watch_folder`, `watch_folders`, `user_code`

## Dang nhap lan dau

Sau khi setup xong, nguoi dung dang nhap 1 lan:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop-agent\run-agent.ps1
```

Agent se hoi:

- `Mã người dùng`
- `Mật khẩu`

Dang nhap thanh cong xong, token se duoc luu lai trong `config.json` duoi dang DPAPI cua Windows.

## Bat tu dong chay cung Windows

Sau khi dang nhap thanh cong:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-desktop-agent-task.ps1 -StartNow
```

Task Scheduler se chay an `desktop-agent\run-agent.ps1`, khong can giu cua so PowerShell mo.

Go task khi can:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-desktop-agent-task.ps1
```

## Kiem tra nhanh tinh trang agent

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-desktop-agent.ps1
```

Script se bao:

- config dang dung
- backend URL
- watch folder
- user code
- token da luu hay chua
- Scheduled Task co dang chay khong
- control API `127.0.0.1:8765` co listen khong
- 15 dong log moi nhat

## File cau hinh

Mau mac dinh cho may moi nam o:

- `desktop-agent\config.example.json`

Mac dinh production/demo public:

```json
{
  "watch_folder": "D:\\Teaching",
  "watch_folders": ["D:\\Teaching"],
  "active_backend": "deploy",
  "backend_profiles": {
    "local": "http://127.0.0.1:8080",
    "deploy": "https://api.example.edu"
  },
  "backend_url": "https://api.example.edu",
  "token": "",
  "user_code": ""
}
```

Khi test local, doi:

```json
"active_backend": "local"
```

Khi chay deploy/demo public, doi lai:

```json
"active_backend": "deploy"
```

Neu backend da duoc cau hinh watch folders trong EduVault, agent se poll `GET /api/desktop-agent/config` de dong bo cau hinh theo tai khoan.

## Luu y van hanh

- `D:\Teaching` la thu muc local cua tung may. Muon may nao tu dong upload thi may do phai cai Desktop Agent.
- File qua nho co the bi bo qua; agent hien bo qua file duoi 1024 bytes.
- Moi file moi se di qua `POST /api/ingestion/desktop/init`, upload chunk, roi `POST /api/ingestion/desktop/{task_id}/analyze`.
- Upload task hien theo user dang nhap trong agent, khong tu dong chia se queue giua cac tai khoan khac nhau.

## Du lieu cuc bo

- Queue: `desktop-agent.db`
- Log: `logs/desktop-agent.log`
- Runner: `run-agent.ps1`
- Setup may moi: `..\scripts\setup-desktop-agent.ps1`
- Health check: `..\scripts\check-desktop-agent.ps1`
