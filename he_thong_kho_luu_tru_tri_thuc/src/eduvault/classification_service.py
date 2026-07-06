from __future__ import annotations

import json
import secrets
from pathlib import Path

from .database import now
from .ingestion_service import normalize_upload_metadata
from .services import DOCUMENT_TYPES, active_course_suggestions, audit, emit_outbox, quick_preview_text


def classification_ticket_public(ticket) -> dict:
    item = dict(ticket)
    item["suggestions"] = json.loads(item["suggestions"])
    return item


def create_classification_ticket(db, task, user: dict) -> dict:
    existing = db.execute(
        "SELECT * FROM document_classification_tickets WHERE upload_task_id=? ORDER BY created_at DESC LIMIT 1",
        (task["id"],),
    ).fetchone()
    if existing and existing["status"] in {"PENDING_CONFIRMATION", "CONFIRMED"}:
        return classification_ticket_public(existing)
    raw = Path(task["temp_path"]).read_bytes()
    preview = quick_preview_text(task["filename"], task["mime_type"], raw)
    metadata = normalize_upload_metadata(json.loads(task["metadata"]))
    suggestions = active_course_suggestions(db, task["filename"], preview)
    top = suggestions[0] if suggestions else {}
    text = f"{task['filename']} {preview}".casefold()
    suggested_type = metadata.get("doc_type") if metadata.get("doc_type") in DOCUMENT_TYPES else DOCUMENT_TYPES[-1]
    for candidate in DOCUMENT_TYPES:
        if candidate.casefold() in text or candidate.replace(" ", "_").casefold() in text:
            suggested_type = candidate
            break
    confidence = float(top.get("confidence") or 0)
    reasoning = (
        f"AI doc nhanh ten file va 1-2 trang dau. Goi y hoc phan '{top.get('course', '')}' vi noi dung/ten file co do khop {round(confidence * 100)}%."
        if top
        else "AI doc nhanh ten file va 1-2 trang dau nhung chua tim thay hoc phan khop du ro trong Master Tree."
    )
    ticket_id = f"ticket-{secrets.token_hex(8)}"
    timestamp = now()
    db.execute(
        """INSERT INTO document_classification_tickets(
           id,upload_task_id,user_code,filename,suggested_specialization_id,suggested_specialization,
           suggested_course_id,suggested_course,suggested_document_type,suggested_visibility,confidence,
           reasoning,suggestions,selected_specialization_id,selected_course_id,selected_document_type,
           selected_visibility,status,document_id,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING_CONFIRMATION', NULL, ?, ?)""",
        (
            ticket_id,
            task["id"],
            user["code"],
            task["filename"],
            top.get("specialization_id"),
            top.get("specialization"),
            top.get("course_id"),
            top.get("course"),
            suggested_type,
            metadata.get("visibility", "private"),
            confidence,
            reasoning,
            json.dumps(suggestions, ensure_ascii=False),
            top.get("specialization_id"),
            top.get("course_id"),
            suggested_type,
            metadata.get("visibility", "private"),
            timestamp,
            timestamp,
        ),
    )
    ticket = classification_ticket_public(
        db.execute("SELECT * FROM document_classification_tickets WHERE id=?", (ticket_id,)).fetchone()
    )
    task_metadata = {**metadata, "classification_ticket": ticket}
    db.execute(
        "UPDATE upload_tasks SET status='pending_confirmation',metadata=?,error=NULL,updated_at=? WHERE id=?",
        (json.dumps(task_metadata, ensure_ascii=False), timestamp, task["id"]),
    )
    audit(db, user["code"], "upload.classification_ticket", "upload_task", task["id"], {
        "ticket_id": ticket_id,
        "confidence": confidence,
        "source_type": metadata["source_type"],
    })
    emit_outbox(db, "draft.created", ticket_id, {
        "upload_task_id": task["id"],
        "user_code": user["code"],
        "source_type": metadata["source_type"],
        "confidence": confidence,
        "suggested_course_id": top.get("course_id"),
        "suggested_document_type": suggested_type,
    })
    return ticket


def analyze_upload_task(db, task, user: dict) -> dict:
    if task["uploaded_bytes"] != task["total_bytes"]:
        raise ValueError("File chua duoc tai len day du.")
    if task["status"] in {"completed", "processing"}:
        from .ingestion_service import upload_task_public

        return upload_task_public(task)
    create_classification_ticket(db, task, user)
    from .ingestion_service import upload_task_public

    return upload_task_public(db.execute("SELECT * FROM upload_tasks WHERE id=?", (task["id"],)).fetchone())
