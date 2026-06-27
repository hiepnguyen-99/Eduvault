from typing import Annotated
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .api.v1 import access_requests, admin, auth, documents, search
from .core.config import settings
from .db.session import engine, get_db
from .core.deps import get_current_user
from .models.user import User


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    yield
    await engine.dispose()


app = FastAPI(
    title="EduVault API",
    description="AI Knowledge Vault for Faculty",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(access_requests.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    """Kiểm tra DB và trả về trạng thái hệ thống."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/v1/dashboard")
async def get_dashboard(user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    """Mock endpoint dashboard để Frontend hiển thị sau khi đăng nhập thành công."""
    return {
        "user": {
            "code": user.code,
            "name": user.full_name,
            "role": user.role.value,
            "department": "Công nghệ thông tin",
            "permissions": []
        },
        "stats": {"documents": 0, "private": 0, "topics": 0},
        "documents": [],
        "requests": [],
        "backups": [],
        "audit": []
    }


@app.get("/api/v1/uploads")
async def get_uploads(user: Annotated[User, Depends(get_current_user)]):
    """Mock endpoint uploads để tránh lỗi 404 khi tải trang."""
    return []

