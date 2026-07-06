from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
import winreg


def _bootstrap_log(message: str) -> None:
    try:
        log_path = Path(os.getenv("TEMP", ".")) / "eduvault-desktop-agent-bootstrap.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(
            (log_path.read_text(encoding="utf-8") if log_path.exists() else "") + message + "\n",
            encoding="utf-8",
        )
    except Exception:
        pass


_bootstrap_log("gui.py module import started")


def _prime_tk_environment() -> None:
    base = Path(getattr(sys, "_MEIPASS", Path(sys.executable if getattr(sys, "frozen", False) else sys.base_prefix)))
    candidates = [
        (base / "_tcl_data", "TCL_LIBRARY"),
        (base / "_tk_data", "TK_LIBRARY"),
        (base / "tcl" / "tcl8.6", "TCL_LIBRARY"),
        (base / "tcl" / "tk8.6", "TK_LIBRARY"),
        (Path(sys.base_prefix) / "tcl" / "tcl8.6", "TCL_LIBRARY"),
        (Path(sys.base_prefix) / "tcl" / "tk8.6", "TK_LIBRARY"),
    ]
    for path, env_name in candidates:
        if path.exists():
            os.environ.setdefault(env_name, str(path))


_prime_tk_environment()
_bootstrap_log(f"TCL_LIBRARY={os.environ.get('TCL_LIBRARY', '')}")
_bootstrap_log(f"TK_LIBRARY={os.environ.get('TK_LIBRARY', '')}")

import tkinter as tk
from tkinter import messagebox

_bootstrap_log("tkinter import succeeded")

from agent import (
    APP_VERSION,
    AgentWorker,
    DEFAULT_CONFIG,
    DesktopAgentAuthService,
    LocalControlAPI,
    LocalQueue,
    NotificationCenter,
    WatchFolderManager,
    apply_watch_folders,
    load_config,
    normalize_watch_folders,
    save_config,
    setup_logging,
)


APP_NAME = "EduVault Desktop Agent"
APP_EXE_NAME = "EduVaultDesktopAgent.exe"


def app_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def installed_agent_dir() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA", str(app_base_dir()))
    return Path(local_app_data) / APP_NAME


def preferred_install_dirs() -> list[Path]:
    dirs = [installed_agent_dir(), Path.home() / APP_NAME]
    unique: list[Path] = []
    seen: set[str] = set()
    for path in dirs:
        key = str(path).lower()
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique


def _write_cmd_shortcut(path: Path, target_exe: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'@echo off\r\nstart "" "{target_exe}"\r\n', encoding="utf-8")


def _create_shortcut(shortcut_path: Path, target_exe: Path) -> None:
    shortcut_path.parent.mkdir(parents=True, exist_ok=True)
    shortcut_raw = str(shortcut_path).replace("'", "''")
    target_raw = str(target_exe).replace("'", "''")
    workdir_raw = str(target_exe.parent).replace("'", "''")
    script = (
        "$shell = New-Object -ComObject WScript.Shell; "
        f"$shortcut = $shell.CreateShortcut('{shortcut_raw}'); "
        f"$shortcut.TargetPath = '{target_raw}'; "
        f"$shortcut.WorkingDirectory = '{workdir_raw}'; "
        "$shortcut.Save()"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def register_windows_shortcuts(target_exe: Path) -> None:
    start_menu = Path(os.getenv("APPDATA", str(target_exe.parent))) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
    desktop = Path.home() / "Desktop"
    shortcut_targets = [
        start_menu / f"{APP_NAME}.lnk",
        desktop / f"{APP_NAME}.lnk",
    ]
    for shortcut in shortcut_targets:
        try:
            _create_shortcut(shortcut, target_exe)
        except Exception:
            try:
                _write_cmd_shortcut(shortcut.with_suffix(".cmd"), target_exe)
            except Exception:
                continue


def register_windows_startup(target_exe: Path) -> None:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, "EduVaultDesktopAgent", 0, winreg.REG_SZ, f'"{target_exe}" --startup')
    except Exception:
        return


def ensure_local_install(source_dir: Path) -> tuple[Path, Path]:
    current_exe = Path(sys.executable).resolve()
    install_dir = None
    last_error: Exception | None = None
    for candidate in preferred_install_dirs():
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            install_dir = candidate
            break
        except PermissionError as exc:
            last_error = exc
    if install_dir is None:
        install_dir = current_exe.parent

    target_exe = install_dir / APP_EXE_NAME
    if current_exe != target_exe:
        shutil.copy2(current_exe, target_exe)
    else:
        target_exe = current_exe

    config_path = install_dir / "config.json"
    if not config_path.exists():
        source_config = source_dir / "config.json"
        if source_config.exists():
            shutil.copy2(source_config, config_path)
        else:
            save_config(config_path, dict(DEFAULT_CONFIG))

    register_windows_shortcuts(target_exe)
    register_windows_startup(target_exe)
    return target_exe, config_path


def bootstrap_installed_app(startup: bool) -> bool:
    if not getattr(sys, "frozen", False):
        return False
    source_dir = app_base_dir()
    _bootstrap_log(f"bootstrap source_dir={source_dir}")
    target_exe, _config_path = ensure_local_install(source_dir)
    current_exe = Path(sys.executable).resolve()
    _bootstrap_log(f"bootstrap current_exe={current_exe} target_exe={target_exe}")
    if current_exe == target_exe:
        return False
    args = [str(target_exe)]
    if startup:
        args.append("--startup")
    subprocess.Popen(args, cwd=str(target_exe.parent))
    _bootstrap_log("bootstrap spawned installed exe")
    return True


class LoginDialog(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_submit):
        super().__init__(master)
        self.on_submit = on_submit
        self.title("EduVault Desktop Agent")
        self.geometry("380x220")
        self.resizable(False, False)
        self.protocol("WM_DELETE_WINDOW", self._close)

        self.username_var = tk.StringVar()
        self.password_var = tk.StringVar()
        self.message_var = tk.StringVar(value="Đăng nhập một lần để Desktop Agent hoạt động tự động.")

        frame = tk.Frame(self, padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="EduVault Desktop Agent", font=("Segoe UI", 14, "bold")).pack(anchor="w")
        tk.Label(frame, textvariable=self.message_var, fg="#334155", wraplength=320, justify="left").pack(anchor="w", pady=(8, 16))

        tk.Label(frame, text="Username").pack(anchor="w")
        username = tk.Entry(frame, textvariable=self.username_var, font=("Segoe UI", 11))
        username.pack(fill="x", pady=(4, 12))
        username.focus_set()

        tk.Label(frame, text="Password").pack(anchor="w")
        password = tk.Entry(frame, textvariable=self.password_var, show="*", font=("Segoe UI", 11))
        password.pack(fill="x", pady=(4, 16))
        password.bind("<Return>", lambda _event: self._submit())

        button_row = tk.Frame(frame)
        button_row.pack(fill="x")
        tk.Button(button_row, text="Đăng nhập", command=self._submit, bg="#1d4ed8", fg="white", padx=16, pady=8).pack(side="left")
        tk.Button(button_row, text="Thoát", command=self._close, padx=16, pady=8).pack(side="left", padx=(8, 0))

    def set_message(self, text: str) -> None:
        self.message_var.set(text)

    def _submit(self) -> None:
        username = self.username_var.get().strip()
        password = self.password_var.get()
        if not username or not password:
            self.set_message("Vui lòng nhập đầy đủ Username và Password.")
            return
        self.on_submit(username, password)

    def _close(self) -> None:
        self.master.destroy()


class AgentApp:
    def __init__(self, config_path: Path, *, startup: bool = False):
        self.config_path = config_path
        self.startup = startup
        self.root = tk.Tk()
        self.root.title("EduVault Desktop Agent")
        self.root.geometry("480x300")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self.config = load_config(self.config_path)
        setup_logging(config_path.parent / str(self.config["log_file"]))

        self.notifications = NotificationCenter()
        self.auth_service = DesktopAgentAuthService(self.config_path, self.config)
        self.auth_service.login_handler = self.ensure_login

        self.queue: LocalQueue | None = None
        self.worker: AgentWorker | None = None
        self.watch_manager: WatchFolderManager | None = None
        self.local_control: LocalControlAPI | None = None
        self.worker_thread: threading.Thread | None = None
        self.login_dialog: LoginDialog | None = None
        self.runtime_started = False

        self.status_var = tk.StringVar(value="Offline")
        self.connection_var = tk.StringVar(value="Disconnected")
        self.folder_var = tk.StringVar(value=str(self.config.get("watch_folder") or r"D:\Teaching"))
        self.last_sync_var = tk.StringVar(value="Chưa có")
        self.version_var = tk.StringVar(value=APP_VERSION)
        self.message_var = tk.StringVar(value="Desktop Agent sẵn sàng.")

        self._build_ui()

    def _build_ui(self) -> None:
        frame = tk.Frame(self.root, padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="EduVault Desktop Agent", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(frame, textvariable=self.message_var, fg="#334155", wraplength=420, justify="left").pack(anchor="w", pady=(8, 18))

        self._add_stat(frame, "Watching Folder", self.folder_var)
        self._add_stat(frame, "Status", self.status_var)
        self._add_stat(frame, "Connection", self.connection_var)
        self._add_stat(frame, "Version", self.version_var)
        self._add_stat(frame, "Last Sync", self.last_sync_var)

        actions = tk.Frame(frame)
        actions.pack(fill="x", pady=(16, 0))
        tk.Button(actions, text="Mở thư mục", command=self._open_watch_folder, padx=14, pady=8).pack(side="left")
        tk.Button(actions, text="Đăng xuất", command=self._logout, padx=14, pady=8).pack(side="left", padx=(8, 0))

    def _add_stat(self, master: tk.Misc, label: str, variable: tk.StringVar) -> None:
        row = tk.Frame(master)
        row.pack(fill="x", pady=4)
        tk.Label(row, text=label, width=16, anchor="w", fg="#475569").pack(side="left")
        tk.Label(row, textvariable=variable, anchor="w", font=("Segoe UI", 11, "bold")).pack(side="left")

    def ensure_login(self) -> str:
        if self.auth_service.authenticated():
            return self.auth_service.load_saved_token()
        result: dict[str, str] = {"token": ""}
        done = threading.Event()

        def submit(username: str, password: str) -> None:
            try:
                self.auth_service.login(username, password)
                result["token"] = self.auth_service.load_saved_token()
                self.message_var.set("Đăng nhập thành công. Desktop Agent đang kết nối...")
                if self.login_dialog is not None:
                    self.login_dialog.destroy()
                    self.login_dialog = None
                done.set()
            except RuntimeError as exc:
                if self.login_dialog is not None:
                    self.login_dialog.set_message(str(exc))

        def open_dialog() -> None:
            if self.login_dialog is None:
                self.login_dialog = LoginDialog(self.root, submit)
                self.login_dialog.grab_set()
            else:
                self.login_dialog.deiconify()
                self.login_dialog.lift()

        self.root.after(0, open_dialog)
        while not done.is_set() and self.root.winfo_exists():
            self.root.update()
        return result["token"]

    def start_runtime(self) -> None:
        if self.runtime_started:
            return
        watch_folders = self.auth_service.sync_remote_watch_folders()
        if not watch_folders:
            watch_folders = normalize_watch_folders(self.config) or [r"D:\Teaching"]
            apply_watch_folders(self.config, watch_folders, remote_loaded=False)
            save_config(self.config_path, self.config)

        queue_db = Path(self.config["queue_db"])
        if not queue_db.is_absolute():
            queue_db = self.config_path.parent / queue_db

        self.queue = LocalQueue(queue_db)
        self.worker = AgentWorker(self.queue, self.config, auth_service=self.auth_service, notifications=self.notifications)
        self.watch_manager = WatchFolderManager(self.queue, self.config, notifications=self.notifications)
        self.watch_manager.apply(watch_folders)
        self.local_control = LocalControlAPI(self.config)
        self.local_control.start()
        self.worker.publish_heartbeat(force=True)

        self.worker_thread = threading.Thread(target=self.worker.run_loop, daemon=True)
        self.worker_thread.start()
        self.runtime_started = True
        self.message_var.set("Desktop Agent đang theo dõi thư mục và tự đồng bộ tài liệu.")
        if self.startup:
            self.root.withdraw()
        self._refresh_ui()

    def _refresh_ui(self) -> None:
        if not self.root.winfo_exists():
            return
        if self.runtime_started and not self.auth_service.load_saved_token() and self.login_dialog is None:
            self.root.deiconify()
            self.message_var.set("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đồng bộ.")
            self.ensure_login()
            try:
                self.auth_service.sync_remote_watch_folders()
            except RuntimeError as exc:
                self.message_var.set(str(exc))
        if self.worker:
            online = self.worker.backend_status == "online"
            self.status_var.set("Online" if online else "Offline")
            self.connection_var.set("Watching..." if online else "Đang kết nối lại...")
            watch_folders = self.config.get("watch_folders") or [self.config.get("watch_folder") or r"D:\Teaching"]
            self.folder_var.set(", ".join(watch_folders))
            self.last_sync_var.set(self.worker.last_sync or "Chưa có")
        self.root.after(2000, self._refresh_ui)

    def _open_watch_folder(self) -> None:
        folder = str(self.config.get("watch_folder") or r"D:\Teaching")
        os.startfile(folder)

    def _logout(self) -> None:
        if self.worker:
            self.worker.stop_event.set()
        self.auth_service.logout()
        messagebox.showinfo("EduVault Desktop Agent", "Đã đăng xuất. Vui lòng đăng nhập lại.")
        self.runtime_started = False
        self.root.deiconify()
        self.ensure_login()
        self.start_runtime()

    def _on_close(self) -> None:
        if self.startup:
            self.root.withdraw()
            return
        if self.worker:
            self.worker.stop_event.set()
        if self.local_control:
            self.local_control.stop()
        if self.watch_manager:
            self.watch_manager.stop()
        self.root.destroy()

    def run(self) -> None:
        try:
            self.ensure_login()
            self.start_runtime()
            self.root.mainloop()
        finally:
            if self.worker:
                self.worker.stop_event.set()
            if self.local_control:
                self.local_control.stop()
            if self.watch_manager:
                self.watch_manager.stop()


def main() -> None:
    parser = argparse.ArgumentParser(description="EduVault Desktop Agent GUI")
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--startup", action="store_true")
    args = parser.parse_args()

    if bootstrap_installed_app(args.startup):
        return

    base_dir = app_base_dir()
    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = base_dir / config_path
    app = AgentApp(config_path, startup=args.startup)
    app.run()


if __name__ == "__main__":
    main()
