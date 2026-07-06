from __future__ import annotations

import html
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import HTMLResponse

from .cloud import PROVIDERS, authorization_url, disconnect, exchange_code, list_connections


def build_cloud_router(
    *,
    current_user_dependency: Callable[..., dict],
    cloud_connect_input: type,
    connection_factory: Callable[[], Any],
    transaction_factory: Callable[[], Any],
    audit_func: Callable[..., Any],
    sync_user_document_func: Callable[..., list[dict]],
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/cloud/connections")
    def cloud_connections(user: dict = Depends(current_user_dependency)):
        with connection_factory() as db:
            return list_connections(db, user["code"])

    @router.post("/api/cloud/connect")
    def connect_cloud(payload: dict = Body(...), user: dict = Depends(current_user_dependency)):
        parsed_payload = cloud_connect_input.model_validate(payload)
        try:
            with transaction_factory() as db:
                url = authorization_url(db, user["code"], parsed_payload.provider)
                audit_func(db, user["code"], "cloud.connect_started", "cloud", parsed_payload.provider)
                return {"authorization_url": url}
        except ValueError as exc:
            raise HTTPException(503, str(exc)) from exc

    @router.get("/api/cloud/callback/{provider}", response_class=HTMLResponse)
    def cloud_callback(provider: str, state: str, code: str):
        if provider not in PROVIDERS:
            raise HTTPException(404, "Nhà cung cấp cloud không được hỗ trợ.")
        try:
            with transaction_factory() as db:
                result = exchange_code(db, provider, state, code)
                audit_func(db, result["user_code"], "cloud.connected", "cloud", provider, {"account": result["account_email"]})
            return HTMLResponse(
                "<h2>Kết nối thành công</h2><p>Bạn có thể đóng cửa sổ này và quay lại EduVault.</p>"
                "<script>setTimeout(()=>window.close(),1500)</script>"
            )
        except Exception as exc:
            return HTMLResponse(
                f"<h2>Kết nối thất bại</h2><p>{html.escape(str(exc))}</p>",
                status_code=400,
            )

    @router.delete("/api/cloud/connections/{provider}")
    def disconnect_cloud(provider: str, user: dict = Depends(current_user_dependency)):
        if provider not in {"google_drive", "onedrive"}:
            raise HTTPException(404, "Nhà cung cấp cloud không được hỗ trợ.")
        with transaction_factory() as db:
            disconnect(db, user["code"], provider)
            audit_func(db, user["code"], "cloud.disconnected", "cloud", provider)
        return {"status": "disconnected", "provider": provider}

    @router.post("/api/cloud/connections/{provider}/sync")
    def sync_personal_cloud(provider: str, user: dict = Depends(current_user_dependency)):
        if provider not in {"google_drive", "onedrive"}:
            raise HTTPException(404, "Nhà cung cấp cloud không được hỗ trợ.")
        with transaction_factory() as db:
            if not db.execute(
                "SELECT 1 FROM cloud_connections WHERE user_code=? AND provider=? AND status='connected'",
                (user["code"], provider),
            ).fetchone():
                raise HTTPException(404, "Kho cloud cá nhân chưa được kết nối.")
            results = []
            for document in db.execute(
                "SELECT * FROM documents WHERE owner_code=? AND deleted_at IS NULL",
                (user["code"],),
            ).fetchall():
                asset = db.execute(
                    """SELECT original_path FROM file_assets
                       WHERE document_id=? AND version_no=?
                       ORDER BY created_at DESC, id DESC LIMIT 1""",
                    (document["id"], document["current_version"]),
                ).fetchone()
                version = db.execute(
                    "SELECT storage_path FROM versions WHERE document_id=? AND version_no=?",
                    (document["id"], document["current_version"]),
                ).fetchone()
                source_path = asset["original_path"] if asset else (version["storage_path"] if version else "")
                if not source_path:
                    results.append(
                        {
                            "provider": provider,
                            "status": "failed",
                            "detail": f"Tai lieu {document['id']} chua co file nguon de dong bo.",
                        }
                    )
                    continue
                source = Path(source_path)
                if not source.exists():
                    results.append(
                        {
                            "provider": provider,
                            "status": "failed",
                            "detail": f"Khong tim thay file nguon cho tai lieu {document['id']}: {source}",
                        }
                    )
                    continue
                results.extend(sync_user_document_func(db, user["code"], document["id"], source, provider))
            audit_func(db, user["code"], "cloud.sync", "cloud", provider, {"documents": len(results)})
        return {"provider": provider, "results": results}

    return router
