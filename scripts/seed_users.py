"""Tạo 3 user mẫu cho 3 vai trò. Chạy: python scripts/seed_users.py"""
import asyncio

from sqlalchemy import select

from src.backend.app.core.security import hash_password
from src.backend.app.db.session import AsyncSessionLocal
from src.backend.app.models.user import User, UserRole

SEED_USERS = [
    ("GV001", "Nguyễn Minh Anh", "GV001", UserRole.lecturer),
    ("GVNEW", "Lê Thu Hà", "GVNEW", UserRole.lecturer),
    ("TBM01", "Trần Hoàng Nam", "TBM01", UserRole.head),
    ("ADMIN", "Phạm Quỳnh Chi", "ADMIN", UserRole.admin),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        # Xóa tất cả các user cũ để tránh rác và trùng lặp
        print("[seed] Đang dọn dẹp các user cũ...")
        await session.execute(text("DELETE FROM users"))
        
        for code, full_name, password, role in SEED_USERS:
            session.add(
                User(
                    code=code,
                    full_name=full_name,
                    hashed_password=hash_password(password),
                    role=role,
                )
            )
            print(f"[seed] tạo {code} / {password} ({role.value})")
        await session.commit()
    print("[seed] Xong.")


if __name__ == "__main__":
    # Import text để chạy câu lệnh SQL thuần
    from sqlalchemy import text
    asyncio.run(main())
