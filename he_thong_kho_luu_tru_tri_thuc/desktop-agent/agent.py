from __future__ import annotations

import argparse
import base64
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ctypes
import getpass
import hashlib
import json
import logging
import mimetypes
import os
import platform
import re
import sqlite3
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

def app_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


CURRENT_DIR = app_base_dir()
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from state import (
    ACTIVE_POLLING_STATUSES,
    LocalStateStore,
    STATUS_COMPLETED,
    STATUS_CONFIRMED,
    STATUS_DETECTED,
    STATUS_EMBEDDING,
    STATUS_FAILED,
    STATUS_NEW,
    STATUS_PROCESSING,
    STATUS_REPLICA,
    STATUS_SYNCED,
    STATUS_UPLOADED,
    STATUS_WAITING_CONFIRMATION,
)

try:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer
except ImportError:  # Tests for queue/retry/hash should not require watchdog.
    FileSystemEventHandler = object
    Observer = None


QUEUE_NEW = "NEW"
QUEUE_UPLOADING = "UPLOADING"
QUEUE_WAITING_SERVER = "WAITING_SERVER"
QUEUE_SUCCESS = "SUCCESS"
QUEUE_FAILED = "FAILED"
QUEUE_RETRY = "RETRY"

RETRY_BACKOFF_SECONDS = [2, 4, 8]
MIN_FILE_SIZE_BYTES = 1024
APP_VERSION = "1.0.0"
HEARTBEAT_INTERVAL_SECONDS = 15

DEFAULT_CONFIG = {
    "watch_folder": r"D:\Teaching",
    "watch_folders": [],
    "remote_watch_config_loaded": False,
    "remote_config_poll_interval": 60,
    "local_control_host": "127.0.0.1",
    "local_control_port": 8765,
    "path_mappings": [],
    "active_backend": os.getenv("DESKTOP_AGENT_ACTIVE_BACKEND") or "deploy",
    "backend_profiles": {
        "local": "http://127.0.0.1:8080",
        "deploy": os.getenv("DESKTOP_AGENT_BACKEND_URL") or os.getenv("BACKEND_URL") or "https://api.example.edu",
    },
    "backend_url": (os.getenv("DESKTOP_AGENT_BACKEND_URL") or os.getenv("BACKEND_URL") or "https://api.example.edu"),
    "token": "",
    "user_code": "",
    "retry_limit": 3,
    "poll_interval": 5,
    "stable_seconds": 1.5,
    "chunk_size_bytes": 5 * 1024 * 1024,
    "device_id": "",
    "queue_db": "desktop-agent.db",
    "log_file": "logs/desktop-agent.log",
}

PIPELINE_STAGES = [
    "Waiting",
    "Analyzing",
    "Uploading",
    "AI Metadata",
    "Repository Analysis",
    "Waiting Confirmation",
    "Confirmed",
    "Moving Repository",
    "Embedding",
    "Replica",
    "Completed",
]

PIPELINE_PROGRESS = {
    "Waiting": 5,
    "Analyzing": 12,
    "Uploading": 24,
    "AI Metadata": 40,
    "Repository Analysis": 58,
    "Waiting Confirmation": 72,
    "Confirmed": 78,
    "Moving Repository": 84,
    "Embedding": 90,
    "Replica": 96,
    "Completed": 100,
}

STATE_TO_STAGE = {
    STATUS_NEW: "Waiting",
    STATUS_DETECTED: "Waiting Confirmation",
    STATUS_WAITING_CONFIRMATION: "Waiting Confirmation",
    STATUS_CONFIRMED: "Confirmed",
    STATUS_PROCESSING: "Moving Repository",
    STATUS_EMBEDDING: "Embedding",
    STATUS_REPLICA: "Replica",
    STATUS_COMPLETED: "Completed",
    STATUS_FAILED: "Waiting",
    STATUS_UPLOADED: "Uploading",
    STATUS_SYNCED: "Completed",
}

QUEUE_TO_STAGE = {
    QUEUE_NEW: "Waiting",
    QUEUE_RETRY: "Waiting",
    QUEUE_UPLOADING: "Uploading",
    QUEUE_WAITING_SERVER: "Repository Analysis",
    QUEUE_SUCCESS: "Waiting Confirmation",
    QUEUE_FAILED: "Waiting",
}

STATUS_ICONS = {
    "COMPLETED": "✓",
    "WAITING CONFIRMATION": "⚠",
    "FAILED": "✗",
    "ACTIVE": "●",
}

DPAPI_PREFIX = "dpapi:"


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _windows_protect_text(value: str) -> str:
    if os.name != "nt" or not value:
        return value
    payload = value.encode("utf-8")
    input_buffer = ctypes.create_string_buffer(payload)
    input_blob = DATA_BLOB(len(payload), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptProtectData(ctypes.byref(input_blob), "EduVault Desktop Agent", None, None, None, 0, ctypes.byref(output_blob)):
        raise ctypes.WinError()
    try:
        protected = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return DPAPI_PREFIX + base64.b64encode(protected).decode("ascii")
    finally:
        if output_blob.pbData:
            kernel32.LocalFree(output_blob.pbData)


def _windows_unprotect_text(value: str) -> str:
    if os.name != "nt" or not value.startswith(DPAPI_PREFIX):
        return value
    raw = base64.b64decode(value[len(DPAPI_PREFIX):].encode("ascii"))
    input_buffer = ctypes.create_string_buffer(raw)
    input_blob = DATA_BLOB(len(raw), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptUnprotectData(ctypes.byref(input_blob), None, None, None, None, 0, ctypes.byref(output_blob)):
        raise ctypes.WinError()
    try:
        unprotected = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return unprotected.decode("utf-8")
    finally:
        if output_blob.pbData:
            kernel32.LocalFree(output_blob.pbData)


def protect_saved_token(token: str) -> str:
    cleaned = str(token or "").strip()
    if not cleaned:
        return ""
    try:
        return _windows_protect_text(cleaned)
    except Exception:
        logging.warning("auth.token_protect_failed", exc_info=True)
        return cleaned


def unprotect_saved_token(token: str) -> str:
    cleaned = str(token or "").strip()
    if not cleaned:
        return ""
    try:
        return _windows_unprotect_text(cleaned)
    except Exception:
        logging.warning("auth.token_unprotect_failed", exc_info=True)
        return ""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_config(path: Path, config: dict[str, Any]) -> None:
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")


def _clean_backend_url(value: Any) -> str:
    return str(value or "").strip().rstrip("/")


def _is_local_backend_url(value: str) -> bool:
    cleaned = _clean_backend_url(value).lower()
    return cleaned.startswith("http://127.0.0.1") or cleaned.startswith("http://localhost")


def _find_backend_profile_name(profiles: dict[str, Any], backend_url: str) -> str:
    target = _clean_backend_url(backend_url)
    if not target:
        return ""
    for name, value in profiles.items():
        if _clean_backend_url(value) == target:
            return str(name).strip()
    return ""


def _preferred_backend_profile_name(profiles: dict[str, Any]) -> str:
    deploy_url = _clean_backend_url(profiles.get("deploy"))
    if deploy_url and not _is_local_backend_url(deploy_url):
        return "deploy"
    for name, value in profiles.items():
        cleaned = _clean_backend_url(value)
        if cleaned and not _is_local_backend_url(cleaned):
            return str(name).strip()
    local_url = _clean_backend_url(profiles.get("local"))
    if local_url:
        return "local"
    for name, value in profiles.items():
        cleaned = _clean_backend_url(value)
        if cleaned:
            return str(name).strip()
    return ""


def resolve_backend_url(config: dict[str, Any]) -> str:
    profiles = config.get("backend_profiles")
    active = str(config.get("active_backend") or "").strip()
    if isinstance(profiles, dict) and active:
        selected = str(profiles.get(active) or "").strip()
        if selected:
            return selected.rstrip("/")
    return str(config.get("backend_url") or DEFAULT_CONFIG["backend_url"]).strip().rstrip("/")


def stabilize_backend_configuration(config: dict[str, Any]) -> dict[str, Any]:
    profiles = config.get("backend_profiles")
    if not isinstance(profiles, dict):
        profiles = {}
    normalized_profiles = {
        str(name).strip(): _clean_backend_url(value)
        for name, value in profiles.items()
        if str(name).strip() and _clean_backend_url(value)
    }

    active_backend = str(config.get("active_backend") or "").strip()
    legacy_backend_url = _clean_backend_url(config.get("backend_url"))
    if legacy_backend_url:
        matched_profile = _find_backend_profile_name(normalized_profiles, legacy_backend_url)
        if matched_profile:
            active_backend = matched_profile
        elif active_backend:
            normalized_profiles[active_backend] = legacy_backend_url
        else:
            inferred_profile = "local" if _is_local_backend_url(legacy_backend_url) else "deploy"
            normalized_profiles[inferred_profile] = legacy_backend_url
            active_backend = inferred_profile

    active_backend = active_backend if active_backend in normalized_profiles else _preferred_backend_profile_name(normalized_profiles)
    active_backend_url = _clean_backend_url(normalized_profiles.get(active_backend))

    has_saved_token = bool(_clean_backend_url(config.get("token")))
    has_user_code = bool(str(config.get("user_code") or "").strip())
    deploy_backend_url = _clean_backend_url(normalized_profiles.get("deploy"))
    if (
        active_backend == "local"
        and _is_local_backend_url(active_backend_url)
        and deploy_backend_url
        and not _is_local_backend_url(deploy_backend_url)
        and not has_saved_token
        and not has_user_code
    ):
        active_backend = "deploy"
        active_backend_url = deploy_backend_url

    if not active_backend_url:
        fallback_profile = _preferred_backend_profile_name(normalized_profiles)
        active_backend = fallback_profile or active_backend or "deploy"
        active_backend_url = _clean_backend_url(normalized_profiles.get(active_backend))

    config["backend_profiles"] = normalized_profiles
    config["active_backend"] = active_backend or "deploy"
    config["backend_url"] = active_backend_url or legacy_backend_url or _clean_backend_url(DEFAULT_CONFIG["backend_url"])
    return config


def migrate_backend_profiles(config: dict[str, Any]) -> dict[str, Any]:
    profiles = config.get("backend_profiles")
    if not isinstance(profiles, dict):
        profiles = {}
    merged_profiles = dict(DEFAULT_CONFIG["backend_profiles"])
    merged_profiles.update({str(key): str(value) for key, value in profiles.items() if str(value).strip()})

    legacy_url = str(config.get("backend_url") or "").strip()
    if legacy_url and legacy_url not in merged_profiles.values():
        active = str(config.get("active_backend") or "").strip()
        if active and active not in merged_profiles:
            merged_profiles[active] = legacy_url
        elif legacy_url.startswith("http://127.0.0.1") or legacy_url.startswith("http://localhost"):
            merged_profiles["local"] = legacy_url
            config["active_backend"] = config.get("active_backend") or "local"
        else:
            merged_profiles["deploy"] = legacy_url

    config["backend_profiles"] = merged_profiles
    config["active_backend"] = str(config.get("active_backend") or "deploy").strip()
    config["backend_url"] = resolve_backend_url(config)
    return stabilize_backend_configuration(config)


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        config = migrate_backend_profiles(dict(DEFAULT_CONFIG))
        save_config(path, config)
        return config
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    config = migrate_backend_profiles({**DEFAULT_CONFIG, **data})
    if config != data:
        save_config(path, config)
    return config


def default_watch_folders() -> list[str]:
    return [str(DEFAULT_CONFIG["watch_folder"])]


def normalize_windows_folder_path(value: str) -> str:
    cleaned = str(value or "").strip().replace("/", "\\")
    cleaned = re.sub(r"\\+", r"\\", cleaned)
    cleaned = re.sub(r"^([A-Za-z])::+\\", r"\1:\\", cleaned)
    cleaned = re.sub(r"^([A-Za-z]):(?!\\)", r"\1:\\", cleaned)
    if len(cleaned) > 3 and cleaned.endswith("\\"):
        cleaned = cleaned.rstrip("\\")
    return cleaned


def parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def format_clock(value: str) -> str:
    parsed = parse_timestamp(value)
    return parsed.astimezone().strftime("%H:%M:%S") if parsed else "-"


def format_elapsed(started_at: str, finished_at: str | None = None) -> str:
    started = parse_timestamp(started_at)
    if not started:
        return "-"
    end = parse_timestamp(finished_at or "") or datetime.now(timezone.utc)
    seconds = max(0, int((end - started).total_seconds()))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {sec:02d}s"
    return f"{sec}s"


def progress_bar(percent: int, width: int = 10) -> str:
    clamped = max(0, min(100, int(percent)))
    filled = round((clamped / 100) * width)
    return "█" * filled + "░" * (width - filled)


def stage_index(stage: str) -> int:
    try:
        return PIPELINE_STAGES.index(stage)
    except ValueError:
        return 0


def pipeline_for_stage(stage: str, *, failed: bool = False) -> str:
    current = stage if stage in PIPELINE_STAGES else "Waiting"
    current_index = stage_index(current)
    parts: list[str] = []
    for index, item in enumerate(PIPELINE_STAGES):
        if failed and index == current_index:
            parts.append(f"✗ {item}")
        elif index < current_index:
            parts.append(f"✓ {item}")
        elif index == current_index:
            parts.append(f"▶ {item}")
        else:
            parts.append(f"· {item}")
    return " -> ".join(parts)


def item_stage(queue_status: str, state_status: str, runtime_stage: str = "") -> str:
    if runtime_stage:
        return runtime_stage
    if state_status in STATE_TO_STAGE:
        return STATE_TO_STAGE[state_status]
    return QUEUE_TO_STAGE.get(queue_status, "Waiting")


def item_progress(stage: str, *, failed: bool = False) -> int:
    if failed:
        return min(99, PIPELINE_PROGRESS.get(stage, 5))
    return PIPELINE_PROGRESS.get(stage, 5)


def normalize_watch_folders(config: dict[str, Any], cli_watch_folders: list[str] | None = None) -> list[str]:
    folders: list[str] = []
    configured = config.get("watch_folders")
    if isinstance(configured, list):
        folders.extend(normalize_windows_folder_path(str(item)) for item in configured if str(item).strip())
    single = normalize_windows_folder_path(str(config.get("watch_folder") or ""))
    if single:
        folders.append(single)
    if cli_watch_folders:
        for item in cli_watch_folders:
            folders.extend(normalize_windows_folder_path(part) for part in str(item).split(",") if part.strip())

    deduped: list[str] = []
    seen: set[str] = set()
    for item in folders:
        key = str(Path(item)).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def apply_watch_folders(config: dict[str, Any], folders: list[str], *, remote_loaded: bool | None = None) -> list[str]:
    normalized = normalize_watch_folders({"watch_folder": "", "watch_folders": folders})
    config["watch_folders"] = normalized
    config["watch_folder"] = normalized[0] if normalized else ""
    if remote_loaded is not None:
        config["remote_watch_config_loaded"] = bool(remote_loaded)
    return normalized


def split_repository_path(value: str) -> list[str]:
    return [segment.strip() for segment in str(value or "").replace("\\", "/").split("/") if segment.strip()]


def build_sync_metadata(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    mappings = config.get("path_mappings")
    if not isinstance(mappings, list):
        return {}
    try:
        absolute_path = path.resolve()
    except OSError:
        absolute_path = path

    best_match: tuple[dict[str, Any], Path] | None = None
    best_length = -1
    for item in mappings:
        if not isinstance(item, dict):
            continue
        local_root_raw = str(item.get("local_root") or "").strip()
        if not local_root_raw:
            continue
        candidate_root = Path(local_root_raw).expanduser()
        try:
            absolute_root = candidate_root.resolve()
        except OSError:
            absolute_root = candidate_root
        try:
            common = os.path.commonpath([str(absolute_path), str(absolute_root)])
        except ValueError:
            continue
        if common.casefold() != str(absolute_root).casefold():
            continue
        current_length = len(str(absolute_root))
        if current_length > best_length:
            best_match = (item, absolute_root)
            best_length = current_length

    if not best_match:
        return {}

    mapping, absolute_root = best_match
    relative_dir_text = os.path.relpath(str(absolute_path.parent), str(absolute_root))
    relative_parts = [] if relative_dir_text in {"", "."} else [part for part in Path(relative_dir_text).parts if part not in {"", "."}]
    repository_prefix = split_repository_path(str(mapping.get("repository_prefix") or ""))
    explicit_folder_hint = str(mapping.get("folder_hint") or "").strip().strip("/\\")
    folder_hint = explicit_folder_hint or "/".join([*repository_prefix, *relative_parts]).strip("/\\")
    doc_type_hint = str(mapping.get("doc_type_hint") or "").strip()
    if not doc_type_hint and mapping.get("derive_doc_type_from_last_segment", True) and relative_parts:
        doc_type_hint = relative_parts[-1]

    return {
        "source_path": str(path),
        "local_root": str(absolute_root),
        "relative_dir": "/".join(relative_parts),
        "relative_path": "/".join([*relative_parts, path.name]),
        "repository_prefix": "/".join(repository_prefix),
        "folder_hint": folder_hint,
        "doc_type_hint": doc_type_hint,
        "visibility_hint": str(mapping.get("visibility_hint") or "").strip(),
        "course_hint": str(mapping.get("course_hint") or "").strip(),
        "specialization_hint": str(mapping.get("specialization_hint") or "").strip(),
    }


def suggest_folder_label(folder_path: str) -> str:
    cleaned = str(folder_path or "").strip().rstrip("\\/")
    if not cleaned:
        return ""
    return Path(cleaned).name or cleaned


def _contains_control_chars(value: str) -> bool:
    return any(ord(ch) < 32 for ch in str(value or ""))


def sanitize_dialog_title(value: str, default: str = "Select watch folder") -> str:
    text = str(value or "").strip()
    if not text or _contains_control_chars(text):
        return default
    text = re.sub(r"\s+", " ", text)
    return text[:80] or default


def sanitize_dialog_initial_path(value: str) -> str:
    text = str(value or "").strip()
    if not text or _contains_control_chars(text):
        return ""
    cleaned = normalize_windows_folder_path(text)
    if len(cleaned) > 260:
        return ""
    candidate = Path(cleaned).expanduser()
    if not candidate.is_absolute():
        return ""
    try:
        resolved = candidate.resolve(strict=False)
    except OSError:
        return ""
    if not resolved.exists() or not resolved.is_dir():
        return ""
    return str(resolved)


def get_device_id(config: dict[str, Any]) -> str:
    existing = str(config.get("device_id") or "").strip()
    if existing:
        return existing
    hostname = re.sub(r"[^A-Za-z0-9_-]+", "-", platform.node().strip()) or "desktop-agent"
    fingerprint = f"{uuid.getnode():012x}"[-12:]
    device_id = f"{hostname}-{fingerprint}"
    config["device_id"] = device_id
    return device_id


def pick_folder_dialog(initial_path: str = "", title: str = "Select watch folder") -> str:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:
        raise RuntimeError("Folder picker is unavailable on this machine.") from exc

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        chosen = filedialog.askdirectory(
            initialdir=initial_path or None,
            title=title,
            mustexist=False,
        )
    finally:
        root.destroy()
    return str(chosen or "").strip()


def setup_logging(log_file: Path) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_file, encoding="utf-8")],
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def should_ignore_file(path: Path) -> bool:
    name = path.name
    lower_name = name.lower()
    if lower_name.endswith(".tmp"):
        return True
    if name.startswith("~$"):
        return True
    if name.startswith(".") or lower_name == ".hidden":
        return True
    try:
        if path.exists() and path.is_file() and path.stat().st_size < MIN_FILE_SIZE_BYTES:
            return True
    except OSError:
        return True
    return False


def can_open_file(path: Path) -> bool:
    try:
        with path.open("rb"):
            return True
    except OSError:
        return False


def wait_until_stable(path: Path, stable_seconds: float) -> bool:
    previous_size = -1
    stable_since = time.time()
    while time.time() - stable_since < stable_seconds:
        if not path.exists() or not path.is_file():
            return False
        size = path.stat().st_size
        if size != previous_size:
            previous_size = size
            stable_since = time.time()
        elif not can_open_file(path):
            stable_since = time.time()
        time.sleep(0.25)
    return path.exists() and path.is_file() and can_open_file(path)


def backoff_delay(retry_count: int) -> int:
    index = max(0, min(retry_count - 1, len(RETRY_BACKOFF_SECONDS) - 1))
    return RETRY_BACKOFF_SECONDS[index]


@dataclass
class QueueItem:
    id: int
    file_path: str
    sha256: str
    size: int
    modified_time: float
    status: str
    retry_count: int
    next_attempt_at: float
    last_error: str
    ticket_id: str


@dataclass
class NotificationEntry:
    level: str
    message: str
    created_at: str


class NotificationCenter:
    def __init__(self, limit: int = 20):
        self.limit = limit
        self._items: deque[NotificationEntry] = deque(maxlen=limit)
        self._last_signature = ""
        self._lock = threading.Lock()

    def emit(self, level: str, message: str) -> None:
        signature = f"{level}:{message}"
        with self._lock:
            if signature == self._last_signature:
                return
            self._last_signature = signature
            self._items.appendleft(NotificationEntry(level=level, message=message, created_at=utc_now()))

    def recent(self, limit: int = 6) -> list[NotificationEntry]:
        with self._lock:
            return list(self._items)[:limit]


class LocalQueue:
    def __init__(self, db_path: Path, state_store: LocalStateStore | None = None):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()
        self.state_store = state_store or LocalStateStore(db_path, utc_now)

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        return db

    @contextmanager
    def session(self):
        db = self.connect()
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def _init_schema(self) -> None:
        with self.session() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS desktop_queue (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  file_path TEXT NOT NULL,
                  sha256 TEXT NOT NULL UNIQUE,
                  size INTEGER NOT NULL,
                  modified_time REAL NOT NULL,
                  status TEXT NOT NULL,
                  retry_count INTEGER NOT NULL DEFAULT 0,
                  next_attempt_at REAL NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  last_error TEXT NOT NULL DEFAULT '',
                  ticket_id TEXT NOT NULL DEFAULT ''
                )
                """
            )
            db.execute("CREATE INDEX IF NOT EXISTS idx_desktop_queue_status ON desktop_queue(status,next_attempt_at)")

    def enqueue_file(self, path: Path, stable_seconds: float = 1.5) -> tuple[bool, QueueItem | None]:
        if should_ignore_file(path):
            logging.info("watch.ignored path=%s", path)
            return False, None
        if not wait_until_stable(path, stable_seconds):
            logging.info("queue.skip_unstable path=%s", path)
            return False, None
        stat = path.stat()
        digest = file_sha256(path)
        if self.state_store.should_skip_detection(digest):
            logging.info("state.skip_detection path=%s sha256=%s", path, digest)
            return False, None
        self.state_store.track_new(str(path), digest)
        timestamp = utc_now()
        with self.session() as db:
            existing = db.execute("SELECT * FROM desktop_queue WHERE sha256=?", (digest,)).fetchone()
            if existing:
                if existing["status"] == QUEUE_FAILED:
                    db.execute(
                        """UPDATE desktop_queue
                           SET file_path=?,size=?,modified_time=?,status=?,retry_count=0,next_attempt_at=0,last_error='',updated_at=?
                           WHERE sha256=?""",
                        (str(path), stat.st_size, stat.st_mtime, QUEUE_NEW, timestamp, digest),
                    )
                    refreshed = db.execute("SELECT * FROM desktop_queue WHERE sha256=?", (digest,)).fetchone()
                    logging.info("queue.requeued_failed_duplicate path=%s sha256=%s", path, digest)
                    return False, self._row_to_item(refreshed)
                logging.info("queue.duplicate_hash path=%s sha256=%s", path, digest)
                return False, self._row_to_item(existing)
            db.execute(
                """INSERT INTO desktop_queue(file_path,sha256,size,modified_time,status,retry_count,next_attempt_at,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (str(path), digest, stat.st_size, stat.st_mtime, QUEUE_NEW, 0, 0, timestamp, timestamp),
            )
            item = db.execute("SELECT * FROM desktop_queue WHERE sha256=?", (digest,)).fetchone()
        logging.info("queue.enqueued path=%s sha256=%s size=%s", path, digest, stat.st_size)
        return True, self._row_to_item(item)

    def next_item(self) -> QueueItem | None:
        with self.session() as db:
            row = db.execute(
                """SELECT * FROM desktop_queue
                   WHERE status IN (?,?) AND next_attempt_at<=?
                   ORDER BY created_at LIMIT 1""",
                (QUEUE_NEW, QUEUE_RETRY, time.time()),
            ).fetchone()
            return self._row_to_item(row) if row else None

    def set_status(self, item_id: int, status: str, *, error: str = "", ticket_id: str = "") -> None:
        with self.session() as db:
            db.execute(
                "UPDATE desktop_queue SET status=?,last_error=?,ticket_id=COALESCE(NULLIF(?,''),ticket_id),updated_at=? WHERE id=?",
                (status, error, ticket_id, utc_now(), item_id),
            )
        logging.info("queue.status id=%s status=%s ticket_id=%s error=%s", item_id, status, ticket_id, error[:200])

    def schedule_retry(self, item: QueueItem, error: str, retry_limit: int) -> None:
        next_retry = item.retry_count + 1
        state = self.state_store.increment_retry(item.sha256)
        if next_retry >= retry_limit:
            with self.session() as db:
                db.execute(
                    "UPDATE desktop_queue SET status=?,retry_count=?,last_error=?,updated_at=? WHERE id=?",
                    (QUEUE_FAILED, next_retry, error, utc_now(), item.id),
                )
            if state and state.status != STATUS_FAILED:
                self.state_store.transition(item.sha256, STATUS_FAILED, retry_count=next_retry)
            logging.error("queue.failed id=%s retries=%s error=%s", item.id, next_retry, error[:300])
            return
        delay = backoff_delay(next_retry)
        with self.session() as db:
            db.execute(
                """UPDATE desktop_queue SET status=?,retry_count=?,next_attempt_at=?,last_error=?,updated_at=?
                   WHERE id=?""",
                (QUEUE_RETRY, next_retry, time.time() + delay, error, utc_now(), item.id),
            )
        logging.warning("queue.retry id=%s retry=%s delay=%ss error=%s", item.id, next_retry, delay, error[:300])

    def metrics(self) -> dict[str, int]:
        with self.session() as db:
            rows = db.execute("SELECT status,COUNT(*) count FROM desktop_queue GROUP BY status").fetchall()
        metrics = {status: 0 for status in [QUEUE_NEW, QUEUE_UPLOADING, QUEUE_WAITING_SERVER, QUEUE_SUCCESS, QUEUE_FAILED, QUEUE_RETRY]}
        metrics.update({row["status"]: row["count"] for row in rows})
        metrics["QUEUE_SIZE"] = sum(metrics.values())
        return metrics

    def current_errors(self, limit: int = 5) -> list[dict[str, str]]:
        with self.session() as db:
            rows = db.execute(
                """SELECT file_path,last_error,status,updated_at
                   FROM desktop_queue
                   WHERE status IN (?,?) AND last_error<>''
                   ORDER BY updated_at DESC LIMIT ?""",
                (QUEUE_RETRY, QUEUE_FAILED, limit),
            ).fetchall()
        return [
            {
                "filename": Path(row["file_path"]).name,
                "error": row["last_error"][:200],
                "status": row["status"],
                "time": format_clock(row["updated_at"]),
            }
            for row in rows
        ]

    def recent_errors(self, limit: int = 3) -> list[str]:
        return [f"{row['filename']}: {row['error'][:100]}" for row in self.current_errors(limit)]

    def recent_activity(self, limit: int = 10) -> list[dict[str, str]]:
        with self.session() as db:
            rows = db.execute(
                """SELECT q.file_path,q.status,q.last_error,q.updated_at,s.status state_status,s.detected_at,s.last_attempt
                   FROM desktop_queue q
                   LEFT JOIN desktop_file_states s ON s.sha256=q.sha256
                   ORDER BY q.updated_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        items: list[dict[str, str]] = []
        for row in rows:
            state_status = str(row["state_status"] or "")
            queue_status = str(row["status"] or "")
            last_error = str(row["last_error"] or "")
            status_label = "Completed" if state_status == STATUS_COMPLETED else "Failed" if queue_status == QUEUE_FAILED or state_status == STATUS_FAILED else "Waiting Confirmation" if state_status == STATUS_WAITING_CONFIRMATION else "Active"
            icon = STATUS_ICONS["COMPLETED"] if status_label == "Completed" else STATUS_ICONS["FAILED"] if status_label == "Failed" else STATUS_ICONS["WAITING CONFIRMATION"] if status_label == "Waiting Confirmation" else STATUS_ICONS["ACTIVE"]
            items.append(
                {
                    "filename": Path(row["file_path"]).name,
                    "status": status_label,
                    "icon": icon,
                    "time": format_clock(str(row["updated_at"] or "")),
                    "stage": item_stage(queue_status, state_status),
                    "error": last_error[:120],
                }
            )
        return items

    def dashboard_stats(self) -> dict[str, str | int]:
        today = datetime.now().astimezone().date().isoformat()
        with self.session() as db:
            uploaded_today = db.execute(
                """SELECT COUNT(*) count FROM desktop_file_states
                   WHERE detected_at<>'' AND substr(detected_at,1,10)=?""",
                (today,),
            ).fetchone()["count"]
            waiting_confirmation = db.execute(
                "SELECT COUNT(*) count FROM desktop_file_states WHERE status=?",
                (STATUS_WAITING_CONFIRMATION,),
            ).fetchone()["count"]
            completed = db.execute(
                "SELECT detected_at,last_attempt FROM desktop_file_states WHERE status=?",
                (STATUS_COMPLETED,),
            ).fetchall()
            failed = db.execute(
                "SELECT COUNT(*) count FROM desktop_file_states WHERE status=?",
                (STATUS_FAILED,),
            ).fetchone()["count"]
        durations: list[int] = []
        for row in completed:
            started = parse_timestamp(str(row["detected_at"] or ""))
            finished = parse_timestamp(str(row["last_attempt"] or ""))
            if started and finished:
                durations.append(max(0, int((finished - started).total_seconds())))
        average_seconds = int(sum(durations) / len(durations)) if durations else 0
        if average_seconds:
            hours, remainder = divmod(average_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            avg_label = f"{hours}h {minutes:02d}m" if hours else f"{minutes}m {seconds:02d}s" if minutes else f"{seconds}s"
        else:
            avg_label = "-"
        return {
            "uploaded_today": uploaded_today,
            "waiting_confirmation": waiting_confirmation,
            "completed": len(completed),
            "failed": failed,
            "average_processing_time": avg_label,
        }

    def get_by_sha(self, sha256: str) -> QueueItem | None:
        with self.session() as db:
            row = db.execute(
                "SELECT * FROM desktop_queue WHERE sha256=? ORDER BY updated_at DESC LIMIT 1",
                (sha256,),
            ).fetchone()
        return self._row_to_item(row) if row else None

    def _row_to_item(self, row) -> QueueItem:
        return QueueItem(
            id=row["id"],
            file_path=row["file_path"],
            sha256=row["sha256"],
            size=row["size"],
            modified_time=row["modified_time"],
            status=row["status"],
            retry_count=row["retry_count"],
            next_attempt_at=row["next_attempt_at"],
            last_error=row["last_error"],
            ticket_id=row["ticket_id"],
        )


class DesktopAgentAuthService:
    def __init__(
        self,
        config_path: Path,
        config: dict[str, Any],
        *,
        prompt_fn=input,
        password_prompt_fn=None,
        print_fn=print,
        login_handler=None,
    ):
        self.config_path = config_path
        self.config = config
        self.prompt_fn = prompt_fn
        self.password_prompt_fn = password_prompt_fn or getpass.getpass
        self.print_fn = print_fn
        self.login_handler = login_handler

    @property
    def backend_url(self) -> str:
        return resolve_backend_url(self.config)

    def load_saved_token(self) -> str:
        stored = str(self.config.get("token") or "").strip()
        token = unprotect_saved_token(stored)
        if stored and token and token != stored and self.config.get("token") != protect_saved_token(token):
            self.config["token"] = protect_saved_token(token)
            save_config(self.config_path, self.config)
        elif stored and not token:
            self.clear_token()
            return ""
        self.config["token"] = protect_saved_token(token) if token else ""
        return token

    def save_token(self, token: str) -> str:
        cleaned = str(token or "").strip()
        self.config["token"] = protect_saved_token(cleaned)
        save_config(self.config_path, self.config)
        return cleaned

    def clear_token(self) -> None:
        if self.config.get("token", "") == "" and self.config.get("user_code", "") == "":
            return
        self.config["token"] = ""
        self.config["user_code"] = ""
        save_config(self.config_path, self.config)

    def login(self, username: str, password: str) -> dict[str, Any]:
        try:
            response = requests.post(
                f"{self.backend_url}/api/auth/login",
                json={"code": username, "password": password},
                timeout=30,
            )
        except requests.RequestException as exc:
            raise RuntimeError("Không thể kết nối tới hệ thống. Vui lòng kiểm tra mạng hoặc thử lại sau.") from exc
        if response.status_code == 401:
            raise RuntimeError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if response.status_code != 200:
            raise RuntimeError("Hệ thống đang bận. Vui lòng thử lại sau.")
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Đăng nhập chưa thành công. Máy chủ trả về dữ liệu không hợp lệ.")
        token = str(payload.get("token") or "").strip()
        if not token:
            raise RuntimeError("Đăng nhập chưa thành công. Hệ thống chưa cấp phiên làm việc.")
        user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        self.config["user_code"] = str(user.get("code") or username).strip()
        self.save_token(token)
        return payload

    def logout(self) -> None:
        self.clear_token()

    def authenticated(self) -> bool:
        token = self.load_saved_token()
        if not token:
            return False
        try:
            response = requests.get(
                f"{self.backend_url}/api/dashboard",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
        except requests.RequestException as exc:
            raise RuntimeError("Không thể kiểm tra phiên đăng nhập do hệ thống đang không phản hồi.") from exc
        if response.status_code == 200:
            return True
        if response.status_code == 401:
            self.clear_token()
            return False
        raise RuntimeError("Không thể xác minh phiên đăng nhập lúc này.")

    def prompt_login(self) -> str:
        self.print_fn("EduVault Desktop Agent Login")
        username = str(self.prompt_fn("Username: ")).strip()
        password = str(self.password_prompt_fn("Password: "))
        if not username or not password:
            raise RuntimeError("Username and password are required.")
        self.login(username, password)
        self.print_fn("Login successful.")
        return self.load_saved_token()

    def ensure_authenticated(self) -> str:
        if self.authenticated():
            return self.load_saved_token()
        if self.login_handler is not None:
            token = str(self.login_handler() or "").strip()
        else:
            token = self.prompt_login()
        if not token:
            raise RuntimeError("Chưa có phiên đăng nhập hợp lệ.")
        return token

    def fetch_desktop_agent_config(self) -> dict[str, Any]:
        token = self.ensure_authenticated()
        response = requests.get(
            f"{self.backend_url}/api/desktop-agent/config",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code == 401:
            token = self.ensure_authenticated()
            response = requests.get(
                f"{self.backend_url}/api/desktop-agent/config",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
        if response.status_code != 200:
            raise RuntimeError("Không tải được cấu hình Desktop Agent từ hệ thống.")
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Cấu hình Desktop Agent nhận từ hệ thống không hợp lệ.")
        return payload

    def sync_remote_watch_folders(self, cli_watch_folders: list[str] | None = None) -> list[str]:
        payload = self.fetch_desktop_agent_config()
        backend_url = str(payload.get("backend_url") or "").strip().rstrip("/")
        if backend_url:
            profiles = self.config.get("backend_profiles")
            if not isinstance(profiles, dict):
                profiles = {}
            existing_deploy = _clean_backend_url(profiles.get("deploy"))
            current_active = str(self.config.get("active_backend") or "").strip()
            current_resolved = _clean_backend_url(resolve_backend_url(self.config))
            should_ignore_local_payload = (
                _is_local_backend_url(backend_url)
                and current_active == "deploy"
                and existing_deploy
                and not _is_local_backend_url(existing_deploy)
                and current_resolved
                and not _is_local_backend_url(current_resolved)
            )
            if not should_ignore_local_payload:
                matched_profile = _find_backend_profile_name(profiles, backend_url)
                target_profile = matched_profile or ("local" if _is_local_backend_url(backend_url) else "deploy")
                profiles[target_profile] = backend_url
                self.config["backend_profiles"] = profiles
                if (
                    not str(self.config.get("active_backend") or "").strip()
                    or _is_local_backend_url(resolve_backend_url(self.config)) and not _is_local_backend_url(backend_url)
                ):
                    self.config["active_backend"] = target_profile
                self.config["backend_url"] = backend_url
                stabilize_backend_configuration(self.config)
        retry_limit = payload.get("retry_limit")
        if isinstance(retry_limit, int) and retry_limit > 0:
            self.config["retry_limit"] = retry_limit
        poll_interval = payload.get("poll_interval")
        if isinstance(poll_interval, int) and poll_interval > 0:
            self.config["poll_interval"] = poll_interval
        remote_poll = payload.get("remote_config_poll_interval")
        if isinstance(remote_poll, int) and remote_poll > 0:
            self.config["remote_config_poll_interval"] = remote_poll
        remote_folders = payload.get("watch_folders")
        if not isinstance(remote_folders, list):
            remote_folders = default_watch_folders()
        if not remote_folders:
            remote_folders = default_watch_folders()
        merged = normalize_watch_folders({"watch_folder": "", "watch_folders": remote_folders}, cli_watch_folders)
        apply_watch_folders(self.config, merged, remote_loaded=True)
        save_config(self.config_path, self.config)
        return merged


class AgentWorker:
    def __init__(
        self,
        queue: LocalQueue,
        config: dict[str, Any],
        auth_service: DesktopAgentAuthService | None = None,
        notifications: NotificationCenter | None = None,
    ):
        self.queue = queue
        self.config = config
        self.state_store = queue.state_store
        self.auth_service = auth_service or DesktopAgentAuthService(CURRENT_DIR / "config.json", self.config)
        self.notifications = notifications or NotificationCenter()
        self.stop_event = threading.Event()
        self.last_sync = ""
        self.backend_status = "unknown"
        self.repository_status = "Connected"
        self.google_drive_status = "Connected"
        self.last_heartbeat = utc_now()
        self._last_heartbeat_publish = 0.0
        self._runtime_items: dict[str, dict[str, Any]] = {}
        self._ui_lock = threading.Lock()

    @property
    def backend_url(self) -> str:
        return resolve_backend_url(self.config)

    def backend_health(self) -> str:
        try:
            response = requests.get(f"{self.backend_url}/api/health", timeout=5)
            self.backend_status = "online" if response.ok else f"http_{response.status_code}"
        except requests.RequestException as exc:
            self.backend_status = f"offline: {exc.__class__.__name__}"
        status_ok = self.backend_status == "online"
        self.repository_status = "Connected" if status_ok else "Disconnected"
        self.google_drive_status = "Connected" if status_ok else "Disconnected"
        self.last_heartbeat = utc_now()
        return self.backend_status

    def _auth_headers(self) -> dict[str, str]:
        token = self.auth_service.load_saved_token()
        return {"Authorization": f"Bearer {token}"} if token else {}

    def _current_token(self) -> str:
        token = self.auth_service.load_saved_token()
        if token:
            return token
        return self.auth_service.ensure_authenticated()

    def _recover_from_unauthorized(self) -> str:
        logging.warning("auth.session_expired backend_url=%s", self.backend_url)
        self.auth_service.clear_token()
        self.notifications.emit("warning", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        if self.auth_service.login_handler is not None:
            raise RuntimeError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
        return self.auth_service.ensure_authenticated()

    def publish_heartbeat(self, *, force: bool = False) -> None:
        current_time = time.time()
        if not force and current_time - self._last_heartbeat_publish < HEARTBEAT_INTERVAL_SECONDS:
            return
        try:
            token = self.auth_service.load_saved_token()
            if not token:
                return
            watch_folders = self.config.get("watch_folders") or [self.config.get("watch_folder", r"D:\Teaching")]
            status = "online" if self.backend_status == "online" else "offline"
            connection_status = "Connected" if status == "online" else "Offline"
            last_error = ""
            if status != "online":
                last_error = "Không thể kết nối tới máy chủ."
            requests.post(
                f"{self.backend_url}/api/desktop-agent/heartbeat",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "device_id": get_device_id(self.config),
                    "app_version": APP_VERSION,
                    "status": status,
                    "connection_status": connection_status,
                    "watch_folders": watch_folders,
                    "last_sync_at": self.last_sync or None,
                    "last_seen_at": utc_now(),
                    "last_error": last_error,
                },
                timeout=15,
            )
            self._last_heartbeat_publish = current_time
        except requests.RequestException:
            logging.warning("heartbeat.publish_failed", exc_info=True)

    def _set_runtime_item(
        self,
        sha256: str,
        *,
        file_path: str,
        queue_status: str = "",
        state_status: str = "",
        stage: str = "",
        progress: int | None = None,
        ticket_id: str = "",
        error: str = "",
        terminal: bool = False,
    ) -> None:
        with self._ui_lock:
            item = self._runtime_items.get(sha256, {})
            started_at = str(item.get("started_at") or utc_now())
            next_stage = item_stage(queue_status or str(item.get("queue_status") or ""), state_status or str(item.get("state_status") or ""), stage)
            item.update(
                {
                    "sha256": sha256,
                    "file_path": file_path,
                    "filename": Path(file_path).name,
                    "queue_status": queue_status or str(item.get("queue_status") or ""),
                    "state_status": state_status or str(item.get("state_status") or ""),
                    "stage": next_stage,
                    "progress": progress if progress is not None else item_progress(next_stage, failed=terminal),
                    "ticket_id": ticket_id or str(item.get("ticket_id") or ""),
                    "error": error,
                    "updated_at": utc_now(),
                    "started_at": started_at,
                    "terminal": terminal,
                }
            )
            self._runtime_items[sha256] = item

    def _record_stage(
        self,
        item: QueueItem,
        *,
        stage: str = "",
        queue_status: str = "",
        state_status: str = "",
        progress: int | None = None,
        error: str = "",
        terminal: bool = False,
    ) -> None:
        self._set_runtime_item(
            item.sha256,
            file_path=item.file_path,
            queue_status=queue_status or item.status,
            state_status=state_status,
            stage=stage,
            progress=progress,
            ticket_id=item.ticket_id,
            error=error,
            terminal=terminal,
        )

    def file_snapshots(self, limit: int = 10) -> list[dict[str, Any]]:
        with self.queue.session() as db:
            rows = db.execute(
                """SELECT q.*,s.status state_status,s.detected_at,s.last_attempt
                   FROM desktop_queue q
                   LEFT JOIN desktop_file_states s ON s.sha256=q.sha256
                   ORDER BY q.updated_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        snapshots: list[dict[str, Any]] = []
        with self._ui_lock:
            runtime = dict(self._runtime_items)
        for row in rows:
            runtime_item = runtime.get(row["sha256"], {})
            queue_status = str(row["status"] or "")
            state_status = str(row["state_status"] or "")
            failed = queue_status == QUEUE_FAILED or state_status == STATUS_FAILED
            stage = item_stage(queue_status, state_status, str(runtime_item.get("stage") or ""))
            progress = int(runtime_item.get("progress") or item_progress(stage, failed=failed))
            started_at = str(runtime_item.get("started_at") or row["detected_at"] or row["created_at"] or "")
            updated_at = str(runtime_item.get("updated_at") or row["updated_at"] or "")
            snapshots.append(
                {
                    "filename": Path(row["file_path"]).name,
                    "status": "Failed" if failed else "Waiting Confirmation" if stage == "Waiting Confirmation" else "Completed" if stage == "Completed" else stage,
                    "stage": stage,
                    "progress": progress,
                    "elapsed": format_elapsed(started_at, updated_at if failed or stage == "Completed" else None),
                    "pipeline": pipeline_for_stage(stage, failed=failed),
                    "error": str(row["last_error"] or runtime_item.get("error") or ""),
                    "updated_at": format_clock(updated_at),
                    "ticket_id": str(row["ticket_id"] or runtime_item.get("ticket_id") or ""),
                }
            )
        return snapshots

    def _fetch_upload_task_detail(self, task_id: str) -> dict[str, Any]:
        url = f"{self.backend_url}/api/ingestion/desktop/{task_id}"
        token = self._current_token()
        response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if response.status_code == 401:
            token = self._recover_from_unauthorized()
            response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:500]}")
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Invalid upload task payload from backend")
        return payload

    def _map_upload_task_to_local_state(self, payload: dict[str, Any]) -> str:
        task_status = str(payload.get("status") or "").strip().lower()
        if task_status == "failed":
            return STATUS_FAILED
        if task_status == "completed":
            return STATUS_COMPLETED
        if task_status == "pending_confirmation":
            return STATUS_WAITING_CONFIRMATION
        if task_status in {"processing", "saving_metadata"}:
            return STATUS_CONFIRMED
        if task_status in {"analyzing"}:
            return STATUS_PROCESSING
        if task_status in {"uploading", "uploaded"}:
            return STATUS_UPLOADED
        return STATUS_WAITING_CONFIRMATION

    def sync_active_states(self) -> None:
        active_states = self.state_store.list_by_status(ACTIVE_POLLING_STATUSES)
        for state in active_states:
            item = self.queue.get_by_sha(state.sha256)
            if not item or not item.ticket_id:
                continue
            try:
                payload = self._fetch_upload_task_detail(item.ticket_id)
                next_status = self._map_upload_task_to_local_state(payload)
                task_status = str(payload.get("status") or "").strip().lower()
                if next_status in {STATUS_COMPLETED, STATUS_FAILED}:
                    self.queue.set_status(item.id, QUEUE_SUCCESS if next_status == STATUS_COMPLETED else QUEUE_FAILED)
                self.state_store.transition(state.sha256, next_status, last_attempt=utc_now())
                display_stage = STATE_TO_STAGE.get(next_status, "Waiting")
                if task_status in {"processing", "saving_metadata"}:
                    display_stage = "Confirmed"
                progress = item_progress(display_stage, failed=next_status == STATUS_FAILED)
                self._set_runtime_item(
                    state.sha256,
                    file_path=item.file_path,
                    queue_status=QUEUE_SUCCESS if next_status == STATUS_COMPLETED else QUEUE_FAILED if next_status == STATUS_FAILED else item.status,
                    state_status=next_status,
                    stage=display_stage,
                    progress=progress,
                    ticket_id=item.ticket_id,
                    error="" if next_status != STATUS_FAILED else str(payload.get("error") or payload.get("detail") or "Processing failed"),
                    terminal=next_status in {STATUS_COMPLETED, STATUS_FAILED},
                )
                if next_status == STATUS_WAITING_CONFIRMATION:
                    self.notifications.emit("warning", f"Waiting confirmation: {Path(item.file_path).name}")
                elif next_status == STATUS_CONFIRMED:
                    self.notifications.emit("info", f"Confirmed for processing: {Path(item.file_path).name}")
                elif next_status == STATUS_PROCESSING:
                    self.notifications.emit("info", f"Repository update started: {Path(item.file_path).name}")
                elif next_status == STATUS_EMBEDDING:
                    self.notifications.emit("info", f"Embedding in progress: {Path(item.file_path).name}")
                elif next_status == STATUS_REPLICA:
                    self.notifications.emit("info", f"Google Drive sync in progress: {Path(item.file_path).name}")
                    self.google_drive_status = "Syncing"
                elif next_status == STATUS_COMPLETED:
                    self.google_drive_status = "Connected"
                    self.notifications.emit("success", f"Completed: {Path(item.file_path).name}")
                elif next_status == STATUS_FAILED:
                    self.repository_status = "Attention"
                    self.notifications.emit("error", f"Failed: {Path(item.file_path).name}")
                self.last_sync = utc_now()
            except (requests.RequestException, RuntimeError, ValueError) as exc:
                error_text = str(exc)
                # Legacy agents stored classification ticket ids ("ticket-*") instead of
                # upload task ids ("upload-*"). When pointing to the repaired v3 backend,
                # polling those stale ids always returns 404. Mark them failed once so
                # the agent stops retrying forever and can resume cleanly with new files.
                if "HTTP 404" in error_text and str(item.ticket_id).startswith("ticket-"):
                    self.queue.set_status(item.id, QUEUE_FAILED, error="Legacy desktop ticket no longer exists on this backend")
                    self.state_store.transition(state.sha256, STATUS_FAILED, last_attempt=utc_now())
                    self._set_runtime_item(
                        state.sha256,
                        file_path=item.file_path,
                        queue_status=QUEUE_FAILED,
                        state_status=STATUS_FAILED,
                        stage="Waiting",
                        progress=item_progress("Waiting", failed=True),
                        ticket_id=item.ticket_id,
                        error="Legacy desktop ticket no longer exists on this backend",
                        terminal=True,
                    )
                    logging.warning("state.sync_legacy_ticket_reset ticket_id=%s sha256=%s", item.ticket_id, state.sha256)
                    self.notifications.emit("warning", f"Legacy desktop task reset: {Path(item.file_path).name}")
                    continue
                # Upload tasks may legitimately disappear from the queue after users
                # confirm, delete, or the backend is reset. Stop polling forever once
                # the server says the upload task no longer exists.
                if "HTTP 404" in error_text and str(item.ticket_id).startswith("upload-"):
                    self.queue.set_status(item.id, QUEUE_SUCCESS)
                    self.state_store.transition(state.sha256, STATUS_SYNCED, last_attempt=utc_now())
                    self._set_runtime_item(
                        state.sha256,
                        file_path=item.file_path,
                        queue_status=QUEUE_SUCCESS,
                        state_status=STATUS_SYNCED,
                        stage="Completed",
                        progress=item_progress("Completed"),
                        ticket_id=item.ticket_id,
                        error="",
                        terminal=True,
                    )
                    logging.info("state.sync_upload_missing ticket_id=%s sha256=%s", item.ticket_id, state.sha256)
                    self.notifications.emit("info", f"Upload queue item already closed on server: {Path(item.file_path).name}")
                    continue
                logging.warning("state.sync_failed ticket_id=%s sha256=%s error=%s", item.ticket_id, state.sha256, str(exc)[:300])
                self.notifications.emit("error", f"Sync failed: {Path(item.file_path).name}")

    def upload_file_chunked(
        self,
        token: str,
        path: Path,
        *,
        mime_type: str,
        source_sha256: str,
        sync_metadata: dict[str, Any],
    ) -> dict[str, Any]:
        chunk_size = max(256 * 1024, int(self.config.get("chunk_size_bytes") or 5 * 1024 * 1024))
        metadata = {
            "filename": path.name,
            "mime_type": mime_type,
            "total_bytes": path.stat().st_size,
            "title": path.stem[:200] or path.name[:200],
            "topic": str(sync_metadata.get("course_hint") or sync_metadata.get("doc_type_hint") or "Desktop Agent Upload")[:120],
            "doc_type": str(sync_metadata.get("doc_type_hint") or "Tài liệu khác")[:80],
            "visibility": "public" if str(sync_metadata.get("visibility_hint") or "").strip().lower() == "public" else "private",
            "folder_path": str(sync_metadata.get("folder_hint") or "").strip() or None,
            "source_path": str(path),
            "source_type": "desktop_agent",
            "device_id": get_device_id(self.config),
            "source_sha256": source_sha256,
            "observed_at": utc_now(),
        }
        init_url = f"{self.backend_url}/api/ingestion/desktop/init"
        init_response = requests.post(init_url, headers={"Authorization": f"Bearer {token}"}, json=metadata, timeout=60)
        if init_response.status_code == 401:
            token = self._recover_from_unauthorized()
            init_response = requests.post(init_url, headers={"Authorization": f"Bearer {token}"}, json=metadata, timeout=60)
        if init_response.status_code not in {200, 201}:
            raise RuntimeError(f"HTTP {init_response.status_code}: {init_response.text[:500]}")
        task = init_response.json()
        if not isinstance(task, dict) or not task.get("id"):
            raise ValueError("Invalid upload init payload from backend")

        task_id = str(task["id"])
        uploaded_bytes = int(task.get("uploaded_bytes") or 0)
        file_url = f"{self.backend_url}/api/ingestion/desktop/{task_id}/file"

        with path.open("rb") as handle:
            handle.seek(uploaded_bytes)
            while uploaded_bytes < metadata["total_bytes"]:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                response = requests.post(
                    file_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Upload-Offset": str(uploaded_bytes),
                        "Content-Type": "application/octet-stream",
                    },
                    data=chunk,
                    timeout=120,
                )
                if response.status_code == 401:
                    token = self._recover_from_unauthorized()
                    handle.seek(uploaded_bytes)
                    response = requests.post(
                        file_url,
                        headers={
                            "Authorization": f"Bearer {token}",
                            "X-Upload-Offset": str(uploaded_bytes),
                            "Content-Type": "application/octet-stream",
                        },
                        data=chunk,
                        timeout=120,
                    )
                if response.status_code == 409:
                    task = self._fetch_upload_task_detail(task_id)
                    uploaded_bytes = int(task.get("uploaded_bytes") or 0)
                    handle.seek(uploaded_bytes)
                    continue
                if response.status_code not in {200, 201}:
                    raise RuntimeError(f"HTTP {response.status_code}: {response.text[:500]}")
                task = response.json()
                if not isinstance(task, dict):
                    raise ValueError("Invalid upload chunk payload from backend")
                uploaded_bytes = int(task.get("uploaded_bytes") or 0)

        analyze_url = f"{self.backend_url}/api/ingestion/desktop/{task_id}/analyze"
        analyze_response = requests.post(analyze_url, headers={"Authorization": f"Bearer {token}"}, timeout=120)
        if analyze_response.status_code == 401:
            token = self._recover_from_unauthorized()
            analyze_response = requests.post(analyze_url, headers={"Authorization": f"Bearer {token}"}, timeout=120)
        if analyze_response.status_code not in {200, 202}:
            raise RuntimeError(f"HTTP {analyze_response.status_code}: {analyze_response.text[:500]}")
        payload = analyze_response.json()
        if not isinstance(payload, dict):
            raise ValueError("Invalid analyze payload from backend")
        return payload

    def upload_item(self, item: QueueItem) -> None:
        attempt_time = utc_now()
        try:
            self._record_stage(item, stage="Analyzing", progress=item_progress("Analyzing"))
            token = self._current_token()
        except RuntimeError as exc:
            self.queue.schedule_retry(item, str(exc), int(self.config["retry_limit"]))
            self._record_stage(item, stage="Waiting", progress=item_progress("Waiting"), error=str(exc), terminal=True)
            self.notifications.emit("error", f"Upload failed: {Path(item.file_path).name}")
            return
        path = Path(item.file_path)
        if not path.exists():
            self.queue.schedule_retry(item, "File no longer exists on disk", int(self.config["retry_limit"]))
            self._record_stage(item, stage="Waiting", progress=item_progress("Waiting"), error="File no longer exists on disk", terminal=True)
            return
        current_hash = file_sha256(path)
        if current_hash != item.sha256:
            self.queue.schedule_retry(item, "File content changed after enqueue; enqueue the new hash separately", int(self.config["retry_limit"]))
            self._record_stage(item, stage="Waiting", progress=item_progress("Waiting"), error="File content changed after enqueue; enqueue the new hash separately", terminal=True)
            return

        self.queue.set_status(item.id, QUEUE_UPLOADING)
        self._record_stage(item, queue_status=QUEUE_UPLOADING, stage="Uploading", progress=item_progress("Uploading"))
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        sync_metadata = build_sync_metadata(path, self.config)
        try:
            payload = self.upload_file_chunked(
                token,
                path,
                mime_type=mime_type,
                source_sha256=item.sha256,
                sync_metadata=sync_metadata,
            )
            self._record_stage(item, queue_status=QUEUE_WAITING_SERVER, stage="AI Metadata", progress=item_progress("AI Metadata"))
            self._record_stage(item, queue_status=QUEUE_WAITING_SERVER, stage="Repository Analysis", progress=item_progress("Repository Analysis"))
            ticket_id = str(payload.get("id") or "")
            self.queue.set_status(item.id, QUEUE_SUCCESS, ticket_id=ticket_id)
            self.state_store.transition(item.sha256, STATUS_DETECTED, detected_at=attempt_time, last_attempt=attempt_time)
            if str(payload.get("status") or "").strip().lower() == "pending_confirmation":
                self.state_store.transition(item.sha256, STATUS_WAITING_CONFIRMATION, last_attempt=attempt_time)
                self._set_runtime_item(
                    item.sha256,
                    file_path=item.file_path,
                    queue_status=QUEUE_SUCCESS,
                    state_status=STATUS_WAITING_CONFIRMATION,
                    stage="Waiting Confirmation",
                    progress=item_progress("Waiting Confirmation"),
                    ticket_id=ticket_id,
                )
                self.notifications.emit("success", f"Upload task created: {path.name}")
                self.notifications.emit("warning", f"Waiting confirmation: {path.name}")
            else:
                self._set_runtime_item(
                    item.sha256,
                    file_path=item.file_path,
                    queue_status=QUEUE_SUCCESS,
                    state_status=STATUS_DETECTED,
                    stage="Confirmed",
                    progress=item_progress("Confirmed"),
                    ticket_id=ticket_id,
                )
            self.last_sync = utc_now()
            self.repository_status = "Connected"
            logging.info("upload.success id=%s path=%s ticket_id=%s", item.id, path, ticket_id)
        except (OSError, requests.RequestException, RuntimeError, ValueError) as exc:
            self.queue.schedule_retry(item, str(exc), int(self.config["retry_limit"]))
            self._record_stage(item, stage="Waiting", progress=item_progress("Waiting"), error=str(exc), terminal=True)
            self.notifications.emit("error", f"Upload failed: {path.name}")

    def run_once(self) -> None:
        item = self.queue.next_item()
        if item:
            self.upload_item(item)
        self.sync_active_states()
        self.backend_health()
        self.publish_heartbeat()
        self.last_heartbeat = utc_now()

    def run_loop(self) -> None:
        interval = float(self.config["poll_interval"])
        while not self.stop_event.is_set():
            self.run_once()
            self.stop_event.wait(interval)


class InboxHandler(FileSystemEventHandler):
    def __init__(self, queue: LocalQueue, stable_seconds: float, on_detect=None):
        self.queue = queue
        self.stable_seconds = stable_seconds
        self.on_detect = on_detect

    def on_created(self, event):
        if not event.is_directory:
            logging.info("watch.new_file path=%s", event.src_path)
            created, item = self.queue.enqueue_file(Path(event.src_path), self.stable_seconds)
            if self.on_detect and item and (created or item.status == QUEUE_NEW):
                self.on_detect(Path(item.file_path).name)


def scan_existing_files(queue: LocalQueue, watch_folders: list[Path], stable_seconds: float, on_detect=None) -> None:
    for watch_folder in watch_folders:
        for path in watch_folder.iterdir():
            if path.is_file():
                created, item = queue.enqueue_file(path, stable_seconds)
                if on_detect and item and created:
                    on_detect(path.name)


class WatchFolderManager:
    def __init__(self, queue: LocalQueue, config: dict[str, Any], notifications: NotificationCenter | None = None):
        self.queue = queue
        self.config = config
        self.notifications = notifications or NotificationCenter()
        self.stable_seconds = float(config["stable_seconds"])
        self.watch_folders: list[Path] = []
        self._observer = None

    def apply(self, watch_folder_values: list[str]) -> None:
        next_folders = [Path(item) for item in watch_folder_values]
        current = [str(path).lower() for path in self.watch_folders]
        incoming = [str(path).lower() for path in next_folders]
        changed = current != incoming
        self.watch_folders = next_folders
        if not changed and self._observer is not None:
            return

        self.stop()
        for watch_folder in self.watch_folders:
            watch_folder.mkdir(parents=True, exist_ok=True)
            logging.info("watch.folder path=%s", watch_folder)
            self.notifications.emit("info", f"Watching {watch_folder}")

        scan_existing_files(
            self.queue,
            self.watch_folders,
            self.stable_seconds,
            on_detect=lambda name: self.notifications.emit("info", f"{name} detected"),
        )

        if Observer is None or not self.watch_folders:
            if Observer is None:
                logging.warning("watchdog_not_installed polling_queue_only=true")
            return

        observer = Observer()
        handler = InboxHandler(
            self.queue,
            self.stable_seconds,
            on_detect=lambda name: self.notifications.emit("info", f"{name} detected"),
        )
        for watch_folder in self.watch_folders:
            observer.schedule(handler, str(watch_folder), recursive=False)
        observer.start()
        self._observer = observer

    def stop(self) -> None:
        if self._observer is None:
            return
        self._observer.stop()
        self._observer.join()
        self._observer = None


class LocalControlAPI:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def host(self) -> str:
        return str(self.config.get("local_control_host") or "127.0.0.1").strip() or "127.0.0.1"

    @property
    def port(self) -> int:
        try:
            return int(self.config.get("local_control_port") or 8765)
        except (TypeError, ValueError):
            return 8765

    def start(self) -> None:
        api = self

        class Handler(BaseHTTPRequestHandler):
            def _set_headers(self, status: HTTPStatus, *, content_type: str = "application/json") -> None:
                self.send_response(status.value)
                self.send_header("Content-Type", content_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()

            def _read_json(self) -> dict[str, Any]:
                try:
                    length = int(self.headers.get("Content-Length", "0") or 0)
                except ValueError:
                    length = 0
                if length <= 0:
                    return {}
                raw = self.rfile.read(length)
                if not raw:
                    return {}
                try:
                    payload = json.loads(raw.decode("utf-8"))
                except Exception:
                    return {}
                return payload if isinstance(payload, dict) else {}

            def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
                self._set_headers(status)
                self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

            def do_OPTIONS(self) -> None:
                self._set_headers(HTTPStatus.NO_CONTENT, content_type="text/plain")

            def do_GET(self) -> None:
                if self.path != "/health":
                    self._write_json(HTTPStatus.NOT_FOUND, {"detail": "Not Found"})
                    return
                self._write_json(
                    HTTPStatus.OK,
                    {
                        "status": "ok",
                        "watch_folders": list(api.config.get("watch_folders") or []),
                        "user_code": str(api.config.get("user_code") or ""),
                    },
                )

            def do_POST(self) -> None:
                if self.path != "/pick-folder":
                    self._write_json(HTTPStatus.NOT_FOUND, {"detail": "Not Found"})
                    return
                payload = self._read_json()
                initial_path = sanitize_dialog_initial_path(payload.get("initial_path") or "")
                title = sanitize_dialog_title(payload.get("title") or "Select watch folder")
                try:
                    folder_path = pick_folder_dialog(initial_path, title=title)
                except RuntimeError as exc:
                    self._write_json(HTTPStatus.SERVICE_UNAVAILABLE, {"detail": str(exc)})
                    return
                if not folder_path:
                    self._write_json(HTTPStatus.OK, {"cancelled": True, "folder_path": "", "folder_label": ""})
                    return
                self._write_json(
                    HTTPStatus.OK,
                    {
                        "cancelled": False,
                        "folder_path": folder_path,
                        "folder_label": suggest_folder_label(folder_path),
                    },
                )

            def log_message(self, format: str, *args: Any) -> None:
                logging.info("local_control.%s", format % args)

        self._server = ThreadingHTTPServer((self.host, self.port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        logging.info("local_control.start host=%s port=%s", self.host, self.port)

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None


def render_dashboard(config: dict[str, Any], queue: LocalQueue, worker: AgentWorker) -> None:
    metrics = queue.metrics()
    stats = queue.dashboard_stats()
    current_errors = queue.current_errors()
    activity = queue.recent_activity(limit=10)
    files = worker.file_snapshots(limit=5)
    notifications = worker.notifications.recent(limit=6)
    watch_folders = config.get("watch_folders") or [config.get("watch_folder", "")]
    status_dot = "● Connected" if worker.backend_status == "online" else "● Reconnecting"
    health_backend = "green" if worker.backend_status == "online" else worker.backend_status
    lines = [
        "EduVault Desktop Agent",
        "=" * 72,
        f"Status       {status_dot}",
        f"User         {config.get('user_code') or '-'}",
        f"Watch Folder {', '.join(watch_folders)}",
        f"Repository   {worker.repository_status}",
        f"Google Drive {worker.google_drive_status}",
        f"Queue        {metrics['QUEUE_SIZE']} files",
        "",
        "Live Pipeline",
        "-" * 72,
    ]
    for item in files:
        lines.extend(
            [
                f"{item['filename']}",
                f"  {progress_bar(int(item['progress']))} {item['progress']}%  {item['stage']}  elapsed {item['elapsed']}",
                f"  {item['pipeline']}",
            ]
        )
        if item["error"]:
            lines.append(f"  Error: {item['error'][:140]}")
    if not files:
        lines.append("No files in queue.")
    lines.extend(["", "Recent Activity", "-" * 72])
    for row in activity:
        lines.append(f"{row['icon']} {row['filename']}  {row['status']}  {row['time']}")
    if not activity:
        lines.append("-")
    lines.extend(
        [
            "",
            "Health",
            "-" * 72,
            f"Backend       {health_backend}",
            "Desktop Agent green",
            f"Repository    {worker.repository_status}",
            f"Google Drive  {worker.google_drive_status}",
            f"Heartbeat     {format_clock(worker.last_heartbeat)}",
            "",
            "Current Errors",
            "-" * 72,
        ]
    )
    if current_errors:
        for row in current_errors:
            lines.append(f"{row['time']}  {row['filename']}  {row['error'][:120]}")
    else:
        lines.append("None")
    lines.extend(
        [
            "",
            "Notifications / History",
            "-" * 72,
        ]
    )
    if notifications:
        for entry in notifications:
            lines.append(f"{format_clock(entry.created_at)}  {entry.message}")
    else:
        lines.append("No new notifications.")
    lines.extend(
        [
            "",
            "Statistics",
            "-" * 72,
            f"Total uploaded today    {stats['uploaded_today']}",
            f"Waiting confirmation   {stats['waiting_confirmation']}",
            f"Completed              {stats['completed']}",
            f"Failed                 {stats['failed']}",
            f"Average processing     {stats['average_processing_time']}",
        ]
    )
    sys.stdout.write("\033[2J\033[H" + "\n".join(lines) + "\n")
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="EduVault Desktop Agent")
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--watch-folder", action="append", default=[])
    parser.add_argument("--logout", action="store_true")
    args = parser.parse_args()

    base_dir = app_base_dir()
    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = base_dir / config_path
    config = load_config(config_path)
    auth_service = DesktopAgentAuthService(config_path, config)
    if args.logout:
        auth_service.logout()
        print("Desktop Agent session cleared.")
        return
    auth_service.ensure_authenticated()
    notifications = NotificationCenter()
    if config.get("user_code"):
        notifications.emit("success", f"Login successful: {config['user_code']}")
    try:
        watch_folder_values = auth_service.sync_remote_watch_folders(args.watch_folder)
        notifications.emit("info", "Desktop sync folders loaded from EduVault.")
    except RuntimeError as exc:
        logging.warning("desktop_sync.config_fetch_failed error=%s", str(exc)[:300])
        watch_folder_values = normalize_watch_folders(config, args.watch_folder)
    if not watch_folder_values and not bool(config.get("remote_watch_config_loaded")):
        watch_folder_values = [r"D:\Teaching"]
    apply_watch_folders(config, watch_folder_values, remote_loaded=bool(config.get("remote_watch_config_loaded")))
    save_config(config_path, config)

    setup_logging(base_dir / str(config["log_file"]))
    queue_db = Path(config["queue_db"])
    if not queue_db.is_absolute():
        queue_db = base_dir / queue_db
    queue = LocalQueue(queue_db)
    worker = AgentWorker(queue, config, auth_service=auth_service, notifications=notifications)
    watch_manager = WatchFolderManager(queue, config, notifications=notifications)
    watch_manager.apply(watch_folder_values)
    local_control = LocalControlAPI(config)
    local_control.start()
    logging.info(
        "agent.start watch_folders=%s active_backend=%s backend_url=%s",
        ",".join(watch_folder_values),
        config.get("active_backend", ""),
        resolve_backend_url(config),
    )

    worker_thread = threading.Thread(target=worker.run_loop, daemon=True)
    worker_thread.start()
    last_remote_refresh = time.time()

    try:
        while True:
            refresh_interval = max(15.0, float(config.get("remote_config_poll_interval") or 60))
            if time.time() - last_remote_refresh >= refresh_interval:
                try:
                    refreshed = auth_service.sync_remote_watch_folders(args.watch_folder)
                    if not refreshed and not bool(config.get("remote_watch_config_loaded")):
                        refreshed = [r"D:\Teaching"]
                    if refreshed != [str(path) for path in watch_manager.watch_folders]:
                        watch_manager.apply(refreshed)
                        logging.info("desktop_sync.watch_folders_updated count=%s", len(refreshed))
                        notifications.emit("info", "Desktop sync folders updated from EduVault.")
                except RuntimeError as exc:
                    logging.warning("desktop_sync.refresh_failed error=%s", str(exc)[:300])
                last_remote_refresh = time.time()
            worker.backend_health()
            render_dashboard(config, queue, worker)
            time.sleep(1.0)
    except KeyboardInterrupt:
        logging.info("agent.stop")
        worker.stop_event.set()
        local_control.stop()
        watch_manager.stop()
        worker_thread.join(timeout=5)


if __name__ == "__main__":
    main()
