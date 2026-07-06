# BỘ SLIDE PITCH DECK CHUẨN BTC GATE 3 - EDUVAULT AI (V3)
## CẤU TRÚC 8 SLIDES ĐÁP ỨNG TOÀN BỘ TIÊU CHÍ ĐÁNH GIÁ

---

### SLIDE 1: TIÊU ĐỀ (TITLE)
*   **Tên dự án**: **EduVault AI**
*   **Logo/Mockup gợi ý**: Biểu tượng cuốn sách kết hợp với bộ não số hóa, bên cạnh là giao diện Web Next.js hiện đại kết hợp ứng dụng Desktop Agent đang đồng bộ file.
*   **Slogan**: *"Biến kho tài liệu tĩnh thành kho tri thức sống động có thể đối thoại"*
*   **Giá trị cốt lõi**:
    *   Tự động hóa nạp liệu tri thức từ nguồn cục bộ.
    *   Khai thác thông minh bằng AI hỏi đáp RAG bảo mật.
    *   Quản trị tập trung, có cấu trúc chặt chẽ cho Khoa/Bộ môn.
*   **Speaker Notes**:
    > *"Kính thưa Ban giám khảo và các Thầy Cô, chúng em là đội ngũ phát triển dự án EduVault AI. Hôm nay chúng em xin phép giới thiệu giải pháp giúp biến toàn bộ kho tài liệu tĩnh của khoa thành một kho tri thức sống động, có thể trò chuyện và truy xuất tức thì."*

---

### SLIDE 2: VẤN ĐỀ (PROBLEM)
*   **Tiêu đề**: Nỗi đau thực tế trong quản lý tri thức của Khoa/Bộ môn
*   **3 nỗi đau lớn (Pain points)**:
    1.  **Thất lạc & đứt gãy tri thức**: Tài liệu giảng dạy, đề cương môn học, đề thi phân tán trên máy tính cá nhân. Khi giảng viên nghỉ hưu hoặc chuyển công tác, tri thức tích lũy bị thất lạc.
    2.  **Quá tải thao tác thủ công**: Giảng viên mất quá nhiều thời gian phân loại file, đặt tên tệp, gán thẻ và tổ chức cây thư mục thủ công.
    3.  **Khó khăn khi tiếp cận (Giảng viên mới & Sinh viên)**: Mất nhiều thời gian tra cứu tài liệu liên quan để soạn giáo án mới hoặc học tập; không có cơ cụ hỏi đáp nhanh thông tin tổng hợp.
*   **Speaker Notes**:
    > *"Trong quá trình vận hành tại các Khoa, chúng em nhận thấy tri thức học thuật đang bị phân mảnh nghiêm trọng trên thiết bị cá nhân của từng giảng viên. Giảng viên mới về trường mất hàng tuần để tìm lại tài liệu cũ, còn việc tìm kiếm thông tin chi tiết trong các file PDF/DOCX quét thì gần như không thể làm thủ công một cách hiệu quả."*

---

### SLIDE 3: GIẢI PHÁP (SOLUTION)
*   **Tiêu đề**: Giải pháp EduVault AI - Quản trị tri thức thông minh
*   **Điểm nhấn công nghệ**:
    *   **Thả file lên, AI tự lo**: AI đọc hiểu tài liệu, tự động phân loại theo học phần và bộ môn, gắn metadata thông minh.
    *   **Trợ lý ảo RAG tiếng Việt**: Đối thoại trực tiếp trên kho tài liệu của khoa, trả lời chính xác thông tin kèm trích dẫn nguồn (tên file, số trang, phiên bản cụ thể).
    *   **Unified Ingestion Layer**: Tích hợp Desktop Sync Agent chạy ngầm trên máy tính giảng viên, tự động đồng bộ tài liệu mà không làm thay đổi thói quen làm việc hàng ngày của họ.
*   **Speaker Notes**:
    > *"EduVault AI mang đến giải pháp đột phá: Giảng viên chỉ cần lưu file vào thư mục làm việc của họ, hệ thống sẽ tự nạp liệu, phân loại bằng AI và biến chúng thành nguồn dữ liệu cho trợ lý ảo RAG. Mọi câu hỏi chuyên môn từ đây sẽ được trả lời tức thì bằng tiếng Việt kèm trích dẫn nguồn minh bạch."*

---

### SLIDE 4: SẢN PHẨM & TÍNH NĂNG (PRODUCT)
*   **Tiêu đề**: Tính năng chính & Quy trình vận hành MVP
*   **Quy trình 3 bước khép kín của MVP**:
    1.  **Nạp liệu tự động (Desktop Sync & Chunked Upload)**: Desktop Agent tự quét thư mục, băm SHA256 chống trùng và tải phân đoạn (chunked) an toàn lên MinIO.
    2.  **Kiểm duyệt AI (Human-in-the-loop)**: AI đề xuất loại tài liệu, học phần tương ứng và độ tin cậy. Quản trị viên/Giảng viên phê duyệt đề xuất trên Web Dashboard Next.js trước khi đưa vào kho lưu trữ chính thức.
    3.  **Khai thác thông minh (Multi-Agent Chatbot)**: LangGraph điều phối câu hỏi, tìm kiếm lai (Hybrid Search) trên Qdrant vector và MySQL, trả lời kèm link tham chiếu tài liệu gốc.
*   **Speaker Notes**:
    > *"Sản phẩm MVP hiện tại của chúng em hoạt động qua luồng khép kín: Desktop Agent tải tài liệu lên -> AI phân tích đưa ra gợi ý phân loại trên Web UI -> Người dùng kiểm tra và xác nhận -> Hệ thống tự động băm nhỏ tài liệu đưa vào Qdrant để chatbot hội thoại RAG khai thác."*

---

### SLIDE 5: THỊ TRƯỜNG & ĐỐI TƯỢNG (MARKET)
*   **Tiêu đề**: Đối tượng mục tiêu & Quy mô thị trường giáo dục
*   **Đối tượng sử dụng chính**:
    *   **Giảng viên**: Upload giáo án, tài liệu tham khảo, quản lý tài liệu cá nhân và chia sẻ nội bộ.
    *   **Giảng viên mới**: Tiếp nhận học phần, quy trình môn học nhanh chóng nhờ chatbot hỏi đáp hệ thống.
    *   **Trưởng khoa / Trưởng bộ môn**: Giám sát chất lượng dạy và học, duyệt đề cương, đề thi mật.
*   **Quy mô thị trường**:
    *   Hơn **400+ trường Đại học và Cao đẳng** trên cả nước.
    *   Hàng chục ngàn Khoa, Viện, Bộ môn có nhu cầu cấp thiết về số hóa dữ liệu học thuật nội bộ và bảo mật thông tin giảng dạy.
*   **Speaker Notes**:
    > *"Đối tượng phục vụ trực tiếp của chúng em là các giảng viên và ban quản lý khoa. Với quy mô hơn 400 trường đại học, cao đẳng tại Việt Nam cùng hàng chục ngàn khoa chuyên ngành, nhu cầu số hóa và khai thác tri thức cục bộ bằng AI an toàn, bảo mật là cực kỳ lớn và chưa có giải pháp chuyên biệt nào đáp ứng tốt."*

---

### SLIDE 6: LỢI THẾ CẠNH TRANH (UNIQUE SELLING POINT - USP)
*   **Tiêu đề**: Tại sao EduVault AI khác biệt & tốt hơn?
*   **3 lợi thế cạnh tranh cốt lõi**:
    1.  **Duyệt tài liệu thông minh (Human-in-the-loop AI)**: Không để AI tự quyết hoàn toàn gây sai lệch; AI gợi ý vị trí lưu trữ và phân loại học phần dựa trên chính sách môn học để giảng viên duyệt nhanh bằng 1 click.
    2.  **Desktop Agent Tích hợp sâu**: Nạp liệu tự động hoàn toàn dưới nền, chống trùng lặp dữ liệu (Deduplication) ở mức biên trước khi gửi lên server.
    3.  **RAG bảo mật tuyệt đối với local fallback**: Chatbot RAG lọc quyền truy cập (RBAC) trực tiếp tại tầng truy vấn dữ liệu. Hệ thống tích hợp chế độ chạy offline fallback hoàn toàn khi mất kết nối Internet hoặc mất API Key.
*   **Speaker Notes**:
    > *"So với các giải pháp lưu trữ thông thường như Google Drive hay OneDrive, EduVault vượt trội nhờ 3 điểm: Thứ nhất, có Desktop Agent đồng bộ tự động chống trùng lặp; Thứ hai, cơ chế AI gợi ý phân loại có người dùng kiểm duyệt đảm bảo tính chính xác 100%; Và thứ ba là chatbot RAG bảo mật lọc quyền truy cập thời gian thực và có chế độ chạy offline fallback khi mất mạng."*

---

### SLIDE 7: LỘ TRÌNH PHÁT TRIỂN (ROADMAP)
*   **Tiêu đề**: Lộ trình nâng cấp & Phát triển sản phẩm
*   **Timeline 3 giai đoạn**:
    *   **Giai đoạn 1 (Hiện tại)**: Hoàn thiện MVP V3 tích hợp Desktop Sync Agent, Unified Ingestion Layer và chatbot hỏi đáp nội bộ khoa.
    *   **Giai đoạn 2 (Trung hạn - Quý tiếp theo)**:
        *   Tích hợp đồng bộ 2 chiều với Google Drive, OneDrive (OAuth/Sync).
        *   Cung cấp giao diện Web cấu hình watch folders trực quan cho người dùng.
    *   **Giai đoạn 3 (Dài hạn - Tương lai)**: Mở rộng kiến trúc Multi-tenant hỗ trợ triển khai cấp trường đại học (nhiều khoa chạy song song, phân tách dữ liệu tuyệt đối).
*   **Speaker Notes**:
    > *"Lộ trình của chúng em bắt đầu từ việc hoàn thiện MVP V3 ổn định tại một khoa. Giai đoạn tiếp theo sẽ mở rộng đồng bộ đám mây 2 chiều với Google Drive/OneDrive, và cuối cùng hướng tới giải pháp Multi-tenant chạy quy mô toàn trường đại học."*

---

### SLIDE 8: ĐỘI NGŨ (TEAM)
*   **Tiêu đề**: Đội ngũ phát triển dự án
*   **Cơ cấu đội ngũ (3 vai trò chính)**:
    1.  **[Tên Thành Viên 1] - Project Owner & Full-stack Engineer**:
        *   Xây dựng kiến trúc hệ thống, phát triển Backend FastAPI, database MySQL 8.4 và Frontend Next.js.
    2.  **[Tên Thành Viên 2] - AI Engineer**:
        *   Thiết kế RAG pipeline, cấu hình LangGraph Multi-agent, Qdrant Vector DB và cơ chế AI Fallback cục bộ.
    3.  **[Tên Thành Viên 3] - DevOps & Tester**:
        *   Quản trị hạ tầng MinIO, triển khai Docker-compose, Redis Queue và chính sách sao lưu dự phòng thảm họa 3-2-1.
    > *"Để phát triển dự án này, đội ngũ của chúng em gồm 3 thành viên phụ trách các mảng cốt lõi từ thiết kế hệ thống, tối ưu thuật toán AI RAG cho tới vận hành và kiểm thử bảo mật. Chúng em rất mong nhận được những ý kiến đóng góp từ Ban giám khảo để hoàn thiện sản phẩm hơn nữa. Em xin chân thành cảm ơn!"*

---

## PHẦN VIẾT RIÊNG CHI TIẾT (DỰ PHÒNG CÁC ĐỊNH NGHĨA "ĐS")

Dưới đây là nội dung chi tiết được thiết kế riêng biệt để bạn dễ dàng sao chép trực tiếp vào các khung nội dung ở góc dưới (hoặc phần chân trang - footer/cards) của slide:

### 1. PHẦN ĐỘI NGŨ (TEAM) - THIẾT KẾ DẠNG THẺ (CARD) GÓC DƯỚI SLIDE

*Nếu thiết kế Slide Đội ngũ dạng 3 thẻ nằm ngang ở nửa dưới màn hình:*

| Thẻ 1: Project Owner & Full-stack | Thẻ 2: AI Engineer | Thẻ 3: DevOps & Tester |
| :--- | :--- | :--- |
| **Họ và Tên**: [Tên PO/Fullstack] <br> **Vai trò**: Trưởng nhóm & Lập trình viên chính <br> **Nhiệm vụ chính**: <br> • Thiết kế kiến trúc tổng thể (System Arch) <br> • Code Backend (FastAPI) & Web Front (Next.js) <br> • Xây dựng Database (MySQL 8.4 / SQLite) | **Họ và Tên**: [Tên AI Engineer] <br> **Vai trò**: Kỹ sư Trí tuệ Nhân tạo <br> **Nhiệm vụ chính**: <br> • Thiết kế luồng LangGraph & 20 query intents <br> • Cấu hình Qdrant Vector & hybrid search <br> • Tối ưu hóa thuật toán fallback RAG cục bộ | **Họ và Tên**: [Tên DevOps/Tester] <br> **Vai trò**: Kỹ sư Vận hành & Kiểm thử <br> **Nhiệm vụ chính**: <br> • Quản trị MinIO S3 & Redis Queue <br> • Setup Docker-compose & CI/CD <br> • Thiết lập chính sách sao lưu dự phòng 3-2-1 |

---

### 2. PHẦN ĐẶC SẮC / ĐỘC ĐÁO (USP) - TÓM TẮT GỌN GÓC DƯỚI SLIDE

*Dành cho góc dưới của Slide Lợi thế cạnh tranh (USP) hoặc Slide Giải pháp:*

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       3 ĐIỂM ĐẶC SẮC NHẤT CỦA EDUVAULT                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. ĐỒNG BỘ ẨN BẰNG AGENT: Tự động hóa hoàn toàn ở biên (Local Edge) qua     │
│    Desktop Agent, tự động kiểm tra trùng lặp (SHA256) giúp tiết kiệm 95%    │
│    thời gian nạp tài liệu cho Giảng viên.                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. KIỂM DUYỆT THÔNG MINH (HITL): Kết hợp sức mạnh AI phân loại tự động với  │
│    quy trình phê duyệt 1-click của con người, đảm bảo cấu trúc kho chuẩn 100%│
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. TRUY VẤN BẢO MẬT & LOCAL FALLBACK: Chatbot RAG lọc quyền truy cập thực   │
│    tế (RBAC), có chế độ offline tự vận hành không cần API Key OpenAI.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. PHẦN ĐỐI TƯỢNG / THỊ TRƯỜNG (MARKET) - CÁC KHỐI THÔNG TIN PHỤ Ở CHÂN SLIDE

*Dành cho góc dưới của Slide Đối tượng & Thị trường:*

*   **Giảng viên**: Người dùng trực tiếp (Nạp liệu & Hỏi đáp tài liệu cá nhân/chung).
*   **Trưởng bộ môn / Khoa**: Người giám sát (Quản lý chương trình đào tạo & bảo mật đề thi).
*   **Giảng viên mới**: Đối tượng thừa kế (Nhận bàn giao môn học & học tập quy trình tự động qua AI).
*   **Sinh viên (Mở rộng)**: Người khai thác (Hỏi đáp ôn thi theo giáo trình được cấp phép).

---

## PHẦN HỎI ĐÁP (Q&A) THUYẾT MINH - DỮ LIỆU ĐỌC TRỰC TIẾP TỪ CODE DỰ ÁN

Dưới đây là phần trả lời ngắn gọn, kỹ thuật và thực tế dựa trên cấu trúc codebase của dự án **EduVault V3**, giúp bạn trả lời các câu hỏi phản biện từ Ban Giám Khảo (BGK):

### Q1: Tên dự án và Slogan cốt lõi là gì? (Tiêu đề - Title)
*   **Trả lời**: Dự án tên là **EduVault AI**. Slogan cốt lõi: *"Biến kho tài liệu tĩnh thành kho tri thức sống động có thể đối thoại"*. Giá trị cốt lõi là giải phóng giảng viên khỏi việc phân loại tài liệu thủ công và giúp khoa kế thừa tri thức giảng dạy một cách tự động, bảo mật.

### Q2: Dự án giải quyết những nỗi đau (pain points) thực tế nào? (Vấn đề - Problem)
*   **Trả lời**:
    1.  **Thất lạc dữ liệu học thuật**: Code dự án quản lý môn học theo mô hình `courses` và `transfers`. Thực tế, khi giảng viên dừng giảng dạy, tài liệu phân tán trên máy tính của họ dễ bị mất.
    2.  **Mất thời gian quản trị thủ công**: Giảng viên phải tự tạo thư mục và phân loại tài liệu môn học.
    3.  **Khó kế thừa tri thức**: Giảng viên mới và sinh viên không có cách nào hỏi đáp tổng hợp nhanh nội dung của toàn bộ tài liệu giảng dạy trong khoa.

### Q3: Ứng dụng AI của sản phẩm giải quyết vấn đề như thế nào? (Giải pháp - Solution)
*   **Trả lời**:
    1.  **Tự động nhận diện & gắn nhãn (Auto-Classification)**: Class `AIProvider` (`ai.py`) gọi LLM (OpenAI / Local Fallback) đọc nội dung file tải lên để trích xuất `title`, `topic`, `doc_type`, `summary`, `keywords`, sau đó đề xuất phân loại theo cấu trúc học phần và lưu vào `document_classification_tickets`.
    2.  **Trợ lý ảo RAG thông minh**: Dùng **LangGraph StateGraph** (`ai.py` / `services.py`) với pipeline RAG hybrid kết hợp tìm kiếm ngữ nghĩa (Qdrant) và từ khóa (BM25), trả lời bằng tiếng Việt kèm trích dẫn chính xác link tài liệu gốc và số trang.

### Q4: Các tính năng chính và cách vận hành của MVP là gì? (Sản phẩm - Product)
*   **Trả lời**:
    *   **Desktop Agent (`desktop-agent/agent.py`)**: Chạy ngầm giám sát thư mục bằng thư viện `watchdog`, tự động hash SHA256 chống trùng lặp tại nguồn, và dùng API `/api/ingestion/desktop/*` để truyền file dạng **Chunked Upload** (tự phục hồi phiên tải khi mất mạng).
    *   **Xác nhận AI gợi ý (HITL)**: Hiển thị trên Web Dashboard Next.js danh sách file đã đồng bộ. Quản trị viên/Giảng viên duyệt gợi ý phân loại của AI chỉ bằng 1 click để chính thức đưa vào CSDL hệ thống (`documents`, `versions`, `file_assets`).
    *   **Chatbot thông minh**: Định tuyến câu hỏi qua 20 intent người dùng, hỗ trợ xem lịch sử phiên bản (`versions`) và rollback.

### Q5: Ai là đối tượng sử dụng và quy mô thị trường ra sao? (Thị trường - Market)
*   **Trả lời**:
    *   **Đối tượng**: Giảng viên (upload, hỏi đáp tài liệu cá nhân), Trưởng bộ môn/Khoa (giám sát, duyệt chương trình và đề thi), Giảng viên mới (tiếp nhận tri thức bàn giao môn học), Sinh viên (tra cứu tài liệu học tập được cấp quyền Public).
    *   **Quy mô**: Triển khai tại hơn **400+ trường Đại học/Cao đẳng** tại Việt Nam. Bắt đầu từ quy mô cấp Bộ môn/Khoa (100GB dữ liệu, 50-100 giảng viên) rồi mở rộng ra toàn trường.

### Q6: Lợi thế cạnh tranh (USP) của EduVault so với các giải pháp khác là gì? (USP)
*   **Trả lời**:
    1.  **Nạp liệu rảnh tay tích hợp sâu**: Có Desktop Agent cục bộ tự động hóa luồng tải file, không bắt giảng viên thay đổi thói quen dùng máy tính.
    2.  **Kiểm duyệt AI (Human-in-the-loop)**: Không phụ thuộc hoàn toàn vào AI để tránh ảo giác; AI đóng vai trò đề xuất, con người duyệt nhanh, đảm bảo cấu trúc kho tri thức chính xác 100%.
    3.  **Chatbot RAG bảo mật & Local Fallback**: Phân quyền truy cập (RBAC) được kiểm tra trực tiếp qua hàm chokepoint `validate_folder_access` tại tầng RAG. Tích hợp chế độ **Local Fallback** chạy ngoại tuyến hoàn toàn khi mất API Key hoặc mất mạng internet.

### Q7: Kế hoạch của nhóm trong các giai đoạn tiếp theo là gì? (Lộ trình - Roadmap)
*   **Trả lời**:
    *   **Giai đoạn 1 (MVP hiện tại)**: Hoàn thiện Unified Ingestion Layer, Desktop Sync Agent và chatbot LangGraph RAG.
    *   **Giai đoạn 2 (Quý tới)**: Tích hợp sync đám mây 2 chiều (Google Drive, OneDrive qua OAuth); xây dựng UI quản lý thư mục giám sát cục bộ của Desktop Agent trên Web Settings.
    *   **Giai đoạn 3 (Tương lai)**: Chuyển đổi kiến trúc sang Multi-tenant hỗ trợ triển khai SaaS cho toàn trường Đại học với nhiều Khoa/Viện chạy độc lập.

### Q8: Cơ cấu nhân sự thực tế xây dựng nên hệ thống này? (Đội ngũ - Team)
*   **Trả lời** (đọc từ các thành phần kỹ thuật đã phát triển):
    *   **Lập trình viên Full-stack**: Xây dựng backend FastAPI (`main.py`, `services.py`, `database.py`) và frontend Next.js (`frontend/app/settings`, `components/app-shell`).
    *   **Kỹ sư AI**: Thiết kế pipeline xử lý dữ liệu, OCR văn bản, lập chỉ mục vector Qdrant và tích hợp LangGraph chatbot (`ai.py`).
    *   **Kỹ sư DevOps & QA**: Cấu hình Docker-compose, thiết lập cơ sở dữ liệu MySQL 8.4, quản lý MinIO Object Storage, viết test suite (`tests/test_mvp_api.py`) và chính sách backup 3-2-1.

### Q9: Hệ thống xử lý các tình huống ngoài ý muốn (Guardrails) như thế nào? (An toàn AI - Guardrails)
*   **Trả lời** (đọc từ codebase):
    1.  **Input Filtering (Lọc đầu vào)**: Tích hợp hàm `_is_out_of_scope_query(question)` trong `services.py` để quét và chặn các câu hỏi thô tục, độc hại, hoặc các truy vấn Prompt Injection tấn công hệ thống (như yêu cầu tiết lộ system prompt).
    2.  **Topic Constraint (Ràng buộc chủ đề)**: Kiểm tra các tín hiệu ngoài chủ đề (off-topic signals) như thời tiết, bóng đá, chính trị... tại hàm `_is_out_of_scope_query`. Nếu khớp, chatbot lập tức chuyển hướng sang luồng `oos_answer` (Out-of-Scope) từ chối trả lời để đảm bảo hệ thống chỉ tập trung vào tài liệu học thuật của khoa.
    3.  **Output Validation (Kiểm chứng đầu ra)**: Prompt hệ thống luôn bổ sung chỉ thị nghiêm ngặt: *"Chỉ dựa trên ngữ cảnh tài liệu được cung cấp; nếu chưa đủ thông tin thì thành thật nói chưa rõ. Không tự bịa đặt thông tin"*. Điều này triệt tiêu tình trạng ảo giác (Anti-hallucination) của AI. Đồng thời kiểm soát thông tin cá nhân (PII).
    4.  **Format Check (Định dạng đầu ra)**: Khi AI phân loại hoặc trích xuất JSON, code sử dụng biểu thức chính quy (Regex) làm sạch markdown backticks (`re.sub(r"^```json|```$", "", ...)`) và bắt buộc chạy qua `json.loads`. Nếu xảy ra lỗi định dạng, hệ thống tự động kích hoạt đối tượng Fallback an toàn đã cấu hình sẵn trong DB.



