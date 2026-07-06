from __future__ import annotations

import re
from typing import Any


DOC_TYPE_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("de_cuong", ("de cuong", "syllabus", "outline")),
    ("bai_giang", ("bai giang", "giao an", "lecture note", "lecture notes")),
    ("slide", ("slide", "slides", "trinh chieu")),
    ("de_thi", ("de thi", "exam", "kiem tra", "quiz")),
    ("dap_an", ("dap an", "loi giai", "answer key")),
    ("lab", ("lab", "thuc hanh")),
    ("bai_tap", ("bai tap", "assignment")),
    ("tai_lieu_tham_khao", ("tham khao", "reference")),
)

DOC_TYPE_FILTER_VALUES = {
    "de_cuong": "de cuong",
    "bai_giang": "bai giang",
    "slide": "slide",
    "de_thi": "de thi",
    "dap_an": "dap an",
    "lab": "lab",
    "bai_tap": "bai tap",
    "tai_lieu_tham_khao": "tai lieu tham khao",
}

GENERIC_DOC_REQUEST_MARKERS = (
    "tai lieu",
    "de cuong",
    "slide",
    "bai giang",
    "de thi",
    "dap an",
    "lab",
    "bai tap",
    "tham khao",
    "file",
)

FOLLOWUP_PRONOUN_MARKERS = (
    "no",
    "cai nay",
    "tai lieu nay",
    "file nay",
    "tai lieu do",
    "cai do",
)

SUBJECT_PREFIXES = (
    "mon ",
    "cho mon ",
    "hoc phan ",
    "chu de ",
    "ve ",
    "day hoc ",
    "giang day ",
)

GENERIC_FILLER_TERMS = {
    "co", "nao", "khong", "cho", "toi", "minh", "ban", "hay", "voi", "giup", "xem",
    "tim", "kiem", "them", "thu", "trong", "kho", "nay", "do", "cai", "gi", "ve", "hien",
    "mon", "hoc", "phan", "chu", "de", "tailieu", "tai", "lieu", "cntt",
}

ANALYTICS_SCOPE_MARKERS = (
    "he thong",
    "toan he thong",
    "cua toi",
    "cua minh",
    "giang vien",
    "khoa",
    "bo mon",
)

ANALYTICS_TIME_MARKERS = (
    "hom nay",
    "thang nay",
    "nam nay",
    "tuan nay",
    "gan day",
    "quy nay",
)

PERMISSION_ACTION_MARKERS = (
    "xem",
    "mo quyen",
    "truy cap",
    "tai xuong",
    "download",
)

DOCUMENT_LOOKUP_SCOPE_MARKERS = (
    "chua duoc phan loai",
    "owner la",
    "chu so huu",
    "co owner",
    "theo owner",
)

ANALYTICS_SELF_SCOPED_MARKERS = (
    "ai da sua",
    "lich su chinh sua",
    "provenance thieu",
    "provenance khong ro",
    "dang nhap vao he thong",
    "rag fallback",
    "query rag.ask",
    "top action",
    "audit",
    "audit logs",
    "document.update",
    "query traces",
    "wrong_source",
    "query nao can goi db",
    "goi db thay vi tra loi mo ta",
    "tong hop tinh hinh chatbot",
    "tong hop chatbot",
)


def _compact(svc: Any, text: str) -> str:
    return " ".join(svc.strip_accents(text).casefold().split())


def _contains_followup_reference(compact: str) -> bool:
    for marker in FOLLOWUP_PRONOUN_MARKERS:
        if " " in marker:
            if marker in compact:
                return True
            continue
        if re.search(rf"\b{re.escape(marker)}\b", compact):
            return True
    return False


def _turn_question(entry: dict | str) -> str:
    if isinstance(entry, dict):
        return str(entry.get("question") or "").strip()
    if not entry.startswith("Q: "):
        return ""
    payload = entry[3:]
    for separator in ("->", "→", "â†’"):
        if separator in payload:
            return payload.split(separator, 1)[0].strip()
    return payload.strip()


def _turn_answer(entry: dict | str) -> str:
    if isinstance(entry, dict):
        return str(entry.get("answer") or "").strip()
    if not entry.startswith("Q: "):
        return ""
    payload = entry[3:]
    for separator in ("->", "→", "â†’"):
        if separator in payload:
            return payload.split(separator, 1)[1].strip()
    return ""


def _memory_questions(short_term: list[dict] | list[str] | None) -> list[str]:
    if not short_term:
        return []
    questions: list[str] = []
    for entry in reversed(short_term):
        question_part = _turn_question(entry)
        if question_part:
            questions.append(question_part)
    return questions


def extract_query_entities(svc: Any, question: str) -> dict:
    compact = _compact(svc, question)
    entities: dict[str, Any] = {
        "doc_types": [],
        "topic": "",
        "course_code": "",
        "owner_code": "",
        "generic_doc_request": any(marker in compact for marker in GENERIC_DOC_REQUEST_MARKERS),
        "followup_reference": _contains_followup_reference(compact),
    }

    for doc_type, patterns in DOC_TYPE_HINTS:
        if any(pattern in compact for pattern in patterns):
            entities["doc_types"].append(doc_type)

    course_match = re.search(r"\b([A-Z]{2,}[0-9]{2,}|\w{2,}-\d{2,})\b", question)
    if course_match:
        entities["course_code"] = course_match.group(1)

    owner_match = re.search(r"\b(GV\d+|TBM\d+|ADMIN)\b", question, re.IGNORECASE)
    if owner_match:
        entities["owner_code"] = owner_match.group(1).upper()

    topic = ""
    breaker_terms = {"gom", "bao", "bao_gom", "va", "kem", "cung", "de", "thi", "slide", "bai", "giang"}
    for prefix in SUBJECT_PREFIXES:
        idx = compact.find(prefix)
        if idx == -1:
            continue
        raw = compact[idx + len(prefix):]
        parts: list[str] = []
        for token in re.findall(r"\w+", raw, re.UNICODE):
            if token in breaker_terms and parts:
                break
            if token in GENERIC_FILLER_TERMS:
                continue
            parts.append(token)
        if parts:
            topic = " ".join(parts[:6]).strip()
            if topic:
                break
    if not topic:
        acronyms = []
        for token in re.findall(r"\b[A-Z]{2,}\b", question):
            folded = token.casefold()
            if folded not in {"api", "sql", "pdf", "docx"}:
                acronyms.append(token)
        if acronyms:
            topic = " ".join(acronyms[:2])
    entities["topic"] = topic
    return entities


def latest_memory_entry(short_term: list[dict] | list[str] | None) -> dict | str | None:
    if not short_term:
        return None
    for entry in reversed(short_term):
        if isinstance(entry, dict):
            if entry.get("question"):
                return entry
        elif entry.startswith("Q: "):
            return entry
    return None


def context_snapshot_from_memory(svc: Any, short_term: list[dict] | list[str] | None) -> dict:
    memory_questions = _memory_questions(short_term)
    previous_question = memory_questions[0] if memory_questions else ""
    previous_entry = latest_memory_entry(short_term)
    previous_answer = _turn_answer(previous_entry) if previous_entry else ""
    if isinstance(previous_entry, dict):
        entities = dict((previous_entry.get("entities") or {}).get("current") or {})
        entities.setdefault("doc_types", [])
        entities.setdefault("topic", "")
        entities.setdefault("course_code", "")
        entities.setdefault("owner_code", "")
        if previous_question:
            inferred_entities = extract_query_entities(svc, previous_question)
            if not entities.get("topic") and inferred_entities.get("topic"):
                entities["topic"] = inferred_entities["topic"]
            if not entities.get("course_code") and inferred_entities.get("course_code"):
                entities["course_code"] = inferred_entities["course_code"]
            if not entities.get("owner_code") and inferred_entities.get("owner_code"):
                entities["owner_code"] = inferred_entities["owner_code"]
            if not entities.get("doc_types") and inferred_entities.get("doc_types"):
                entities["doc_types"] = inferred_entities["doc_types"]
    else:
        entities = extract_query_entities(svc, previous_question)
    for older_question in memory_questions[1:4]:
        older_entities = extract_query_entities(svc, older_question)
        if not entities.get("topic") and older_entities.get("topic"):
            entities["topic"] = older_entities["topic"]
        if not entities.get("course_code") and older_entities.get("course_code"):
            entities["course_code"] = older_entities["course_code"]
        if not entities.get("owner_code") and older_entities.get("owner_code"):
            entities["owner_code"] = older_entities["owner_code"]
        if not entities.get("doc_types") and older_entities.get("doc_types"):
            entities["doc_types"] = older_entities["doc_types"]
        if entities.get("topic") and entities.get("course_code") and entities.get("doc_types"):
            break

    return {
        "previous_question": previous_question,
        "previous_answer": previous_answer,
        "previous_intent": previous_entry.get("intent", "") if isinstance(previous_entry, dict) else "",
        "previous_citations": list(previous_entry.get("citations") or []) if isinstance(previous_entry, dict) else [],
        "previous_document_title": (
            str((previous_entry.get("citations") or [{}])[0].get("title") or "").strip()
            if isinstance(previous_entry, dict) and previous_entry.get("citations")
            else ""
        ),
        "entities": entities,
    }


def resolve_followup_mode(
    svc: Any,
    question: str,
    previous_result: dict | None = None,
    active_task: dict | None = None,
) -> str:
    compact = _compact(svc, question)
    previous_result = dict(previous_result or {})
    active_task = dict(active_task or {})
    previous_answer = str(previous_result.get("answer") or "").strip()
    previous_question = str(previous_result.get("question") or active_task.get("question") or "").strip()

    rewrite_markers = (
        "viet lai",
        "viet lai ngan gon",
        "noi ngan gon",
        "ngan gon thoi",
        "tom tat no",
        "tom tat ngan hon",
        "ngan hon",
        "rut gon",
        "dung tra loi bang bullet",
        "khong bullet",
    )
    compare_markers = (
        "so voi ket qua truoc",
        "so sanh voi ket qua truoc",
        "so sanh voi cau tra loi truoc",
        "khac gi so voi",
        "khac gi voi lan truoc",
        "doi chieu voi ket qua truoc",
    )
    continue_markers = (
        "tiep tuc",
        "lam tiep",
        "tim them",
        "tim tiep",
        "cung chu de",
        "tai lieu nay thi sao",
        "file nay thi sao",
        "cai nay thi sao",
        "no chi noi ve",
        "cai nay co nghiem trong khong",
    )

    if previous_answer and any(marker in compact for marker in rewrite_markers):
        return "rewrite_previous_answer"
    if previous_answer and any(marker in compact for marker in compare_markers):
        return "compare_with_previous_result"
    if previous_question and any(marker in compact for marker in continue_markers):
        return "continue_previous_task"
    return ""


def build_retrieval_context(current_entities: dict, memory_entities: dict, explicit_filters: dict | None) -> dict:
    merged_entities = {
        "doc_types": current_entities.get("doc_types") or memory_entities.get("doc_types") or [],
        "topic": current_entities.get("topic") or memory_entities.get("topic") or "",
        "course_code": current_entities.get("course_code") or memory_entities.get("course_code") or "",
        "owner_code": current_entities.get("owner_code") or memory_entities.get("owner_code") or "",
    }

    contextual_filters: dict[str, str] = {}
    contextual_trace_filters: dict[str, str] = {}
    if len(current_entities.get("doc_types") or []) == 1:
        doc_type_key = current_entities["doc_types"][0]
        contextual_trace_filters["doc_type"] = DOC_TYPE_FILTER_VALUES.get(doc_type_key, doc_type_key.replace("_", " "))
    if current_entities.get("owner_code"):
        contextual_filters["owner_code"] = current_entities["owner_code"]
        contextual_trace_filters["owner_code"] = current_entities["owner_code"]

    hint_terms: list[str] = []
    for doc_type_key in merged_entities["doc_types"]:
        hint_terms.append(DOC_TYPE_FILTER_VALUES.get(doc_type_key, doc_type_key.replace("_", " ")))
    if merged_entities["topic"]:
        hint_terms.append(merged_entities["topic"])
    if merged_entities["course_code"]:
        hint_terms.append(merged_entities["course_code"])
    if merged_entities["owner_code"]:
        hint_terms.append(merged_entities["owner_code"])

    deduped_terms: list[str] = []
    seen: set[str] = set()
    for item in hint_terms:
        folded = item.casefold().strip()
        if not folded or folded in seen:
            continue
        seen.add(folded)
        deduped_terms.append(item)

    effective_filters = {**contextual_filters, **(explicit_filters or {})}
    trace_filters = {**contextual_trace_filters, **(explicit_filters or {})}
    return {
        "effective_filters": effective_filters,
        "trace_filters": trace_filters,
        "hint_terms": deduped_terms,
        "merged_entities": merged_entities,
    }


def resolve_contextual_question(
    svc: Any,
    question: str,
    current_page: str | None,
    short_term: list[dict] | list[str] | None,
    *,
    page_context: dict | None = None,
    previous_result: dict | None = None,
    active_task: dict | None = None,
) -> dict:
    current_entities = extract_query_entities(svc, question)
    memory_snapshot = context_snapshot_from_memory(svc, short_term)
    previous_question = memory_snapshot["previous_question"]
    previous_entities = memory_snapshot["entities"]
    page_context = dict(page_context or {})
    previous_result = dict(previous_result or {})
    active_task = dict(active_task or {})
    compact = _compact(svc, question)
    followup_mode = resolve_followup_mode(svc, question, previous_result, active_task)

    resolved_parts = [question.strip()]
    resolution_source = ""

    if current_entities["followup_reference"] and previous_question:
        if previous_entities.get("topic"):
            resolved_parts.append(f"trong ngu canh chu de {previous_entities['topic']}")
            resolution_source = "memory_topic"
        elif previous_entities.get("course_code"):
            resolved_parts.append(f"trong ngu canh hoc phan {previous_entities['course_code']}")
            resolution_source = "memory_course"
        elif previous_question:
            resolved_parts.append(f"theo cau hoi truoc: {previous_question}")
            resolution_source = "memory_question"

    if followup_mode == "continue_previous_task":
        task_question = str(active_task.get("question") or previous_result.get("question") or "").strip()
        task_topic = str(previous_result.get("topic") or previous_entities.get("topic") or page_context.get("focus_topic") or "").strip()
        doc_title = str(previous_result.get("document_title") or page_context.get("document_title") or memory_snapshot.get("previous_document_title") or "").strip()
        if task_question and task_question not in resolved_parts:
            resolved_parts.append(f"tiep noi tu yeu cau truoc: {task_question}")
            resolution_source = resolution_source or "active_task"
        if task_topic:
            resolved_parts.append(f"trong ngu canh chu de {task_topic}")
            resolution_source = resolution_source or "previous_result_topic"
        elif doc_title:
            resolved_parts.append(f"trong ngu canh tai lieu {doc_title}")
            resolution_source = resolution_source or "page_document"

    if any(marker in compact for marker in ("tim them tai lieu", "tim them file", "tim them", "tim tiep", "cung chu de")):
        if previous_question and previous_question not in resolved_parts:
            resolved_parts.append(f"theo cau hoi truoc: {previous_question}")
            resolution_source = resolution_source or "memory_question"

    if not current_entities.get("topic") and previous_entities.get("topic"):
        if any(marker in compact for marker in ("co slide", "co de cuong", "co bai giang", "co de thi", "co tai lieu")):
            resolved_parts.append(f"cho chu de {previous_entities['topic']}")
            resolution_source = resolution_source or "memory_topic"

    if not current_entities.get("course_code") and previous_entities.get("course_code"):
        if current_entities["generic_doc_request"]:
            resolved_parts.append(f"cho hoc phan {previous_entities['course_code']}")
            resolution_source = resolution_source or "memory_course"

    if current_page == "/operations" and any(
        marker in compact for marker in ("co nghiem trong khong", "xu ly sao", "uu tien gi", "canh bao nay")
    ):
        resolved_parts.append("trong ngu canh van hanh he thong")
        resolution_source = resolution_source or "page_operations"

    if not current_entities.get("topic") and page_context.get("focus_topic"):
        if followup_mode in {"continue_previous_task", "compare_with_previous_result"}:
            resolved_parts.append(f"cho chu de {page_context['focus_topic']}")
            resolution_source = resolution_source or "page_focus_topic"

    resolved_query = " ".join(part for part in resolved_parts if part).strip()
    return {
        "resolved_query": resolved_query,
        "current_entities": current_entities,
        "memory_snapshot": memory_snapshot,
        "resolution_source": resolution_source,
        "followup_mode": followup_mode,
    }


def clarification_reason(
    svc: Any,
    question: str,
    current_page: str | None,
    short_term: list[dict] | list[str] | None,
) -> str | None:
    context_entities = {
        "current": extract_query_entities(svc, question),
        "memory": context_snapshot_from_memory(svc, short_term)["entities"],
    }
    plan = build_clarification_plan(
        svc,
        question,
        current_page,
        context_entities,
        short_term,
        None,
    )
    return plan["reason"]


def resolve_required_slots(intent_label: str, current_page: str | None = None) -> list[str]:
    if intent_label in {"document_lookup", "topic_search", "document_recommendation"}:
        return ["topic_or_course"]
    if intent_label == "analytics_query":
        return ["analytics_scope"]
    if intent_label == "version_management":
        return [] if current_page == "/documents/doc-id" else ["document_reference"]
    if intent_label == "permission_request":
        return ["resource_reference", "permission_action"]
    return []


def build_clarification_plan(
    svc: Any,
    question: str,
    current_page: str | None,
    context_entities: dict | None,
    short_term: list[dict] | list[str] | None,
    intent_meta: dict | None,
) -> dict:
    current_entities = dict((context_entities or {}).get("current") or {})
    memory_entities = dict((context_entities or {}).get("memory") or {})
    merged_entities = {
        "doc_types": current_entities.get("doc_types") or memory_entities.get("doc_types") or [],
        "topic": current_entities.get("topic") or memory_entities.get("topic") or "",
        "course_code": current_entities.get("course_code") or memory_entities.get("course_code") or "",
        "owner_code": current_entities.get("owner_code") or memory_entities.get("owner_code") or "",
        "document_id": current_entities.get("document_id") or memory_entities.get("document_id") or "",
    }
    compact = _compact(svc, question)
    previous_question = latest_memory_entry(short_term)
    previous_question_text = _turn_question(previous_question) if previous_question else ""
    page_hint = (current_page or "").casefold()
    inferred_intent = intent_meta or svc.infer_contextual_intent(question, current_page=current_page, short_term=short_term) or svc.classify_query_intent(question)
    intent_label = str(inferred_intent.get("label") or "question_answer")
    if (
        intent_label == "permission_request"
        and current_entities.get("generic_doc_request")
        and not merged_entities.get("document_id")
    ):
        intent_label = "document_lookup"
        inferred_intent = {**inferred_intent, "label": intent_label}
    required_slots = resolve_required_slots(intent_label, current_page=current_page)
    missing_slots: list[str] = []
    reason: str | None = None

    if "document_reference" in required_slots:
        has_resolved_reference = bool(
            merged_entities.get("document_id")
            or (
                intent_label == "version_management"
                and (
                    merged_entities.get("topic")
                    or merged_entities.get("course_code")
                    or merged_entities.get("doc_types")
                )
            )
        )
        if not has_resolved_reference and not previous_question_text and page_hint != "/documents/doc-id":
            missing_slots.append("document_reference")
            reason = "missing_document_reference"

    if not reason and svc.is_ambiguous_reference_query(question):
        has_reference_context = bool(previous_question_text or page_hint == "/documents/doc-id" or merged_entities.get("document_id"))
        if not has_reference_context:
            missing_slots.append("reference_context")
            reason = "missing_reference_context"

    if not reason and "topic_or_course" in required_slots:
        has_lookup_scope = any(token in compact for token in DOCUMENT_LOOKUP_SCOPE_MARKERS)
        if (
            not has_lookup_scope
            and not merged_entities.get("topic")
            and not merged_entities.get("course_code")
            and not merged_entities.get("document_id")
        ):
            missing_slots.append("topic_or_course")
            reason = "missing_topic_for_document_request"

    if not reason and "analytics_scope" in required_slots:
        has_scope = (
            any(token in compact for token in ANALYTICS_SCOPE_MARKERS)
            or any(token in compact for token in ANALYTICS_SELF_SCOPED_MARKERS)
            or page_hint in {"/operations", "/system", "/admin", "/audit-logs", "/reports", "/versions"}
        )
        has_time_window = any(token in compact for token in ANALYTICS_TIME_MARKERS)
        if not has_scope and not has_time_window:
            missing_slots.append("analytics_scope")
            reason = "missing_analytics_scope"

    if not reason and "resource_reference" in required_slots:
        if not merged_entities.get("document_id") and not merged_entities.get("topic") and not merged_entities.get("course_code"):
            missing_slots.append("resource_reference")
            reason = "missing_resource_reference"

    if not reason and "permission_action" in required_slots:
        if not any(token in compact for token in PERMISSION_ACTION_MARKERS):
            missing_slots.append("permission_action")
            reason = "missing_permission_action"

    return {
        "need_clarification": bool(reason),
        "reason": reason,
        "intent_label": intent_label,
        "missing_slots": missing_slots,
        "required_slots": required_slots,
        "entities": merged_entities,
    }


def build_clarification_answer(reason: str, current_page: str | None = None, missing_slots: list[str] | None = None) -> str:
    if reason == "missing_reference_context":
        place_hint = (
            "trang t\u00e0i li\u1ec7u c\u1ee5 th\u1ec3"
            if not current_page or current_page == "/assistant"
            else current_page
        )
        return (
            "M\u00ecnh ch\u01b0a \u0111\u1ee7 ng\u1eef c\u1ea3nh \u0111\u1ec3 bi\u1ebft b\u1ea1n \u0111ang ch\u1ec9 t\u00e0i li\u1ec7u hay c\u00e2u tr\u1ea3 l\u1eddi n\u00e0o. "
            f"B\u1ea1n n\u00f3i r\u00f5 t\u00ean t\u00e0i li\u1ec7u, ch\u1ee7 \u0111\u1ec1, ho\u1eb7c m\u1edf {place_hint} r\u1ed3i h\u1ecfi l\u1ea1i gi\u00fap m\u00ecnh nh\u00e9."
        )
    if reason == "missing_topic_for_document_request":
        return (
            "M\u00ecnh c\u1ea7n b\u1ea1n n\u00f3i r\u00f5 **m\u00f4n h\u1ecdc, h\u1ecdc ph\u1ea7n ho\u1eb7c ch\u1ee7 \u0111\u1ec1** tr\u01b0\u1edbc \u0111\u00e3. "
            "V\u00ed d\u1ee5: `\u0111\u1ec1 c\u01b0\u01a1ng m\u00f4n Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o`, `slide m\u00f4n NLP`, ho\u1eb7c `t\u00e0i li\u1ec7u cho h\u1ecdc ph\u1ea7n C\u01a1 s\u1edf d\u1eef li\u1ec7u`."
        )
    if reason == "missing_analytics_scope":
        return (
            "B\u1ea1n mu\u1ed1n th\u1ed1ng k\u00ea theo ph\u1ea1m vi n\u00e0o? "
            "M\u00ecnh c\u00f3 th\u1ec3 l\u00e0m theo **c\u1ee7a b\u1ea1n**, **to\u00e0n h\u1ec7 th\u1ed1ng**, ho\u1eb7c theo m\u1ed1c th\u1eddi gian nh\u01b0 **h\u00f4m nay / th\u00e1ng n\u00e0y / n\u0103m nay**."
        )
    if reason == "missing_document_reference":
        return (
            "M\u00ecnh c\u1ea7n b\u1ea1n n\u00f3i r\u00f5 **t\u00e0i li\u1ec7u n\u00e0o** tr\u01b0\u1edbc \u0111\u00e3. "
            "B\u1ea1n c\u00f3 th\u1ec3 n\u00eau t\u00ean t\u00e0i li\u1ec7u, ch\u1ee7 \u0111\u1ec1, ho\u1eb7c m\u1edf trang chi ti\u1ebft t\u00e0i li\u1ec7u r\u1ed3i h\u1ecfi l\u1ea1i."
        )
    if reason == "missing_resource_reference":
        return (
            "B\u1ea1n mu\u1ed1n xin quy\u1ec1n cho **t\u00e0i li\u1ec7u hay ch\u1ee7 \u0111\u1ec1 n\u00e0o**? "
            "M\u00ecnh c\u1ea7n t\u00ean t\u00e0i li\u1ec7u, m\u00f4n h\u1ecdc, ho\u1eb7c h\u1ecdc ph\u1ea7n c\u1ee5 th\u1ec3 \u0111\u1ec3 h\u01b0\u1edbng d\u1eabn \u0111\u00fang."
        )
    if reason == "missing_permission_action":
        return (
            "B\u1ea1n c\u1ea7n quy\u1ec1n theo ki\u1ec3u n\u00e0o? "
            "V\u00ed d\u1ee5: **xem**, **t\u1ea3i xu\u1ed1ng**, ho\u1eb7c **m\u1edf quy\u1ec1n truy c\u1eadp**."
        )
    return "M\u00ecnh c\u1ea7n th\u00eam m\u1ed9t ch\u00fat th\u00f4ng tin \u0111\u1ec3 tr\u1ea3 l\u1eddi ch\u00ednh x\u00e1c h\u01a1n."
