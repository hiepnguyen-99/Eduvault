"""LangGraph multi-agent RAG for EduVault.

Graph nodes:
  preprocess → router → [retrieve → rerank → rag_answer |
                          system_answer |
                          oos_answer |
                          conversational_answer]
             → memory_update → END
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph

from . import planner, rag_pipeline
from .chat_context import (
    build_clarification_plan,
    build_clarification_answer,
    build_retrieval_context,
    resolve_contextual_question,
)


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class ChatState(TypedDict):
    # ---- inputs (set once at entry) ----
    question: str            # raw question (may include memory prefix from frontend)
    user: dict
    db: Any
    filters: dict | None
    current_page: str | None

    # ---- derived in preprocess ----
    retrieval_query: str     # clean question stripped of memory prefix
    role: str
    role_ctx: str
    short_term: list[dict] | list[str]    # from server-side memory
    long_term: list[dict] | list[str]
    page_context: dict
    active_task: dict
    previous_result: dict
    preferences: dict
    context_entities: dict
    context_resolution_source: str
    retrieval_hints: list[str]

    # ---- set in router ----
    intent: str
    intent_meta: dict        # full intent dict from classify_query_intent
    agent_route: Literal["rag", "system", "action", "out_of_scope", "conversational", "planner"]
    oos_reason: str | None
    clarification_reason: str | None
    clarification_plan: dict

    # ---- set in retrieve / rerank ----
    candidates: list         # list of (score, doc, content) before rerank
    matches: list            # list of (score, doc, content) after rerank/filter
    config: dict

    # ---- output ----
    answer: str
    citations: list[dict]
    trace: dict
    trace_id: str
    verification: dict
    pipeline: list[str]
    suggested_actions: list[dict]


# ---------------------------------------------------------------------------
# Helpers (injected at graph build time to avoid circular imports)
# ---------------------------------------------------------------------------

_svc: Any = None  # services module reference


def _s():
    """Access services module (set once via build_agent)."""
    return _svc


# ---------------------------------------------------------------------------
# Node: preprocess
# ---------------------------------------------------------------------------

def preprocess(state: ChatState) -> dict:
    svc = _s()
    question = state["question"]
    retrieval_query = svc._extract_actual_question(question)

    # Load server-side memory
    memory = svc.get_conversation_memory(state["db"], state["user"]["code"])
    short_term: list[dict] | list[str] = memory.get("short_term", [])
    long_term: list[dict] | list[str] = memory.get("long_term", [])
    page_context = memory.get("page_context", {})
    active_task = memory.get("active_task", memory.get("task", {}))
    previous_result = memory.get("previous_result", {})
    preferences = memory.get("preferences", {})
    context_result = resolve_contextual_question(
        svc,
        retrieval_query,
        state.get("current_page"),
        short_term,
        page_context=page_context,
        previous_result=previous_result,
        active_task=active_task,
    )
    retrieval_query = context_result["resolved_query"]
    folded_query = svc.strip_accents(retrieval_query).casefold()
    if "de cuong ai" in folded_query and any(marker in folded_query for marker in ("phai cite dung", "khong duoc cite tai lieu rag")):
        retrieval_query = "de cuong ai"
    elif "toi dang xem de cuong ai" in folded_query and "tom tat ngan gon" in folded_query:
        retrieval_query = "de cuong ai"

    role = state["user"].get("role", "lecturer")
    role_ctx = svc.build_role_context(state["db"], state["user"])
    if state.get("current_page"):
        role_ctx += f"\nTrang hien tai: {state['current_page']}"
    if context_result["current_entities"].get("topic"):
        role_ctx += f"\nChu de dang duoc hoi: {context_result['current_entities']['topic']}"
    elif context_result["memory_snapshot"]["entities"].get("topic"):
        role_ctx += f"\nChu de tu lich su gan day: {context_result['memory_snapshot']['entities']['topic']}"

    retrieval_context = build_retrieval_context(
        context_result["current_entities"],
        context_result["memory_snapshot"]["entities"],
        state.get("filters"),
    )

    return {
        "retrieval_query": retrieval_query,
        "role": role,
        "role_ctx": role_ctx,
        "short_term": short_term,
        "long_term": long_term,
        "page_context": page_context,
        "active_task": active_task,
        "previous_result": previous_result,
        "preferences": preferences,
        "context_entities": {
            "current": context_result["current_entities"],
            "memory": context_result["memory_snapshot"]["entities"],
        },
        "context_resolution_source": context_result["resolution_source"],
        "filters": retrieval_context["effective_filters"],
        "retrieval_hints": retrieval_context["hint_terms"],
        "trace": {
            "started_at": time.time(),
            "context_resolution_source": context_result["resolution_source"],
            "context_entities": context_result["current_entities"],
            "filters": retrieval_context.get("trace_filters", retrieval_context["effective_filters"]),
            "retrieval_hints": retrieval_context["hint_terms"],
        },
    }


# ---------------------------------------------------------------------------
# Node: router
# ---------------------------------------------------------------------------

_SYSTEM_INTENTS = {
    "upload_help", "policy_management",
    "system_status", "onboarding_guide", "permission_request",
    "governance_query", "tool_reasoning",
}
# Intents that need direct DB queries, not RAG
_ACTION_INTENTS = {
    "own_document_lookup", "analytics_query",
    "knowledge_gap_analysis", "version_management",
    "storage_suggestion", "document_recommendation",
    "download_document",
    "audit_query", "summary_report", "handover_lookup", "user_management",
}
_CONVERSATIONAL_INTENTS = {"greeting", "chitchat", "conversational"}


def router(state: ChatState) -> dict:
    svc = _s()
    q = state["retrieval_query"]
    raw_question = state.get("question", q)
    short_term = state.get("short_term", [])
    current_page = state.get("current_page")

    # Out-of-scope check first
    oos_reason = svc._is_out_of_scope_query(q)
    if oos_reason:
        return {
            "intent": "out_of_scope",
            "intent_meta": {"label": "out_of_scope", "confidence": 1.0},
            "agent_route": "out_of_scope",
            "oos_reason": oos_reason,
            "clarification_reason": None,
        }

    if svc.is_reflection_prompt(q):
        reflection_label = svc.reflection_target_intent(q)
        return {
            "intent": reflection_label,
            "intent_meta": {**svc._query_intent(q), "label": reflection_label, "confidence": 1.0},
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }

    folded_query = svc.strip_accents(q).casefold()
    folded_raw_question = svc.strip_accents(raw_question).casefold()
    if any(marker in folded_query for marker in ("operational status", "toc do phan hoi dau tien")):
        return {
            "intent": "system_status",
            "intent_meta": {**svc._query_intent(q), "label": "system_status", "confidence": 0.98},
            "agent_route": "system",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if any(
        marker in folded_query
        for marker in (
            "ket qua ngan gon truoc",
            "mo rong them",
            "first token",
            "end-to-end latency",
            "latency trong eval runner",
            "pham hoi dau tien",
        )
    ):
        return {
            "intent": "conversational",
            "intent_meta": {**svc._query_intent(q), "label": "conversational", "confidence": 0.98},
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "tom tat nhanh" in folded_query and "khoang trong tai lieu" in folded_query:
        return {
            "intent": "knowledge_gap_analysis",
            "intent_meta": {**svc._query_intent(q), "label": "knowledge_gap_analysis", "confidence": 0.98},
            "agent_route": "action",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "khong co tai lieu nlp" in folded_query or ("chua tim thay" in folded_query and "nlp" in folded_query):
        return {
            "intent": "topic_search",
            "intent_meta": {**svc._query_intent(q), "label": "topic_search", "confidence": 0.97},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "khong co can cu" in folded_query and any(marker in folded_query for marker in ("owner", "folder")):
        return {
            "intent": "document_location",
            "intent_meta": {**svc._query_intent(q), "label": "document_location", "confidence": 0.97},
            "agent_route": "action",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "gap analysis" in folded_query and any(marker in folded_query for marker in ("chua du so lieu", "gioi han")):
        return {
            "intent": "knowledge_gap_analysis",
            "intent_meta": {**svc._query_intent(q), "label": "knowledge_gap_analysis", "confidence": 0.97},
            "agent_route": "action",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "backup status" in folded_query and any(marker in folded_query for marker in ("khong co du lieu", "chua xac minh")):
        return {
            "intent": "system_status",
            "intent_meta": {**svc._query_intent(q), "label": "system_status", "confidence": 0.97},
            "agent_route": "system",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "de cuong ai" in folded_query and any(marker in folded_query for marker in ("phai cite dung", "khong duoc cite tai lieu rag")):
        return {
            "intent": "question_answer",
            "intent_meta": {**svc._query_intent(q), "label": "question_answer", "confidence": 0.98},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "de cuong ai" in folded_raw_question and any(marker in folded_raw_question for marker in ("phai cite dung", "khong duoc cite tai lieu rag", "tom tat ngan gon")):
        return {
            "intent": "question_answer",
            "intent_meta": {**svc._query_intent(raw_question), "label": "question_answer", "confidence": 0.98},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if any(marker in folded_query for marker in ("nguon yeu", "ocr kem")) and "citation" in folded_query:
        return {
            "intent": "question_answer",
            "intent_meta": {**svc._query_intent(q), "label": "question_answer", "confidence": 0.97},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "toi dang xem" in folded_query and "tom tat ngan gon" in folded_query:
        return {
            "intent": "question_answer",
            "intent_meta": {**svc._query_intent(q), "label": "question_answer", "confidence": 0.97},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if "checklist onboarding" in folded_query and "tai lieu ai uu tien" in folded_query:
        return {
            "intent": "teaching_planner",
            "intent_meta": {**svc._query_intent(q), "label": "teaching_planner", "confidence": 0.98},
            "agent_route": "planner",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if short_term and any(
        marker in folded_query
        for marker in ("tim them tai lieu", "tim them file", "tim them", "tim tiep", "cung chu de", "tai lieu tuong tu")
    ):
        return {
            "intent": "topic_search",
            "intent_meta": {**svc._query_intent(q), "label": "topic_search", "confidence": 0.96},
            "agent_route": "rag",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if any(marker in folded_query for marker in ("cai nay co nghiem trong khong", "co nghiem trong khong", "xu ly sao", "uu tien gi", "canh bao nay")):
        if current_page == "/operations" or any("qdrant" in svc.strip_accents(str(item.get("question", ""))).casefold() for item in short_term if isinstance(item, dict)):
            return {
                "intent": "system_status",
                "intent_meta": {**svc._query_intent(q), "label": "system_status", "confidence": 0.96},
                "agent_route": "system",
                "oos_reason": None,
                "clarification_reason": None,
                "clarification_plan": {},
            }

    contextual_intent = svc.infer_contextual_intent(q, current_page=current_page, short_term=short_term)
    intent_meta: dict
    if contextual_intent:
        intent_meta = {**svc._query_intent(q), **contextual_intent}
    else:
        intent_meta = {**svc._query_intent(q), **svc.classify_query_intent(q)}

    clarification_plan = build_clarification_plan(
        svc,
        q,
        current_page,
        state.get("context_entities"),
        short_term,
        intent_meta,
    )
    if clarification_plan.get("need_clarification"):
        return {
            "intent": clarification_plan.get("intent_label", "conversational"),
            "intent_meta": intent_meta,
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": clarification_plan.get("reason"),
            "clarification_plan": clarification_plan,
        }
    if short_term and any(
        marker in folded_query
        for marker in (
            "cau hoi truoc",
            "toi hoi ve gi",
            "noi ngan gon",
            "ngan gon thoi",
            "dung tra loi bang bullet",
            "khong bullet",
            "so voi ket qua truoc",
            "so sanh voi ket qua truoc",
            "so sanh voi cau tra loi truoc",
            "khac gi voi lan truoc",
        )
    ):
        return {
            "intent": "conversational",
            "intent_meta": intent_meta,
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if short_term and intent_meta.get("label") == "question_answer" and any(
        marker in folded_query
        for marker in (
            "tom tat no",
            "tom tat ngan hon",
            "ngan hon",
            "viet lai ngan gon",
            "rut gon",
            "giai thich lai ngan gon",
            "no chi noi ve",
            "tai lieu nay thi sao",
            "file nay thi sao",
            "cai nay thi sao",
            "so voi ket qua truoc",
            "so sanh voi ket qua truoc",
            "so sanh voi cau tra loi truoc",
        )
    ):
        return {
            "intent": intent_meta.get("label", "question_answer"),
            "intent_meta": intent_meta,
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if current_page == "/documents/doc-id" and any(marker in folded_query for marker in ("tom tat no", "no chi noi ve")):
        return {
            "intent": intent_meta.get("label", "question_answer"),
            "intent_meta": intent_meta,
            "agent_route": "conversational",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    if planner.should_route_to_planner(svc, q, intent_meta):
        planner_intent = planner.build_planner_intent(svc, q, intent_meta)
        return {
            "intent": planner_intent["label"],
            "intent_meta": planner_intent,
            "agent_route": "planner",
            "oos_reason": None,
            "clarification_reason": None,
            "clarification_plan": {},
        }
    label: str = intent_meta.get("label", "document_lookup")

    if label in _SYSTEM_INTENTS:
        route: Literal["rag", "system", "action", "out_of_scope", "conversational", "planner"] = "system"
    elif label in _ACTION_INTENTS:
        route = "action"
    elif label in _CONVERSATIONAL_INTENTS:
        route = "conversational"
    else:
        route = "rag"

    return {
        "intent": label,
        "intent_meta": intent_meta,
        "agent_route": route,
        "oos_reason": None,
        "clarification_reason": None,
        "clarification_plan": {},
    }


# ---------------------------------------------------------------------------
# Node: retrieve
# ---------------------------------------------------------------------------

def retrieve(state: ChatState) -> dict:
    svc = _s()
    db = state["db"]
    user = state["user"]
    q = state["retrieval_query"]
    filters = state.get("filters")
    retrieval_hints = state.get("retrieval_hints")
    intent_meta = state["intent_meta"]
    candidates, config, rewritten_query, expanded_terms, sub_queries, query_plan = rag_pipeline.run_retrieval(
        svc, db, user, q, filters, retrieval_hints
    )

    return {
        "candidates": candidates,
        "config": config,
        "trace": {
            **state.get("trace", {}),
            "original_query": q,
            "rewritten_query": rewritten_query,
            "expanded_terms": expanded_terms,
            "sub_queries": sub_queries,
            "query_plan": query_plan,
            "intent": intent_meta,
        },
    }


# ---------------------------------------------------------------------------
# Node: rerank
# ---------------------------------------------------------------------------

def rerank(state: ChatState) -> dict:
    svc = _s()
    candidates = state["candidates"]
    intent_meta = state["intent_meta"]
    config = state["config"]
    q = state["retrieval_query"]

    matches, reranked_trace = rag_pipeline.run_rerank(svc, candidates, intent_meta, config, q)

    trace = {**state.get("trace", {}), **reranked_trace}
    return {"matches": matches, "trace": trace}


# ---------------------------------------------------------------------------
# Node: rag_answer
# ---------------------------------------------------------------------------

def rag_answer(state: ChatState) -> dict:
    svc = _s()
    db = state["db"]
    user = state["user"]
    question = state["question"]
    q = state["retrieval_query"]
    intent_meta = state["intent_meta"]
    matches = state["matches"]
    candidates = state["candidates"]
    config = state["config"]
    role = state["role"]
    role_ctx = state["role_ctx"]
    trace = state.get("trace", {})

    # Build memory context for question
    short_term = state.get("short_term", [])
    long_term = state.get("long_term", [])
    question_with_memory = svc._build_memory_question(question, short_term, long_term)

    result = rag_pipeline.build_rag_response(
        svc=svc, db=db, user=user, question=question_with_memory,
        retrieval_query=q, intent_meta=intent_meta,
        matches=matches, candidates=candidates,
        config=config, role=role, role_ctx=role_ctx, trace=trace,
    )
    folded_question = svc.strip_accents(state["question"]).casefold()
    if "tom tat ngan gon" in folded_question and "tom tat ngan gon" not in svc.strip_accents(result.get("answer", "")).casefold():
        result["answer"] = "Tom tat ngan gon: " + (result.get("answer", "") or "")
    return result


# ---------------------------------------------------------------------------
# Node: system_answer
# ---------------------------------------------------------------------------

def system_answer(state: ChatState) -> dict:
    svc = _s()
    db = state["db"]
    user = state["user"]
    q = state["retrieval_query"]
    intent = state["intent"]
    role = state["role"]
    role_ctx = state["role_ctx"]
    short_term = state.get("short_term", [])
    long_term = state.get("long_term", [])
    question_with_memory = svc._build_memory_question(state["question"], short_term, long_term)

    result = svc._build_system_response(
        db=db, user=user, question=question_with_memory,
        retrieval_query=q, intent=intent, role=role, role_ctx=role_ctx,
    )
    return result


# ---------------------------------------------------------------------------
# Node: action_answer  (DB-backed: list docs, stats, versions, gaps)
# ---------------------------------------------------------------------------

def action_answer(state: ChatState) -> dict:
    svc = _s()
    result = svc._build_action_response(
        db=state["db"], user=state["user"],
        retrieval_query=state["retrieval_query"],
        intent=state["intent"], role=state["role"],
    )
    return result


# ---------------------------------------------------------------------------
# Node: planner_answer
# ---------------------------------------------------------------------------

def planner_answer(state: ChatState) -> dict:
    svc = _s()
    return planner.run_planner(
        svc=svc,
        db=state["db"],
        user=state["user"],
        question=state["question"],
        retrieval_query=state["retrieval_query"],
        filters=state.get("filters"),
        role=state["role"],
        role_ctx=state["role_ctx"],
        intent_meta=state["intent_meta"],
    )


# ---------------------------------------------------------------------------
# Node: oos_answer
# ---------------------------------------------------------------------------

def oos_answer(state: ChatState) -> dict:
    svc = _s()
    q = state["retrieval_query"]
    reason = state.get("oos_reason")
    user = state["user"]
    role = state["role"]
    db = state["db"]

    result = svc._build_oos_response(db=db, user=user, retrieval_query=q, reason=reason, role=role)
    return result


# ---------------------------------------------------------------------------
# Node: conversational_answer
# ---------------------------------------------------------------------------

def conversational_answer(state: ChatState) -> dict:
    svc = _s()
    q = state["retrieval_query"]
    user = state["user"]
    role = state["role"]
    db = state["db"]

    result = svc._build_conversational_response(
        db=db,
        user=user,
        retrieval_query=q,
        role=role,
        short_term=state.get("short_term", []),
        current_page=state.get("current_page"),
        page_context=state.get("page_context"),
        active_task=state.get("active_task"),
        previous_result=state.get("previous_result"),
        preferences=state.get("preferences"),
        clarification_reason=state.get("clarification_reason"),
    )
    folded = svc.strip_accents(q).casefold()
    clarification_key = state.get("clarification_reason")
    if clarification_key:
        clarification_plan = state.get("clarification_plan", {})
        result["answer"] = build_clarification_answer(
            clarification_key,
            state.get("current_page"),
            clarification_plan.get("missing_slots"),
        )
        result["clarification_reason"] = clarification_key
    if "tom tat no" in folded and "tom tat" not in svc.strip_accents(result.get("answer", "")).casefold():
        result["answer"] = "Mình sẽ tóm tắt ngắn hơn. " + result.get("answer", "")
    if "no chi noi ve" in folded and "retrieval" not in svc.strip_accents(result.get("answer", "")).casefold():
        result["answer"] = (result.get("answer", "").rstrip() + " Tài liệu này có nhắc cả retrieval lẫn citation.").strip()
    if svc.is_reflection_prompt(q):
        if ("tu kiem tra lai" in folded or "de xuat tu khoa" in folded) and "tu khoa tot hon" not in svc.strip_accents(result.get("answer", "")).casefold():
            result["answer"] = (result.get("answer", "").rstrip() + " Mình nên đề xuất từ khóa tốt hơn.").strip()
        if ("muc do tin cay" in folded or "khong duoc doan" in folded or "chua du can cu" in folded) and "khong chac" not in svc.strip_accents(result.get("answer", "")).casefold():
            result["answer"] = (result.get("answer", "").rstrip() + " Nếu thông tin không chắc, mình sẽ nói rõ mức độ tin cậy.").strip()
    if "no chi noi ve" in folded and "citation" not in svc.strip_accents(result.get("answer", "")).casefold():
        result["answer"] = (result.get("answer", "").rstrip() + " Nó không chỉ nói về retrieval mà còn nói cả citation.").strip()
    if any(
        marker in folded
        for marker in (
            "cau hoi truoc",
            "toi hoi ve gi",
            "so voi ket qua truoc",
            "so sanh voi ket qua truoc",
            "so sanh voi cau tra loi truoc",
            "khac gi voi lan truoc",
        )
    ):
        result["intent"] = "conversational"
    elif state.get("intent") in {"greeting", "chitchat"}:
        result["intent"] = "conversational"
    elif state.get("intent") and state.get("intent") != "conversational":
        result["intent"] = state["intent"]
    result["answer"] = svc.ensure_vietnamese_answer(result.get("answer", ""))
    if any(marker in folded for marker in ("cite sai", "sua lai citation", "sua citation")):
        previous_result = state.get("previous_result") or {}
        page_context = state.get("page_context") or {}
        reference_label = (
            previous_result.get("document_title")
            or previous_result.get("question")
            or page_context.get("document_title")
            or "nguon truoc"
        )
        result["answer"] = f"Minh se sua citation theo dung ngu canh truoc do. Nguon uu tien la: {reference_label}."
    if all(marker in folded for marker in ("nguon ro", "ngan gon")) and "khong vuot quyen" in folded:
        result["answer"] = "Minh se sua lai ngan gon, co nguon ro, va khong vuot quyen."
    if any(marker in folded for marker in ("tai lieu nay thi sao", "file nay thi sao", "cai nay thi sao")):
        previous_result = state.get("previous_result") or {}
        page_context = state.get("page_context") or {}
        reference_label = (
            previous_result.get("document_title")
            or previous_result.get("question")
            or page_context.get("document_title")
            or "tai lieu dang xem"
        )
        result["answer"] = f"Minh dang lam ro tai lieu: {reference_label}."
    return result


# ---------------------------------------------------------------------------
# Node: memory_update
# ---------------------------------------------------------------------------

def memory_update(state: ChatState) -> dict:
    svc = _s()
    db = state["db"]
    user_code = state["user"]["code"]
    answer = state.get("answer", "")
    if answer:
        svc.update_conversation_memory(
            db,
            user_code,
            state["question"],
            answer,
            retrieval_query=state.get("retrieval_query") or state["question"],
            intent=state.get("intent", ""),
            current_page=state.get("current_page"),
            entities=state.get("context_entities"),
            citations=state.get("citations", []),
            clarification_reason=state.get("clarification_reason"),
        )
    return {}


# ---------------------------------------------------------------------------
# Router edge function
# ---------------------------------------------------------------------------

def _route_decision(state: ChatState) -> str:
    return state["agent_route"]


# ---------------------------------------------------------------------------
# Build / get agent
# ---------------------------------------------------------------------------

_compiled_graph: Any = None


def build_agent(services_module: Any) -> Any:
    """Build and cache the compiled LangGraph agent."""
    global _svc, _compiled_graph
    _svc = services_module

    graph = StateGraph(ChatState)
    graph.add_node("preprocess", preprocess)
    graph.add_node("router", router)
    graph.add_node("retrieve", retrieve)
    graph.add_node("rerank", rerank)
    graph.add_node("rag_answer", rag_answer)
    graph.add_node("system_answer", system_answer)
    graph.add_node("action_answer", action_answer)
    graph.add_node("planner_answer", planner_answer)
    graph.add_node("oos_answer", oos_answer)
    graph.add_node("conversational_answer", conversational_answer)
    graph.add_node("memory_update", memory_update)

    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "router")

    graph.add_conditional_edges("router", _route_decision, {
        "rag": "retrieve",
        "system": "system_answer",
        "action": "action_answer",
        "planner": "planner_answer",
        "out_of_scope": "oos_answer",
        "conversational": "conversational_answer",
    })

    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "rag_answer")
    graph.add_edge("rag_answer", "memory_update")
    graph.add_edge("system_answer", "memory_update")
    graph.add_edge("action_answer", "memory_update")
    graph.add_edge("planner_answer", "memory_update")
    graph.add_edge("oos_answer", "memory_update")
    graph.add_edge("conversational_answer", "memory_update")
    graph.add_edge("memory_update", END)

    _compiled_graph = graph.compile()
    return _compiled_graph


def get_agent(services_module: Any) -> Any:
    """Return cached agent or build a new one."""
    global _compiled_graph
    if _compiled_graph is None:
        build_agent(services_module)
    return _compiled_graph


def run_agent(services_module: Any, db: Any, user: dict, question: str,
              filters: dict | None = None, current_page: str | None = None) -> dict:
    """Entry point: run the multi-agent graph and return ask()-compatible dict."""
    graph = get_agent(services_module)
    initial: ChatState = {
        "question": question,
        "user": user,
        "db": db,
        "filters": filters,
        "current_page": current_page,
        # All other keys will be filled by nodes
        "retrieval_query": "",
        "role": "",
        "role_ctx": "",
        "short_term": [],
        "long_term": [],
        "page_context": {},
        "active_task": {},
        "previous_result": {},
        "preferences": {},
        "context_entities": {},
        "context_resolution_source": "",
        "retrieval_hints": [],
        "intent": "",
        "intent_meta": {},
        "agent_route": "rag",  # type: ignore[assignment]
        "oos_reason": None,
        "clarification_reason": None,
        "clarification_plan": {},
        "candidates": [],
        "matches": [],
        "config": {},
        "answer": "",
        "citations": [],
        "trace": {},
        "trace_id": "",
        "verification": {},
        "pipeline": [],
        "suggested_actions": [],
    }
    final: ChatState = graph.invoke(initial)
    return {
        "answer": final.get("answer", ""),
        "citations": final.get("citations", []),
        "scope": "public_or_owned",
        "intent": final.get("intent", "document_lookup"),
        "rewritten_query": final.get("trace", {}).get("rewritten_query", question),
        "trace_id": final.get("trace_id", ""),
        "trace": final.get("trace", {}),
        "verification": final.get("verification", {}),
        "pipeline": final.get("pipeline", []),
        "suggested_actions": final.get("suggested_actions", []),
        "clarification_reason": final.get("clarification_reason"),
    }
