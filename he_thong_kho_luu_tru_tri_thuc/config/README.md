# Cấu hình

Thư mục `config/` chỉ chứa nội dung an toàn để commit:

- `env/`: file mẫu môi trường
- `policy/`: policy seed mẫu
- `app/`: chỗ dành cho config ứng dụng không nhạy cảm

## Nguyên tắc

- Không lưu secret thật trong `config/`.
- File thật như `.env`, `.env.demo` vẫn nằm ngoài vùng config mẫu.
- Khi cần tạo môi trường mới, lấy file mẫu từ `config/env/`.
