# Cấu Trúc Thư Mục Đề Xuất Cho EduVault

Tài liệu này đề xuất cấu trúc thư mục mục tiêu cho repo `he_thong_kho_luu_tru_tri_thuc` theo hướng của một dự án thực tế có thể vận hành lâu dài, nhiều người cùng làm, dễ audit và dễ mở rộng.

## Mục tiêu

- Tách rõ `application code`, `shared packages`, `infrastructure`, `configuration`, `automation`, `tests`, `artifacts`.
- Loại bỏ tình trạng file chạy thật, file build, log, report và dữ liệu tạm nằm lẫn trong root.
- Giảm rủi ro commit nhầm file nhạy cảm hoặc artifact không cần thiết.
- Tạo nền để scale team `backend`, `frontend`, `desktop-agent`, `AI/evaluation`, `DevOps`.

## Cấu trúc mục tiêu

```text
eduvault/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  ├─ tests/
│  │  ├─ requirements.txt
│  │  └─ README.md
│  ├─ web/
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ lib/
│  │  ├─ public/
│  │  ├─ src/
│  │  ├─ package.json
│  │  └─ README.md
│  └─ desktop-agent/
│     ├─ src/
│     ├─ packaging/
│     ├─ requirements.txt
│     └─ README.md
├─ packages/
│  ├─ evaluation/
│  │  ├─ runner/
│  │  ├─ cases/
│  │  ├─ reporters/
│  │  └─ README.md
│  ├─ shared-config/
│  └─ shared-types/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  ├─ security/
│  └─ fixtures/
├─ infra/
│  ├─ compose/
│  ├─ docker/
│  ├─ nginx/
│  ├─ tunnel/
│  ├─ database/
│  └─ scripts/
├─ config/
│  ├─ env/
│  │  ├─ .env.example
│  │  ├─ .env.demo.example
│  │  ├─ .env.production.example
│  │  └─ .env.mysql.example
│  ├─ policy/
│  └─ app/
├─ docs/
│  ├─ architecture/
│  ├─ deployment/
│  ├─ operations/
│  ├─ security/
│  ├─ evaluation/
│  └─ decisions/
├─ tools/
│  ├─ dev/
│  ├─ release/
│  ├─ maintenance/
│  └─ ci/
├─ var/
│  ├─ reports/
│  ├─ logs/
│  ├─ tmp/
│  ├─ backups/
│  └─ sample-data/
├─ .github/
├─ .gitignore
├─ .dockerignore
├─ README.md
└─ CONTRIBUTING.md
```

## Nguyên tắc tổ chức

### 1. `apps/` chỉ chứa ứng dụng chạy thật

- `apps/api`: FastAPI backend.
- `apps/web`: Next.js frontend.
- `apps/desktop-agent`: agent đồng bộ desktop.

Không để file deploy, log, report hoặc build artifact nằm trong các thư mục này.

### 2. `packages/` chứa phần dùng chung

- `packages/evaluation`: benchmark chatbot, parser test case, report generator.
- `packages/shared-config`: schema env, config loader, constants dùng chung.
- `packages/shared-types`: type/schema chia sẻ giữa backend, frontend, evaluator.

### 3. `infra/` tách biệt hoàn toàn với business code

- Dockerfile, compose file, nginx, tunnel config, schema DB, script deploy đều nằm ở đây.
- Mục tiêu là nhìn vào `infra/` là biết toàn bộ phần vận hành.

### 4. `config/` chỉ chứa cấu hình mẫu và cấu hình an toàn để commit

- Chỉ commit file `.example`.
- Không để `.env` thật, `config.json` thật, credential thật trong repo.
- Policy seed như `policy_mau_cntt.json` nên chuyển vào `config/policy/`.

### 5. `var/` chứa artifact sinh ra khi chạy

- `var/reports`: benchmark output.
- `var/logs`: log runtime.
- `var/tmp`: file tạm.
- `var/backups`: backup.
- `var/sample-data`: dữ liệu demo có chủ đích.

Các thư mục này nên được ignore phần lớn hoặc chỉ giữ một số file mẫu nếu thật sự cần.

### 6. `tests/` tổ chức theo cấp độ kiểm thử

- `unit`: kiểm thử hàm/module nhỏ.
- `integration`: kiểm thử backend, DB, API flow.
- `e2e`: luồng người dùng hoặc UI/API xuyên tầng.
- `security`: RBAC, secret leak, privacy, policy enforcement.
- `fixtures`: dữ liệu test tách riêng.

## Mapping từ repo hiện tại sang cấu trúc mới

| Hiện tại | Mục tiêu | Ghi chú |
| --- | --- | --- |
| `src/eduvault` | `apps/api/src/eduvault` | Toàn bộ backend code |
| `tests/test_mvp_api.py` | `tests/integration/test_mvp_api.py` | Tách theo cấp độ test |
| `tests/test_policy_security.py` | `tests/security/test_policy_security.py` | Gom nhóm security |
| `tests/test_chatbot_eval_suite.py` | `tests/e2e/test_chatbot_eval_suite.py` hoặc `packages/evaluation/tests/` | Tùy mức coupling |
| `frontend/` | `apps/web/` | Giữ nguyên cấu trúc nội bộ của Next.js |
| `desktop-agent/` | `apps/desktop-agent/` | Tách `src/`, `packaging/`, `artifacts/` |
| `scripts/run_chatbot_eval.py` | `packages/evaluation/runner/run_chatbot_eval.py` | Tách benchmark khỏi script chung |
| `reports/` | `var/reports/` | Artifact sinh ra khi chạy |
| `cloudflared/` | `infra/tunnel/` | Cấu hình tunnel |
| `database/` | `infra/database/` | Schema, migration seed |
| `docker-compose.*.yml` | `infra/compose/` | Tách root cho gọn |
| `Dockerfile.backend` | `infra/docker/Dockerfile.api` | Đặt tên rõ nghĩa |
| `nginx.conf` | `infra/nginx/nginx.conf` | Hạ tầng web |
| `deploy-*.ps1`, `deploy-*.sh` | `infra/scripts/` | Script vận hành |
| `check-*.ps1`, `logs-*.ps1`, `status-*.ps1`, `stop-*.ps1` | `infra/scripts/` | Script ops |
| `.env*.example` | `config/env/` | Chỉ giữ file mẫu |
| `.env`, `.env.demo` | ngoài repo hoặc secret store | Không nên nằm trong git repo |
| `policy_mau_cntt.json` | `config/policy/policy_mau_cntt.json` | Seed config |
| `build/`, `dist/` | `var/` hoặc ignore hoàn toàn | Build artifact, không để ở root |
| `tmp/` | `var/tmp/` | File tạm runtime |
| `backend.log`, `*.stderr.log`, `*.stdout.log` | `var/logs/` | Runtime logs |
| `data/` | `var/sample-data/` hoặc mount runtime ngoài repo | Cần tách dữ liệu chạy thật khỏi source |
| `installer/` | `apps/desktop-agent/packaging/installer/` | Gần nơi phát hành agent |
| `web/` | `apps/legacy-web/` hoặc `docs/archive/` | Nếu còn dùng demo HTML tĩnh |
| `web_demo.py` | `apps/api/examples/` hoặc `tools/dev/` | Chỉ giữ nếu còn dùng |

## Mapping chi tiết cho EduVault hiện tại

### Root hiện tại đang có các nhóm bị trộn

- Source code thật: `src`, `frontend`, `desktop-agent`
- Infra/deploy: `cloudflared`, `database`, `docker-compose.*`, `nginx.conf`, `deploy-*.ps1`
- Artifact/runtime: `build`, `dist`, `reports`, `tmp`, `backend.log`, `*.stderr.log`, `*.stdout.log`
- Config/environment: `.env`, `.env.demo`, `.env.*.example`, `policy_mau_cntt.json`
- Docs: `docs`

Đây là lý do repo hiện tại dùng được, nhưng chưa đạt trạng thái "production-grade repository hygiene".

## Cấu trúc đích áp riêng cho EduVault

```text
he_thong_kho_luu_tru_tri_thuc/
├─ apps/
│  ├─ api/
│  │  ├─ src/eduvault/
│  │  ├─ requirements.txt
│  │  └─ README.md
│  ├─ web/
│  └─ desktop-agent/
├─ packages/
│  ├─ evaluation/
│  │  ├─ runner/
│  │  ├─ cases/
│  │  ├─ reporters/
│  │  └─ outputs -> ../../../var/reports
│  ├─ shared-config/
│  └─ shared-types/
├─ tests/
│  ├─ integration/
│  ├─ security/
│  ├─ e2e/
│  └─ fixtures/
├─ infra/
│  ├─ compose/
│  ├─ docker/
│  ├─ nginx/
│  ├─ tunnel/
│  ├─ database/
│  └─ scripts/
├─ config/
│  ├─ env/
│  ├─ policy/
│  └─ app/
├─ docs/
│  ├─ architecture/
│  ├─ deployment/
│  ├─ operations/
│  ├─ evaluation/
│  └─ security/
├─ tools/
│  ├─ dev/
│  ├─ ci/
│  └─ maintenance/
├─ var/
│  ├─ reports/
│  ├─ logs/
│  ├─ tmp/
│  ├─ backups/
│  └─ sample-data/
└─ ...
```

## Thứ tự di chuyển an toàn

### Pha 1. Dọn root nhưng không đổi import/runtime

- Tạo `infra/`, `config/`, `var/`, `docs/deployment/`, `docs/evaluation/`.
- Di chuyển tài liệu, script deploy, docker compose, nginx, tunnel config.
- Di chuyển `reports/` sang `var/reports/`.
- Di chuyển log sang `var/logs/`.
- Giữ nguyên `src/`, `frontend/`, `desktop-agent/` để không làm vỡ runtime.

Đây là pha nên làm đầu tiên vì rủi ro thấp và hiệu quả cao.

### Pha 2. Chuẩn hóa backend/frontend/desktop-agent

- Đổi `frontend/` thành `apps/web/`.
- Đổi `src/eduvault` thành `apps/api/src/eduvault`.
- Đổi `desktop-agent/` thành `apps/desktop-agent/`.

Pha này cần cập nhật lại:

- Docker build context
- path trong CI
- path trong script deploy
- import path Python
- README và tài liệu vận hành

### Pha 3. Tách benchmark/evaluation khỏi script chung

- Tạo `packages/evaluation/`.
- Chuyển `scripts/run_chatbot_eval.py`, test case, report schema vào đây.
- Tách phần `cases`, `runner`, `reporters`, `outputs`.

Pha này giúp chatbot benchmark trở thành một module có thể phát triển độc lập.

### Pha 4. Tách test theo cấp độ

- Từ `tests/` hiện tại, chia sang `tests/integration`, `tests/security`, `tests/e2e`, `tests/fixtures`.
- Giảm tình trạng một thư mục test chứa nhiều mục đích lẫn nhau.

## Những thứ nên loại khỏi root càng sớm càng tốt

- `build/`
- `dist/`
- `tmp/`
- `reports/`
- `backend.log`
- `*.stderr.log`
- `*.stdout.log`
- `.env`
- `.env.demo`

## Quy ước bắt buộc để repo trông chuyên nghiệp

- Không commit secret thật.
- Không để artifact sinh ra khi chạy trong root.
- Không để nhiều script vận hành ngang hàng với source code chính.
- Không để benchmark output chung cấp với business code.
- Không để dữ liệu local DB hoặc file upload test trộn với source.

## Cấu trúc nên ưu tiên triển khai ngay

Nếu chỉ làm một đợt gọn, nên ưu tiên:

1. Tạo `infra/`, `config/`, `var/`.
2. Chuyển toàn bộ `docker-compose`, `nginx`, `cloudflared`, script deploy vào `infra/`.
3. Chuyển `reports`, `tmp`, log sang `var/`.
4. Chuyển `.env.*.example` vào `config/env/`.
5. Giữ nguyên `src`, `frontend`, `desktop-agent` cho đến khi có thời gian làm pha 2.

Đây là điểm cân bằng tốt nhất giữa tính chuyên nghiệp và rủi ro thay đổi.

## Kết luận

Repo EduVault hiện tại đã có đủ thành phần của một sản phẩm thật, nhưng đang bị "flat root" quá nhiều. Cấu trúc mục tiêu ở trên sẽ làm repo:

- dễ đọc hơn,
- dễ onboarding hơn,
- dễ CI/CD hơn,
- dễ audit bảo mật hơn,
- và quan trọng nhất là giảm lỗi vận hành do trộn source với artifact.

Tài liệu này là blueprint nên dùng trước khi bắt đầu đợt refactor cấu trúc repo.

