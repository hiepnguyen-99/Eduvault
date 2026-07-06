from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


DATASET_PATH = Path(__file__).with_name("chatbot_eval_cases_200.csv")

VALID_ROLES = {"lecturer", "new_lecturer", "head", "admin"}
VALID_CODES = {"GV001", "GVNEW", "TBM01", "ADMIN"}

EXPECTED_METRICS = {
    "intent_accuracy",
    "context_understanding",
    "query_rewrite",
    "clarification",
    "recall",
    "precision",
    "grounding",
    "citation",
    "hallucination",
    "planning",
    "tool_calling",
    "reflection",
    "multi_step_reasoning",
    "memory",
    "latency",
    "cost",
    "reliability",
    "security",
    "observability",
    "scalability",
}

LEGACY_METRIC_MAP = {
    "intent_accuracy": {"intent_accuracy"},
    "retrieval_precision": {"precision"},
    "retrieval_recall": {"recall"},
    "citation_precision": {"citation"},
    "citation_recall": {"grounding"},
    "hallucination_rate": {"hallucination"},
    "planner_success": {"planning", "multi_step_reasoning"},
    "reflection_success": {"reflection"},
    "tool_success": {"tool_calling"},
    "rbac_safety": {"security"},
    "prompt_injection_defense": {"security"},
    "first_token": {"latency"},
    "end_to_end_latency": {"latency", "reliability"},
    "user_satisfaction": {"context_understanding"},
    "conversation_success": {"context_understanding", "memory"},
}

CATEGORY_METRIC_HINTS = {
    "academic_retrieval": {"query_rewrite"},
    "grounded_qa": {"query_rewrite", "grounding"},
    "metadata_location": {"query_rewrite"},
    "upload_storage": {"clarification"},
    "version_provenance": {"multi_step_reasoning", "observability"},
    "admin_policy": {"clarification", "tool_calling", "observability"},
    "head_transfer": {"planning", "multi_step_reasoning"},
    "onboarding": {"planning", "context_understanding"},
    "operations_analytics": {"tool_calling", "observability", "reliability", "cost", "scalability"},
    "rbac_private": {"security"},
    "prompt_injection": {"security"},
    "out_of_scope": {"security", "clarification"},
    "planner_bundle": {"planning", "multi_step_reasoning"},
    "reflection": {"reflection", "clarification"},
    "tool_db_action": {"tool_calling", "observability", "reliability"},
    "conversation_memory": {"memory", "context_understanding"},
    "latency_streaming": {"latency", "reliability", "observability"},
    "citation_stress": {"grounding", "citation"},
    "weak_evidence": {"clarification", "grounding"},
    "mixed_end_to_end": {"planning", "tool_calling", "multi_step_reasoning", "observability", "reliability"},
}


def _rows() -> list[dict[str, str]]:
    with DATASET_PATH.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def _normalized_metrics(row: dict[str, str]) -> set[str]:
    metrics: set[str] = set()
    for item in [part.strip() for part in row["metrics"].split("|") if part.strip()]:
        if item in EXPECTED_METRICS:
            metrics.add(item)
        else:
            metrics.update(LEGACY_METRIC_MAP.get(item, set()))

    metrics.update(CATEGORY_METRIC_HINTS.get(row["category"], set()))
    if row["citation_required"] == "true":
        metrics.update({"grounding", "citation"})
    if row["prompt_attack"] == "true":
        metrics.add("security")
    if row["context_turns"].strip():
        metrics.update({"context_understanding", "memory"})
    if row["current_page"] in {"/operations", "/documents/doc-id", "/repository"}:
        metrics.add("observability")
    return metrics


def test_eval_suite_has_200_cases_and_unique_ids():
    rows = _rows()
    assert len(rows) == 200
    ids = [row["id"] for row in rows]
    assert len(ids) == len(set(ids))


def test_eval_suite_has_20_categories_with_10_cases_each():
    rows = _rows()
    counts = Counter(row["category"] for row in rows)
    assert len(counts) == 20
    assert all(count == 10 for count in counts.values())


def test_eval_suite_roles_codes_and_metrics_are_valid():
    rows = _rows()
    metric_counts: Counter[str] = Counter()
    for row in rows:
        assert row["role"] in VALID_ROLES
        assert row["code"] in VALID_CODES
        assert row["question"].strip()
        assert row["expected_intent"].strip()
        assert row["citation_required"] in {"true", "false"}
        metrics = _normalized_metrics(row)
        assert metrics
        assert metrics.issubset(EXPECTED_METRICS)
        metric_counts.update(metrics)

    # Some production metrics are runtime-derived and need not appear as explicit CSV tags.
    required_coverage = EXPECTED_METRICS - {"cost", "scalability"}
    assert required_coverage.issubset(metric_counts)
    assert all(metric_counts[name] >= 5 for name in required_coverage)


def test_eval_suite_contains_prompt_attacks_and_contextual_cases():
    rows = _rows()
    prompt_attacks = [row for row in rows if row["prompt_attack"] == "true"]
    contextual_cases = [row for row in rows if row["context_turns"].strip()]
    assert len(prompt_attacks) >= 10
    assert len(contextual_cases) >= 10
