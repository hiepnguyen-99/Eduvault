"""RAG pipeline helpers used by the LangGraph chatbot agent.

This module is intentionally service-module driven: the existing EduVault
service layer owns database helpers, policy helpers, AI provider instances, and
audit utilities. Keeping those dependencies injected avoids circular imports
while moving the active RAG execution path out of the already-large
``services.py`` module.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any


def _normalized_text(svc: Any, value: str) -> str:
    return " ".join(svc.strip_accents(value).casefold().split())


def _tokenize(svc: Any, value: str) -> set[str]:
    return {
        token
        for token in _normalized_text(svc, value).split()
        if len(token) >= 2
    }


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        compact = " ".join(str(item or "").split()).strip()
        folded = compact.casefold()
        if not compact or folded in seen:
            continue
        seen.add(folded)
        ordered.append(compact)
    return ordered


def _build_query_plan(
    svc: Any,
    retrieval_query: str,
    config: dict,
    filters: dict | None,
    retrieval_hints: list[str] | None,
) -> dict:
    canonical_query = svc.rewrite_query(retrieval_query)
    lexical_queries = svc.decompose_query(canonical_query, config)
    metadata_terms = _dedupe_keep_order(
        [canonical_query]
        + list(retrieval_hints or [])
        + [str(value) for value in (filters or {}).values() if value not in (None, "")]
    )

    document_type_terms = [
        term
        for term in metadata_terms
        if any(
            marker in _normalized_text(svc, term)
            for marker in ("de cuong", "bai giang", "slide", "de thi", "dap an", "lab", "bai tap", "tham khao")
        )
    ]
    entity_query = " ".join(term for term in metadata_terms[1:] if term != canonical_query).strip()
    semantic_queries = _dedupe_keep_order(
        [canonical_query]
        + ([entity_query] if entity_query else [])
        + document_type_terms[:2]
    )
    expanded_terms = svc.expanded_query_terms(" ".join(_dedupe_keep_order(lexical_queries + semantic_queries)), config)
    words = svc.query_words(expanded_terms + lexical_queries + semantic_queries)
    hard_filters = dict(filters or {})
    soft_filters = {
        "doc_type": hard_filters.get("doc_type", ""),
        "owner_code": hard_filters.get("owner_code", ""),
    }
    return {
        "followup_resolved_query": retrieval_query,
        "canonical_query": canonical_query,
        "entity_query": entity_query,
        "document_type_query": " ".join(document_type_terms[:2]).strip(),
        "semantic_queries": semantic_queries,
        "lexical_queries": lexical_queries,
        "metadata_terms": metadata_terms,
        "expanded_terms": expanded_terms,
        "hard_filters": hard_filters,
        "soft_filters": soft_filters,
        "words": words,
    }


def _metadata_match_score(svc: Any, document: dict, metadata_terms: list[str], filters: dict | None) -> float:
    searchable = " ".join(
        [
            str(document.get("title") or ""),
            str(document.get("topic") or ""),
            str(document.get("doc_type") or ""),
            str(document.get("document_type") or ""),
            str(document.get("folder_path") or ""),
            str(document.get("owner_code") or ""),
        ]
    )
    searchable_folded = _normalized_text(svc, searchable)
    score = 0.0
    for term in metadata_terms:
        folded = _normalized_text(svc, term)
        if not folded:
            continue
        if folded in searchable_folded:
            score += 3.5
        else:
            term_tokens = _tokenize(svc, term)
            if term_tokens:
                score += 0.8 * sum(1 for token in term_tokens if token in searchable_folded)
    if filters:
        for key in ("doc_type", "owner_code", "document_type"):
            value = filters.get(key)
            if value and _normalized_text(svc, str(value)) in searchable_folded:
                score += 2.0
    return score


def _source_quality_score(svc: Any, document: dict, content: str) -> float:
    text_quality = min(2.5, float(svc.meaningful_text_score(content[:1200])) / 450.0)
    metadata_quality = 0.0
    if document.get("topic"):
        metadata_quality += 0.35
    if document.get("doc_type") or document.get("document_type"):
        metadata_quality += 0.35
    doc_type = _normalized_text(svc, str(document.get("doc_type") or document.get("document_type") or ""))
    if doc_type and doc_type not in {"tai lieu khac", "cv", "ho so"}:
        metadata_quality += 0.3
    if document.get("updated_at"):
        metadata_quality += 0.1
    return text_quality + metadata_quality


def _candidate_signature(svc: Any, document: dict, content: str) -> set[str]:
    title = str(document.get("title") or "")
    topic = str(document.get("topic") or "")
    doc_type = str(document.get("doc_type") or document.get("document_type") or "")
    snippet = re.sub(r"\s+", " ", content.strip())[:180]
    return _tokenize(svc, f"{title} {topic} {doc_type} {snippet}")


def _apply_mmr(
    svc: Any,
    candidates: list[tuple[float, dict, str]],
    *,
    limit: int,
    lambda_weight: float,
) -> list[tuple[float, dict, str]]:
    if len(candidates) <= 2:
        return candidates[:limit]
    top_score = max(float(score) for score, _, _ in candidates) or 1.0
    signatures = {
        document["id"]: _candidate_signature(svc, document, content)
        for score, document, content in candidates
    }
    remaining = list(candidates)
    selected: list[tuple[float, dict, str]] = []

    while remaining and len(selected) < limit:
        best_idx = 0
        best_value = None
        for idx, candidate in enumerate(remaining):
            score, document, _content = candidate
            relevance = float(score) / top_score
            novelty_penalty = 0.0
            if selected:
                current_signature = signatures.get(document["id"], set())
                novelty_penalty = max(
                    (
                        len(current_signature & signatures.get(selected_doc["id"], set()))
                        / max(1, len(current_signature | signatures.get(selected_doc["id"], set())))
                    )
                    for _selected_score, selected_doc, _selected_content in selected
                )
            mmr_value = lambda_weight * relevance - (1.0 - lambda_weight) * novelty_penalty
            if best_value is None or mmr_value > best_value:
                best_value = mmr_value
                best_idx = idx
        selected.append(remaining.pop(best_idx))
    return selected


def run_retrieval(
    svc: Any,
    db: Any,
    user: dict,
    retrieval_query: str,
    filters: dict | None,
    retrieval_hints: list[str] | None = None,
) -> tuple:
    """Run hybrid retrieval and return candidates plus query expansion metadata."""
    allowed = {document["id"]: document for document in svc.rag_documents(db, user)}
    config = svc.search_policy(db)
    query_plan = _build_query_plan(svc, retrieval_query, config, filters, retrieval_hints)
    rewritten_query = query_plan["canonical_query"]
    sub_queries = query_plan["lexical_queries"]
    expanded_terms = query_plan["expanded_terms"]
    semantic_queries = query_plan["semantic_queries"]
    metadata_terms = query_plan["metadata_terms"]
    query_vectors: dict[str, list[float]] = {}
    words = query_plan["words"]
    filtered_allowed = {
        doc_id: doc for doc_id, doc in allowed.items() if svc.metadata_matches(doc, filters)
    }

    requested_provider = svc._retrieval_provider()
    provider_used = requested_provider
    fallback_used = False
    fallback_reason = ""
    candidate_count = 0
    filtered_count = 0
    vector_matches: list = []
    lexical_matches: list = []
    metadata_matches: list = []
    retrieval_started = time.perf_counter()

    if requested_provider == "qdrant" and svc.qdrant_enabled():
        try:
            top_k = max(1, int(config.get("semantic_top_k", os.getenv("QDRANT_TOP_K", "100"))))
            for semantic_query in semantic_queries:
                query_vector = svc.ai_provider.embed(semantic_query)
                hits = svc.search_vectors(query_vector, user["code"], limit=top_k)
                candidate_count += len(hits)
                semantic_words = svc.query_words([semantic_query])
                for hit in hits:
                    payload = hit.get("payload") or {}
                    document_id = payload.get("document_id")
                    document = filtered_allowed.get(document_id)
                    if not document:
                        continue
                    chunk_id = payload.get("chunk_id")
                    chunk = db.execute(
                        "SELECT content FROM chunks WHERE id=? AND document_id=?",
                        (chunk_id, document_id),
                    ).fetchone()
                    if not chunk:
                        continue
                    content = chunk["content"]
                    similarity = float(hit.get("score") or 0.0) * 4.0
                    lexical = svc.lexical_score(semantic_words, document, content)
                    metadata_bonus = _metadata_match_score(svc, document, metadata_terms, filters)
                    hybrid = (
                        similarity * float(config.get("vector_weight", 0.38))
                        + lexical * float(config.get("lexical_weight", 0.62))
                        + metadata_bonus * float(config.get("metadata_weight", 0.28))
                    )
                    vector_matches.append((hybrid, document, content))
                    filtered_count += 1
            if not vector_matches:
                fallback_used = True
                fallback_reason = "no_usable_qdrant_results"
                provider_used = "database"
        except Exception as exc:
            print(json.dumps({"event": "QDRANT_RETRIEVAL_WARNING", "error": str(exc)}, ensure_ascii=True))
            fallback_used = True
            fallback_reason = str(exc)
            provider_used = "database"
    else:
        fallback_used = requested_provider == "qdrant"
        fallback_reason = "qdrant_disabled" if fallback_used else ""
        provider_used = "database"

    if provider_used == "database":
        for chunk in db.execute("SELECT * FROM chunks").fetchall():
            document = filtered_allowed.get(chunk["document_id"])
            if not document:
                continue
            candidate_count += 1
            provider = chunk["provider"]
            if provider not in query_vectors:
                query_vectors[provider] = svc.ai_provider.embed(
                    " ".join(expanded_terms),
                    force_local=provider == "local",
                )
            query_vector = query_vectors[provider]
            vector = json.loads(chunk["vector"])
            similarity = sum(a * b for a, b in zip(query_vector, vector))
            lexical = svc.lexical_score(words, document, chunk["content"])
            metadata_bonus = _metadata_match_score(svc, document, metadata_terms, filters)
            hybrid = (
                similarity * float(config.get("vector_weight", 0.38))
                + lexical * float(config.get("lexical_weight", 0.62))
                + metadata_bonus * float(config.get("metadata_weight", 0.28))
            )
            vector_matches.append((hybrid, document, chunk["content"]))
            if lexical > 0:
                lexical_matches.append((lexical + metadata_bonus, document, chunk["content"]))
            filtered_count += 1

    svc._log_retrieval_metrics(provider_used, retrieval_started, candidate_count, filtered_count, fallback_used)
    if requested_provider == "qdrant" and fallback_used:
        svc.audit(db, user["code"], "rag.qdrant_fallback", "query", None, {
            "question": retrieval_query,
            "reason": fallback_reason,
            "candidate_count": candidate_count,
            "filtered_count": filtered_count,
        })

    scored: list = []
    if provider_used != "qdrant" or fallback_used or not vector_matches:
        for doc in filtered_allowed.values():
            content = svc.content_for(db, doc)
            score = svc.lexical_score(words, doc, content)
            if score:
                metadata_bonus = _metadata_match_score(svc, doc, metadata_terms, filters)
                scored.append((score + metadata_bonus, doc, content))
            metadata_score = _metadata_match_score(svc, doc, metadata_terms, filters)
            if metadata_score > 0:
                metadata_matches.append((metadata_score, doc, content))
    scored = svc.merge_ranked_matches(scored)
    lexical_matches = svc.merge_ranked_matches(lexical_matches)
    metadata_matches = svc.merge_ranked_matches(metadata_matches)
    vector_matches = svc.merge_ranked_matches([item for item in vector_matches if item[0] > 0])
    pre_mmr_candidates = svc.merge_ranked_matches(vector_matches + lexical_matches + metadata_matches + scored)
    candidates = _apply_mmr(
        svc,
        pre_mmr_candidates,
        limit=int(config.get("top_k", 8)),
        lambda_weight=float(config.get("mmr_lambda", 0.74)),
    )
    query_plan["branch_scores"] = {
        "semantic": len(vector_matches),
        "lexical": len(lexical_matches),
        "metadata": len(metadata_matches),
    }
    public_query_plan = {key: value for key, value in query_plan.items() if key != "words"}
    return candidates, config, rewritten_query, expanded_terms, sub_queries, public_query_plan


def run_rerank(svc: Any, candidates: list, intent_meta: dict, config: dict, retrieval_query: str) -> tuple:
    """Score, intent-filter, and threshold retrieved candidates."""
    words = svc.query_words([retrieval_query])
    reranked = [
        (
            svc.rerank_score(score, words, document, content, config)
            + _source_quality_score(svc, document, content) * float(config.get("source_quality_weight", 0.45))
            + _metadata_match_score(svc, document, [retrieval_query], None) * float(config.get("citation_weight", 0.18)),
            document,
            content,
        )
        for score, document, content in candidates
    ]
    reranked = svc.merge_ranked_matches(reranked)[: int(config.get("rerank_k", 5))]
    filtered = [(s, d, c) for s, d, c in reranked if svc._matches_query_intent(d, c, intent_meta)]

    non_teaching_types = {"tai lieu khac", "cv", "ho so"}
    if intent_meta.get("label") in ("topic_search", "document_lookup", "own_document_lookup"):
        filtered_teaching = [
            item for item in filtered
            if svc.strip_accents(str(item[1].get("doc_type") or "")).casefold() not in non_teaching_types
        ]
        filtered = filtered_teaching if filtered_teaching else filtered

    disable_fallback = svc.is_reflection_prompt(retrieval_query) or svc.should_ask_for_clarification(retrieval_query)
    require_overlap = intent_meta.get("label") in {
        "topic_search", "document_lookup", "document_recommendation", "question_answer",
    }
    if require_overlap and filtered:
        overlap_filtered = [
            item for item in filtered
            if svc.match_overlap_count(retrieval_query, item[1], item[2]) > 0
        ]
        if overlap_filtered:
            filtered = overlap_filtered

    if filtered:
        top_score = filtered[0][0]
        threshold = max(float(config.get("confidence_threshold", 0.3)), top_score * 0.35)
        matches = [item for item in filtered if item[0] >= threshold][:3]
    elif intent_meta.get("wants_books") or intent_meta.get("wants_exam") or intent_meta.get("wants_ai") or disable_fallback:
        matches = []
    else:
        min_fallback_score = float(config.get("min_fallback_score", 3.0))
        matches = [item for item in candidates if item[0] >= min_fallback_score][:3]

    trace_fragment = {
        "retrieved": [{"id": d["id"], "score": round(float(s), 4), "title": d["title"]} for s, d, _ in reranked],
        "reranked": [
            {
                "id": d["id"],
                "score": round(float(s), 4),
                "title": d["title"],
                "overlap": svc.match_overlap_count(retrieval_query, d, c),
                "source_quality": round(_source_quality_score(svc, d, c), 4),
            }
            for s, d, c in matches
        ],
    }
    return matches, trace_fragment


def _evidence_quality_label(document: dict, content: str, source_quality: float) -> str:
    if "TEXT_EXTRACTION_INSUFFICIENT" in content or document.get("status") == "TEXT_EXTRACTION_INSUFFICIENT":
        return "ocr_limited"
    if source_quality < 1.2:
        return "weak_evidence"
    return "verified"


def verify_evidence_bundle(
    svc: Any,
    retrieval_query: str,
    matches: list[tuple[float, dict, str]],
    config: dict,
) -> dict:
    if not matches:
        return {
            "status": "insufficient_evidence",
            "message": "Khong du bang chung de trich nguon.",
            "approved_matches": [],
            "primary": None,
            "supporting": [],
            "discarded": [],
        }

    evaluated: list[dict[str, Any]] = []
    for score, document, content in matches:
        overlap = svc.match_overlap_count(retrieval_query, document, content)
        source_quality = _source_quality_score(svc, document, content)
        metadata_score = _metadata_match_score(svc, document, [retrieval_query], None)
        evidence_score = float(score) + overlap * 0.85 + source_quality * 0.45 + metadata_score * 0.25
        quality_label = _evidence_quality_label(document, content, source_quality)
        evaluated.append(
            {
                "match": (score, document, content),
                "doc_id": document.get("id"),
                "title": document.get("title"),
                "score": round(float(score), 4),
                "evidence_score": round(float(evidence_score), 4),
                "overlap": overlap,
                "source_quality": round(float(source_quality), 4),
                "quality_label": quality_label,
            }
        )

    evaluated.sort(key=lambda item: item["evidence_score"], reverse=True)
    primary = evaluated[0]
    approved = [primary]
    supporting: list[dict[str, Any]] = []
    discarded: list[dict[str, Any]] = []
    for item in evaluated[1:]:
        same_family = item["quality_label"] == "ocr_limited" and primary["quality_label"] == "ocr_limited"
        if item["overlap"] > 0 or item["source_quality"] >= 1.5 or same_family:
            supporting.append(item)
            approved.append(item)
        else:
            discarded.append(item)

    approved_matches = [item["match"] for item in approved[:3]]
    top_score = float(primary["score"])
    status = "grounded"
    if primary["quality_label"] != "verified" or top_score < float(config.get("confidence_threshold", 0.3)):
        status = "weak_evidence"

    return {
        "status": status,
        "message": "Da xac minh nguon trich dan chinh va nguon bo tro." if approved_matches else "Khong du bang chung de trich nguon.",
        "approved_matches": approved_matches,
        "primary": {key: value for key, value in primary.items() if key != "match"},
        "supporting": [{key: value for key, value in item.items() if key != "match"} for item in supporting[:2]],
        "discarded": [{key: value for key, value in item.items() if key != "match"} for item in discarded[:3]],
    }


def build_rag_response(
    svc: Any,
    db: Any,
    user: dict,
    question: str,
    retrieval_query: str,
    intent_meta: dict,
    matches: list,
    candidates: list,
    config: dict,
    role: str,
    role_ctx: str,
    trace: dict,
) -> dict:
    """Build the final RAG answer.

    The answer composer still delegates to the existing service implementation
    in this first extraction step because it shares many formatting and policy
    helpers with non-RAG routes. Retrieval and reranking, the highest-churn RAG
    stages, now live in this module.
    """
    evidence_bundle = verify_evidence_bundle(svc, retrieval_query, matches, config)
    augmented_trace = {
        **trace,
        "evidence_bundle": {
            "status": evidence_bundle["status"],
            "message": evidence_bundle["message"],
            "primary": evidence_bundle["primary"],
            "supporting": evidence_bundle["supporting"],
            "discarded": evidence_bundle["discarded"],
        },
    }
    return svc._build_rag_response(
        db=db,
        user=user,
        question=question,
        retrieval_query=retrieval_query,
        intent_meta=intent_meta,
        matches=matches,
        candidates=candidates,
        config=config,
        role=role,
        role_ctx=role_ctx,
        trace=augmented_trace,
    )
