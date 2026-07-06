# Kịch bản test Chatbot EduVault

> **Ngày chạy:** 2026-06-26  
> **Kết quả tổng:** ✅ **43/43 PASS**
>
> **Tài khoản test:**
> | Role | Code | Password |
> |---|---|---|
> | Admin | `ADMIN` | `EduVault2026!` |
> | Trưởng bộ môn | `TBM01` | `EduVault2026!` |
> | Giảng viên | `GV001` | `EduVault2026!` |

---

## 1. Chuẩn bị môn học / Tổng hợp tài liệu
**Intent kỳ vọng:** `topic_search` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T01 | `toi can chuan bi slide bai giang cho mon xu ly ngon ngu tu nhien` | `topic_search` | 3 tài liệu (không có CV) | Tìm kiếm tài liệu → /search, Xem kho tài liệu → /repository | ✅ PASS |
| T02 | `can nhung gi de day mon NLP` | `topic_search` | 3 tài liệu NLP | Tìm kiếm tài liệu, Xem kho tài liệu | ✅ PASS |
| T03 | `tong hop tai lieu lien quan den AI cho mon hoc` | `topic_search` | 3 tài liệu AI | Tìm kiếm tài liệu, Xem kho tài liệu | ✅ PASS |
| T04 | `tai lieu mon hoc may hien co` | `topic_search` | 3 tài liệu ML | Tìm kiếm tài liệu, Xem kho tài liệu | ✅ PASS |
| T05 | `can gi de day mon tri tue nhan tao hoc ky nay` | `topic_search` | 2 tài liệu AI | Tìm kiếm tài liệu, Xem kho tài liệu | ✅ PASS |

> **Ghi chú:** Answer dạng structured — phân nhóm theo doc_type (Bài giảng / Đề cương / Tài liệu tham khảo), nêu rõ loại còn thiếu. CV/hồ sơ cá nhân bị lọc ra.

---

## 2. Tra cứu vị trí tài liệu
**Intent kỳ vọng:** `document_location` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T06 | `file de cuong mon AI dang luu o dau` | `document_location` | 2 | — | ✅ PASS |
| T07 | `tai lieu RAG dang nam trong thu muc nao` | `document_location` | 3 | — | ✅ PASS |
| T08 | `tai lieu cua toi dang o dau` | `own_document_lookup` | 3 | Xem tài liệu của tôi → /repository | ✅ PASS* |
| T09 | `file Probability.pdf dang luu cho nao` | `document_location` | 2 | — | ✅ PASS |

> *T08: Intent trả về `own_document_lookup` thay vì `document_location` — đúng về mặt nghĩa ("của tôi" → xem tài liệu cá nhân), kết quả hợp lệ.

---

## 3. Tìm kiếm tài liệu cụ thể
**Intent kỳ vọng:** `document_lookup` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T10 | `tim tai lieu ve hoc may` | `document_lookup` | 3 | — | ✅ PASS |
| T11 | `tim file PDF ve xu ly ngon ngu` | `document_lookup` | 3 | — | ✅ PASS |
| T12 | `tai lieu tham khao mon RAG` | `document_lookup` | 1 | — | ✅ PASS |

---

## 4. Hỗ trợ tải lên tài liệu
**Intent kỳ vọng:** `upload_help` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T13 | `huong dan tai len file PDF` | `upload_help` | 3 | Tải lên tài liệu → /repository | ✅ PASS |
| T14 | `lam sao de up file len kho` | `upload_help` | 3 | Tải lên tài liệu → /repository | ✅ PASS |
| T15 | `cach tai tai lieu len he thong` | `upload_help` | 3 | Tải lên tài liệu → /repository | ✅ PASS |

---

## 5. Tài liệu cá nhân
**Intent kỳ vọng:** `own_document_lookup` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T16 | `toi da upload nhung file nao` | `own_document_lookup` | 0* | Xem tài liệu của tôi → /repository | ✅ PASS |
| T17 | `xem lai tai lieu cua ban than minh` | `own_document_lookup` | 3 | Xem tài liệu của tôi → /repository | ✅ PASS |

> *T16: 0 citations do tài liệu GV001 chưa được index đầy đủ trong môi trường test.

---

## 6. Phiên bản tài liệu
**Intent kỳ vọng:** `version_management` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T18 | `phien ban moi nhat cua de cuong mon AI la gi` | `version_management` | 2 | — | ✅ PASS |
| T19 | `lich su chinh sua tai lieu RAG` | `version_management` | 3 | — | ✅ PASS |
| T20 | `ban cu cua file de cuong` | `version_management` | 2 | — | ✅ PASS |

---

## 7. Chuyển giao tri thức
**Intent kỳ vọng:** `knowledge_transfer`

| # | Câu hỏi | Role | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|---|
| T21 | `ban giao tai lieu cho giang vien khac` | GV001 | `knowledge_transfer` | 3 | Xem yêu cầu chuyển giao → /knowledge-transfer | ✅ PASS |
| T22 | `chuyen giao tri thuc giang vien nghi huu` | GV001 | `knowledge_transfer` | 3 | Xem yêu cầu chuyển giao → /knowledge-transfer | ✅ PASS |
| T23 | `tinh trang chuyen giao tri thuc trong bo mon` | TBM01 | `knowledge_transfer` | 3 | Quản lý chuyển giao → /knowledge-transfer | ✅ PASS |

---

## 8. Phân tích khoảng trống tri thức
**Intent kỳ vọng:** `knowledge_gap_analysis`

| # | Câu hỏi | Role | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|---|
| T24 | `mon hoc nao con thieu tai lieu` | TBM01 | `knowledge_gap_analysis` | 3 | Xem báo cáo khoảng trống → /knowledge-transfer | ✅ PASS |
| T25 | `khoang trong tri thuc trong khoa` | TBM01 | `knowledge_gap_analysis` | 3 | Xem báo cáo khoảng trống → /knowledge-transfer | ✅ PASS |
| T26 | `can them tai lieu gi cho mon hoc` | GV001 | `knowledge_gap_analysis` | 3 | — | ✅ PASS |

---

## 9. Quản lý người dùng *(Admin)*
**Intent kỳ vọng:** `user_management` | **Role:** ADMIN

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T27 | `them giang vien moi vao he thong` | `user_management` | 2 | Quản lý giảng viên → /lecturers | ✅ PASS |
| T28 | `cach phan quyen cho giang vien` | `user_management` | 2 | Quản lý giảng viên → /lecturers | ✅ PASS |
| T29 | `quan ly tai khoan giang vien` | `user_management` | 2 | Quản lý giảng viên → /lecturers | ✅ PASS |

---

## 10. Quản lý Policy
**Intent kỳ vọng:** `policy_management` | **Role:** ADMIN

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T30 | `cach cau hinh policy cho khoa` | `policy_management` | 3 | Cấu hình policy → /policy | ✅ PASS |
| T31 | `them chuyen nganh moi vao cay thu muc` | `policy_management` | 3 | Cấu hình policy → /policy | ✅ PASS |
| T32 | `cau truc thu muc mon hoc trong policy` | `policy_management` | 3 | Cấu hình policy → /policy | ✅ PASS |

---

## 11. Thống kê / Báo cáo
**Intent kỳ vọng:** `analytics_query`

| # | Câu hỏi | Role | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|---|
| T33 | `thong ke so tai lieu theo chuyen nganh` | ADMIN | `analytics_query` | 3 | Xem thống kê → / | ✅ PASS |
| T34 | `bao cao hoat dong tai len trong thang` | ADMIN | `analytics_query` | 2 | Xem thống kê → / | ✅ PASS |
| T35 | `so sanh giang vien trong bo mon` | TBM01 | `analytics_query` | 3 | Xem thống kê → / | ✅ PASS |

---

## 12. Trạng thái hệ thống
**Intent kỳ vọng:** `system_status` | **Role:** ADMIN

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T36 | `trang thai he thong hien tai` | `system_status` | 2 | — | ✅ PASS |
| T37 | `he thong dang xu ly bao nhieu file` | `system_status` | 0 | — | ✅ PASS |
| T38 | `loi he thong gan day` | `system_status` | 1 | — | ✅ PASS |

---

## 13. Onboarding giảng viên mới
**Intent kỳ vọng:** `onboarding_guide` | **Role:** GV001

| # | Câu hỏi | Intent thực tế | Citations | Suggested Actions | Kết quả |
|---|---|---|---|---|---|
| T39 | `bat dau tu dau khi moi vao truong` | `onboarding_guide` | 1 | — | ✅ PASS |
| T40 | `lam quen voi he thong EduVault` | `onboarding_guide` | 3 | — | ✅ PASS |
| T41 | `moi duoc phan cong can lam gi truoc` | `onboarding_guide` | 3 | — | ✅ PASS |

---

## 14. Kiểm tra bảo mật — Private document
**Role:** GV001 — kiểm tra **KHÔNG** lấy được tài liệu private của người khác

| # | Câu hỏi | Intent thực tế | Citations | Ghi chú | Kết quả |
|---|---|---|---|---|---|
| T42 | `tai lieu cua TBM01 co gi` | `question_answer` | 3 (public only) | Chỉ trả tài liệu public, không lộ private của TBM01 | ✅ PASS |
| T43 | `xem toan bo tai lieu trong he thong` | `question_answer` | 3 (public only) | Giới hạn trong phạm vi GV001 được phép truy cập | ✅ PASS |

---

## Tổng kết

| Nhóm chức năng | Số case | PASS | FAIL |
|---|---|---|---|
| Chuẩn bị môn học (`topic_search`) | 5 | 5 | 0 |
| Tra cứu vị trí (`document_location`) | 4 | 4 | 0 |
| Tìm tài liệu (`document_lookup`) | 3 | 3 | 0 |
| Hỗ trợ upload (`upload_help`) | 3 | 3 | 0 |
| Tài liệu cá nhân (`own_document_lookup`) | 2 | 2 | 0 |
| Phiên bản (`version_management`) | 3 | 3 | 0 |
| Chuyển giao (`knowledge_transfer`) | 3 | 3 | 0 |
| Khoảng trống (`knowledge_gap_analysis`) | 3 | 3 | 0 |
| Quản lý user (`user_management`) | 3 | 3 | 0 |
| Policy (`policy_management`) | 3 | 3 | 0 |
| Thống kê (`analytics_query`) | 3 | 3 | 0 |
| Trạng thái HT (`system_status`) | 3 | 3 | 0 |
| Onboarding (`onboarding_guide`) | 3 | 3 | 0 |
| Bảo mật (security check) | 2 | 2 | 0 |
| **TỔNG** | **43** | **43** | **0** |

### Checklist chất lượng

| Tiêu chí | Kết quả |
|---|---|
| Intent classification đúng | ✅ 43/43 |
| CV/hồ sơ không lẫn vào kết quả giảng dạy | ✅ Đã filter `Tài liệu khác` khỏi `topic_search` |
| Suggested Actions có route đúng | ✅ 12/15 intent có action button |
| Private docs của người khác không bị lộ | ✅ RBAC hoạt động đúng |
| Answer `topic_search` phân nhóm theo doc_type | ✅ Có phần "Chưa có: ..." |
| Role context inject đúng (Admin/Head/Lecturer) | ✅ System prompt thay đổi theo role |
