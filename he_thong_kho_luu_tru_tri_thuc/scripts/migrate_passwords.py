import sys
import os
from pathlib import Path

# Thêm thư mục src vào sys.path để import eduvault
src_path = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(src_path))

from eduvault.database import connection, password_needs_rehash, hash_password, seed_password_for

def main():
    print("Bắt đầu kiểm tra và chuyển đổi dữ liệu mật khẩu người dùng...")
    migrated_count = 0
    skipped_count = 0
    
    with connection() as db:
        users = db.execute("SELECT code, password_hash FROM users").fetchall()
        print(f"Tổng số người dùng trong hệ thống: {len(users)}")
        
        for user in users:
            code = user["code"]
            current_hash = user["password_hash"]
            
            if password_needs_rehash(current_hash):
                # Vì không thể giải mã pbkdf2, chúng ta sẽ reset mật khẩu về seed password mặc định
                # User sẽ cần đăng nhập bằng seed password (mã số giảng viên + prefix) 
                # hoặc thay đổi mật khẩu sau đó.
                print(f"Người dùng {code} có hash cũ, đang reset về seed password (bằng bcrypt)...")
                try:
                    seed_pwd = seed_password_for(code)
                    new_hash = hash_password(seed_pwd)
                    db.execute("UPDATE users SET password_hash=? WHERE code=?", (new_hash, code))
                    migrated_count += 1
                except Exception as e:
                    print(f"Lỗi khi reset mật khẩu cho {code}: {e}")
            else:
                skipped_count += 1
                
        db.commit()
        
    print("=" * 40)
    print(f"Báo cáo quá trình Migrate Mật khẩu:")
    print(f"- Số người dùng đã được migrate (reset về seed password): {migrated_count}")
    print(f"- Số người dùng bỏ qua (đã dùng bcrypt): {skipped_count}")
    print("=" * 40)

if __name__ == "__main__":
    main()
