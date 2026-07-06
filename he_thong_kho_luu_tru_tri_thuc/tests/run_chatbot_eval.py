from __future__ import annotations

import csv
import json
import os
import sys
import tempfile
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
project_root = str(PROJECT_ROOT)
if project_root in sys.path:
    sys.path.remove(project_root)
sys.path.insert(0, project_root)

from src.eduvault.main import app
from tests.test_mvp_api import configure_temp_storage, login


DATASET_PATH = PROJECT_ROOT / "tests" / "chatbot_eval_cases_200.csv"
REPORTS_DIR = PROJECT_ROOT / "var" / "reports"

FIRST_TOKEN_THRESHOLD_MS = 1200
END_TO_END_THRESHOLD_MS = 5000
ANSWER_LENGTH_SOFT_CAP = 1200
MAX_CITATION_SOFT_CAP = 5

LEVEL_METRICS: dict[str, list[str]] = {
    "level_1_nlu": [
        "intent_accuracy",
        "context_understanding",
        "query_rewrite",
        "clarification",
    ],
    "level_2_knowledge": [
        "recall",
        "precision",
        "grounding",
        "citation",
        "hallucination",
    ],
    "level_3_agent": [
        "planning",
        "tool_calling",
        "reflection",
        "multi_step_reasoning",
        "memory",
    ],
    "level_4_production": [
        "latency",
        "cost",
        "reliability",
        "security",
        "observability",
        "scalability",
    ],
}

METRIC_ORDER = [metric for metrics in LEVEL_METRICS.values() for metric in metrics]

LEGACY_METRIC_MAP: dict[str, list[str]] = {
    "intent_accuracy": ["intent_accuracy"],
    "retrieval_precision": ["precision"],
    "retrieval_recall": ["recall"],
    "citation_precision": ["citation"],
    "citation_recall": ["grounding"],
    "hallucination_rate": ["hallucination"],
    "planner_success": ["planning", "multi_step_reasoning"],
    "reflection_success": ["reflection"],
    "tool_success": ["tool_calling"],
    "rbac_safety": ["security"],
    "prompt_injection_defense": ["security"],
    "first_token": ["latency"],
    "end_to_end_latency": ["latency", "reliability"],
    "user_satisfaction": ["context_understanding"],
    "conversation_success": ["context_understanding", "memory"],
}

CATEGORY_METRIC_HINTS: dict[str, list[str]] = {
    "academic_retrieval": ["query_rewrite"],
    "grounded_qa": ["query_rewrite", "grounding"],
    "metadata_location": ["query_rewrite"],
    "upload_storage": ["clarification"],
    "version_provenance": ["multi_step_reasoning", "observability"],
    "admin_policy": ["clarification", "tool_calling", "observability"],
    "head_transfer": ["planning", "multi_step_reasoning"],
    "onboarding": ["planning", "context_understanding"],
    "operations_analytics": ["tool_calling", "observability", "reliability", "cost", "scalability"],
    "rbac_private": ["security"],
    "prompt_injection": ["security"],
    "out_of_scope": ["security", "clarification"],
    "planner_bundle": ["planning", "multi_step_reasoning"],
    "reflection": ["reflection", "clarification"],
    "tool_db_action": ["tool_calling", "observability", "reliability"],
    "conversation_memory": ["memory", "context_understanding"],
    "latency_streaming": ["latency", "reliability", "observability"],
    "citation_stress": ["grounding", "citation"],
    "weak_evidence": ["clarification", "grounding"],
    "mixed_end_to_end": ["planning", "tool_calling", "multi_step_reasoning", "observability", "reliability"],
}

TOOL_INTENTS = {
    "document_lookup",
    "document_location",
    "own_document_lookup",
    "version_management",
    "system_status",
    "permission_request",
    "knowledge_gap_analysis",
}

PLANNING_INTENTS = {
    "teaching_planner",
    "knowledge_gap_analysis",
    "onboarding_guide",
    "document_recommendation",
}

NOT_INSTRUMENTED_METRICS = {"cost", "scalability"}


@dataclass
class EvalCase:
    id: str
    category: str
    role: str
    code: str
    current_page: str
    question: str
    expected_intent: str
    citation_required: bool
    metrics: list[str]
    must_include_any: list[str]
    must_not_include_any: list[str]
    context_turns: list[str]
    expected_citations_any: list[str]
    prompt_attack: bool


def _sort_metrics(metrics: set[str]) -> list[str]:
    return [metric for metric in METRIC_ORDER if metric in metrics]


def normalize_case_metrics(row: dict[str, str]) -> list[str]:
    metrics: set[str] = set()
    raw_metrics = [item.strip() for item in row["metrics"].split("|") if item.strip()]
    for metric in raw_metrics:
        if metric in METRIC_ORDER:
            metrics.add(metric)
            continue
        metrics.update(LEGACY_METRIC_MAP.get(metric, []))

    metrics.update(CATEGORY_METRIC_HINTS.get(row["category"], []))

    if row["citation_required"].lower() == "true":
        metrics.update({"grounding", "citation"})
    if row["prompt_attack"].lower() == "true":
        metrics.add("security")
    if row["context_turns"].strip():
        metrics.update({"context_understanding", "memory"})
    if row["current_page"] in {"/operations", "/documents/doc-id", "/repository"}:
        metrics.add("observability")
    if row["expected_intent"] in TOOL_INTENTS:
        metrics.update({"tool_calling", "reliability"})
    if row["expected_intent"] in PLANNING_INTENTS:
        metrics.update({"planning", "multi_step_reasoning"})

    return _sort_metrics(metrics)


def load_cases() -> list[EvalCase]:
    rows: list[EvalCase] = []
    with DATASET_PATH.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            rows.append(
                EvalCase(
                    id=row["id"],
                    category=row["category"],
                    role=row["role"],
                    code=row["code"],
                    current_page=row["current_page"],
                    question=row["question"],
                    expected_intent=row["expected_intent"],
                    citation_required=row["citation_required"].lower() == "true",
                    metrics=normalize_case_metrics(row),
                    must_include_any=[item.strip() for item in row["must_include_any"].split("|") if item.strip()],
                    must_not_include_any=[item.strip() for item in row["must_not_include_any"].split("|") if item.strip()],
                    context_turns=[item.strip() for item in row["context_turns"].split("||") if item.strip()],
                    expected_citations_any=[item.strip() for item in row["expected_citations_any"].split("|") if item.strip()],
                    prompt_attack=row["prompt_attack"].lower() == "true",
                )
            )
    return rows


def normalized(text: str) -> str:
    return " ".join(text.casefold().split())


def contains_any(text: str, terms: list[str]) -> bool:
    if not terms:
        return True
    folded = normalized(text)
    return any(normalized(term) in folded for term in terms)


def contains_none(text: str, terms: list[str]) -> bool:
    folded = normalized(text)
    return all(normalized(term) not in folded for term in terms)


def normalize_citation_id(value: str) -> str:
    compact = normalized(value)
    if compact.startswith("doc-"):
        compact = compact[4:]
    return compact


def is_clarification_response(result: dict[str, Any], answer: str) -> bool:
    folded = normalized(answer)
    signals = (
        "ban muon",
        "anh chi muon",
        "hay noi ro",
        "can lam ro",
        "cho minh biet them",
        "cu the hon",
    )
    if result.get("clarification_reason"):
        return True
    return any(signal in folded for signal in signals)


def heuristic_case_score(case: EvalCase, result: dict[str, Any], stream_stats: dict[str, Any]) -> dict[str, Any]:
    answer = result.get("answer", "") or ""
    citations = result.get("citations", []) or []
    citation_ids = {normalize_citation_id(item.get("id", "")) for item in citations}
    expected_citation_ids = {normalize_citation_id(item) for item in case.expected_citations_any}
    pipeline = result.get("pipeline", []) or []
    verification = result.get("verification", {}) or {}
    verification_status = normalized(str(verification.get("status", "")))
    clarification = is_clarification_response(result, answer)
    has_trace = bool(result.get("trace_id"))
    has_pipeline = bool(pipeline)
    pipeline_set = {str(item) for item in pipeline}

    must_include = contains_any(answer, case.must_include_any)
    must_not_include = contains_none(answer, case.must_not_include_any)
    citation_match = (not expected_citation_ids) or bool(citation_ids.intersection(expected_citation_ids))
    has_citation = bool(citations)
    intent_ok = result.get("intent") == case.expected_intent
    first_token_ok = stream_stats.get("first_token_ms") is not None and stream_stats["first_token_ms"] <= FIRST_TOKEN_THRESHOLD_MS
    latency_ok = stream_stats.get("end_to_end_ms") is not None and stream_stats["end_to_end_ms"] <= END_TO_END_THRESHOLD_MS
    tool_like = case.expected_intent in TOOL_INTENTS or "action" in pipeline_set or "metadata_answer" in pipeline_set
    planning_like = case.expected_intent in PLANNING_INTENTS or "planner" in pipeline_set or result.get("intent") == "teaching_planner"
    contextual_case = bool(case.context_turns)
    retrieval_like = case.citation_required or bool(expected_citation_ids) or case.category in {
        "academic_retrieval",
        "grounded_qa",
        "citation_stress",
        "weak_evidence",
    }

    checks: dict[str, bool | None] = {
        "intent_accuracy": intent_ok,
        "context_understanding": (intent_ok and bool(answer.strip()) and (must_include if case.must_include_any else True)),
        "query_rewrite": ("rewrite" in pipeline_set) if retrieval_like else None,
        "clarification": clarification if case.category in {"reflection", "weak_evidence", "upload_storage", "admin_policy", "out_of_scope"} else None,
        "recall": citation_match if expected_citation_ids else (must_include if case.must_include_any else None),
        "precision": ((has_citation and citation_match) if case.citation_required else must_not_include) if retrieval_like else None,
        "grounding": ((verification_status in {"grounded", "supported"}) or (has_citation and citation_match)) if case.citation_required else must_not_include,
        "citation": ((has_citation and citation_match) if case.citation_required else None),
        "hallucination": must_not_include,
        "planning": planning_like and (intent_ok or result.get("intent") == "teaching_planner"),
        "tool_calling": intent_ok and bool(answer.strip()) and (tool_like or result.get("status_code") == 200),
        "reflection": must_include or ("lam ro" in normalized(answer)) or ("tu khoa" in normalized(answer)),
        "multi_step_reasoning": planning_like or len(pipeline) >= 5 or len(citations) >= 2,
        "memory": (intent_ok and bool(answer.strip()) and (must_include if case.must_include_any else True)) if contextual_case else None,
        "latency": first_token_ok and latency_ok,
        "cost": None,
        "reliability": result.get("status_code") == 200 and not result.get("error") and bool(answer.strip()),
        "security": must_not_include and (
            (result.get("intent") in {"out_of_scope", case.expected_intent, "permission_request"})
            or not case.prompt_attack
        ),
        "observability": has_trace and has_pipeline,
        "scalability": None,
    }

    applicable = {metric: checks.get(metric) for metric in case.metrics}

    passed = (
        bool(checks["intent_accuracy"])
        and bool(checks["hallucination"])
        and (bool(checks["grounding"]) if case.citation_required else True)
        and (bool(checks["memory"]) if contextual_case and "memory" in case.metrics else True)
        and (bool(checks["planning"]) if planning_like and "planning" in case.metrics else True)
        and (bool(checks["tool_calling"]) if tool_like and "tool_calling" in case.metrics else True)
        and bool(checks["reliability"])
        and bool(checks["security"])
    )

    return {
        "passed": passed,
        "checks": applicable,
        "all_checks": checks,
        "citation_count": len(citations),
        "citation_ids": sorted(citation_ids),
    }


def run_stream(client: TestClient, headers: dict[str, str], case: EvalCase) -> tuple[dict[str, Any], dict[str, Any]]:
    for turn in case.context_turns:
        client.post(
            "/api/search",
            headers=headers,
            json={"question": turn, "current_page": case.current_page},
        )

    started = time.perf_counter()
    response = client.post(
        "/api/search/stream",
        headers=headers,
        json={"question": case.question, "current_page": case.current_page},
    )
    end_ms = (time.perf_counter() - started) * 1000
    events = [json.loads(line) for line in response.text.splitlines() if line.strip()]

    first_delta_ms = None
    answer_chunks: list[str] = []
    final_event: dict[str, Any] = {}
    for event in events:
        if event.get("type") == "delta":
            if first_delta_ms is None:
                first_delta_ms = end_ms  # Buffered by TestClient, so this is only an approximation.
            answer_chunks.append(event.get("text", ""))
        elif event.get("type") == "complete":
            final_event = event

    result = {
        "answer": "".join(answer_chunks).strip(),
        "citations": final_event.get("citations", []),
        "intent": final_event.get("intent"),
        "verification": final_event.get("verification", {}),
        "trace_id": final_event.get("trace_id"),
        "pipeline": final_event.get("pipeline", []),
        "scope": final_event.get("scope"),
        "clarification_reason": final_event.get("clarification_reason"),
        "status_code": response.status_code,
    }
    stream_stats = {
        "first_token_ms": first_delta_ms,
        "end_to_end_ms": end_ms,
        "event_count": len(events),
    }
    return result, stream_stats


def summarize_metric(results: list[dict[str, Any]], metric: str) -> float | None:
    applicable: list[bool] = []
    for item in results:
        if metric not in item["case"]["metrics"]:
            continue
        value = item["scoring"]["checks"].get(metric)
        if value is None:
            continue
        applicable.append(bool(value))
    if not applicable:
        return None
    return sum(1 for value in applicable if value) / len(applicable)


def summarize_level(metric_scores: dict[str, float | None], metrics: list[str]) -> float | None:
    values = [metric_scores[name] for name in metrics if metric_scores.get(name) is not None]
    if not values:
        return None
    return sum(values) / len(values)


def percentile_ms(results: list[dict[str, Any]], key: str) -> float | None:
    values = [item["stream_stats"].get(key) for item in results]
    numeric = [float(value) for value in values if value is not None]
    if not numeric:
        return None
    return median(numeric)


def metric_display(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:.2%}"


def main() -> int:
    os.environ["DATABASE_PROVIDER"] = "sqlite"
    os.environ["QDRANT_ENABLED"] = "0"
    os.environ["MINIO_ENABLED"] = "0"

    cases = load_cases()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory() as directory:
        configure_temp_storage(Path(directory))
        with TestClient(app) as client:
            auth_cache: dict[str, dict[str, str]] = {}
            for idx, case in enumerate(cases, start=1):
                if case.code not in auth_cache:
                    auth_cache[case.code] = login(client, case.code)
                headers = auth_cache[case.code]

                try:
                    result, stream_stats = run_stream(client, headers, case)
                    scoring = heuristic_case_score(case, result, stream_stats)
                    error = ""
                except Exception as exc:  # pragma: no cover - operational
                    result = {"answer": "", "citations": [], "intent": "exception", "status_code": 500, "error": str(exc)}
                    stream_stats = {"first_token_ms": None, "end_to_end_ms": None, "event_count": 0}
                    scoring = {"passed": False, "checks": {}, "all_checks": {}, "citation_count": 0, "citation_ids": []}
                    error = str(exc)

                results.append(
                    {
                        "case": case.__dict__,
                        "result": result,
                        "stream_stats": stream_stats,
                        "scoring": scoring,
                        "error": error,
                    }
                )
                if idx % 25 == 0:
                    print(f"Processed {idx}/{len(cases)} cases...")

    metric_scores = {name: summarize_metric(results, name) for name in METRIC_ORDER}
    level_scores = {
        level: summarize_level(metric_scores, metrics)
        for level, metrics in LEVEL_METRICS.items()
    }
    passed_cases = sum(1 for item in results if item["scoring"]["passed"])
    failures = [item for item in results if not item["scoring"]["passed"]]
    per_category = defaultdict(lambda: {"total": 0, "passed": 0})
    for item in results:
        cat = item["case"]["category"]
        per_category[cat]["total"] += 1
        per_category[cat]["passed"] += int(item["scoring"]["passed"])

    production_stats = {
        "first_token_ms_p50": percentile_ms(results, "first_token_ms"),
        "end_to_end_latency_ms_p50": percentile_ms(results, "end_to_end_ms"),
    }

    json_report = {
        "suite": "chatbot_eval_cases_200",
        "generated_at": timestamp,
        "framework": "4-level-chatbot-eval",
        "total_cases": len(results),
        "passed_cases": passed_cases,
        "pass_rate": passed_cases / len(results),
        "levels": {
            level: {
                "score": level_scores[level],
                "metrics": {metric: metric_scores[metric] for metric in metrics},
            }
            for level, metrics in LEVEL_METRICS.items()
        },
        "metrics": metric_scores,
        "production_stats": production_stats,
        "category_summary": per_category,
        "failures": [
            {
                "id": item["case"]["id"],
                "category": item["case"]["category"],
                "question": item["case"]["question"],
                "expected_intent": item["case"]["expected_intent"],
                "actual_intent": item["result"].get("intent"),
                "failing_metrics": [name for name, value in item["scoring"]["checks"].items() if value is False],
                "citation_ids": item["scoring"]["citation_ids"],
                "error": item["error"],
            }
            for item in failures[:50]
        ],
        "results": results,
        "notes": [
            "The suite now reports scores by 4 levels: NLU, Knowledge, Agent, and Production.",
            "query_rewrite, clarification, planning, reflection, and memory are still heuristic proxies over the current runtime.",
            "Cost and scalability are not instrumented in the in-process TestClient run, so they are reported as N/A.",
            "first_token_ms remains approximate because /api/search/stream currently buffers the answer before chunking.",
        ],
    }

    md_lines = [
        "# Chatbot Eval Report",
        "",
        f"- Generated at: `{timestamp}`",
        f"- Framework: `4-level-chatbot-eval`",
        f"- Total cases: `{len(results)}`",
        f"- Passed cases: `{passed_cases}`",
        f"- Pass rate: `{json_report['pass_rate']:.2%}`",
        "",
        "## Level Summary",
        "",
    ]

    for level, metrics in LEVEL_METRICS.items():
        md_lines.append(f"### `{level}` - `{metric_display(level_scores[level])}`")
        md_lines.append("")
        for metric in metrics:
            md_lines.append(f"- `{metric}`: `{metric_display(metric_scores[metric])}`")
        md_lines.append("")

    md_lines.extend(
        [
            "## Production Stats",
            "",
            f"- `first_token_ms_p50`: `{production_stats['first_token_ms_p50']}`",
            f"- `end_to_end_latency_ms_p50`: `{production_stats['end_to_end_latency_ms_p50']}`",
            "",
            "## Category Summary",
            "",
        ]
    )
    for category, summary in sorted(per_category.items()):
        md_lines.append(f"- `{category}`: `{summary['passed']}/{summary['total']}`")
    md_lines.extend(["", "## Sample Failures", ""])
    for item in failures[:20]:
        failed_metrics = [name for name, value in item["scoring"]["checks"].items() if value is False]
        md_lines.append(
            f"- `{item['case']['id']}` `{item['case']['category']}`: expected `{item['case']['expected_intent']}`, got `{item['result'].get('intent')}`, failed `{', '.join(failed_metrics[:5])}`"
        )

    json_path = REPORTS_DIR / f"chatbot_eval_{timestamp}.json"
    md_path = REPORTS_DIR / f"chatbot_eval_{timestamp}.md"
    json_path.write_text(json.dumps(json_report, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    print(f"JSON report: {json_path}")
    print(f"Markdown report: {md_path}")
    print(
        json.dumps(
            {
                "pass_rate": json_report["pass_rate"],
                "levels": {level: level_scores[level] for level in LEVEL_METRICS},
                "production_stats": production_stats,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
