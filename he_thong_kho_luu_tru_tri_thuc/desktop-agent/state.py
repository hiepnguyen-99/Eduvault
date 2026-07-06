from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path


STATUS_NEW = "NEW"
STATUS_DETECTED = "DETECTED"
STATUS_WAITING_CONFIRMATION = "WAITING_CONFIRMATION"
STATUS_CONFIRMED = "CONFIRMED"
STATUS_PROCESSING = "PROCESSING"
STATUS_EMBEDDING = "EMBEDDING"
STATUS_REPLICA = "REPLICA"
STATUS_COMPLETED = "COMPLETED"
STATUS_UPLOADED = "UPLOADED"
STATUS_SYNCED = "SYNCED"
STATUS_FAILED = "FAILED"

SKIP_DETECTION_STATUSES = {
    STATUS_DETECTED,
    STATUS_WAITING_CONFIRMATION,
    STATUS_CONFIRMED,
    STATUS_PROCESSING,
    STATUS_EMBEDDING,
    STATUS_REPLICA,
    STATUS_COMPLETED,
    STATUS_UPLOADED,
    STATUS_SYNCED,
}

ACTIVE_POLLING_STATUSES = {
    STATUS_WAITING_CONFIRMATION,
    STATUS_CONFIRMED,
    STATUS_PROCESSING,
    STATUS_EMBEDDING,
    STATUS_REPLICA,
}


@dataclass
class FileState:
    file_path: str
    sha256: str
    detected_at: str
    status: str
    last_attempt: str
    retry_count: int


class LocalStateStore:
    def __init__(self, db_path: Path, now_fn):
        self.db_path = db_path
        self.now_fn = now_fn
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

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
                CREATE TABLE IF NOT EXISTS desktop_file_states (
                  sha256 TEXT PRIMARY KEY,
                  file_path TEXT NOT NULL,
                  detected_at TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL,
                  last_attempt TEXT NOT NULL DEFAULT '',
                  retry_count INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                """
            )

    def get(self, sha256: str) -> FileState | None:
        with self.session() as db:
            row = db.execute("SELECT * FROM desktop_file_states WHERE sha256=?", (sha256,)).fetchone()
        return self._row_to_state(row) if row else None

    def should_skip_detection(self, sha256: str) -> bool:
        state = self.get(sha256)
        return bool(state and state.status in SKIP_DETECTION_STATUSES)

    def list_by_status(self, statuses: set[str]) -> list[FileState]:
        if not statuses:
            return []
        placeholders = ",".join("?" for _ in statuses)
        with self.session() as db:
            rows = db.execute(
                f"SELECT * FROM desktop_file_states WHERE status IN ({placeholders}) ORDER BY updated_at",
                tuple(statuses),
            ).fetchall()
        return [self._row_to_state(row) for row in rows]

    def track_new(self, file_path: str, sha256: str) -> FileState:
        current = self.get(sha256)
        timestamp = self.now_fn()
        with self.session() as db:
            if current:
                db.execute(
                    """UPDATE desktop_file_states
                       SET file_path=?, status=?, last_attempt='', retry_count=0, updated_at=?
                       WHERE sha256=?""",
                    (file_path, STATUS_NEW, timestamp, sha256),
                )
            else:
                db.execute(
                    """INSERT INTO desktop_file_states(
                       sha256,file_path,detected_at,status,last_attempt,retry_count,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?)""",
                    (sha256, file_path, "", STATUS_NEW, "", 0, timestamp, timestamp),
                )
        logging.info("state.transition sha256=%s status=%s previous=%s", sha256, STATUS_NEW, current.status if current else "")
        return self.get(sha256)  # type: ignore[return-value]

    def transition(self, sha256: str, status: str, *, detected_at: str | None = None, last_attempt: str | None = None, retry_count: int | None = None) -> FileState | None:
        current = self.get(sha256)
        if not current:
            return None
        next_detected_at = current.detected_at
        if detected_at is not None:
            next_detected_at = detected_at
        elif status == STATUS_DETECTED and not current.detected_at:
            next_detected_at = self.now_fn()
        next_last_attempt = current.last_attempt if last_attempt is None else last_attempt
        next_retry_count = current.retry_count if retry_count is None else retry_count
        timestamp = self.now_fn()
        with self.session() as db:
            db.execute(
                """UPDATE desktop_file_states
                   SET detected_at=?, status=?, last_attempt=?, retry_count=?, updated_at=?
                   WHERE sha256=?""",
                (next_detected_at, status, next_last_attempt, next_retry_count, timestamp, sha256),
            )
        if current.status != status:
            logging.info("state.transition sha256=%s status=%s previous=%s", sha256, status, current.status)
        return self.get(sha256)

    def increment_retry(self, sha256: str) -> FileState | None:
        current = self.get(sha256)
        if not current:
            return None
        return self.transition(
            sha256,
            STATUS_FAILED,
            last_attempt=self.now_fn(),
            retry_count=current.retry_count + 1,
        )

    def _row_to_state(self, row) -> FileState:
        return FileState(
            file_path=row["file_path"],
            sha256=row["sha256"],
            detected_at=row["detected_at"],
            status=row["status"],
            last_attempt=row["last_attempt"],
            retry_count=row["retry_count"],
        )
