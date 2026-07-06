from __future__ import annotations

import json
import uuid
from typing import Any


SESSION_STATE_VERSION = 2
MAX_RECENT_TURNS = 8
MAX_LONG_TERM_ITEMS = 6


def _blank_preferences() -> dict:
    return {
        "concise": False,
        "bullet_style": True,
    }


def _blank_page_context() -> dict:
    return {
        "route": "",
        "document_id": "",
        "document_title": "",
        "focus_topic": "",
        "source": "",
        "updated_at": "",
    }


def _blank_active_task() -> dict:
    return {
        "id": "",
        "type": "",
        "status": "idle",
        "question": "",
        "intent": "",
        "current_page": "",
        "constraints": [],
        "subtasks": [],
        "updated_at": "",
    }


def _blank_previous_result() -> dict:
    return {
        "question": "",
        "answer": "",
        "intent": "",
        "summary": "",
        "document_id": "",
        "document_title": "",
        "topic": "",
        "citations": [],
        "updated_at": "",
    }


def new_session_state(user_code: str, current_page: str | None = None) -> dict:
    session_id = f"sess-{uuid.uuid4().hex[:12]}"
    return {
        "version": SESSION_STATE_VERSION,
        "session_id": session_id,
        "user_code": user_code,
        "current_page": current_page or "",
        "active_intent": "",
        "entities": {
            "topic": "",
            "course_code": "",
            "owner_code": "",
            "document_id": "",
            "doc_types": [],
        },
        "slots": {},
        "task": {
            "id": "",
            "type": "",
            "status": "idle",
            "constraints": [],
            "subtasks": [],
        },
        "page_context": _blank_page_context(),
        "active_task": _blank_active_task(),
        "previous_result": _blank_previous_result(),
        "preferences": _blank_preferences(),
        "retrieved_context": [],
        "turns": [],
        "long_term": [],
    }


def _legacy_entry_to_turn(entry: str) -> dict | None:
    payload = str(entry or "").strip()
    if not payload:
        return None
    if payload.startswith("Q: "):
        payload = payload[3:]

    question = payload
    answer = ""
    for separator in ("->", "→", "â†’", "Ã¢â€ â€™"):
        if separator in payload:
            question, answer = payload.split(separator, 1)
            break

    question = question.strip()
    answer = answer.strip()
    if not question:
        return None
    return {
        "id": f"turn-legacy-{uuid.uuid4().hex[:10]}",
        "question": question,
        "normalized_question": question,
        "retrieval_query": question,
        "answer": answer,
        "intent": "",
        "current_page": "",
        "created_at": "",
        "entities": {"current": {}, "memory": {}},
        "citations": [],
        "clarification_reason": None,
    }


def state_from_legacy_row(user_code: str, row: Any, current_page: str | None = None) -> dict:
    state = new_session_state(user_code, current_page=current_page)
    if not row:
        return state

    try:
        short_term_raw = json.loads(row["short_term"] or "[]")
    except Exception:
        short_term_raw = []
    try:
        long_term_raw = json.loads(row["long_term"] or "[]")
    except Exception:
        long_term_raw = []

    turns = [turn for item in short_term_raw if (turn := _legacy_entry_to_turn(item))]
    long_term = []
    for item in long_term_raw:
        turn = _legacy_entry_to_turn(item)
        if not turn:
            continue
        long_term.append(
            {
                "kind": "legacy_summary",
                "question": turn["question"],
                "answer": turn["answer"],
            }
        )
    state["turns"] = turns[-MAX_RECENT_TURNS:]
    state["long_term"] = long_term[-MAX_LONG_TERM_ITEMS:]
    if state["turns"]:
        latest_turn = state["turns"][-1]
        state["page_context"] = _derive_page_context(latest_turn, state.get("page_context"), "")
        state["active_task"] = _derive_active_task(latest_turn, state.get("active_task"), "")
        state["previous_result"] = _derive_previous_result(latest_turn, "")
    return state


def _merge_entities(existing: dict, incoming: dict | None) -> dict:
    merged = dict(existing or {})
    incoming = dict(incoming or {})
    for key in ("topic", "course_code", "owner_code", "document_id"):
        value = incoming.get(key)
        if value:
            merged[key] = value
    if incoming.get("doc_types"):
        merged["doc_types"] = list(incoming["doc_types"])
    return merged


def _update_preferences(preferences: dict | None, question: str) -> dict:
    prefs = dict(preferences or _blank_preferences())
    folded = question.casefold()
    if any(token in folded for token in ("ngan gon", "ngắn gọn", "khong bullet", "không bullet")):
        prefs["concise"] = True
    if any(token in folded for token in ("dung tra loi bang bullet", "đừng trả lời bằng bullet", "khong bullet", "không bullet")):
        prefs["bullet_style"] = False
    return prefs


def _build_long_term_items(turns: list[dict]) -> list[dict]:
    items: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for turn in reversed(turns):
        entities = turn.get("entities", {}).get("current", {})
        topic = str(entities.get("topic") or "").strip()
        intent = str(turn.get("intent") or "").strip()
        if not topic and not intent:
            continue
        key = (topic.casefold(), intent.casefold())
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "kind": "topic_intent_summary",
                "topic": topic,
                "intent": intent,
                "question": turn.get("question", ""),
            }
        )
        if len(items) >= MAX_LONG_TERM_ITEMS:
            break
    return list(reversed(items))


def _primary_citation(citations: list[dict] | None) -> dict:
    if not citations:
        return {}
    first = citations[0]
    return dict(first) if isinstance(first, dict) else {}


def _derive_page_context(turn: dict, current_state: dict | None, timestamp: str) -> dict:
    page_context = dict(current_state or _blank_page_context())
    page_context["route"] = turn.get("current_page") or page_context.get("route", "")
    page_context["updated_at"] = timestamp
    page_context["source"] = "turn"

    citation = _primary_citation(turn.get("citations"))
    entities = dict((turn.get("entities") or {}).get("current") or {})

    if citation.get("id"):
        page_context["document_id"] = citation["id"]
    if citation.get("title"):
        page_context["document_title"] = citation["title"]
    if entities.get("document_id"):
        page_context["document_id"] = entities["document_id"]
    if entities.get("topic"):
        page_context["focus_topic"] = entities["topic"]
    elif citation.get("topic"):
        page_context["focus_topic"] = citation["topic"]
    return page_context


def _derive_active_task(turn: dict, current_state: dict | None, timestamp: str) -> dict:
    active_task = dict(current_state or _blank_active_task())
    active_task["id"] = active_task.get("id") or f"task-{uuid.uuid4().hex[:12]}"
    active_task["type"] = turn.get("intent", "") or active_task.get("type", "")
    active_task["intent"] = turn.get("intent", "") or active_task.get("intent", "")
    active_task["question"] = turn.get("question", "")
    active_task["current_page"] = turn.get("current_page", "") or active_task.get("current_page", "")
    active_task["status"] = "ready_for_followup" if turn.get("answer") else active_task.get("status", "idle")
    active_task["updated_at"] = timestamp
    active_task.setdefault("constraints", [])
    active_task.setdefault("subtasks", [])
    return active_task


def _derive_previous_result(turn: dict, timestamp: str) -> dict:
    citation = _primary_citation(turn.get("citations"))
    entities = dict((turn.get("entities") or {}).get("current") or {})
    answer = str(turn.get("answer") or "")
    return {
        "question": turn.get("question", ""),
        "answer": answer,
        "intent": turn.get("intent", ""),
        "summary": answer[:240],
        "document_id": entities.get("document_id") or citation.get("id", ""),
        "document_title": citation.get("title", ""),
        "topic": entities.get("topic") or citation.get("topic", ""),
        "citations": list(turn.get("citations") or [])[:3],
        "updated_at": timestamp,
    }


class SessionStateRepository:
    def __init__(self, db: Any, now_factory: Any):
        self.db = db
        self.now_factory = now_factory

    def load(self, user_code: str, *, current_page: str | None = None) -> dict:
        row = self.db.execute(
            "SELECT session_id,state_json FROM assistant_sessions WHERE user_code=?",
            (user_code,),
        ).fetchone()
        if row:
            try:
                state = json.loads(row["state_json"] or "{}")
            except Exception:
                state = {}
            if not state:
                state = new_session_state(user_code, current_page=current_page)
            state.setdefault("session_id", row["session_id"])
        else:
            legacy_row = self.db.execute(
                "SELECT short_term,long_term,updated_at FROM conversation_memory WHERE user_code=?",
                (user_code,),
            ).fetchone()
            state = state_from_legacy_row(user_code, legacy_row, current_page=current_page)
            self.save(state)

        state.setdefault("version", SESSION_STATE_VERSION)
        state.setdefault("user_code", user_code)
        state.setdefault("preferences", _blank_preferences())
        state.setdefault("entities", {})
        state.setdefault("slots", {})
        state.setdefault("task", {"id": "", "type": "", "status": "idle", "constraints": [], "subtasks": []})
        state.setdefault("page_context", _blank_page_context())
        state.setdefault("active_task", _blank_active_task())
        state.setdefault("previous_result", _blank_previous_result())
        state.setdefault("retrieved_context", [])
        state.setdefault("turns", [])
        state.setdefault("long_term", [])
        if not state.get("active_task") and state.get("task"):
            state["active_task"] = dict(state["task"])
        if not state.get("task") and state.get("active_task"):
            state["task"] = dict(state["active_task"])
        if current_page is not None:
            state["current_page"] = current_page
            state["page_context"]["route"] = current_page
        return state

    def save(self, state: dict) -> dict:
        timestamp = self.now_factory()
        session_id = state.get("session_id") or f"sess-{uuid.uuid4().hex[:12]}"
        user_code = state["user_code"]
        state["session_id"] = session_id
        state["updated_at"] = timestamp
        self.db.execute(
            "INSERT INTO assistant_sessions(session_id,user_code,state_json,updated_at,expires_at,created_at) "
            "VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(user_code) DO UPDATE SET session_id=excluded.session_id,state_json=excluded.state_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at",
            (
                session_id,
                user_code,
                json.dumps(state, ensure_ascii=False),
                timestamp,
                None,
                timestamp,
            ),
        )
        self._sync_entities(state, timestamp)
        self._sync_task(state, timestamp)
        self._sync_legacy_memory(state, timestamp)
        return state

    def append_turn(
        self,
        user_code: str,
        *,
        question: str,
        retrieval_query: str,
        answer: str,
        intent: str,
        current_page: str | None,
        entities: dict | None,
        citations: list[dict] | None,
        clarification_reason: str | None,
    ) -> dict:
        state = self.load(user_code, current_page=current_page)
        timestamp = self.now_factory()
        turn = {
            "id": f"turn-{uuid.uuid4().hex[:12]}",
            "question": question,
            "normalized_question": question.strip(),
            "retrieval_query": retrieval_query.strip(),
            "answer": answer,
            "intent": intent,
            "current_page": current_page or "",
            "created_at": timestamp,
            "entities": entities or {"current": {}, "memory": {}},
            "citations": citations or [],
            "clarification_reason": clarification_reason,
        }
        turns = list(state.get("turns", []))
        turns.append(turn)
        state["turns"] = turns[-MAX_RECENT_TURNS:]
        state["long_term"] = _build_long_term_items(turns)
        state["active_intent"] = intent or state.get("active_intent", "")
        state["current_page"] = current_page or state.get("current_page", "")
        state["preferences"] = _update_preferences(state.get("preferences"), question)
        current_entities = dict((entities or {}).get("current") or {})
        state["entities"] = _merge_entities(state.get("entities", {}), current_entities)
        state["page_context"] = _derive_page_context(turn, state.get("page_context"), timestamp)
        state["active_task"] = _derive_active_task(turn, state.get("active_task"), timestamp)
        state["previous_result"] = _derive_previous_result(turn, timestamp)
        state["task"] = {
            "id": state["active_task"].get("id", ""),
            "type": state["active_task"].get("type", ""),
            "status": state["active_task"].get("status", "idle"),
            "constraints": state["active_task"].get("constraints", []),
            "subtasks": state["active_task"].get("subtasks", []),
        }
        state["retrieved_context"] = [
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "score": item.get("score", 0),
                "used_for": ["answer", "citation"],
            }
            for item in (citations or [])[:3]
        ]
        self.db.execute(
            "INSERT INTO assistant_turns(id,session_id,user_code,question,retrieval_query,answer,intent,current_page,entities_json,citations_json,clarification_reason,created_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                turn["id"],
                state["session_id"],
                user_code,
                turn["question"],
                turn["retrieval_query"],
                turn["answer"],
                turn["intent"],
                turn["current_page"],
                json.dumps(turn["entities"], ensure_ascii=False),
                json.dumps(turn["citations"], ensure_ascii=False),
                clarification_reason or "",
                timestamp,
            ),
        )
        return self.save(state)

    def clear(self, user_code: str) -> None:
        self.db.execute("DELETE FROM assistant_turns WHERE user_code=?", (user_code,))
        self.db.execute("DELETE FROM assistant_entities WHERE user_code=?", (user_code,))
        self.db.execute("DELETE FROM assistant_tasks WHERE user_code=?", (user_code,))
        self.db.execute("DELETE FROM assistant_sessions WHERE user_code=?", (user_code,))
        self.db.execute("DELETE FROM conversation_memory WHERE user_code=?", (user_code,))

    def _sync_entities(self, state: dict, timestamp: str) -> None:
        user_code = state["user_code"]
        session_id = state["session_id"]
        self.db.execute("DELETE FROM assistant_entities WHERE user_code=? AND session_id=?", (user_code, session_id))
        entities = dict(state.get("entities") or {})
        for entity_type, value in entities.items():
            if value in (None, "", []):
                continue
            stored_value = json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else str(value)
            self.db.execute(
                "INSERT INTO assistant_entities(id,session_id,user_code,entity_type,entity_value,source,confidence,updated_at,expires_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    f"ent-{uuid.uuid4().hex[:12]}",
                    session_id,
                    user_code,
                    entity_type,
                    stored_value,
                    "conversation",
                    1.0,
                    timestamp,
                    None,
                ),
            )

    def _sync_task(self, state: dict, timestamp: str) -> None:
        task = dict(state.get("active_task") or state.get("task") or {})
        user_code = state["user_code"]
        session_id = state["session_id"]
        self.db.execute("DELETE FROM assistant_tasks WHERE user_code=? AND session_id=?", (user_code, session_id))
        if not any(task.get(key) for key in ("id", "type")):
            return
        task_id = task.get("id") or f"task-{uuid.uuid4().hex[:12]}"
        self.db.execute(
            "INSERT INTO assistant_tasks(id,session_id,user_code,task_type,status,constraints_json,state_json,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (
                task_id,
                session_id,
                user_code,
                task.get("type", ""),
                task.get("status", "idle"),
                json.dumps(task.get("constraints", []), ensure_ascii=False),
                json.dumps(task, ensure_ascii=False),
                timestamp,
                timestamp,
            ),
        )

    def _sync_legacy_memory(self, state: dict, timestamp: str) -> None:
        short_term = [
            f"Q: {turn.get('question', '')} -> {turn.get('answer', '')[:250]}"
            for turn in state.get("turns", [])
        ]
        long_term = [
            item.get("question", "")
            for item in state.get("long_term", [])
            if item.get("question")
        ]
        self.db.execute(
            "INSERT INTO conversation_memory(user_code,short_term,long_term,updated_at) VALUES(?,?,?,?) "
            "ON CONFLICT(user_code) DO UPDATE SET short_term=excluded.short_term,long_term=excluded.long_term,updated_at=excluded.updated_at",
            (
                state["user_code"],
                json.dumps(short_term, ensure_ascii=False),
                json.dumps(long_term, ensure_ascii=False),
                timestamp,
            ),
        )
