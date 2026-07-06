from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException

from .database import DATA_DIR, now
from .services import audit, emit_outbox, validate_folder_access

INGESTION_SOURCE_TYPES = {"web", "desktop_agent", "cloud_sync", "api_import"}


def _normalized_source_type(value: str | None) -> str:
    source_type = (value or "web").strip().lower()
    if source_type not in INGESTION_SOURCE_TYPES:
        raise HTTPException(422, "Nguon ingestion khong hop le.")
    return source_type


def normalize_upload_metadata(metadata: dict) -> dict:
    normalized = dict(metadata)
    normalized["source_type"] = _normalized_source_type(normalized.get("source_type"))
    normalized["source_path"] = (normalized.get("source_path") or "").strip() or None
    normalized["device_id"] = (normalized.get("device_id") or "").strip() or None
    normalized["source_sha256"] = (normalized.get("source_sha256") or "").strip() or None
    normalized["observed_at"] = (normalized.get("observed_at") or "").strip() or None
    return normalized


def upload_task_public(task) -> dict:
    item = dict(task)
    item["metadata"] = normalize_upload_metadata(json.loads(item["metadata"]))
    item.pop("temp_path", None)
    return item


def list_upload_tasks(db, user: dict, *, limit: int = 20) -> list[dict]:
    tasks = db.execute(
        "SELECT * FROM upload_tasks WHERE user_code=? ORDER BY created_at DESC LIMIT ?",
        (user["code"], limit),
    ).fetchall()
    return [upload_task_public(task) for task in tasks]


def get_upload_task_row(db, task_id: str, user_code: str):
    task = db.execute("SELECT * FROM upload_tasks WHERE id=? AND user_code=?", (task_id, user_code)).fetchone()
    if not task:
        raise HTTPException(404, "Khong tim thay tac vu tai len.")
    return task


def get_upload_task_public(db, task_id: str, user: dict) -> dict:
    return upload_task_public(get_upload_task_row(db, task_id, user["code"]))


def create_upload_task(db, user: dict, payload: dict, *, max_upload_bytes: int) -> dict:
    if payload["total_bytes"] > max_upload_bytes:
        raise HTTPException(413, f"File vuot qua gioi han tai len {max_upload_bytes // 1024 // 1024} MB.")
    if payload.get("existing_document") is not None:
        document = payload["existing_document"]
        if document["owner_code"] != user["code"]:
            raise HTTPException(403, "Ban khong co quyen cap nhat tai lieu nay.")
        try:
            validate_folder_access(db, user, payload.get("folder_node_id") or document.get("folder_node_id"))
        except PermissionError as exc:
            raise HTTPException(403, str(exc))
    elif payload.get("folder_node_id"):
        try:
            validate_folder_access(db, user, payload["folder_node_id"])
        except PermissionError as exc:
            raise HTTPException(403, str(exc))

    task_id = f"upload-{secrets.token_hex(8)}"
    upload_dir = DATA_DIR / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    temp_path = upload_dir / f"{task_id}.part"
    temp_path.write_bytes(b"")
    timestamp = now()
    metadata = normalize_upload_metadata(payload["metadata"])
    
    # Bắt đầu đoạn kiểm tra Idempotency cho Desktop Agent / Sync
    source_path = metadata.get("source_path")
    source_sha256 = metadata.get("source_sha256")
    if source_path and source_sha256:
        existing = db.execute(
            """SELECT * FROM upload_tasks 
               WHERE user_code=? 
               AND status IN ('uploading', 'pending_confirmation')
               AND json_extract(metadata, '$.source_path') = ? 
               AND json_extract(metadata, '$.source_sha256') = ?""",
            (user["code"], source_path, source_sha256)
        ).fetchone()
        if existing:
            return upload_task_public(existing)
            
    db.execute(
        """INSERT INTO upload_tasks(id,user_code,filename,mime_type,total_bytes,uploaded_bytes,status,metadata,temp_path,document_id,error,created_at,updated_at)
           VALUES(?,?,?,?,?,0,'uploading',?,?,NULL,NULL,?,?)""",
        (
            task_id,
            user["code"],
            payload["filename"],
            payload["mime_type"],
            payload["total_bytes"],
            json.dumps(metadata, ensure_ascii=False),
            str(temp_path),
            timestamp,
            timestamp,
        ),
    )
    audit(db, user["code"], "upload.started", "upload_task", task_id, {
        "filename": payload["filename"],
        "size": payload["total_bytes"],
        "source_type": metadata["source_type"],
    })
    emit_outbox(db, "ingestion.job_created", task_id, {
        "user_code": user["code"],
        "filename": payload["filename"],
        "mime_type": payload["mime_type"],
        "total_bytes": payload["total_bytes"],
        "source_type": metadata["source_type"],
        "source_path": metadata.get("source_path"),
        "device_id": metadata.get("device_id"),
        "source_sha256": metadata.get("source_sha256"),
    })
    return upload_task_public(db.execute("SELECT * FROM upload_tasks WHERE id=?", (task_id,)).fetchone())


def append_upload_chunk(db, task_id: str, user: dict, chunk: bytes, offset: int) -> dict:
    if not chunk:
        raise HTTPException(400, "Chunk tai len dang trong.")
    task = get_upload_task_row(db, task_id, user["code"])
    if task["status"] not in {"uploading", "failed"}:
        raise HTTPException(409, "Tac vu khong con nhan du lieu tai len.")
    if offset != task["uploaded_bytes"]:
        raise HTTPException(409, f"Offset khong hop le. May chu dang co {task['uploaded_bytes']} byte.")
    uploaded_bytes = offset + len(chunk)
    if uploaded_bytes > task["total_bytes"]:
        raise HTTPException(413, "Du lieu tai len vuot qua dung luong da khai bao.")
    path = Path(task["temp_path"])
    with path.open("r+b") as output:
        output.seek(offset)
        output.write(chunk)
    status = "uploaded" if uploaded_bytes == task["total_bytes"] else "uploading"
    db.execute(
        "UPDATE upload_tasks SET uploaded_bytes=?,status=?,error=NULL,updated_at=? WHERE id=?",
        (uploaded_bytes, status, now(), task_id),
    )
    if status == "uploaded":
        emit_outbox(db, "ingestion.file_uploaded", task_id, {
            "user_code": user["code"],
            "uploaded_bytes": uploaded_bytes,
        })
    return upload_task_public(db.execute("SELECT * FROM upload_tasks WHERE id=?", (task_id,)).fetchone())


def delete_upload_task(db, task_id: str, user: dict) -> tuple[dict, Path]:
    task = get_upload_task_row(db, task_id, user["code"])
    if task["status"] in {"processing", "saving_metadata"}:
        raise HTTPException(409, "Khong the xoa tac vu dang xu ly.")
    temp_path = Path(task["temp_path"])
    db.execute("DELETE FROM document_classification_tickets WHERE upload_task_id=?", (task_id,))
    db.execute("DELETE FROM upload_tasks WHERE id=?", (task_id,))
    action = "upload.removed" if task["document_id"] else "upload.cancelled"
    audit(db, user["code"], action, "upload_task", task_id, {
        "filename": task["filename"],
        "status": task["status"],
    })
    emit_outbox(db, "ingestion.job_deleted", task_id, {
        "user_code": user["code"],
        "status": task["status"],
    })
    return {"status": "deleted" if task["document_id"] else "cancelled", "id": task_id}, temp_path


def force_source_type(metadata: dict, source_type: str) -> dict:
    next_metadata = dict(metadata)
    next_metadata["source_type"] = source_type
    return normalize_upload_metadata(next_metadata)
