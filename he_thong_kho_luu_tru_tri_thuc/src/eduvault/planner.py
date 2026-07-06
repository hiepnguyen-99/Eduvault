from __future__ import annotations

import json
import re
import uuid
from typing import Any

from . import rag_pipeline

_DOC_TYPE_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("De cuong", ("de cuong", "syllabus", "outline")),
    ("Bai giang", ("bai giang", "giao an", "lecture note", "lecture notes")),
    ("Slide", ("slide", "slides", "trinh chieu")),
    ("De thi", ("de thi", "exam", "kiem tra", "quiz")),
    ("Tai lieu tham khao", ("tham khao", "reference", "tai lieu tham khao")),
    ("Hoc lieu", ("hoc lieu", "tai lieu hoc tap", "material")),
)

_PLANNER_TRIGGERS = (
    "chuan bi day",
    "chuan bi giang",
    "tron bo",
    "day du",
    "ke hoach day",
    "phuc vu giang day",
    "phan tach yeu cau",
    "de xuat file can upload them",
    "bo tai lieu can cho",
    "tong hop bo tai lieu",
    "goi tai lieu",
    "hoc nhanh",
    "buoi dau tien",
    "hop chuyen giao",
    "neu thieu",
)

_PLANNER_CONNECTORS = ("gom", "bao gom", "va", "kem", "cung voi")

_DEFAULT_DOC_TYPES = ["De cuong", "Bai giang", "Slide", "De thi", "Tai lieu tham khao"]
_WORKFLOW_GUIDE_TRIGGERS = ("quy trinh", "theo tung buoc", "debug", "workflow")
_ACTION_PLAN_TRIGGERS = ("ke hoach", "3 buoc", "buoc tiep theo", "xu ly", "plan bo sung")


def _compact(svc: Any, text: str) -> str:
    return " ".join(svc.strip_accents(text).casefold().split())


def extract_requested_doc_types(svc: Any, question: str) -> list[str]:
    compact = _compact(svc, question)
    selected: list[str] = []
    for doc_type, patterns in _DOC_TYPE_PATTERNS:
        if any(pattern in compact for pattern in patterns):
            selected.append(doc_type)
    return selected


def detect_planner_mode(svc: Any, question: str, intent_meta: dict) -> str | None:
    compact = _compact(svc, question)
    base_label = intent_meta.get("label", "")
    requested_doc_types = extract_requested_doc_types(svc, question)
    has_trigger = any(trigger in compact for trigger in _PLANNER_TRIGGERS)
    has_bundle_shape = len(requested_doc_types) >= 2 and any(connector in compact for connector in _PLANNER_CONNECTORS)
    has_material_request = any(
        token in compact
        for token in ("bo tai lieu", "goi tai lieu", "tong hop tai lieu", "lap danh sach tai lieu")
    )
    has_handover_bundle = (
        "tai lieu" in compact
        and any(token in compact for token in ("ban giao", "tiep quan", "hop chuyen giao"))
        and any(token in compact for token in ("tong hop", "lap danh sach", "goi", "bo", "can cho"))
    )
    has_workflow_trigger = any(token in compact for token in _WORKFLOW_GUIDE_TRIGGERS) and any(
        token in compact for token in ("retrieval", "rerank", "citation", "rag", "grounding")
    )
    has_action_trigger = base_label == "knowledge_gap_analysis" or any(
        token in compact for token in _ACTION_PLAN_TRIGGERS
    )
    has_inventory_prompt = any(
        phrase in compact for phrase in ("trong kho hien co gi", "co nhung tai lieu nao", "trong kho co tai lieu nao")
    )
    if base_label in {"system_status", "policy_management", "analytics_query", "out_of_scope", "permission_request"}:
        return None
    if has_inventory_prompt and not any(token in compact for token in ("tong hop", "lap", "chuan bi", "ke hoach", "phan tach")):
        return None
    if has_inventory_prompt and not has_bundle_shape and not has_material_request:
        return None
    if has_workflow_trigger:
        return "workflow_guide"
    if (
        has_action_trigger
        and any(token in compact for token in ("thieu", "bo sung", "xu ly", "ke hoach"))
        and not (has_material_request or has_handover_bundle or "bo tai lieu" in compact or "goi tai lieu" in compact)
    ):
        return "action_plan"
    if base_label == "teaching_planner" or has_trigger or has_bundle_shape or has_material_request or has_handover_bundle:
        return "material_bundle"
    return None


def should_route_to_planner(svc: Any, question: str, intent_meta: dict) -> bool:
    if getattr(svc, "classify_sensitive_private_request", None):
        if svc.classify_sensitive_private_request(question):
            return False
    planner_mode = detect_planner_mode(svc, question, intent_meta)
    if intent_meta.get("label", "") == "upload_help" and planner_mode not in {"material_bundle", "workflow_guide"}:
        return False
    return planner_mode is not None


def build_planner_intent(svc: Any, question: str, intent_meta: dict) -> dict:
    base = dict(intent_meta)
    planner_mode = detect_planner_mode(svc, question, intent_meta) or "material_bundle"
    base_label = intent_meta.get("label", "document_recommendation")
    final_label = "teaching_planner"
    if planner_mode == "action_plan" and base_label == "knowledge_gap_analysis":
        final_label = "knowledge_gap_analysis"
    base["base_label"] = base_label
    base["planner_mode"] = planner_mode
    base["label"] = final_label
    base["confidence"] = max(float(intent_meta.get("confidence", 0.75)), 0.9)
    return base


def _extract_topic_hint(svc: Any, text: str) -> str:
    compact = _compact(svc, text)
    if re.search(r"\bai101\b", compact, re.IGNORECASE):
        return "tri tue nhan tao ai"
    if re.search(r"\brag\b", compact, re.IGNORECASE):
        return "rag"
    if re.search(r"\bai\b", compact, re.IGNORECASE):
        return "tri tue nhan tao ai"
    if re.search(r"\bmon ai\b", compact, re.IGNORECASE) or "tri tue nhan tao" in compact:
        return "tri tue nhan tao"
    course_code_match = re.search(r"\b([a-z]{2,}[0-9]{2,})\b", compact, re.IGNORECASE)
    if course_code_match:
        code = course_code_match.group(1).strip()
        if code.startswith("ai"):
            return "tri tue nhan tao ai"
        return code
    patterns = (
        r"(?:mon|hoc phan|chu de|chuyen nganh)\s+([a-z0-9\s]{4,60})",
        r"(?:ve|cho)\s+([a-z0-9\s]{4,60})",
        r"(?:tiep quan|ban giao)\s+([a-z0-9\s]{3,40})",
    )
    for pattern in patterns:
        match = re.search(pattern, compact, re.IGNORECASE)
        if match:
            value = match.group(1).strip(" .,:;")
            if value:
                return value
    return ""


def parse_constraints(svc: Any, question: str, role: str) -> dict[str, Any]:
    compact = _compact(svc, question)
    constraints = {
        "public_only": any(token in compact for token in ("public", "cong khai", "khong dung private", "khong dung tai lieu private")),
        "include_missing": True,
        "need_summary": any(token in compact for token in ("tom tat", "tong hop", "phan tach", "ke hoach")),
        "need_upload_suggestions": any(token in compact for token in ("upload them", "bo sung", "con thieu", "can upload")),
        "exclude_doc_types": [],
        "role": role,
    }
    if any(token in compact for token in ("khong can de thi", "bo qua de thi")):
        constraints["exclude_doc_types"].append("De thi")
    if any(token in compact for token in ("khong can slide", "bo qua slide")):
        constraints["exclude_doc_types"].append("Slide")
    return constraints


def build_task_graph(svc: Any, retrieval_query: str, role: str, intent_meta: dict) -> dict[str, Any]:
    planner_mode = intent_meta.get("planner_mode") or detect_planner_mode(svc, retrieval_query, intent_meta) or "material_bundle"
    compact = _compact(svc, retrieval_query)
    requested_doc_types = extract_requested_doc_types(svc, retrieval_query)
    explicit_request = bool(requested_doc_types)
    if planner_mode == "material_bundle" and len(requested_doc_types) <= 1 and any(
        token in compact for token in ("bo tai lieu", "goi tai lieu", "tong hop tai lieu")
    ):
        requested_doc_types = list(dict.fromkeys([*requested_doc_types, *_DEFAULT_DOC_TYPES]))
    if not requested_doc_types:
        if planner_mode == "workflow_guide":
            requested_doc_types = ["Hoc lieu", "Tai lieu tham khao"]
        else:
            requested_doc_types = list(_DEFAULT_DOC_TYPES)
    constraints = parse_constraints(svc, retrieval_query, role)
    requested_doc_types = [
        doc_type for doc_type in requested_doc_types
        if doc_type not in set(constraints["exclude_doc_types"])
    ] or [doc_type for doc_type in _DEFAULT_DOC_TYPES if doc_type not in set(constraints["exclude_doc_types"])]
    topic_hint = _extract_topic_hint(svc, retrieval_query)
    step_count = 3 if any(token in compact for token in ("3 buoc", "ba buoc")) else 0
    seen: set[str] = set()
    subtasks: list[dict[str, Any]] = []
    for doc_type in requested_doc_types:
        if doc_type in seen:
            continue
        seen.add(doc_type)
        focused_query = f"{topic_hint} {doc_type}".strip() if topic_hint else f"{retrieval_query} {doc_type}".strip()
        subtasks.append(
            {
                "id": f"subtask-{uuid.uuid4().hex[:10]}",
                "doc_type": doc_type,
                "query": focused_query,
                "goal": f"Tim tai lieu loai {doc_type}",
                "explicit": explicit_request,
                "status": "pending",
                "topic_hint": topic_hint,
            }
        )
    return {
        "task_type": "teaching_planner",
        "planner_mode": planner_mode,
        "goal": retrieval_query,
        "base_intent": intent_meta.get("base_label") or intent_meta.get("label", "document_recommendation"),
        "constraints": constraints,
        "topic_hint": topic_hint,
        "step_count": step_count,
        "need_private_warning": "private" in compact,
        "need_next_steps": any(token in compact for token in ("buoc tiep theo", "bo sung", "neu thieu", "con thieu")),
        "subtasks": subtasks,
    }


def _subtask_filters(filters: dict | None, constraints: dict[str, Any]) -> dict | None:
    merged = dict(filters or {})
    if constraints.get("public_only"):
        merged["visibility"] = "public"
    return merged or None


def _topic_fit_score(svc: Any, topic_hint: str, question: str, document: dict, content: str) -> float:
    if not topic_hint:
        return 1.0
    compact_hint = _compact(svc, topic_hint)
    haystack = _compact(
        svc,
        " ".join(
            filter(
                None,
                [
                    str(document.get("title", "")),
                    str(document.get("topic", "")),
                    str(document.get("folder_path", "")),
                    content[:400],
                ],
            )
        ),
    )
    hint_tokens = [token for token in compact_hint.split() if len(token) >= 2]
    if not hint_tokens:
        return 1.0
    matched_tokens = sum(1 for token in hint_tokens if token in haystack)
    overlap = svc.match_overlap_count(question, document, content)
    metadata_bonus = 1 if compact_hint in haystack else 0
    ai_alias_bonus = 0.0
    if any(token in compact_hint for token in ("tri tue nhan tao", " ai")) and any(
        token in haystack for token in ("tri tue nhan tao", " ai", "ai101")
    ):
        ai_alias_bonus = 2.0
    return matched_tokens + overlap * 0.4 + metadata_bonus * 1.5 + ai_alias_bonus


def _build_subtask_evidence_bundle(
    svc: Any,
    query: str,
    matches: list[tuple[float, dict, str]],
    config: dict,
) -> dict[str, Any]:
    return rag_pipeline.verify_evidence_bundle(svc, query, matches, config)


def _compress_snippet(content: str, limit: int = 140) -> str:
    compact = re.sub(r"\s+", " ", content.strip())
    return compact[:limit].rstrip(" ,.;:")


def execute_subtasks(
    svc: Any,
    db: Any,
    user: dict,
    task_graph: dict[str, Any],
    filters: dict | None,
) -> dict[str, Any]:
    config = svc.search_policy(db)
    grouped_matches: list[dict[str, Any]] = []
    best_by_doc: dict[str, dict[str, Any]] = {}
    retrieved_trace: list[dict[str, Any]] = []
    reranked_trace: list[dict[str, Any]] = []
    planner_steps: list[dict[str, Any]] = []
    rewritten_queries: list[str] = []

    for item in task_graph["subtasks"]:
        subtask_filters = _subtask_filters(filters, task_graph["constraints"])
        planner_mode = task_graph.get("planner_mode", "material_bundle")
        candidates, _sub_config, rewritten_query, expanded_terms, sub_queries, query_plan = rag_pipeline.run_retrieval(
            svc, db, user, item["query"], subtask_filters
        )
        exact_type_candidates = [
            (score, doc, content)
            for score, doc, content in candidates
            if _same_doc_type(item["doc_type"], doc.get("doc_type", ""))
            and _topic_fit_score(svc, item.get("topic_hint", ""), item["query"], doc, content) >= 1.0
        ]

        matches: list[tuple[float, dict, str]]
        rerank_trace: dict[str, Any]
        retry_used = False
        if exact_type_candidates:
            ranked_exact = sorted(exact_type_candidates, key=lambda row: row[0], reverse=True)
            matches = ranked_exact[:3]
            rerank_trace = {
                "retrieved": [
                    {"doc_id": doc.get("id"), "title": doc.get("title"), "score": round(score, 4)}
                    for score, doc, _content in ranked_exact[:4]
                ],
                "reranked": [
                    {"doc_id": doc.get("id"), "title": doc.get("title"), "score": round(score, 4)}
                    for score, doc, _content in matches[:2]
                ],
            }
        else:
            matches = []
            rerank_trace = {"retrieved": [], "reranked": []}
            if planner_mode != "material_bundle":
                sub_intent = {**svc._query_intent(item["query"]), **svc.classify_query_intent(item["query"])}
                matches, rerank_trace = rag_pipeline.run_rerank(
                    svc,
                    candidates,
                    sub_intent,
                    config,
                    item["query"],
                )
                if not matches and item.get("topic_hint"):
                    retry_query = f"{item['topic_hint']} {item['doc_type']}"
                    retry_candidates, _retry_config, retry_rewritten_query, retry_expanded_terms, retry_sub_queries, retry_query_plan = rag_pipeline.run_retrieval(
                        svc, db, user, retry_query, subtask_filters
                    )
                    retry_matches, retry_rerank_trace = rag_pipeline.run_rerank(
                        svc,
                        retry_candidates,
                        sub_intent,
                        config,
                        retry_query,
                    )
                    if retry_matches:
                        matches = retry_matches
                        rerank_trace = retry_rerank_trace
                        rewritten_query = retry_rewritten_query
                        expanded_terms = retry_expanded_terms
                        sub_queries = retry_sub_queries
                        query_plan = retry_query_plan
                        candidates = retry_candidates
                        retry_used = True
            if not matches and item.get("topic_hint"):
                focused_query = f"{item['topic_hint']} {item['doc_type']}".strip()
                focused_candidates, _focused_config, focused_rewritten_query, focused_expanded_terms, focused_sub_queries, focused_query_plan = rag_pipeline.run_retrieval(
                    svc, db, user, focused_query, subtask_filters
                )
                focused_matches = [
                    (score, doc, content)
                    for score, doc, content in focused_candidates
                    if _same_doc_type(item["doc_type"], doc.get("doc_type", ""))
                ]
                if focused_matches:
                    ranked_focused = sorted(focused_matches, key=lambda row: row[0], reverse=True)
                    matches = ranked_focused[:3]
                    rerank_trace = {
                        "retrieved": [
                            {"doc_id": doc.get("id"), "title": doc.get("title"), "score": round(score, 4)}
                            for score, doc, _content in ranked_focused[:4]
                        ],
                        "reranked": [
                            {"doc_id": doc.get("id"), "title": doc.get("title"), "score": round(score, 4)}
                            for score, doc, _content in matches[:2]
                        ],
                    }
                    rewritten_query = focused_rewritten_query
                    expanded_terms = focused_expanded_terms
                    sub_queries = focused_sub_queries
                    query_plan = focused_query_plan
                    candidates = focused_candidates
                    retry_used = True

        evidence_bundle = _build_subtask_evidence_bundle(svc, item["query"], matches[:3], config)
        top_matches = evidence_bundle.get("approved_matches", [])[:2]
        item["status"] = "done" if top_matches else "missing"
        item["retry_used"] = retry_used
        grouped_matches.append(
            {
                "doc_type": item["doc_type"],
                "matches": top_matches,
                "evidence_bundle": evidence_bundle,
                "query": item["query"],
            }
        )
        rewritten_queries.append(rewritten_query)
        retrieved_trace.extend(
            {
                "subquery": item["query"],
                "doc_id": doc.get("id"),
                "title": doc.get("title"),
                "score": round(score, 4),
            }
            for score, doc, _content in candidates[:4]
        )
        reranked_trace.extend(
            {
                "subquery": item["query"],
                "doc_id": doc.get("id"),
                "title": doc.get("title"),
                "score": round(score, 4),
                "doc_type": item["doc_type"],
            }
            for score, doc, _content in top_matches
        )
        planner_steps.append(
            {
                "subtask_id": item["id"],
                "doc_type": item["doc_type"],
                "goal": item["goal"],
                "expanded_terms": expanded_terms,
                "sub_queries": sub_queries,
                "query_plan": query_plan,
                "matches": len(top_matches),
                "status": item["status"],
                "retry_used": retry_used,
                "evidence_status": evidence_bundle.get("status"),
                "primary_doc_id": (evidence_bundle.get("primary") or {}).get("doc_id"),
                "supporting_doc_ids": [entry.get("doc_id") for entry in evidence_bundle.get("supporting", [])],
            }
        )
        for score, doc, content in top_matches:
            doc_id = doc.get("id")
            current = best_by_doc.get(doc_id)
            evidence_meta = None
            primary = evidence_bundle.get("primary") or {}
            if str(primary.get("doc_id")) == str(doc_id):
                evidence_meta = {**primary, "role": "primary"}
            else:
                for support in evidence_bundle.get("supporting", []):
                    if str(support.get("doc_id")) == str(doc_id):
                        evidence_meta = {**support, "role": "supporting"}
                        break
            if current is None or score > float(current["score"]):
                best_by_doc[doc_id] = {
                    "score": float(score),
                    "document": doc,
                    "content": content,
                    "evidence": evidence_meta or {},
                }

    unique_docs = sorted(best_by_doc.values(), key=lambda item: item["score"], reverse=True)
    return {
        "config": config,
        "grouped_matches": grouped_matches,
        "unique_docs": unique_docs,
        "retrieved_trace": retrieved_trace,
        "reranked_trace": reranked_trace,
        "planner_steps": planner_steps,
        "rewritten_queries": rewritten_queries,
    }


def verify_plan_result(
    svc: Any,
    task_graph: dict[str, Any],
    execution_result: dict[str, Any],
) -> dict[str, Any]:
    missing_doc_types = [
        item["doc_type"]
        for item in execution_result["grouped_matches"]
        if not item["matches"]
    ]
    unique_docs = execution_result["unique_docs"]
    evidence_strength = "insufficient_evidence"
    evidence_statuses = [item["evidence_bundle"].get("status") for item in execution_result["grouped_matches"] if item.get("evidence_bundle")]
    if unique_docs:
        top_score = float(unique_docs[0]["score"])
        evidence_strength = "grounded" if top_score >= 6 else "weak_evidence"
    if evidence_statuses and all(status == "grounded" for status in evidence_statuses if status):
        evidence_strength = "grounded"
    elif evidence_statuses and any(status == "weak_evidence" for status in evidence_statuses):
        evidence_strength = "weak_evidence"
    completeness = 1.0
    if execution_result["grouped_matches"]:
        completeness = (
            sum(1 for item in execution_result["grouped_matches"] if item["matches"])
            / len(execution_result["grouped_matches"])
        )
    needs_followup = bool(missing_doc_types) or len(unique_docs) < 2
    return {
        "status": evidence_strength,
        "missing_doc_types": missing_doc_types,
        "completeness": round(completeness, 4),
        "needs_followup": needs_followup,
        "grounded_doc_types": [
            item["doc_type"]
            for item in execution_result["grouped_matches"]
            if item.get("evidence_bundle", {}).get("approved_matches")
        ],
        "message": (
            "Da tong hop bo tai lieu theo tung nhom phuc vu giang day."
            if unique_docs
            else "Chua du tai lieu de lap bo goi y day hoc."
        ),
    }


def _format_material_bundle_answer(
    grouped_matches: list[dict[str, Any]],
    unique_docs: list[dict[str, Any]],
    task_graph: dict[str, Any],
) -> str:
    total_docs = len(unique_docs)
    lines = [
        f"Minh da lap mot bo tai lieu giang day gom **{total_docs} tai lieu** lien quan nhat.",
        "",
        "### Luong xu ly",
        "- Xac dinh cac nhom tai lieu can cho yeu cau giang day",
        "- Tim tai lieu tot nhat trong kho cho tung nhom",
        "- Tong hop phan da co va phan con thieu de ban hanh dong tiep",
    ]

    missing: list[str] = []
    for item in grouped_matches:
        lines.append("")
        lines.append(f"### {item['doc_type']}")
        matches = item["matches"]
        evidence_bundle = item.get("evidence_bundle") or {}
        primary_meta = evidence_bundle.get("primary") or {}
        if matches:
            for score, document, content in matches:
                score_label = f"{score:.2f}"
                if str(primary_meta.get("doc_id")) == str(document.get("id")):
                    lines.append(f"- Nguon chinh: **{document.get('title', 'Tai lieu khong ten')}** (do phu hop {score_label})")
                    lines.append(f"  Tom tat can dung: {_compress_snippet(content)}")
                else:
                    lines.append(f"- Nguon bo tro: {document.get('title', 'Tai lieu khong ten')} (do phu hop {score_label})")
        else:
            lines.append("- Chua tim thay tai lieu phu hop trong pham vi ban duoc phep truy cap.")
            missing.append(item["doc_type"])

    lines.append("")
    if missing:
        lines.append(f"### Khoang trong can bo sung")
        lines.append(f"- Chua du: {', '.join(missing)}")
        lines.append("- Goi y: upload bo sung tai lieu con thieu hoac mo rong tu khoa tim kiem theo hoc phan/cu de.")
    else:
        lines.append("### Danh gia")
        lines.append("- Bo tai lieu da kha day du cho mot vong chuan bi giang day co ban.")
    if task_graph.get("need_private_warning"):
        lines.append("")
        lines.append("### Luu y phan quyen")
        lines.append("- Khi ban giao, chi nen chia se cac tai lieu ma nguoi nhan duoc cap quyen xem.")
        lines.append("- Neu can dung tai lieu private, hay xac nhan quyen truy cap rieng truoc khi chia se.")
    if task_graph.get("need_next_steps"):
        lines.append("")
        lines.append("### Buoc tiep theo")
        lines.append("- Kiem tra nhom tai lieu con thieu va uu tien bo sung de cuong/slide truoc.")
        lines.append("- Sau khi bo sung, chay lai truy van de xac nhan bo tai lieu da du cho giang day.")

    return "\n".join(lines)


def _format_action_plan_answer(
    grouped_matches: list[dict[str, Any]],
    unique_docs: list[dict[str, Any]],
    task_graph: dict[str, Any],
) -> str:
    missing_doc_types = [item["doc_type"] for item in grouped_matches if not item["matches"]]
    available_doc_types = [item["doc_type"] for item in grouped_matches if item["matches"]]
    step_count = task_graph.get("step_count") or 3
    lines = [f"Minh de xuat **ke hoach {step_count} buoc** de xu ly yeu cau hien tai:", ""]
    lines.append("1. Ra soat hien trang hoc phan va xac nhan nhom tai lieu bat buoc dang co hoac dang thieu.")
    if available_doc_types:
        lines.append(f"2. Tan dung ngay cac nhom da co: {', '.join(available_doc_types)}; chuan hoa ten, quyen xem va phien ban.")
    else:
        lines.append("2. Vi chua thay bang chung tai lieu cu the, can kiem tra lai ten hoc phan hoac kho tai lieu truoc khi chot ke hoach.")
    if missing_doc_types:
        lines.append(f"3. Uu tien bo sung cac nhom con thieu: {', '.join(missing_doc_types)}; sau do kiem tra lai bo tai lieu va nguon trich dan.")
    else:
        lines.append("3. Chot danh sach tai lieu, xac nhan quyen truy cap va ban giao cho nguoi day theo dung pham vi duoc phep.")
    if unique_docs:
        lines.append("")
        lines.append("Tai lieu ho tro gan nhat:")
        for item in unique_docs[:3]:
            document = item["document"]
            lines.append(f"- {document.get('title', 'Tai lieu khong ten')} (do phu hop {item['score']:.2f})")
    if task_graph.get("need_private_warning"):
        lines.append("")
        lines.append("Luu y: neu co tai lieu private, can canh bao ro va kiem tra quyen truoc khi su dung trong ke hoach.")
    return "\n".join(lines)


def _format_workflow_guide_answer(
    unique_docs: list[dict[str, Any]],
    task_graph: dict[str, Any],
) -> str:
    lines = [
        "Minh de xuat quy trinh debug chatbot theo tung buoc nhu sau:",
        "",
        "1. Kiem tra query rewrite va truy van retrieval de xem da mo dung chu de, doc_type va pham vi quyen chua.",
        "2. So doi retrieved set va reranked set de xem tai lieu nao bi rot, tai lieu nao duoc uu tien.",
        "3. Kiem tra grounding va citation: chi giu cac chunk thuc su tra loi dung cau hoi va dung pham vi quyen.",
        "4. Xem verification cuoi cung de ha muc tin cay neu bang chung yeu, thay vi doi route nghiep vu.",
    ]
    if unique_docs:
        lines.append("")
        lines.append("Tai lieu tham chieu nen kiem tra dau tien:")
        for item in unique_docs[:2]:
            document = item["document"]
            lines.append(f"- {document.get('title', 'Tai lieu khong ten')} (do phu hop {item['score']:.2f})")
    if task_graph.get("need_next_steps"):
        lines.append("")
        lines.append("Buoc tiep theo: ghi lai trace retrieval -> rerank -> citation cho moi lan debug de so sanh regression.")
    return "\n".join(lines)


def _format_answer(
    task_graph: dict[str, Any],
    grouped_matches: list[dict[str, Any]],
    unique_docs: list[dict[str, Any]],
) -> str:
    planner_mode = task_graph.get("planner_mode", "material_bundle")
    if planner_mode == "action_plan":
        return _format_action_plan_answer(grouped_matches, unique_docs, task_graph)
    if planner_mode == "workflow_guide":
        return _format_workflow_guide_answer(unique_docs, task_graph)
    return _format_material_bundle_answer(grouped_matches, unique_docs, task_graph)


def _same_doc_type(expected: str, actual: str) -> bool:
    expected_folded = re.sub(r"\s+", " ", expected.strip()).casefold()
    actual_folded = re.sub(r"\s+", " ", actual.strip()).casefold()
    normalized_expected = expected_folded.replace("de cuong", "đề cương").replace("de thi", "đề thi")
    normalized_actual = actual_folded.replace("de cuong", "đề cương").replace("de thi", "đề thi")
    return normalized_actual == normalized_expected


def _persist_trace(
    svc: Any,
    db: Any,
    user: dict,
    retrieval_query: str,
    trace: dict,
    citations: list[dict],
) -> str:
    trace_id = f"trace-{uuid.uuid4().hex[:12]}"
    db.execute(
        "INSERT INTO query_traces(id,user_code,original_query,rewritten_query,intent,retrieved_json,citations_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (
            trace_id,
            user["code"],
            retrieval_query,
            trace.get("rewritten_query", retrieval_query),
            "teaching_planner",
            json.dumps(trace.get("retrieved", []), ensure_ascii=False),
            json.dumps(citations, ensure_ascii=False),
            svc.now(),
        ),
    )
    svc.audit(
        db,
        user["code"],
        "rag.ask",
        "query",
        trace_id,
        {"question": retrieval_query, "matches": len(citations), "scope": "public_or_owned", "intent": "teaching_planner"},
    )
    return trace_id


def run_planner(
    svc: Any,
    db: Any,
    user: dict,
    question: str,
    retrieval_query: str,
    filters: dict | None,
    role: str,
    role_ctx: str,
    intent_meta: dict,
) -> dict:
    task_graph = build_task_graph(svc, retrieval_query, role, intent_meta)
    execution_result = execute_subtasks(svc, db, user, task_graph, filters)
    config = execution_result["config"]
    grouped_matches = execution_result["grouped_matches"]
    unique_docs = execution_result["unique_docs"]

    citations: list[dict[str, Any]] = []
    for item in unique_docs:
        document = item["document"]
        content = item["content"]
        evidence = item.get("evidence", {})
        citations.append(
            svc.citation_for(
                item["score"],
                document,
                content,
                role=evidence.get("role"),
                evidence_status=evidence.get("status") or evidence.get("quality_label"),
                source_quality=evidence.get("source_quality"),
                quality_label=evidence.get("quality_label"),
            )
        )
    verification = verify_plan_result(svc, task_graph, execution_result)
    trace = {
        "original_query": retrieval_query,
        "rewritten_query": execution_result["rewritten_queries"][0] if execution_result["rewritten_queries"] else retrieval_query,
        "intent": intent_meta,
        "filters": filters or {},
        "task_graph": task_graph,
        "planner": execution_result["planner_steps"],
        "planner_evidence": [
            {
                "doc_type": item["doc_type"],
                "status": item.get("evidence_bundle", {}).get("status"),
                "primary": item.get("evidence_bundle", {}).get("primary"),
                "supporting": item.get("evidence_bundle", {}).get("supporting", []),
            }
            for item in grouped_matches
        ],
        "retrieved": execution_result["retrieved_trace"],
        "reranked": execution_result["reranked_trace"],
        "planner_verification": verification,
    }

    if not unique_docs:
        if task_graph.get("planner_mode") == "action_plan":
            answer = _format_action_plan_answer(grouped_matches, unique_docs, task_graph)
        elif task_graph.get("planner_mode") == "workflow_guide":
            answer = _format_workflow_guide_answer(unique_docs, task_graph)
        else:
            answer = (
                "Minh da chia yeu cau thanh nhieu nhom tai lieu, nhung chua tim thay ket qua phu hop "
                "trong pham vi ban duoc phep truy cap. Ban co the noi ro ten hoc phan, hoc ky, hoac loai tai lieu can tim."
            )
        trace_id = _persist_trace(svc, db, user, retrieval_query, trace, citations)
        return {
            "answer": answer,
            "citations": [],
            "intent": intent_meta.get("label", "teaching_planner"),
            "trace_id": trace_id,
            "trace": trace,
            "verification": verification,
            "pipeline": ["router", "planner", "task_graph", "retrieve", "rerank", "verify", "no_match"],
            "suggested_actions": svc._suggested_actions_for("document_recommendation", role),
        }

    answer = _format_answer(task_graph, grouped_matches, unique_docs)
    trace_id = _persist_trace(svc, db, user, retrieval_query, trace, citations)
    return {
        "answer": answer,
        "citations": citations,
        "intent": intent_meta.get("label", "teaching_planner"),
        "trace_id": trace_id,
        "trace": trace,
        "verification": verification,
        "pipeline": ["router", "planner", "task_graph", "retrieve", "rerank", "verify", "synthesize"],
        "suggested_actions": svc._suggested_actions_for("document_recommendation", role),
    }
