# Desktop Agent Installer

## Mục tiêu

Giữ nguyên pipeline hiện tại:

Desktop Agent -> Detect -> AI Metadata -> Placement -> Import Ticket -> Confirm -> Repository

Chỉ bổ sung trải nghiệm cài đặt và khởi tạo lần đầu cho giảng viên.

## Kiến trúc bộ cài

1. `desktop-agent/gui.py`
- Giao diện đăng nhập và trạng thái chạy.
- Không cần terminal.

2. `desktop-agent/EduVaultDesktopAgent.spec`
- Dùng PyInstaller để build `EduVaultDesktopAgent.exe`.

3. `installer/EduVaultDesktopAgent.iss`
- Dùng Inno Setup tạo `EduVaultDesktopAgentSetup.exe`.
- Tạo shortcut Start Menu.
- Tạo shortcut Desktop.
- Đăng ký Windows Startup qua `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Tự khởi chạy sau khi cài xong.

4. `scripts/build-desktop-agent-installer.ps1`
- Build `.exe` chính.
- Sau đó build installer `.exe`.

## Luồng first-time setup

1. Giảng viên vào `Settings > Desktop Agent`
2. Chọn `Watch Folder`
3. Bấm `Lưu`
4. Web hiển thị `Desktop Agent is not installed.`
5. Giảng viên bấm `Download Desktop Agent`
6. Chạy `EduVaultDesktopAgentSetup.exe`
7. Ứng dụng mở màn hình:
   - Username
   - Password
8. Agent gọi `POST /api/auth/login`
9. Token được lưu bằng DPAPI của Windows
10. Agent gọi `GET /api/desktop-agent/config`
11. Agent bắt đầu theo dõi thư mục
12. Agent gửi heartbeat về web qua `POST /api/desktop-agent/heartbeat`

## Trạng thái web

`GET /api/desktop-agent/status` trả về:

- `installed`
- `online`
- `version`
- `watch_folders`
- `last_sync`
- `connection_status`
- `last_error`

## Lệnh build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-desktop-agent-installer.ps1
```

Kết quả mong đợi:

- `desktop-agent\dist\EduVaultDesktopAgent.exe`
- `desktop-agent\dist\EduVaultDesktopAgentSetup.exe`

Nếu máy build chưa có `Inno Setup 6`, script vẫn tạo `EduVaultDesktopAgentSetup.exe`
dạng self-install fallback từ chính `EduVaultDesktopAgent.exe`. Khi người dùng mở file,
ứng dụng sẽ tự copy vào `%LOCALAPPDATA%\EduVault Desktop Agent`, tạo shortcut Start Menu,
Desktop shortcut, đăng ký Windows Startup, rồi khởi chạy app đã cài.
