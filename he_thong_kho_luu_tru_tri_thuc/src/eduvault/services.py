from __future__ import annotations

import json
import hashlib
import math
import re
import shutil
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree

from .ai import ai_provider
from .database import BACKUP_DIR, STORAGE_DIR, database_backend, hash_secret, now, restore_database, rows, snapshot_database
from .infrastructure import delete_object, delete_vectors, publish_event, store_object, upsert_vector


DEFAULT_POLICY_TREE = {
    "department": "Khoa CNTT",
    "specializations": [
        {"name": "AI Application", "folders": ["De cuong", "Bai giang", "Lab", "De thi"]},
        {"name": "Machine Learning", "folders": ["De cuong", "Bai giang", "Lab", "De thi"]},
        {"name": "Data Engineering", "folders": ["De cuong", "Bai giang", "ETL", "De thi"]},
    ],
}


def audit(db, actor: str, action: str, resource_type: str, resource_id: str | None, detail: dict | None = None):
    db.execute(
        "INSERT INTO audit_logs(actor_code,action,resource_type,resource_id,detail,created_at) VALUES(?,?,?,?,?,?)",
        (actor, action, resource_type, resource_id, json.dumps(detail or {}, ensure_ascii=False), now()),
    )


def policy_value(db, key: str, fallback: dict) -> dict:
    row = db.execute("SELECT value FROM policies WHERE key=?", (key,)).fetchone()
    return json.loads(row["value"]) if row else fallback


def _try_parse_yaml_like(text: str) -> dict | None:
    department = None
    specializations: list[dict] = []
    current: dict | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        lowered = line.lower()
        if lowered.startswith("department:"):
            department = line.split(":", 1)[1].strip().strip("'\"")
        elif lowered.startswith("- name:") or lowered.startswith("name:"):
            if current:
                specializations.append(current)
            current = {"name": line.split(":", 1)[1].strip().strip("'\""), "folders": []}
        elif lowered.startswith("folders:") and current is not None:
            value = line.split(":", 1)[1].strip()
            current["folders"] = [item.strip().strip("'\"") for item in value.strip("[]").split(",") if item.strip()]
        elif line.startswith("-") and current is not None:
            current.setdefault("folders", []).append(line[1:].strip().strip("'\""))
    if current:
        specializations.append(current)
    if department and specializations:
        return {"department": department, "specializations": specializations}
    return None


def parse_policy_tree(raw_text: str) -> dict:
    text = raw_text.strip()
    if not text:
        return DEFAULT_POLICY_TREE
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = _try_parse_yaml_like(text)
    if not data:
        specs: list[dict] = []
        current_name = ""
        current_folders: list[str] = []
        for raw_line in text.splitlines():
            line = raw_line.strip(" -\t")
            if not line:
                continue
            if ":" in line:
                label, value = line.split(":", 1)
                if label.strip().lower() in {"department", "khoa"}:
                    continue
                if current_name:
                    specs.append({"name": current_name, "folders": current_folders or DEFAULT_POLICY_TREE["specializations"][0]["folders"]})
                current_name = label.strip()
                current_folders = [item.strip() for item in re.split(r",|;", value) if item.strip()]
        if current_name:
            specs.append({"name": current_name, "folders": current_folders or DEFAULT_POLICY_TREE["specializations"][0]["folders"]})
        data = {"department": "Khoa CNTT", "specializations": specs or DEFAULT_POLICY_TREE["specializations"]}
    department = str(data.get("department") or DEFAULT_POLICY_TREE["department"]).strip()
    specializations = []
    for item in data.get("specializations", []):
        name = str(item.get("name") or "").strip()
        folders = [str(folder).strip() for folder in item.get("folders", []) if str(folder).strip()]
        if name:
            specializations.append({"name": name, "folders": folders or DEFAULT_POLICY_TREE["specializations"][0]["folders"]})
    if not specializations:
        specializations = DEFAULT_POLICY_TREE["specializations"]
    return {"department": department, "specializations": specializations}


def tree_node_public(row: dict, children: list[dict] | None = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "parent_id": row.get("parent_id"),
        "type": row["type"],
        "policy_id": row["policy_id"],
        "path": row["path"],
        "status": row.get("status", "active"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "children": children or [],
    }


def build_tree_from_rows(nodes: list[dict], root_name: str | None = None) -> dict:
    by_parent: dict[str | None, list[dict]] = {}
    known_ids = {node["id"] for node in nodes}
    for node in nodes:
        parent_id = node.get("parent_id") if node.get("parent_id") in known_ids else None
        by_parent.setdefault(parent_id, []).append(node)
    for siblings in by_parent.values():
        siblings.sort(key=lambda item: (item["type"] != "department", item["name"].lower()))

    def build(node: dict) -> dict:
        return tree_node_public(node, [build(child) for child in by_parent.get(node["id"], [])])

    roots = [build(node) for node in by_parent.get(None, [])]
    if root_name is not None:
        return {"name": root_name, "children": roots}
    return roots[0] if len(roots) == 1 else {"name": "Master Folder Tree", "children": roots}


def active_policy(db) -> dict | None:
    row = db.execute("SELECT * FROM policy_files WHERE status='active' ORDER BY activated_at DESC LIMIT 1").fetchone()
    return dict(row) if row else None


def create_policy_file(db, user: dict, title: str, filename: str, raw: bytes, mime_type: str) -> dict:
    text = extract_text(filename, mime_type, raw)
    parsed = parse_policy_tree(text)
    policy_id = f"policy-{uuid.uuid4().hex[:12]}"
    policy_dir = STORAGE_DIR / "policies"
    policy_dir.mkdir(parents=True, exist_ok=True)
    safe_name = safe_filename(filename)
    file_path = policy_dir / f"{policy_id}_{safe_name}"
    file_path.write_bytes(raw)
    timestamp = now()
    db.execute(
        "INSERT INTO policy_files(id,title,file_path,status,raw_text,parsed_json,created_by,created_at,activated_at) VALUES(?,?,?,?,?,?,?,?,NULL)",
        (policy_id, title, str(file_path), "draft", text, json.dumps(parsed, ensure_ascii=False), user["code"], timestamp),
    )
    audit(db, user["code"], "policy_file.upload", "policy", policy_id, {"filename": filename})
    return dict(db.execute("SELECT * FROM policy_files WHERE id=?", (policy_id,)).fetchone())


def activate_policy_file(db, user: dict, policy_id: str) -> dict:
    policy = db.execute("SELECT * FROM policy_files WHERE id=?", (policy_id,)).fetchone()
    if not policy:
        raise ValueError("Policy khong ton tai.")
    parsed = json.loads(policy["parsed_json"])
    timestamp = now()
    previous_nodes = rows(db.execute("SELECT * FROM folder_nodes WHERE status='active'").fetchall())
    previous_paths = {node["path"] for node in previous_nodes}
    next_paths: set[str] = set()
    db.execute("UPDATE policy_files SET status='archived' WHERE status='active' AND id<>?", (policy_id,))
    db.execute("UPDATE policy_files SET status='active',activated_at=? WHERE id=?", (timestamp, policy_id))

    department_id = f"node-{uuid.uuid4().hex[:12]}"
    department = parsed["department"]
    next_paths.add(department)
    db.execute(
        "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (department_id, policy_id, department, None, "department", department, "active", timestamp, timestamp),
    )
    for spec in parsed["specializations"]:
        spec_id = f"node-{uuid.uuid4().hex[:12]}"
        spec_path = f"{department}/{spec['name']}"
        next_paths.add(spec_path)
        db.execute(
            "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (spec_id, policy_id, spec["name"], department_id, "specialization", spec_path, "active", timestamp, timestamp),
        )
        specialization_id = f"spec-{uuid.uuid4().hex[:12]}"
        db.execute(
            "INSERT INTO specializations(id,name,description,policy_id,folder_node_id) VALUES(?,?,?,?,?)",
            (specialization_id, spec["name"], "", policy_id, spec_id),
        )
        for folder in spec["folders"]:
            folder_id = f"node-{uuid.uuid4().hex[:12]}"
            folder_path = f"{spec_path}/{folder}"
            next_paths.add(folder_path)
            db.execute(
                "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (folder_id, policy_id, folder, spec_id, "folder", folder_path, "active", timestamp, timestamp),
            )
    deprecated_paths = previous_paths - next_paths
    if deprecated_paths:
        for node in previous_nodes:
            if node["path"] in deprecated_paths:
                db.execute("UPDATE folder_nodes SET status='deprecated',updated_at=? WHERE id=?", (timestamp, node["id"]))
    audit(db, user["code"], "policy_file.activate", "policy", policy_id, {"department": department, "specializations": len(parsed["specializations"])})
    return policy_public(db.execute("SELECT * FROM policy_files WHERE id=?", (policy_id,)).fetchone())


def policy_public(row) -> dict:
    item = dict(row)
    item["parsed_json"] = json.loads(item["parsed_json"])
    return item


def list_policy_files(db) -> list[dict]:
    return [policy_public(row) for row in db.execute("SELECT * FROM policy_files ORDER BY created_at DESC").fetchall()]


def master_tree(db) -> dict:
    policy = active_policy(db)
    if not policy:
        return {"policy": None, "tree": None, "message": "He thong chua co policy active. Vui long lien he Admin."}
    nodes = rows(db.execute("SELECT * FROM folder_nodes WHERE policy_id=? ORDER BY path", (policy["id"],)).fetchall())
    return {"policy": policy_public(policy), "tree": build_tree_from_rows(nodes)}


def active_specializations(db) -> list[dict]:
    policy = active_policy(db)
    if not policy:
        return []
    return rows(db.execute("SELECT * FROM specializations WHERE policy_id=? ORDER BY name", (policy["id"],)).fetchall())


def user_specializations(db, user_code: str) -> list[dict]:
    policy = active_policy(db)
    if not policy:
        return []
    return rows(db.execute(
        """SELECT s.* FROM lecturer_specializations ls
           JOIN specializations s ON s.id=ls.specialization_id
           WHERE ls.user_code=? AND s.policy_id=? ORDER BY s.name""",
        (user_code, policy["id"]),
    ).fetchall())


def set_user_specializations(db, user: dict, specialization_ids: list[str]) -> dict:
    policy = active_policy(db)
    if not policy:
        raise ValueError("He thong chua co policy active. Vui long lien he Admin.")
    allowed = {item["id"] for item in active_specializations(db)}
    requested = set(specialization_ids)
    if not requested.issubset(allowed):
        raise ValueError("Nhom chuyen mon khong thuoc policy active.")
    db.execute(
        "DELETE FROM lecturer_specializations WHERE user_code=? AND specialization_id IN (SELECT id FROM specializations WHERE policy_id=?)",
        (user["code"], policy["id"]),
    )
    for spec_id in sorted(requested):
        db.execute(
            "INSERT OR IGNORE INTO lecturer_specializations(id,user_code,specialization_id,created_at) VALUES(?,?,?,?)",
            (f"ls-{uuid.uuid4().hex[:12]}", user["code"], spec_id, now()),
        )
    audit(db, user["code"], "profile.specializations_update", "user", user["code"], {"count": len(requested)})
    return profile_specializations(db, user["code"])


def profile_specializations(db, user_code: str) -> dict:
    policy = active_policy(db)
    all_specs = active_specializations(db)
    selected = user_specializations(db, user_code)
    return {
        "policy": policy_public(policy) if policy else None,
        "available": all_specs,
        "selected_ids": [item["id"] for item in selected],
        "message": None if policy else "He thong chua co policy active. Vui long lien he Admin.",
    }


def subtree_node_ids(db, root_id: str) -> set[str]:
    pending = [root_id]
    result: set[str] = set()
    while pending:
        node_id = pending.pop()
        if node_id in result:
            continue
        result.add(node_id)
        pending.extend(row["id"] for row in db.execute("SELECT id FROM folder_nodes WHERE parent_id=? AND status='active'", (node_id,)).fetchall())
    return result


def allowed_folder_node_ids(db, user: dict) -> set[str]:
    if user["role"] in {"admin", "head"}:
        policy = active_policy(db)
        if not policy:
            return set()
        return {row["id"] for row in db.execute("SELECT id FROM folder_nodes WHERE policy_id=? AND status='active'", (policy["id"],)).fetchall()}
    allowed: set[str] = set()
    for spec in user_specializations(db, user["code"]):
        allowed.update(subtree_node_ids(db, spec["folder_node_id"]))
    return allowed


def validate_folder_access(db, user: dict, folder_node_id: str | None) -> dict | None:
    if not folder_node_id:
        return None
    node = db.execute("SELECT * FROM folder_nodes WHERE id=? AND status='active'", (folder_node_id,)).fetchone()
    if not node:
        raise PermissionError("Thu muc trong Master Tree khong ton tai hoac da deprecated.")
    if folder_node_id not in allowed_folder_node_ids(db, user):
        raise PermissionError("Ban khong co quyen upload vao nhanh chuyen mon nay.")
    return dict(node)


def get_my_folder_tree(db, user: dict) -> dict:
    policy = active_policy(db)
    if not policy:
        return {
            "policy": None,
            "name": "Kho cua toi",
            "children": [],
            "message": "He thong chua co policy active. Vui long lien he Admin.",
        }
    specs = user_specializations(db, user["code"])
    if user["role"] in {"admin", "head"}:
        nodes = rows(db.execute("SELECT * FROM folder_nodes WHERE policy_id=? AND status='active'", (policy["id"],)).fetchall())
        return {"policy": policy_public(policy), "name": "Kho cua toi", "children": [build_tree_from_rows(nodes)]}
    if not specs:
        return {
            "policy": policy_public(policy),
            "name": "Kho cua toi",
            "children": [],
            "message": "Ban chua chon nhom chuyen mon. Vui long cap nhat ho so de he thong tao cay thu muc phu hop.",
        }
    nodes: list[dict] = []
    for spec in specs:
        ids = subtree_node_ids(db, spec["folder_node_id"])
        if not ids:
            continue
        placeholders = ",".join("?" for _ in ids)
        nodes.extend(rows(db.execute(f"SELECT * FROM folder_nodes WHERE id IN ({placeholders}) AND status='active'", tuple(ids)).fetchall()))
    return {"policy": policy_public(policy), "name": "Kho cua toi", "children": build_tree_from_rows(nodes, "Kho cua toi")["children"]}


def v2_state_for(db, document_id: str) -> dict:
    row = db.execute("SELECT * FROM document_v2_state WHERE document_id=?", (document_id,)).fetchone()
    return dict(row) if row else {}


def set_v2_state(db, document_id: str, **changes) -> dict:
    current = v2_state_for(db, document_id)
    state = {
        "classification": current.get("classification", "private"),
        "lifecycle_status": current.get("lifecycle_status", "published"),
        "scan_status": current.get("scan_status", "clean"),
        "extraction_status": current.get("extraction_status", "completed"),
        "indexing_status": current.get("indexing_status", "completed"),
        "publish_after": current.get("publish_after"),
        **changes,
    }
    db.execute(
        """INSERT INTO document_v2_state(document_id,classification,lifecycle_status,scan_status,extraction_status,indexing_status,publish_after,updated_at)
           VALUES(?,?,?,?,?,?,?,?)
           ON CONFLICT(document_id) DO UPDATE SET classification=excluded.classification,lifecycle_status=excluded.lifecycle_status,
           scan_status=excluded.scan_status,extraction_status=excluded.extraction_status,indexing_status=excluded.indexing_status,
           publish_after=excluded.publish_after,updated_at=excluded.updated_at""",
        (
            document_id, state["classification"], state["lifecycle_status"], state["scan_status"],
            state["extraction_status"], state["indexing_status"], state["publish_after"], now(),
        ),
    )
    return v2_state_for(db, document_id)


def emit_outbox(db, event_type: str, aggregate_id: str, payload: dict) -> dict:
    event = {
        "id": f"evt-{uuid.uuid4().hex[:12]}",
        "event_type": event_type,
        "aggregate_id": aggregate_id,
        "payload": payload,
        "created_at": now(),
    }
    published = publish_event(event)
    db.execute(
        "INSERT INTO outbox_events(id,event_type,aggregate_id,payload,status,attempts,created_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
        (
            event["id"], event_type, aggregate_id, json.dumps(payload, ensure_ascii=False),
            "published" if published else "processed_sync", 1, event["created_at"], now(),
        ),
    )
    return event


def record_object_ref(
    db, document_id: str, version_no: int, kind: str, object_key: str, raw: bytes, content_type: str
) -> dict:
    stored = store_object(object_key, raw, content_type)
    ref_id = f"obj-{uuid.uuid4().hex[:12]}"
    db.execute(
        "INSERT INTO object_refs(id,document_id,version_no,kind,provider,object_uri,object_version,checksum,size,content_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            ref_id, document_id, version_no, kind, stored["provider"], stored["object_uri"],
            stored["object_version"], stored["checksum"], len(raw), content_type, now(),
        ),
    )
    return dict(db.execute("SELECT * FROM object_refs WHERE id=?", (ref_id,)).fetchone())


def can_read(db, user: dict, document: dict) -> bool:
    if document["owner_code"] == user["code"]:
        return True
    if document["visibility"] == "private":
        approved = db.execute(
            "SELECT 1 FROM access_requests WHERE document_id=? AND requester_code=? AND status='approved'",
            (document["id"], user["code"]),
        ).fetchone()
        return bool(approved)
    if document["visibility"] == "public":
        return True
    state = v2_state_for(db, document["id"])
    if state.get("classification") == "confidential" and user["role"] == "head":
        return True
    approved = db.execute(
        "SELECT 1 FROM access_requests WHERE document_id=? AND requester_code=? AND status='approved'",
        (document["id"], user["code"]),
    ).fetchone()
    return bool(approved)


def list_documents(db, user: dict) -> list[dict]:
    docs = rows(db.execute("SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC").fetchall())
    return [doc for doc in docs if can_read(db, user, doc)]


def rag_documents(db, user: dict) -> list[dict]:
    """All documents the user can access, including approved shared docs."""
    docs = rows(db.execute("SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC").fetchall())
    return [doc for doc in docs if can_read(db, user, doc)]


def anonymize_document(document: dict, user: dict) -> dict:
    result = dict(document)
    if result.get("visibility") == "private" and result.get("owner_code") != user["code"]:
        result["owner_code"] = "Ẩn danh"
        result["owner_anonymous"] = True
    else:
        result["owner_anonymous"] = False
    return result


def anonymize_documents(documents: list[dict], user: dict) -> list[dict]:
    return [anonymize_document(document, user) for document in documents]


def list_deleted_documents(db, user: dict) -> list[dict]:
    if user["role"] == "admin":
        return rows(db.execute("SELECT * FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").fetchall())
    return rows(db.execute("SELECT * FROM documents WHERE deleted_at IS NOT NULL AND owner_code=? ORDER BY deleted_at DESC", (user["code"],)).fetchall())


def soft_delete_document(db, user: dict, document: dict) -> dict:
    if document["owner_code"] != user["code"]:
        raise PermissionError("Bạn không có quyền xóa tài liệu này.")
    if document.get("deleted_at"):
        raise ValueError("Tài liệu đã nằm trong thùng rác.")
    timestamp = now()
    db.execute("UPDATE documents SET deleted_at=?,updated_at=? WHERE id=?", (timestamp, timestamp, document["id"]))
    db.execute("DELETE FROM chunks WHERE document_id=?", (document["id"],))
    delete_vectors(document["id"])
    audit(db, user["code"], "document.delete", "document", document["id"])
    return {"id": document["id"], "deleted_at": timestamp, "status": "trashed"}


def restore_deleted_document(db, user: dict, document: dict) -> dict:
    if document["owner_code"] != user["code"]:
        raise PermissionError("Bạn không có quyền khôi phục tài liệu này.")
    if not document.get("deleted_at"):
        raise ValueError("Tài liệu không nằm trong thùng rác.")
    db.execute("UPDATE documents SET deleted_at=NULL,updated_at=? WHERE id=?", (now(), document["id"]))
    restored = dict(db.execute("SELECT * FROM documents WHERE id=?", (document["id"],)).fetchone())
    index_document(db, restored["id"], restored["current_version"], content_for(db, restored))
    audit(db, user["code"], "document.restore", "document", document["id"])
    return restored


def permanently_delete_document(db, user: dict, document: dict) -> dict:
    if user["role"] != "admin":
        raise PermissionError("Chỉ quản trị viên được xóa vĩnh viễn.")
    if not document.get("deleted_at"):
        raise ValueError("Cần chuyển tài liệu vào thùng rác trước.")
    assets = rows(db.execute("SELECT original_path FROM file_assets WHERE document_id=?", (document["id"],)).fetchall())
    versions = rows(db.execute("SELECT storage_path FROM versions WHERE document_id=?", (document["id"],)).fetchall())
    objects = rows(db.execute("SELECT object_uri FROM object_refs WHERE document_id=?", (document["id"],)).fetchall())
    db.execute("DELETE FROM chunks WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM object_refs WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM document_v2_state WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM file_assets WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM versions WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM access_requests WHERE document_id=?", (document["id"],))
    db.execute("UPDATE upload_tasks SET document_id=NULL WHERE document_id=?", (document["id"],))
    db.execute("DELETE FROM documents WHERE id=?", (document["id"],))
    for item in assets + versions:
        path = Path(item.get("original_path") or item.get("storage_path"))
        if path.exists() and path.is_file():
            path.unlink()
    for item in objects:
        delete_object(item["object_uri"])
    delete_vectors(document["id"])
    audit(db, user["code"], "document.purge", "document", document["id"])
    return {"id": document["id"], "status": "deleted_permanently"}


def content_for(db, document: dict) -> str:
    row = db.execute(
        "SELECT storage_path FROM versions WHERE document_id=? AND version_no=?",
        (document["id"], document["current_version"]),
    ).fetchone()
    return Path(row["storage_path"]).read_text(encoding="utf-8") if row else ""


def guess_metadata(filename: str, content: str, instructions: str | None = None) -> dict:
    text = f"{filename} {content}".lower()
    topic = "Khác"
    for candidate, keywords in {
        "Trí tuệ nhân tạo": ["ai", "rag", "embedding", "học máy", "trí tuệ"],
        "Lập trình": ["python", "lập trình", "code"],
        "Khảo thí": ["đề thi", "khảo thí", "chấm thi"],
        "Quy trình nội bộ": ["quy trình", "thủ tục", "biên bản"],
    }.items():
        if any(keyword in text for keyword in keywords):
            topic = candidate
            break
    doc_type = "Tài liệu"
    for candidate in ["Đề cương", "Quy trình", "Biên bản", "Học liệu"]:
        if candidate.lower() in text:
            doc_type = candidate
            break
    title = Path(filename).stem.replace("_", " ").replace("-", " ").strip().title()
    fallback = {
        "title": title or "Tài liệu chưa đặt tên", "topic": topic, "doc_type": doc_type,
        "summary": content[:300].strip(), "keywords": [word for word in re.findall(r"\w+", topic.lower()) if len(word) > 2],
    }
    return ai_provider.metadata(filename, content, fallback, instructions)


def safe_segment(value: str, max_length: int = 30) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", value).strip(" .-") or "Khác"
    if len(cleaned) <= max_length:
        return cleaned
    suffix = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:8]
    return f"{cleaned[:max_length - 9].rstrip(' .-')}-{suffix}"


def safe_folder_path(value: str, max_length: int = 55) -> str:
    segments = [safe_segment(part) for part in value.replace("\\", "/").split("/") if part.strip()]
    result = "/".join(segments)
    while len(result) > max_length and segments:
        longest = max(range(len(segments)), key=lambda index: len(segments[index]))
        segments[longest] = safe_segment(segments[longest], max(12, len(segments[longest]) - 5))
        result = "/".join(segments)
    return result or "Unsorted"


def safe_filename(value: str, max_length: int = 55) -> str:
    source = Path(value).name
    suffix = re.sub(r"[^A-Za-z0-9.]+", "", Path(source).suffix)[:10]
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(source).stem).strip("._-") or "upload"
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:8]
    available = max(8, max_length - len(suffix) - len(digest) - 2)
    return f"{stem[:available]}-{digest}{suffix}"


def suggest_folder(db, user: dict, metadata: dict) -> str:
    row = db.execute("SELECT value FROM policies WHERE key='storage_rules'").fetchone()
    policy = json.loads(row["value"]) if row else {}
    template = policy.get("naming", "{department}/{topic}/{doc_type}/{visibility}")
    values = {**metadata, "department": user["department"], "owner_code": user["code"]}
    result = template
    for key in ("department", "topic", "doc_type", "visibility", "owner_code", "title"):
        result = result.replace(f"{{{key}}}", safe_segment(str(values.get(key, "Khác"))))
    return safe_folder_path(result)


def create_document(db, user: dict, payload: dict, defer_processing: bool = False) -> dict:
    content = payload.get("content", "").strip()
    digest = hash_secret(content)
    duplicate = db.execute("SELECT id,title FROM documents WHERE content_hash=?", (digest,)).fetchone()
    if duplicate:
        raise ValueError(f"Nội dung trùng với tài liệu: {duplicate['title']}")
    doc_id = f"doc-{uuid.uuid4().hex[:12]}"
    timestamp = now()
    path = STORAGE_DIR / doc_id / "v1.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    folder_node = validate_folder_access(db, user, payload.get("folder_node_id"))
    folder_path = safe_folder_path(payload.get("folder_path") or (folder_node["path"] if folder_node else None) or suggest_folder(db, user, payload))
    db.execute(
        "INSERT INTO documents(id,title,doc_type,topic,owner_code,visibility,current_version,content_hash,created_at,updated_at,folder_path,folder_node_id) VALUES(?,?,?,?,?,?,1,?,?,?,?,?)",
        (doc_id, payload["title"], payload["doc_type"], payload["topic"], user["code"], payload["visibility"], digest, timestamp, timestamp, folder_path, payload.get("folder_node_id")),
    )
    db.execute(
        "INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
        (f"ver-{uuid.uuid4().hex[:12]}", doc_id, 1, str(path), digest, user["code"], timestamp),
    )
    classification = "confidential" if "đề thi" in f"{payload['title']} {payload['doc_type']} {payload['topic']}".lower() else payload["visibility"]
    set_v2_state(db, doc_id, classification=classification, indexing_status="processing")
    audit(db, user["code"], "document.create", "document", doc_id, {"title": payload["title"]})
    if not defer_processing:
        record_object_ref(db, doc_id, 1, "extracted_text", f"documents/{doc_id}/versions/1/content.txt", content.encode("utf-8"), "text/plain")
        emit_outbox(db, "document.created", doc_id, {"version_no": 1, "classification": classification})
        index_document(db, doc_id, 1, content)
        sync_document(db, doc_id, path)
    return dict(db.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone())


def save_file_asset(db, document_id: str, version_no: int, filename: str, mime_type: str, raw: bytes, defer_processing: bool = False) -> dict:
    safe_name = safe_filename(filename)
    document = db.execute("SELECT folder_path FROM documents WHERE id=?", (document_id,)).fetchone()
    folder_path = safe_folder_path(document["folder_path"]) if document and document["folder_path"] else "Unsorted"
    folder = Path(*folder_path.split("/"))
    path = STORAGE_DIR / "repository" / folder / document_id / f"v{version_no}_{safe_name}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    asset_id = f"asset-{uuid.uuid4().hex[:12]}"
    db.execute(
        "INSERT INTO file_assets VALUES(?,?,?,?,?,?,?,?)",
        (asset_id, document_id, version_no, filename, str(path), mime_type, len(raw), now()),
    )
    if not defer_processing:
        record_object_ref(
            db, document_id, version_no, "original",
            f"documents/{document_id}/versions/{version_no}/original/{safe_name}", raw, mime_type,
        )
        emit_outbox(db, "document.original_stored", document_id, {"version_no": version_no, "filename": filename})
    return dict(db.execute("SELECT * FROM file_assets WHERE id=?", (asset_id,)).fetchone())


def extract_text(filename: str, mime_type: str, raw: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json", ".xml", ".html", ".log", ".py", ".js", ".ts"} or mime_type.startswith("text/"):
        for encoding in ("utf-8", "utf-8-sig", "cp1258", "latin-1"):
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                continue
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(BytesIO(raw)) as archive:
                root = ElementTree.fromstring(archive.read("word/document.xml"))
            return "\n".join(text.text for text in root.iter() if text.tag.endswith("}t") and text.text)
        except (zipfile.BadZipFile, KeyError, ElementTree.ParseError):
            pass
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(raw))
            extracted = "\n\n".join(page.extract_text() or "" for page in reader.pages).strip()
            if extracted:
                return extracted
        except Exception:
            pass
        try:
            import fitz
            pdf = fitz.open(stream=raw, filetype="pdf")
            images = [page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).tobytes("png") for page in pdf[:10]]
            ocr_text = ai_provider.ocr_images(images).strip()
            if ocr_text:
                return ocr_text
        except Exception:
            pass
        return f"[PDF scan chưa OCR được: {filename}]"
    return f"[File gốc: {filename}] Nội dung chưa được trích xuất. Cần cấu hình parser/OCR cho định dạng {suffix or mime_type}."


def update_document(db, user: dict, document: dict, payload: dict, defer_processing: bool = False) -> dict:
    if document["owner_code"] != user["code"]:
        raise PermissionError("Bạn không có quyền cập nhật tài liệu này.")
    content = payload.get("content", "").strip()
    version = document["current_version"] + 1
    path = STORAGE_DIR / document["id"] / f"v{version}.txt"
    path.write_text(content, encoding="utf-8")
    digest = hash_secret(content)
    db.execute(
        "INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
        (f"ver-{uuid.uuid4().hex[:12]}", document["id"], version, str(path), digest, user["code"], now()),
    )
    folder_node = validate_folder_access(db, user, payload.get("folder_node_id") or document.get("folder_node_id"))
    folder_node_id = payload.get("folder_node_id") if "folder_node_id" in payload else document.get("folder_node_id")
    folder_path = safe_folder_path(payload.get("folder_path") or (folder_node["path"] if folder_node else None) or document.get("folder_path") or suggest_folder(db, user, payload))
    db.execute(
        "UPDATE documents SET title=?,doc_type=?,topic=?,visibility=?,current_version=?,content_hash=?,updated_at=?,folder_path=?,folder_node_id=? WHERE id=?",
        (payload["title"], payload["doc_type"], payload["topic"], payload["visibility"], version, digest, now(), folder_path, folder_node_id, document["id"]),
    )
    classification = "confidential" if "đề thi" in f"{payload['title']} {payload['doc_type']} {payload['topic']}".lower() else payload["visibility"]
    set_v2_state(db, document["id"], classification=classification, indexing_status="processing")
    audit(db, user["code"], "document.update", "document", document["id"], {"version": version})
    if not defer_processing:
        record_object_ref(db, document["id"], version, "extracted_text", f"documents/{document['id']}/versions/{version}/content.txt", content.encode("utf-8"), "text/plain")
        emit_outbox(db, "document.version_created", document["id"], {"version_no": version})
        index_document(db, document["id"], version, content)
        sync_document(db, document["id"], path)
    return dict(db.execute("SELECT * FROM documents WHERE id=?", (document["id"],)).fetchone())


def rollback_document(db, user: dict, document: dict, target: int) -> dict:
    if document["owner_code"] != user["code"]:
        raise PermissionError("Bạn không có quyền rollback tài liệu này.")
    source = db.execute("SELECT storage_path FROM versions WHERE document_id=? AND version_no=?", (document["id"], target)).fetchone()
    if not source:
        raise ValueError("Phiên bản không tồn tại.")
    content = Path(source["storage_path"]).read_text(encoding="utf-8")
    return update_document(db, user, document, {**document, "content": content})


def ask(db, user: dict, question: str) -> dict:
    allowed = {doc["id"]: doc for doc in rag_documents(db, user)}

    # --- vector retrieval: best chunk per document ---
    query_vectors: dict[str, list[float]] = {}
    vec_scores: dict[str, tuple[float, dict, str]] = {}
    for chunk in db.execute("SELECT * FROM chunks").fetchall():
        document = allowed.get(chunk["document_id"])
        if not document:
            continue
        provider = chunk["provider"]
        if provider not in query_vectors:
            query_vectors[provider] = ai_provider.embed(question, force_local=provider == "local")
        similarity = sum(a * b for a, b in zip(query_vectors[provider], json.loads(chunk["vector"])))
        doc_id = document["id"]
        if doc_id not in vec_scores or similarity > vec_scores[doc_id][0]:
            vec_scores[doc_id] = (similarity, document, chunk["content"])

    # --- keyword retrieval ---
    words = {w for w in re.findall(r"\w+", question.lower(), re.UNICODE) if len(w) > 2}
    kw_scores: dict[str, tuple[float, dict, str]] = {}
    if words:
        for document in allowed.values():
            content = content_for(db, document)
            searchable = f"{document['title']} {document['topic']} {document['doc_type']} {content}".lower()
            score = sum(1 for w in words if w in searchable)
            if score:
                kw_scores[document["id"]] = (score, document, content)

    # --- hybrid merge (70% vector + 30% keyword) ---
    max_vec = max((s for s, _, _ in vec_scores.values()), default=1.0) or 1.0
    max_kw = max((s for s, _, _ in kw_scores.values()), default=1.0) or 1.0
    merged: list[tuple[float, dict, str]] = []
    for doc_id in set(vec_scores) | set(kw_scores):
        v_norm = vec_scores[doc_id][0] / max_vec if doc_id in vec_scores else 0.0
        k_norm = kw_scores[doc_id][0] / max_kw if doc_id in kw_scores else 0.0
        hybrid = v_norm * 0.7 + k_norm * 0.3
        source = vec_scores.get(doc_id) or kw_scores[doc_id]
        merged.append((hybrid, source[1], source[2]))
    merged.sort(key=lambda x: x[0], reverse=True)
    matches = merged[:5]

    audit(db, user["code"], "rag.ask", "query", None, {"question": question, "matches": len(matches), "scope": "accessible"})
    if not matches:
        return {"answer": "Không tìm thấy thông tin phù hợp trong phạm vi bạn được phép truy cập.", "citations": []}
    fallback = conversational_fallback(question, matches)
    prompts = policy_value(db, "ai_prompts", {})
    answer = ai_provider.answer(
        question,
        [{"title": doc["title"], "content": content} for _, doc, content in matches],
        fallback,
        prompts.get("answer_instructions"),
    )
    answer = ensure_conversational_format(answer, question)
    return {
        "answer": answer,
        "citations": [{"id": d["id"], "title": d["title"], "topic": d["topic"], "version": d["current_version"], "visibility": d["visibility"]} for _, d, _ in matches],
        "scope": "accessible",
        "pipeline": ["parse", "chunk_overlap", "embed", "vector_store", "permission_filter", "hybrid_retrieve", "answer"],
    }


def conversational_fallback(question: str, matches: list[tuple]) -> str:
    highlights = []
    for _, document, content in matches[:3]:
        sentences = [
            part.strip()
            for part in re.split(r"\n+|(?<=[.!?])\s+", content)
            if part.strip() and not part.strip().startswith("[")
        ]
        detail = sentences[0][:240] if sentences else f"Tài liệu tập trung vào {document['topic']}."
        highlights.append((document["title"], detail))

    lines = "\n".join(f"- **{title}**: {detail}" for title, detail in highlights)
    return f"Dưới đây là thông tin tìm được từ các tài liệu liên quan:\n\n{lines}"


def ensure_conversational_format(answer: str, question: str) -> str:
    # Strip any source citation block the AI might have appended
    cleaned = re.split(
        r"\n#{0,3}\s*(?:📄\s*)?(?:Nguồn tham khảo|Nguồn tài liệu|Tài liệu tham khảo)\s*:?",
        answer.strip(),
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    # Strip legacy template sections if AI still generates them
    for pattern in (
        r"\n###\s*Bạn có thể hỏi tiếp[\s\S]*",
        r"\n###\s*Gợi ý học tập[\s\S]*",
        r"\n###\s*Những phần cần chú ý[\s\S]*(?=\n###|$)",
    ):
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def _split_chunks(content: str, max_len: int = 1000, overlap: int = 200) -> list[str]:
    units = [p.strip() for p in re.split(r"\n\s*\n|(?<=[.!?])\s+", content) if p.strip()]
    if not units:
        return [content.strip()] if content.strip() else []
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for unit in units:
        unit_len = len(unit) + 1
        if current_len + unit_len > max_len and current:
            chunks.append(" ".join(current))
            tail: list[str] = []
            tail_len = 0
            for part in reversed(current):
                if tail_len + len(part) + 1 > overlap:
                    break
                tail.insert(0, part)
                tail_len += len(part) + 1
            current = tail
            current_len = tail_len
        current.append(unit)
        current_len += unit_len
    if current:
        chunks.append(" ".join(current))
    return chunks


def index_document(db, document_id: str, version_no: int, content: str, force_local: bool = False) -> None:
    db.execute("DELETE FROM chunks WHERE document_id=?", (document_id,))
    delete_vectors(document_id)
    for chunk in _split_chunks(content)[:200]:
        chunk_id = f"chunk-{uuid.uuid4().hex[:12]}"
        vector = ai_provider.embed(chunk, force_local=force_local)
        indexed_external = False if force_local else upsert_vector(
            chunk_id, vector, {"document_id": document_id, "version_no": version_no}
        )
        db.execute(
            "INSERT INTO chunks VALUES(?,?,?,?,?,?,?)",
            (
                chunk_id, document_id, version_no, chunk,
                json.dumps(vector),
                "qdrant" if indexed_external else ("local" if force_local else ai_provider.mode), now(),
            ),
        )
    set_v2_state(db, document_id, indexing_status="completed")
    emit_outbox(db, "document.indexed", document_id, {"version_no": version_no})


def create_backup(db, user: dict) -> dict:
    backup_id = f"backup-{uuid.uuid4().hex[:10]}"
    target = BACKUP_DIR / backup_id
    target.mkdir(parents=True)
    database_file = target / ("eduvault.mysql.json" if database_backend() == "mysql" else "eduvault.db")
    snapshot_database(db, database_file)
    shutil.copytree(STORAGE_DIR, target / "storage")
    db.execute("INSERT INTO backup_logs VALUES(?,?,?,?,?)", (backup_id, str(target), "success", user["code"], now()))
    audit(db, user["code"], "backup.create", "backup", backup_id)
    return dict(db.execute("SELECT * FROM backup_logs WHERE id=?", (backup_id,)).fetchone())


def restore_backup(db, user: dict, backup_id: str) -> dict:
    backup = db.execute("SELECT * FROM backup_logs WHERE id=? AND status='success'", (backup_id,)).fetchone()
    if not backup:
        raise ValueError("Không tìm thấy bản backup hợp lệ.")
    source_dir = Path(backup["storage_path"])
    source_db = source_dir / ("eduvault.mysql.json" if database_backend() == "mysql" else "eduvault.db")
    source_storage = source_dir / "storage"
    if not source_db.exists() or not source_storage.exists():
        raise ValueError("Bản backup thiếu database hoặc storage.")

    safety_id = f"pre-restore-{uuid.uuid4().hex[:8]}"
    safety_dir = BACKUP_DIR / safety_id
    safety_dir.mkdir(parents=True)
    safety_db = safety_dir / ("eduvault.mysql.json" if database_backend() == "mysql" else "eduvault.db")
    snapshot_database(db, safety_db)
    shutil.copytree(STORAGE_DIR, safety_dir / "storage")

    restore_database(db, source_db)
    shutil.copytree(source_storage, STORAGE_DIR, dirs_exist_ok=True)
    audit(db, user["code"], "backup.restore", "backup", backup_id, {"safety_backup": safety_id})
    return {"restored": backup_id, "safety_backup": safety_id, "status": "success"}


def sync_document(db, document_id: str, source: Path, storage_id: str | None = None) -> list[dict]:
    results = []
    query = "SELECT * FROM external_storages WHERE enabled=1"
    params = ()
    if storage_id:
        query += " AND id=?"
        params = (storage_id,)
    for storage in db.execute(query, params).fetchall():
        target_dir = Path(storage["location"]) / document_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        shutil.copy2(source, target)
        timestamp = now()
        log_id = f"sync-{uuid.uuid4().hex[:10]}"
        db.execute("INSERT INTO sync_logs VALUES(?,?,?,?,?,?)", (log_id, storage["id"], document_id, "success", str(target), timestamp))
        db.execute("UPDATE external_storages SET last_sync_at=?,last_status='success' WHERE id=?", (timestamp, storage["id"]))
        results.append({"storage": storage["name"], "status": "success", "path": str(target)})
    return results


def knowledge_summary(db, user: dict, *, topic: str | None = None, doc_type: str | None = None) -> dict:
    selected = []
    for document in list_documents(db, user):
        if topic and topic.lower() not in document["topic"].lower() and topic.lower() not in document["title"].lower():
            continue
        if doc_type and doc_type.lower() not in document["doc_type"].lower():
            continue
        selected.append({**document, "content": content_for(db, document)})
    return {
        "summary": " ".join(item["content"] for item in selected[:5]) or "Chưa có đủ tài liệu để tổng hợp.",
        "documents": [{"id": item["id"], "title": item["title"], "topic": item["topic"], "doc_type": item["doc_type"]} for item in selected],
    }


def quality_report(db) -> dict:
    documents = rows(db.execute("SELECT * FROM documents").fetchall())
    hashes: dict[str, list[dict]] = {}
    for document in documents:
        hashes.setdefault(document["content_hash"], []).append(document)
    duplicates = [[item["title"] for item in group] for group in hashes.values() if len(group) > 1]
    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
    stale = [doc for doc in documents if doc["updated_at"][:10] < cutoff]
    missing = []
    for course in db.execute("SELECT * FROM courses").fetchall():
        required = json.loads(course["required_doc_types"])
        available = {doc["doc_type"] for doc in documents if course["name"].lower() in f"{doc['topic']} {doc['title']}".lower()}
        absent = [item for item in required if item not in available]
        if absent:
            missing.append({"course_code": course["code"], "course": course["name"], "missing": absent})
    return {"stale": stale, "duplicates": duplicates, "missing_course_documents": missing}


def usage_report(db) -> dict:
    actions = rows(db.execute("SELECT action,COUNT(*) count FROM audit_logs GROUP BY action ORDER BY count DESC").fetchall())
    return {
        "actions": actions,
        "documents": db.execute("SELECT COUNT(*) count FROM documents").fetchone()["count"],
        "users": db.execute("SELECT COUNT(*) count FROM users WHERE active=1").fetchone()["count"],
        "queries": db.execute("SELECT COUNT(*) count FROM audit_logs WHERE action='rag.ask'").fetchone()["count"],
        "transfers": db.execute("SELECT COUNT(*) count FROM transfers").fetchone()["count"],
    }


def compliance_report(db) -> dict:
    storages = rows(db.execute("SELECT * FROM external_storages WHERE enabled=1").fetchall())
    successful = [item for item in storages if item["last_status"] in {"ready", "success"}]
    offsite = [item for item in successful if item["provider"] != "local"]
    policy = policy_value(db, "backup_321", {"copies": 3, "media": 2, "offsite": 1})
    return {
        "compliant": len(successful) >= policy["copies"] and len({item["provider"] for item in successful}) >= policy["media"] and len(offsite) >= policy["offsite"],
        "copies": len(successful),
        "media": len({item["provider"] for item in successful}),
        "offsite": len(offsite),
        "required": policy,
        "storages": storages,
    }
