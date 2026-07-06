# So sánh hiện trạng EduVault V4 với báo cáo cải tiến hạ tầng

> Đối chiếu với `docs/report_improve_infracstructure.md` và trạng thái code hiện có trong repo.
> Ngày lập: 2026-07-02.

## 1. Kết luận nhanh

EduVault V4 hiện tại không chỉ là một MVP RAG đơn giản. Hệ thống đã có nhiều thành phần thực chiến hơn so với phần "hiện trạng" trong report gốc: Docker Compose production có MySQL, MinIO, Redis, Qdrant và healthcheck; có GitHub Actions CI; có Desktop Agent tự động đồng bộ tài liệu; có backup/restore 3-2-1; có audit log; có policy tree, permission, versioning và rollback; có operations dashboard và cảnh báo vận hành cơ bản.

Tuy vậy, nếu so với chuẩn Production Infrastructure, MLOps và LLMOps đầy đủ thì hệ thống vẫn cần nâng cấp thêm ở các điểm: IaC bằng Terraform, data quality gate/quarantine, lakehouse/Delta, evaluation RAG tự động, observability chuẩn Prometheus/OpenTelemetry, PII masking, ABAC/RBAC khai báo bằng policy engine, cost/token tracking và self-host model serving.

Đánh giá tổng quan:

| Nhóm | Mức độ hiện tại | Nhận xét |
| --- | --- | --- |
| Core product | Mạnh | Đã bao phủ upload, search, RAG, phân quyền, versioning, backup, policy, desktop agent. |
| Hạ tầng local/demo | Khá tốt | Có Docker Compose, healthcheck, fallback SQLite/local storage. |
| Production deploy | Trung bình-khá | Có Docker production và CI, nhưng chưa có Terraform, SLO, secret management chuẩn, blue/green/canary. |
| LLMOps/MLOps | Trung bình | Có RAG pipeline, test report, feedback trace; chưa có RAGAS/LangSmith/MLflow/DVC. |
| Security/governance | Trung bình-khá | Có session, role, audit, token encryption cho cloud; chưa có PII masking, Casbin/OPA, rate limit, full encryption-at-rest. |
| FinOps | Yếu | Chưa có tracking token/cost/workload. |

## 2. Những điểm hệ thống đang "hơn" so với mô tả trong report

| Điểm hơn | Hệ thống hiện có | Giá trị thực tế |
| --- | --- | --- |
| Desktop Agent | Có agent Windows watch `D:\Teaching`, upload chunked, heartbeat, local control API `127.0.0.1:8765`, token DPAPI, 2 profile URL local/deploy. | Giảm thao tác upload thủ công, phù hợp workflow giảng viên lưu file trên máy cá nhân. |
| Docker production rõ hơn | `docker-compose.production.yml` có MySQL, MinIO, Redis, Qdrant, backend, frontend, healthcheck và volume riêng. | Tốt hơn "deploy thủ công" trong report; có thể lập mới một môi trường khá nhất quán bằng Docker. |
| CI đã tồn tại | `.github/workflows/ci.yml` chạy pytest backend, npm lint/build frontend. | Không đúng với nhận xét "không có CI/CD"; tuy nhiên CI này chưa có RAG eval/deploy gate. |
| Fallback resilience | SQLite fallback, local object store fallback, local hash embedding fallback khi chưa có OpenAI, Qdrant fallback về DB/lexical. | Demo/development ít bị chết do thiếu dịch vụ ngoài. |
| Policy tree và HITL | Upload có AI gợi ý metadata/folder, nhưng người dùng xác nhận trước khi lưu. | Tốt cho governance vì AI không tự quyết định hoàn toàn. |
| Backup/restore thực tế | Có snapshot database + storage, manifest/checksum, restore có safety backup, báo cáo 3-2-1. | Mạnh hơn nhiều MVP RAG thông thường. |
| Audit và operations dashboard | Có audit logs, operations status, cảnh báo Qdrant fallback, backup stale, service unavailable. | Đã có nền tảng observability ở mức ứng dụng, dù chưa phải Prometheus/OTel. |
| Security token cloud | OAuth Google Drive/OneDrive token được mã hóa bằng Fernet từ `TOKEN_ENCRYPTION_KEY`. | Không phải mọi dữ liệu nhạy cảm đều "lưu thô". |
| RAG có điều phối | Có LangGraph StateGraph, intent routing, role-aware behavior, memory, citation, action answer trực tiếp từ DB. | Cao hơn chatbot RAG tìm-kiếm-rồi-trả-lời cơ bản. |
| Download UX vừa cải tiến | Chatbot hiện lỗi khi download bị 401/403/404 và backend chỉ match file có asset vật lý tồn tại. | Giảm lỗi im lặng khi người dùng báo "chatbot tải tài liệu không được". |

## 3. Đối chiếu theo từng mục Day 16-25

| Bài học | Report đề xuất | Hiện trạng EduVault V4 | Mức độ đáp ứng | Có gì hơn | Tối ưu tiếp theo |
| --- | --- | --- | --- | --- | --- |
| Day 16 - IaC | Terraform quản lý cloud resources. | Có Docker Compose demo/production, script deploy/check/logs, Cloudflare Tunnel docs. Chưa có Terraform. | Một phần | Compose production có healthcheck và volumes, đủ để demo/prod nhỏ. | Viết Terraform hoặc Pulumi cho DB, storage, cache, domain, secret, tunnel; tách `dev/staging/prod`. |
| Day 17 - Data Engineering & Flywheel | Data quality gate, quarantine, trace -> eval/DPO. | Có ingestion, upload tasks, classification ticket, audit log, feedback chat, reports. Chưa có schema validation chuẩn và quarantine/DLQ riêng. | Một phần | HITL classification và upload task state machine tốt. | Thêm validation bằng Pydantic/Pandera/Great Expectations; tạo bảng `ingestion_quarantine`; export conversation/feedback thành golden dataset. |
| Day 18 - Lakehouse/Delta | Delta Lake, time travel, native rollback. | Có version table, file assets, rollback app-level, backup manifest. Chưa có Delta/Lakehouse. | Một phần | Rollback tài liệu đã có UI/API, phù hợp sản phẩm hiện tại. | Nếu data lớn, đưa chunks/audit/telemetry sang Delta/Iceberg; giữ rollback tài liệu app-level nhưng thêm data lineage. |
| Day 19 - Vector & Feature Store | Hybrid Search BM25 + RRF, Feast/Redis feature store. | Có Qdrant vector, local embedding fallback, lexical scoring/fallback, access control trước retrieval. Docs mô tả hybrid Qdrant + BM25, nhưng code chưa thấy BM25/RRF chuẩn hóa đầy đủ. Chưa có Feature Store. | Một phần-khá | Retrieval có role-aware access control và fallback khi Qdrant down. | Chuẩn hóa BM25/FTS, RRF merge, test retrieval; cache permission/user features trong Redis nếu latency cao. |
| Day 20 - Model Serving | Self-host llama.cpp, speculative decoding, KV cache. | AI provider có OpenAI và local fallback hash/rule-based; chưa self-host LLM inference. | Chưa đáp ứng | Local fallback giúp demo không cần key, nhưng không thay thế model serving. | Nếu cần giảm chi phí: self-host embedding trước, sau đó llama.cpp/vLLM cho LLM; đo TTFT/TPOT. |
| Day 21 - CI/CD AI | GitHub Actions, DVC, MLflow, RAG quality gate. | Đã có GitHub Actions pytest + frontend lint/build. Chưa có deploy gate, DVC, MLflow, RAG eval. | Một phần | Report gốc nói "không có pipeline" là không còn đúng. | Thêm test integration Docker, golden RAG eval, threshold pass/fail, deploy staging/prod có approval. |
| Day 22 - LLMOps | Prompt hub, A/B testing, RAGAS, Guardrails. | Prompt và rules nằm trong code/service docs; có chatbot test scenario/report, feedback endpoint. Chưa có prompt registry hay RAGAS tự động. | Một phần | Đã có bộ test chatbot 100 case và intent coverage. | Tạo `eval/golden_queries.jsonl`, chạy RAGAS hoặc evaluator tự động trong CI; version prompt bằng file YAML/DB có `prompt_version`. |
| Day 23 - Observability | OpenTelemetry, Prometheus, Grafana, Loki, Jaeger, SLO. | Có `/api/health`, Docker healthcheck, operations dashboard, audit event, backup alerts. Chưa có OTel/Prometheus/Grafana production. | Một phần | Operations dashboard gắn với domain: backup stale, Qdrant fallback, desktop heartbeat. | Thêm `/metrics`, request id, structured JSON logs, OTel traces cho upload/RAG, SLO alert. |
| Day 24 - Governance & Security | PII masking, Casbin, encryption-at-rest, Nghị định 13. | Có role/session, RBAC tự viết, public/private, access request, audit logs, password PBKDF2/bcrypt compatibility, cloud token encryption. Chưa có PII masking, policy engine, rate limit, full encryption-at-rest. | Một phần-khá | Token cloud đã mã hóa; audit và permission model khá đầy. | Thêm PII detector/masking trước embedding; rate limit; Casbin/OPA nếu policy phức tạp; encrypt object storage/server-side; audit retention. |
| Day 25 - FinOps | Token/cost tracking, chargeback, FOCUS tagging. | Chưa có bảng/token usage/cost attribution. | Chưa đáp ứng | Có audit/report nên có chỗ để gắn event chi phí sau này. | Log model, input/output tokens, latency, cost estimate theo user/department/request; dashboard `cost per 1M tokens`. |

## 4. Các mục đã đáp ứng tốt

| Mục | Bằng chứng trong hệ thống | Đánh giá |
| --- | --- | --- |
| Upload và ingest tài liệu | Upload web, Desktop Agent, chunked upload, classification ticket, metadata normalize. | Đáp ứng tốt cho workflow giảng viên. |
| Phân quyền cơ bản | Role admin/head/lecturer/new_lecturer, public/private, request/approval, folder permissions. | Đáp ứng MVP và demo; cần policy engine khi scale. |
| RAG tiếng Việt có citation | LangGraph pipeline, intent routing, Qdrant/vector fallback, citations và download actions. | Mạnh hơn MVP RAG cơ bản. |
| Versioning và rollback | Bảng versions, document_assets, rollback API/UI, backup safety. | Đáp ứng tốt như một document repository. |
| Backup/restore | Snapshot database/storage, manifest, verify restore, external storages, 3-2-1 report. | Đáp ứng khá tốt cho cấp độ demo/SMB. |
| Local/deploy flexibility | Backend/frontend local, Docker, Cloudflare tunnel, Desktop Agent dual URL local/deploy. | Rất tốt cho test và demo. |
| Vận hành cơ bản | Healthcheck, operations status, desktop heartbeat, audit log. | Tốt ở mức app-level; thiếu stack observability chuẩn. |
| CI cơ bản | GitHub Actions backend/frontend. | Đáp ứng kiểm tra code; chưa đáp ứng AI quality gate. |

## 5. Các mục còn thiếu hoặc mới đáp ứng một phần

| Mục còn thiếu | Tác động | Mức ưu tiên |
| --- | --- | --- |
| Terraform/IaC cloud | Khó lập lại staging/prod, dễ drift config. | Trung bình-cao |
| Data quality gate + quarantine | File lỗi có thể làm kết quả RAG kém hoặc tắc pipeline. | Cao |
| PII masking trước embedding/LLM | Rủi ro pháp lý và bảo mật nếu tài liệu có thông tin cá nhân. | Cao |
| Rate limiting và abuse protection | Dễ bị spam API/chat/upload. | Cao |
| RAG eval tự động | Khó biết chatbot tốt/xấu sau mỗi thay đổi. | Cao |
| Observability chuẩn | Khó debug latency/cost/error theo trace. | Cao |
| Token/cost tracking | Không quản trị được chi phí AI. | Trung bình-cao |
| Prompt versioning | Sửa prompt khó rollback và khó so sánh chất lượng. | Trung bình |
| Feature store | Chưa cần ngay nếu tải nhỏ; cần khi permission query lớn/latency cao. | Thấp-trung bình |
| Delta Lake | Chưa cần ngay nếu dữ liệu nhỏ; cần khi telemetry/audit/chunks lớn. | Thấp-trung bình |
| Self-host LLM | Cần nếu muốn giảm chi phí/kiểm soát data; tốn effort GPU/ops. | Trung bình |

## 6. Đề xuất tối ưu theo 3 giai đoạn

### Giai đoạn 1 - Nền tảng an toàn và chất lượng RAG

1. Thêm PII masking trước khi embedding và trước khi gửi lên model.
2. Thêm rate limit cho auth, chat, upload, download.
3. Chuẩn hóa hybrid retrieval: BM25/FTS + Qdrant + RRF; viết test golden retrieval.
4. Tạo `eval/golden_queries.jsonl` từ `CHATBOT_100_TEST_EVALUATION_REPORT.md`.
5. Chạy RAG eval trong CI với threshold tối thiểu.

### Giai đoạn 2 - Observability và LLMOps

1. Thêm structured JSON logs và request id xuyên suốt frontend/backend/desktop-agent.
2. Thêm `/metrics` Prometheus: request count/error/duration, upload duration, RAG latency, Qdrant fallback count.
3. Lưu `prompt_version`, `model`, `token_estimate`, `latency_ms`, `trace_id` cho mỗi chat request.
4. Tách prompt thành file versioned hoặc bảng DB `prompts`.
5. Tạo dashboard operations mới: RAG quality, cost, latency, error, backup, desktop agents.

### Giai đoạn 3 - Production automation và scale

1. Viết Terraform/Pulumi cho production cloud.
2. Thêm staging deploy và smoke test tự động.
3. Đưa audit/chat telemetry/chunks lớn sang Delta/Iceberg nếu volume tăng.
4. Cân nhắc Redis cache/Feature Store cho permission và metadata hot path.
5. Thử nghiệm self-host embedding/LLM, bắt đầu bằng embedding model nội bộ để giảm chi phí.

## 7. Điểm nên sửa trong report gốc

Report gốc nên cập nhật lại các nhận xét sau để khớp với repo hiện tại:

| Nhận xét trong report gốc | Nên cập nhật thành |
| --- | --- |
| "Không có pipeline CI/CD" | "Đã có CI backend/frontend; chưa có RAG eval, DVC/MLflow và deploy gate." |
| "Chỉ giám sát bằng UptimeRobot" | "Đã có healthcheck, operations dashboard, audit/app-level alerts; chưa có Prometheus/OTel/Grafana." |
| "Tìm kiếm ngữ nghĩa thuần túy" | "Đã có vector + lexical fallback/hybrid-like retrieval; cần chuẩn hóa BM25/RRF và benchmark." |
| "Dữ liệu nhạy cảm không được mã hóa" | "Cloud OAuth token đã mã hóa; file/object và PII pipeline chưa được bảo vệ đầy đủ." |
| "Deploy thủ công qua dashboard" | "Có Docker Compose demo/production và script; chưa có IaC cloud bằng Terraform." |

## 8. Kết luận

EduVault V4 đã vượt qua mức "MVP RAG cơ bản" và gần hơn với một hệ thống quản trị tri thức thực tế: có desktop ingestion, policy tree, HITL, versioning, backup/restore, audit, operations và CI cơ bản. Phần nên cải tiến tiếp không nên làm dàn trải theo tất cả buzzword cùng lúc. Ưu tiên tốt nhất là: PII/rate limit, RAG eval, hybrid search chuẩn, observability metrics, sau đó mới tới IaC, Lakehouse, Feature Store và self-host LLM.

