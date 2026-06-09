from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "mvp"
DB_PATH = DATA_DIR / "eduvault.db"
STORAGE_DIR = DATA_DIR / "storage"
BACKUP_DIR = DATA_DIR / "backups"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


@contextmanager
def connection():
    db = connect()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def transaction():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  department TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_code TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(user_code) REFERENCES users(code)
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, doc_type TEXT NOT NULL, topic TEXT NOT NULL,
  owner_code TEXT NOT NULL, visibility TEXT NOT NULL, current_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_code) REFERENCES users(code)
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  storage_path TEXT NOT NULL, content_hash TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(document_id, version_no),
  FOREIGN KEY(document_id) REFERENCES documents(id), FOREIGN KEY(created_by) REFERENCES users(code)
);
CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  original_name TEXT NOT NULL, original_path TEXT NOT NULL, mime_type TEXT NOT NULL,
  size INTEGER NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  content TEXT NOT NULL, vector TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, requester_code TEXT NOT NULL,
  owner_code TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(document_id, requester_code, status)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_code TEXT NOT NULL, action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS backup_logs (
  id TEXT PRIMARY KEY, storage_path TEXT NOT NULL, status TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, required_doc_types TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY, course_code TEXT NOT NULL, from_code TEXT NOT NULL,
  to_code TEXT NOT NULL, deadline TEXT NOT NULL, status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  FOREIGN KEY(course_code) REFERENCES courses(code)
);
CREATE TABLE IF NOT EXISTS external_storages (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
  location TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT, last_status TEXT NOT NULL DEFAULT 'never'
);
CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY, storage_id TEXT NOT NULL, document_id TEXT,
  status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(storage_id) REFERENCES external_storages(id)
);
CREATE TABLE IF NOT EXISTS cloud_connections (
  user_code TEXT NOT NULL, provider TEXT NOT NULL, account_email TEXT NOT NULL,
  access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'connected', last_sync_at TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_code, provider),
  FOREIGN KEY(user_code) REFERENCES users(code)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, user_code TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(user_code) REFERENCES users(code)
);
CREATE TABLE IF NOT EXISTS cloud_sync_logs (
  id TEXT PRIMARY KEY, user_code TEXT NOT NULL, provider TEXT NOT NULL, document_id TEXT NOT NULL,
  status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(user_code) REFERENCES users(code), FOREIGN KEY(document_id) REFERENCES documents(id)
);
"""


SEED_USERS = [
    ("GV001", "Nguyễn Minh Anh", "lecturer", "Công nghệ thông tin"),
    ("GVNEW", "Lê Thu Hà", "new_lecturer", "Công nghệ thông tin"),
    ("TBM01", "Trần Hoàng Nam", "head", "Công nghệ thông tin"),
    ("ADMIN", "Phạm Quỳnh Chi", "admin", "Phòng hệ thống"),
]

SEED_DOCS = [
    ("de-cuong-ai", "Đề cương học phần Trí tuệ nhân tạo", "Đề cương", "Trí tuệ nhân tạo", "GV001", "public",
     "Học phần Trí tuệ nhân tạo gồm tìm kiếm, biểu diễn tri thức, học máy và hệ chuyên gia. Đánh giá quá trình 40%, thi cuối kỳ 60%."),
    ("rag-guide", "Hướng dẫn xây dựng hệ thống RAG", "Học liệu", "Trí tuệ nhân tạo", "TBM01", "public",
     "RAG gồm ingest, chunking, embedding, retrieval, kiểm tra quyền, sinh câu trả lời và trích dẫn nguồn."),
    ("exam-process", "Quy trình xây dựng đề thi cuối kỳ", "Quy trình", "Khảo thí", "TBM01", "private",
     "Quy trình gồm lập ma trận, biên soạn câu hỏi, phản biện chéo, phê duyệt và bàn giao bảo mật."),
]


def init_database() -> None:
    with transaction() as db:
        db.executescript(SCHEMA)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(documents)").fetchall()}
        if "folder_path" not in columns:
            db.execute("ALTER TABLE documents ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''")
        if "deleted_at" not in columns:
            db.execute("ALTER TABLE documents ADD COLUMN deleted_at TEXT")
        for code, name, role, department in SEED_USERS:
            db.execute(
                "INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?, 1)",
                (code, name, role, department, hash_secret(code)),
            )
        db.execute(
            "INSERT OR IGNORE INTO policies VALUES ('backup_321', ?, ?)",
            (json.dumps({"copies": 3, "media": 2, "offsite": 1}), now()),
        )
        db.execute(
            "INSERT OR IGNORE INTO policies VALUES ('storage_rules', ?, ?)",
            (json.dumps({"naming": "{department}/{topic}/{doc_type}/{visibility}", "retention_years": 10}, ensure_ascii=False), now()),
        )
        current_storage_policy = db.execute("SELECT value FROM policies WHERE key='storage_rules'").fetchone()
        if current_storage_policy and "{title}" in current_storage_policy["value"]:
            db.execute(
                "UPDATE policies SET value=?,updated_at=? WHERE key='storage_rules'",
                (json.dumps({"naming": "{department}/{topic}/{doc_type}/{visibility}", "retention_years": 10}, ensure_ascii=False), now()),
            )
        db.execute(
            "INSERT OR IGNORE INTO policies VALUES ('permission_rules', ?, ?)",
            (json.dumps({"private_requires_owner_approval": True}), now()),
        )
        db.execute(
            "INSERT OR IGNORE INTO policies VALUES ('ai_prompts', ?, ?)",
            (json.dumps({
                "metadata_instructions": "Phân loại tài liệu học thuật tiếng Việt. Chỉ trả JSON hợp lệ, không markdown.",
                "answer_instructions": "Trả lời bằng tiếng Việt, chỉ dựa trên ngữ cảnh. Nêu tên tài liệu nguồn và không tiết lộ dữ liệu ngoài ngữ cảnh."
            }, ensure_ascii=False), now()),
        )
        db.execute(
            "INSERT OR IGNORE INTO courses VALUES ('AI101','Trí tuệ nhân tạo',?)",
            (json.dumps(["Đề cương", "Học liệu", "Ngân hàng câu hỏi"], ensure_ascii=False),),
        )
        db.execute(
            "INSERT OR IGNORE INTO courses VALUES ('PY101','Lập trình Python',?)",
            (json.dumps(["Đề cương", "Học liệu", "Slide"], ensure_ascii=False),),
        )
        for storage_id, name, provider in [
            ("local-primary", "Kho chính EduVault", "local"),
            ("google-drive", "Google Drive", "google_drive"),
            ("onedrive", "OneDrive", "onedrive"),
        ]:
            location = str(DATA_DIR / "external" / storage_id)
            Path(location).mkdir(parents=True, exist_ok=True)
            db.execute(
                "INSERT OR IGNORE INTO external_storages(id,name,provider,location,enabled,last_status) VALUES(?,?,?,?,1,'ready')",
                (storage_id, name, provider, location),
            )
        for slug, title, doc_type, topic, owner, visibility, content in SEED_DOCS:
            doc_id = f"doc-{slug}"
            exists = db.execute("SELECT 1 FROM documents WHERE id=?", (doc_id,)).fetchone()
            if exists:
                continue
            doc_dir = STORAGE_DIR / doc_id
            doc_dir.mkdir(parents=True, exist_ok=True)
            path = doc_dir / "v1.txt"
            path.write_text(content, encoding="utf-8")
            digest = hash_secret(content)
            timestamp = now()
            db.execute(
                "INSERT INTO documents(id,title,doc_type,topic,owner_code,visibility,current_version,content_hash,created_at,updated_at,folder_path) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '')",
                (doc_id, title, doc_type, topic, owner, visibility, digest, timestamp, timestamp),
            )
            db.execute(
                "INSERT INTO versions VALUES (?, ?, 1, ?, ?, ?, ?)",
                (f"ver-{slug}-1", doc_id, str(path), digest, owner, timestamp),
            )


def rows(items) -> list[dict]:
    return [dict(item) for item in items]
