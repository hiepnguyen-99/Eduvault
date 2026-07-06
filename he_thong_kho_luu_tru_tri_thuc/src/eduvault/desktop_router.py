from __future__ import annotations

from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse


def build_desktop_router(
    *,
    current_user_dependency: Callable[..., dict],
    desktop_agent_heartbeat_input: type,
    desktop_sync_folders_input: type,
    connection_factory: Callable[[], Any],
    transaction_factory: Callable[[], Any],
    root_path: Path,
    desktop_agent_sync_config_func: Callable[..., dict],
    desktop_agent_status_func: Callable[..., dict],
    upsert_desktop_agent_device_func: Callable[..., dict],
    list_desktop_sync_folders_func: Callable[..., list[dict]],
    replace_desktop_sync_folders_func: Callable[..., list[dict]],
    audit_func: Callable[..., Any],
    force_source_type_func: Callable[..., dict],
    upload_init_input: type,
    init_upload_func: Callable[..., dict],
    upload_chunk_func: Callable[..., Awaitable[dict]],
    analyze_upload_func: Callable[..., dict],
    upload_status_func: Callable[..., dict],
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/desktop-agent/config")
    def desktop_agent_config(request: Request, user: dict = Depends(current_user_dependency)):
        with connection_factory() as db:
            public_base = str(request.base_url).rstrip("/")
            return desktop_agent_sync_config_func(db, user["code"], request_base_url=public_base)

    @router.get("/api/desktop-agent/status")
    def desktop_agent_live_status(user: dict = Depends(current_user_dependency)):
        with connection_factory() as db:
            return desktop_agent_status_func(db, user["code"])

    @router.post("/api/desktop-agent/heartbeat")
    def desktop_agent_heartbeat(payload: dict = Body(...), user: dict = Depends(current_user_dependency)):
        parsed_payload = desktop_agent_heartbeat_input.model_validate(payload)
        with transaction_factory() as db:
            return upsert_desktop_agent_device_func(db, user["code"], parsed_payload.model_dump())

    @router.get("/api/desktop-agent/installer")
    def desktop_agent_installer():
        installer_path = root_path / "desktop-agent" / "dist" / "EduVaultDesktopAgentSetup.exe"
        if not installer_path.exists():
            raise HTTPException(404, "Bộ cài Desktop Agent chưa sẵn sàng trên máy chủ.")
        return FileResponse(
            installer_path,
            filename="EduVaultDesktopAgentSetup.exe",
            media_type="application/vnd.microsoft.portable-executable",
        )

    @router.get("/api/desktop-sync/folders")
    def desktop_sync_folders(user: dict = Depends(current_user_dependency)):
        with connection_factory() as db:
            folders = list_desktop_sync_folders_func(db, user["code"], include_disabled=True)
        return {"folders": folders}

    @router.put("/api/desktop-sync/folders")
    def save_desktop_sync_folders(payload: dict = Body(...), user: dict = Depends(current_user_dependency)):
        parsed_payload = desktop_sync_folders_input.model_validate(payload)
        with transaction_factory() as db:
            folders = replace_desktop_sync_folders_func(
                db,
                user["code"],
                [item.model_dump() for item in parsed_payload.folders],
            )
            audit_func(
                db,
                user["code"],
                "desktop.sync_folders.updated",
                "user",
                user["code"],
                {
                    "folders_count": len(folders),
                    "enabled_count": len([item for item in folders if item["enabled"]]),
                },
            )
        return {
            "folders": folders,
            "watch_folders": [item["folder_path"] for item in folders if item["enabled"]],
        }

    @router.post("/api/ingestion/desktop/init", status_code=201)
    def init_desktop_ingestion(payload: dict = Body(...), user: dict = Depends(current_user_dependency)):
        parsed_payload = upload_init_input.model_validate(payload)
        payload_data = parsed_payload.model_dump()
        payload_data.update(force_source_type_func(payload_data, "desktop_agent"))
        desktop_payload = upload_init_input(**payload_data)
        return init_upload_func(desktop_payload, user)

    @router.post("/api/ingestion/desktop/{task_id}/file")
    async def upload_desktop_chunk(
        task_id: str,
        request: Request,
        x_upload_offset: int = Header(),
        user: dict = Depends(current_user_dependency),
    ):
        return await upload_chunk_func(task_id, request, x_upload_offset, user)

    @router.post("/api/ingestion/desktop/{task_id}/analyze", status_code=202)
    def analyze_desktop_ingestion(task_id: str, user: dict = Depends(current_user_dependency)):
        return analyze_upload_func(task_id, user)

    @router.get("/api/ingestion/desktop/{task_id}")
    def desktop_ingestion_status(task_id: str, user: dict = Depends(current_user_dependency)):
        return upload_status_func(task_id, user)

    return router
