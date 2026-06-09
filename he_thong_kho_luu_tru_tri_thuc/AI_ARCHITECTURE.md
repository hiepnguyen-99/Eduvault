# Kiến trúc AI và Policy Storage

## Chế độ AI

Hệ thống tự chọn provider khi khởi động:

- Không có `OPENAI_API_KEY`: dùng local fallback để phân loại, embedding và RAG vẫn hoạt động.
- Có `OPENAI_API_KEY`: dùng OpenAI Responses API cho metadata/câu trả lời và Embeddings API cho semantic retrieval.

Biến môi trường:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Pipeline upload

1. Người dùng chọn hoặc kéo-thả file.
2. Hệ thống trích text với định dạng được hỗ trợ.
3. AI đề xuất tiêu đề, chủ đề, loại tài liệu, tóm tắt và từ khóa.
4. Storage policy sinh `folder_path` từ metadata.
5. Người dùng xác nhận hoặc chỉnh sửa folder.
6. Hệ thống lưu file gốc vào cây thư mục policy.
7. Nội dung được chia chunk, tạo embedding và lập chỉ mục RAG.
8. Phiên bản được đồng bộ sang các kho ngoài đã cấu hình.

Policy mặc định:

```text
{department}/{topic}/{doc_type}/{visibility}
```

Ví dụ:

```text
Công nghệ thông tin/Học máy/Học liệu/Public/
```

## Pipeline hỏi đáp

1. Lọc nghiêm ngặt: chỉ tài liệu Public và tài liệu do chính người hỏi sở hữu.
2. Tạo embedding câu hỏi.
3. Tìm các chunk gần nhất trong phạm vi được phép.
4. OpenAI hoặc local fallback sinh câu trả lời.
5. Trả về citation gồm tài liệu và phiên bản.

## Ranh giới an toàn

- AI không được cấp quyền truy cập.
- Tài liệu Private của người khác bị loại trước bước retrieval, kể cả đã được cấp quyền xem hoặc người hỏi là trưởng/admin.
- Chủ sở hữu tài liệu Private được ẩn danh với mọi người dùng khác.
- Folder AI đề xuất phải được người dùng xác nhận.
- Nếu OpenAI API lỗi, hệ thống tự fallback cục bộ.
