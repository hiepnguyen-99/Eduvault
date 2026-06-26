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
    short_term: list[str]    # from server-side memory
    long_term: list[str]

    # ---- set in router ----
    intent: str
    intent_meta: dict        # full intent dict from classify_query_intent
    agent_route: Literal["rag", "system", "action", "out_of_scope", "conversational"]
    oos_reason: str | None

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
    short_term: list[str] = memory.get("short_term", [])
    long_term: list[str] = memory.get("long_term", [])

    role = state["user"].get("role", "lecturer")
    role_ctx = svc.build_role_context(state["db"], state["user"])
    if state.get("current_page"):
        role_ctx += f"\nTrang hiện tại: {state['current_page']}"

    return {
        "retrieval_query": retrieval_query,
        "role": role,
        "role_ctx": role_ctx,
        "short_term": short_term,
        "long_term": long_term,
        "trace": {"started_at": time.time()},
    }


# ---------------------------------------------------------------------------
# Node: router
# ---------------------------------------------------------------------------

_SYSTEM_INTENTS = {
    "upload_help", "policy_management", "user_management",
    "system_status", "onboarding_guide", "permission_request",
}
# Intents that need direct DB queries, not RAG
_ACTION_INTENTS = {
    "own_document_lookup", "analytics_query",
    "knowledge_gap_analysis", "version_management",
}
_CONVERSATIONAL_INTENTS = {"greeting", "chitchat"}


def router(state: ChatState) -> dict:
    svc = _s()
    q = state["retrieval_query"]

    # Out-of-scope check first
    oos_reason = svc._is_out_of_scope_query(q)
    if oos_reason:
        return {
            "intent": "out_of_scope",
            "intent_meta": {"label": "out_of_scope", "confidence": 1.0},
            "agent_route": "out_of_scope",
            "oos_reason": oos_reason,
        }

    # Full intent classification
    intent_meta = {**svc._query_intent(q), **svc.classify_query_intent(q)}
    label: str = intent_meta.get("label", "document_lookup")

    if label in _SYSTEM_INTENTS:
        route: Literal["rag", "system", "action", "out_of_scope", "conversational"] = "system"
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
    intent_meta = state["intent_meta"]
    question = state["question"]  # full question with memory for LLM

    # Delegate to existing retrieval pipeline in services
    candidates, config, rewritten_query, expanded_terms, sub_queries = svc._run_retrieval(
        db, user, q, filters
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
            "intent": intent_meta,
            "filters": filters or {},
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

    matches, reranked_trace = svc._run_rerank(candidates, intent_meta, config, q)

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

    result = svc._build_rag_response(
        db=db, user=user, question=question_with_memory,
        retrieval_query=q, intent_meta=intent_meta,
        matches=matches, candidates=candidates,
        config=config, role=role, role_ctx=role_ctx, trace=trace,
    )
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

    result = svc._build_conversational_response(db=db, user=user, retrieval_query=q, role=role)
    return result


# ---------------------------------------------------------------------------
# Node: memory_update
# ---------------------------------------------------------------------------

def memory_update(state: ChatState) -> dict:
    svc = _s()
    db = state["db"]
    user_code = state["user"]["code"]
    q = state["retrieval_query"]
    answer = state.get("answer", "")
    if answer:
        svc.update_conversation_memory(db, user_code, q, answer)
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
    graph.add_node("oos_answer", oos_answer)
    graph.add_node("conversational_answer", conversational_answer)
    graph.add_node("memory_update", memory_update)

    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "router")

    graph.add_conditional_edges("router", _route_decision, {
        "rag": "retrieve",
        "system": "system_answer",
        "action": "action_answer",
        "out_of_scope": "oos_answer",
        "conversational": "conversational_answer",
    })

    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "rag_answer")
    graph.add_edge("rag_answer", "memory_update")
    graph.add_edge("system_answer", "memory_update")
    graph.add_edge("action_answer", "memory_update")
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
        "intent": "",
        "intent_meta": {},
        "agent_route": "rag",  # type: ignore[assignment]
        "oos_reason": None,
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
    }
