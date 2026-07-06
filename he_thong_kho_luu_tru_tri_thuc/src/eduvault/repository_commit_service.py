from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

from .classification_service import classification_ticket_public, create_classification_ticket
from .database import now
from .ingestion_service import normalize_upload_metadata
from .services import (
    DOCUMENT_TYPES,
    active_policy,
    audit,
    create_document,
    emit_outbox,
    enqueue_processing_jobs,
    folder_assignment_from_metadata,
    quick_preview_text,
    run_document_processing_jobs,
    save_file_asset,
    sync_document,
    update_document,
    validate_folder_access,
)
from .cloud import sync_user_document


def _get_document(db, document_id: str) -> dict:
    document = db.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
    if not document:
        raise HTTPException(404, "Khong tim thay tai lieu.")
    item = dict(document)
    if item.get("deleted_at"):
        raise HTTPException(404, "Tai lieu dang nam trong thung rac.")
    return item


def confirm_upload_task(db, task, payload: dict, user: dict) -> dict:
    if task["uploaded_bytes"] != task["total_bytes"]:
        raise HTTPException(409, "File chua duoc tai len day du.")
    ticket = db.execute(
        "SELECT * FROM document_classification_tickets WHERE upload_task_id=? AND user_code=? ORDER BY created_at DESC LIMIT 1",
        (task["id"], user["code"]),
    ).fetchone()
    if not ticket:
        created = create_classification_ticket(db, task, dict(user))
        ticket = db.execute("SELECT * FROM document_classification_tickets WHERE id=?", (created["id"],)).fetchone()
    if ticket["status"] == "CONFIRMED" and ticket["document_id"]:
        return {
            "ticket": classification_ticket_public(ticket),
            "document": dict(db.execute("SELECT * FROM documents WHERE id=?", (ticket["document_id"],)).fetchone()),
            "asset": None,
        }

    metadata = normalize_upload_metadata(json.loads(task["metadata"]))
    final_specialization_id = payload.get("specialization_id")
    final_course_id = payload.get("course_id")
    final_document_type = payload["document_type"]
    selected_node = validate_folder_access(db, user, payload.get("folder_node_id")) if payload.get("folder_node_id") else None
    if selected_node and selected_node["type"] in {"faculty", "specialization", "course"}:
        raise HTTPException(400, "Document must be saved inside a document-type folder.")
    if selected_node and selected_node["type"] == "standard_folder":
        final_document_type = selected_node["name"]
        final_course_id = selected_node["parent_id"]
    selected_document_folder = bool(selected_node and selected_node["type"] in {"standard_folder", "folder", "document_type_folder"})
    if final_document_type not in DOCUMENT_TYPES and not selected_document_folder:
        raise HTTPException(422, "Loai tai lieu khong hop le.")
    selected_course = (
        db.execute("SELECT * FROM folder_nodes WHERE id=? AND type='course' AND status='active'", (final_course_id,)).fetchone()
        if final_course_id
        else None
    )
    if selected_course:
        spec_node = db.execute(
            "SELECT * FROM folder_nodes WHERE id=? AND type='specialization' AND status='active'",
            (selected_course["parent_id"],),
        ).fetchone()
        specialization = db.execute("SELECT * FROM specializations WHERE folder_node_id=?", (spec_node["id"],)).fetchone() if spec_node else None
        final_specialization_id = specialization["id"] if specialization else final_specialization_id
    assignment = folder_assignment_from_metadata(db, final_specialization_id, final_course_id, final_document_type)
    if not assignment["folder_node_id"] and payload.get("folder_path"):
        assignment["folder_path"] = payload["folder_path"]
    if final_course_id and not assignment["folder_node_id"] and not assignment["folder_path"]:
        raise HTTPException(400, "Hay chon hoc phan hop le de luu tai lieu vao thu muc loai tai lieu.")
    if active_policy(db) and not assignment["folder_node_id"] and not assignment["folder_path"]:
        raise HTTPException(400, "Hay chon hoc phan hop le de luu tai lieu vao thu muc loai tai lieu.")
    destination_node = (
        db.execute("SELECT * FROM folder_nodes WHERE id=? AND status='active'", (assignment["folder_node_id"],)).fetchone()
        if assignment["folder_node_id"]
        else None
    )
    if destination_node and destination_node["type"] in {"faculty", "specialization", "course"}:
        raise HTTPException(400, "Document must be saved inside a document-type folder.")

    title = metadata.get("title") or Path(task["filename"]).stem
    topic = selected_course["name"] if selected_course else metadata.get("topic") or final_document_type
    raw = Path(task["temp_path"]).read_bytes()
    preview = quick_preview_text(task["filename"], task["mime_type"], raw)
    document_payload = {
        "title": title,
        "topic": topic,
        "doc_type": final_document_type,
        "document_type": final_document_type,
        "visibility": payload["visibility"],
        "folder_path": assignment["folder_path"],
        "folder_node_id": assignment["folder_node_id"],
        "specialization_id": final_specialization_id,
        "course_id": final_course_id,
        "content": f"File: {task['filename']}\nStatus: SAVED. AI processing is waiting in background.\n\n{preview[:4000]}",
    }
    existing_id = metadata.get("existing_document_id")
    if existing_id:
        document = update_document(db, dict(user), _get_document(db, existing_id), document_payload, defer_processing=True)
        version_no = document["current_version"]
    else:
        document = create_document(db, dict(user), document_payload, defer_processing=True)
        version_no = 1
    asset = save_file_asset(db, document["id"], version_no, task["filename"], task["mime_type"], raw, defer_processing=True)
    enqueue_processing_jobs(db, document["id"])
    db.execute(
        "UPDATE documents SET status='SAVED',specialization_id=?,course_id=?,document_type=?,folder_node_id=?,folder_path=?,updated_at=? WHERE id=?",
        (final_specialization_id, final_course_id, final_document_type, assignment["folder_node_id"], assignment["folder_path"], now(), document["id"]),
    )
    db.execute(
        "UPDATE document_classification_tickets SET selected_specialization_id=?,selected_course_id=?,selected_document_type=?,selected_visibility=?,status='CONFIRMED',document_id=?,updated_at=? WHERE id=?",
        (final_specialization_id, final_course_id, final_document_type, payload["visibility"], document["id"], now(), ticket["id"]),
    )
    db.execute(
        "UPDATE upload_tasks SET status='processing',document_id=?,error=NULL,updated_at=? WHERE id=?",
        (document["id"], now(), task["id"]),
    )
    audit(db, user["code"], "upload.confirmed", "document", document["id"], {
        "ticket_id": ticket["id"],
        "asset_id": asset["id"],
        "source_type": metadata["source_type"],
    })
    emit_outbox(db, "draft.confirmed", ticket["id"], {
        "upload_task_id": task["id"],
        "document_id": document["id"],
        "source_type": metadata["source_type"],
        "final_destination_source": payload.get("final_destination_source"),
        "folder_node_id": assignment["folder_node_id"],
        "folder_path": assignment["folder_path"],
    })
    document = dict(db.execute("SELECT * FROM documents WHERE id=?", (document["id"],)).fetchone())
    ticket_public = classification_ticket_public(db.execute("SELECT * FROM document_classification_tickets WHERE id=?", (ticket["id"],)).fetchone())
    return {"ticket": ticket_public, "document": document, "asset": asset}


def process_document_background_task(db, document_id: str, task_id: str | None = None) -> None:
    document = run_document_processing_jobs(db, document_id)
    if task_id:
        db.execute(
            "UPDATE upload_tasks SET status='completed',document_id=?,error=NULL,updated_at=? WHERE id=?",
            (document_id, now(), task_id),
        )
    version = db.execute(
        "SELECT storage_path FROM versions WHERE document_id=? AND version_no=?",
        (document_id, document["current_version"]),
    ).fetchone()
    if version:
        sync_document(db, document_id, Path(version["storage_path"]))
    asset = db.execute(
        "SELECT original_path FROM file_assets WHERE document_id=? AND version_no=? ORDER BY created_at DESC LIMIT 1",
        (document_id, document["current_version"]),
    ).fetchone()
    if asset:
        sync_user_document(db, document["owner_code"], document_id, Path(asset["original_path"]))
    emit_outbox(db, "document.processing_completed", document_id, {
        "task_id": task_id,
        "owner_code": document["owner_code"],
        "current_version": document["current_version"],
    })
