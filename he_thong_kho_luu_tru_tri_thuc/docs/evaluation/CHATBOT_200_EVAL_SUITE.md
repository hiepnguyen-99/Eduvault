# Chatbot 200-Case Evaluation Suite

Ngay cap nhat: 2026-07-04

## Muc tieu

Bo suite 200 case nay duoc chuyen sang khung danh gia 4 tang de phan tich chatbot theo cach de ra quyet dinh hon:

- `Level 1 - NLU`: chatbot co hieu dung nguoi dung khong
- `Level 2 - Knowledge`: chatbot co truy xuat va tra loi co can cu khong
- `Level 3 - Agent`: chatbot co lap ke hoach va hanh dong dung luc khong
- `Level 4 - Production`: chatbot co van hanh on dinh va quan sat duoc khong

File du lieu chinh:

- [tests/chatbot_eval_cases_200.csv](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc/tests/chatbot_eval_cases_200.csv)

File validator:

- [tests/test_chatbot_eval_suite.py](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc/tests/test_chatbot_eval_suite.py)

File runner:

- [tests/run_chatbot_eval.py](/D:/VIN_AI/FIX/C2-App-012/he_thong_kho_luu_tru_tri_thuc/tests/run_chatbot_eval.py)

## 1. Metric framework

### Level 1 - NLU

| Metric | Y nghia | Ghi chu |
|---|---|---|
| `intent_accuracy` | Dung y dinh nguoi dung | auto-check chinh |
| `context_understanding` | Hieu dung page context, follow-up, vai tro | proxy tu answer + context |
| `query_rewrite` | Co vao luong rewrite khi can retrieval | proxy tu pipeline |
| `clarification` | Biet hoi lai khi de bai thieu/yeu | proxy tu answer/clarification signal |

### Level 2 - Knowledge

| Metric | Y nghia | Ghi chu |
|---|---|---|
| `recall` | Lay du tai lieu/noi dung can thiet | proxy tu expected citations / must include |
| `precision` | Tai lieu lay ve co lien quan | proxy tu citation + anti-leak signals |
| `grounding` | Cau tra loi co duoc neo vao nguon | dua vao verification/citation |
| `citation` | Trich dan nguon dung va du | proxy tu citation presence + id match |
| `hallucination` | Khong noi vuot qua can cu | proxy tu must-not-include |

### Level 3 - Agent

| Metric | Y nghia | Ghi chu |
|---|---|---|
| `planning` | Tach va tong hop query nhieu muc tieu | proxy tu planner route / pipeline |
| `tool_calling` | Goi dung luong action / DB / system | proxy tu intent + pipeline + response |
| `reflection` | Tu sua, tu de xuat huong xu ly tot hon | proxy tu answer signals |
| `multi_step_reasoning` | Xu ly duoc bai toan can nhieu buoc | proxy tu pipeline / planner / multi-citation |
| `memory` | Su dung context va lich su hoi dap | ap dung manh cho multi-turn cases |

### Level 4 - Production

| Metric | Y nghia | Ghi chu |
|---|---|---|
| `latency` | Phan hoi nhanh | threshold-based |
| `cost` | Hieu qua chi phi | hien chua instrument day du trong runner |
| `reliability` | Tra loi on dinh, status tot, khong exception | auto-check |
| `security` | Khong lo du lieu / chong prompt injection | hop nhat RBAC + injection |
| `observability` | Co trace, pipeline, dau vet debug | auto-check |
| `scalability` | Kha nang mo rong | hien chua do duoc trong in-process eval |

## 2. Cau truc CSV

Moi dong trong CSV la mot test case.

Cot giu nguyen:

- `id`
- `category`
- `role`
- `code`
- `current_page`
- `question`
- `expected_intent`
- `citation_required`
- `metrics`
- `must_include_any`
- `must_not_include_any`
- `context_turns`
- `expected_citations_any`
- `prompt_attack`

Luu y:

- Runner van doc duoc tag metric cu de giu tuong thich voi bo case hien co.
- Trong luc chay, runner se normalize metric cu sang khung 4 level moi.
- Mot so metric nhu `cost` va `scalability` hien la metric cap framework, khong nhat thiet duoc gan tay tren tung case CSV.

## 3. Phan bo 200 case

Moi nhom co 10 case:

| Prefix | Nhom | Muc tieu chinh |
|---|---|---|
| `A` | Academic Retrieval | retrieval hoc lieu, topic search, recommendation |
| `B` | Grounded QA | hoi dap noi dung tai lieu co nguon |
| `C` | Metadata & Location | vi tri, owner, metadata |
| `D` | Upload & Storage | upload, indexing, OCR, chunking |
| `E` | Version & Provenance | version, rollback, provenance |
| `F` | Admin & Policy | workflow chinh sach va quyen |
| `G` | Head & Knowledge Transfer | gap analysis, handover |
| `H` | Onboarding | giang vien moi, checklist, uu tien doc |
| `I` | Operations & Analytics | telemetry, fallback, analytics |
| `J` | RBAC & Private Data | private docs, anti-leak |
| `K` | Prompt Injection | jailbreak, raw secret, ignore rules |
| `L` | Out-of-Scope | ngoai pham vi he thong |
| `M` | Planner Bundle | multi-goal retrieval/planning |
| `N` | Reflection | tu sua, hoi lai, bo sung |
| `O` | Tool / DB Action | action/tool/DB reasoning |
| `P` | Conversation Memory | follow-up, memory, page context |
| `Q` | Latency & Streaming | first response, concise-first |
| `R` | Citation Stress | citation quality, weak/strong evidence |
| `S` | Weak Evidence & Abstention | khong du can cu thi phai biet dung |
| `T` | Mixed End-to-End | planner + RBAC + retrieval + conversation |

## 4. Cach cham hien tai

### Auto-check da co trong runner

- intent dung/sai
- citation co/khong
- expected citation match
- must include / must not include
- trace / pipeline co mat
- status code / exception
- first token va end-to-end latency

### Proxy metric dang dung tam

- `context_understanding`
- `query_rewrite`
- `clarification`
- `planning`
- `reflection`
- `multi_step_reasoning`
- `memory`

### Chua instrument day du

- `cost`
- `scalability`

## 5. JSON/Markdown output

Moi lan chay, runner sinh:

- `reports/chatbot_eval_YYYYMMDD.json`
- `reports/chatbot_eval_YYYYMMDD.md`

Shape tong quat:

```json
{
  "framework": "4-level-chatbot-eval",
  "pass_rate": 0.71,
  "levels": {
    "level_1_nlu": {
      "score": 0.82,
      "metrics": {
        "intent_accuracy": 0.91,
        "context_understanding": 0.79,
        "query_rewrite": 0.83,
        "clarification": 0.55
      }
    }
  },
  "production_stats": {
    "first_token_ms_p50": 620,
    "end_to_end_latency_ms_p50": 2400
  }
}
```

## 6. Cach doc ket qua

- Neu `Level 1` thap: uu tien sua router, current page, follow-up, clarification.
- Neu `Level 2` thap: uu tien retrieval, citation, grounding.
- Neu `Level 3` thap: uu tien planner, tool path, memory, reflection.
- Neu `Level 4` thap: uu tien logging, trace, latency, hardening.

## 7. Ghi chu quan trong

- Report nay huu ich de thay regression va nhom loi chinh, nhung van chua phai human eval hoan toan.
- `first_token` van la gia tri approximate vi endpoint stream hien tai con buffer roi moi tach delta.
- `cost` va `scalability` can them instrumentation rieng neu muon dung lam KPI van hanh that.

