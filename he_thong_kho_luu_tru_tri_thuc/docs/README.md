# Chỉ mục tài liệu EduVault

## Nhóm tài liệu

- `architecture/`: kiến trúc hệ thống, luồng xử lý, chatbot, RAG
- `deployment/`: cách deploy, checklist production, tunnel, Docker
- `evaluation/`: benchmark chatbot, test suite, use case coverage
- `operations/`: vận hành, desktop agent, audit hạ tầng
- `security/`: audit giao diện/ngôn ngữ, tài liệu liên quan an toàn hệ thống
- `decisions/`: kế hoạch, thay đổi, quyết định kỹ thuật

## Nên đọc gì trước

### Nếu bạn là người mới vào dự án

1. [REPO_STRUCTURE_TARGET.md](REPO_STRUCTURE_TARGET.md)
2. [architecture/SYSTEM_ARCHITECTURE_FULL.md](architecture/SYSTEM_ARCHITECTURE_FULL.md)
3. [deployment/DEPLOY_DOCKER_PRODUCTION.md](deployment/DEPLOY_DOCKER_PRODUCTION.md)

### Nếu bạn làm chatbot/evaluation

1. [evaluation/CHATBOT_200_EVAL_SUITE.md](evaluation/CHATBOT_200_EVAL_SUITE.md)
2. [architecture/CHATBOT_FLOW_ARCHITECTURE.md](architecture/CHATBOT_FLOW_ARCHITECTURE.md)
3. [architecture/RAG_PIPELINE.md](architecture/RAG_PIPELINE.md)

### Nếu bạn làm vận hành/deploy

1. [deployment/DEPLOY_PRODUCTION_CHECKLIST.md](deployment/DEPLOY_PRODUCTION_CHECKLIST.md)
2. [deployment/production_internet_deployment.md](deployment/production_internet_deployment.md)
3. [operations/INFRASTRUCTURE_COMPARISON_WITH_REPORT.md](operations/INFRASTRUCTURE_COMPARISON_WITH_REPORT.md)

## Ghi chú

Một số tài liệu cũ vẫn có thể còn nhắc tới đường dẫn trước khi refactor repo. Khi có khác biệt, hãy ưu tiên:

- cấu trúc thư mục thực tế hiện tại
- `README.md` ở root
- `infra/compose/`
- `infra/scripts/`
