from __future__ import annotations

from collections import Counter
from datetime import datetime
import json
from pathlib import Path
from typing import Any

from app.runtime.history_store import HistoryStore


TERMINAL_STATUSES = {"completed", "failed", "cancelled", "interrupted"}
KNOWN_FAILURES = {
    "cancelled_before_start",
    "invalid_action_ir",
    "max_input_tokens",
    "max_model_calls",
    "max_output_tokens",
    "max_steps",
    "max_tool_calls",
    "max_wall_time_seconds",
    "model_error",
    "user_cancelled",
    "worker_error",
}


def build_evaluation_summary(history: HistoryStore, project_id: str | None = None) -> dict[str, object]:
    runs, _ = history.list_runs(
        project_id=project_id,
        include_archived=True,
        limit=1_000_000,
    )
    terminal = [run for run in runs if run["status"] in TERMINAL_STATUSES]
    status_counts = Counter(str(run["status"]) for run in terminal)
    observed_tests = [run for run in terminal if str(run["test_status"]).lower() not in {"", "not run"}]
    passed_tests = [run for run in observed_tests if str(run["test_status"]).lower() == "passed"]
    event_counts: Counter[str] = Counter()
    evidence_gaps = 0
    for run in runs:
        events, valid = _read_trace_events(run)
        if not valid:
            evidence_gaps += 1
            continue
        for event in events:
            name = event.get("event")
            if not isinstance(name, str):
                continue
            if name == "approval.requested":
                event_counts["approval_requests"] += 1
            elif name == "approval.resolved":
                payload = event.get("payload")
                if isinstance(payload, dict) and payload.get("decision") == "approve_once":
                    event_counts["approvals_granted"] += 1
            elif name == "policy.evaluated":
                payload = event.get("payload")
                evaluation = payload.get("evaluation") if isinstance(payload, dict) else None
                if isinstance(evaluation, dict) and evaluation.get("outcome") != "allowed":
                    event_counts["guard_blocks"] += 1
            elif name == "context.compacted":
                event_counts["context_compactions"] += 1
            elif name == "run.resumed":
                event_counts["resumes"] += 1

    failures = Counter(_failure_category(run) for run in terminal if run["status"] != "completed")
    terminal_count = len(terminal)
    completed_count = status_counts["completed"]
    approval_requests = event_counts["approval_requests"]
    return {
        "scope": {"project_id": project_id, "local_only": True},
        "runs": {
            "total": len(runs),
            "terminal": terminal_count,
            "active": len(runs) - terminal_count,
            "status": dict(sorted(status_counts.items())),
        },
        "rates": {
            "completion": _rate(completed_count, terminal_count),
            "test_pass": _rate(len(passed_tests), len(observed_tests)),
            "patch_acceptance": _rate(event_counts["approvals_granted"], approval_requests),
        },
        "averages": {
            "steps": _average(terminal, "steps"),
            "model_calls": _average(terminal, "model_calls"),
            "tool_calls": _average(terminal, "tool_calls"),
            "total_tokens": _average(terminal, "total_tokens"),
            "repair_attempts": _average(terminal, "repair_attempts"),
            "duration_ms": _average_duration(terminal),
        },
        "governance": {
            "approval_requests": approval_requests,
            "approvals_granted": event_counts["approvals_granted"],
            "guard_blocks": event_counts["guard_blocks"],
            "context_compactions": event_counts["context_compactions"],
            "resumes": event_counts["resumes"],
        },
        "failures": [
            {"category": category, "count": count, "share": _rate(count, sum(failures.values()))}
            for category, count in sorted(failures.items(), key=lambda item: (-item[1], item[0]))
        ],
        "evidence": {
            "trace_runs": len(runs) - evidence_gaps,
            "evidence_gaps": evidence_gaps,
        },
        "privacy": {
            "content_collected": False,
            "fields_excluded": ["task", "project_path", "source", "prompt", "trace_payload", "credential"],
        },
    }


def _read_trace_events(run: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    workspace = Path(str(run["project_path"])).resolve()
    expected_root = (workspace / "runs" / str(run["run_id"])).resolve()
    trace_path = Path(str(run["trace_path"])).expanduser().resolve()
    if not trace_path.is_relative_to(expected_root) or not trace_path.is_file():
        return [], False
    try:
        lines = trace_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return [], False
    events: list[dict[str, Any]] = []
    valid = True
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            valid = False
            continue
        if isinstance(event, dict):
            events.append(event)
        else:
            valid = False
    return events, valid


def _failure_category(run: dict[str, Any]) -> str:
    if run["status"] == "interrupted":
        return "interrupted"
    reason = str(run.get("termination_reason") or "")
    return reason if reason in KNOWN_FAILURES else str(run["status"] or "other")


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _average(runs: list[dict[str, Any]], key: str) -> float | None:
    if not runs:
        return None
    return round(sum(float(run.get(key, 0) or 0) for run in runs) / len(runs), 2)


def _average_duration(runs: list[dict[str, Any]]) -> float | None:
    durations = [duration for run in runs if (duration := _duration_ms(run)) is not None]
    return round(sum(durations) / len(durations), 2) if durations else None


def _duration_ms(run: dict[str, Any]) -> int | None:
    start = run.get("created_at")
    end = run.get("completed_at") or run.get("updated_at")
    if not start or not end:
        return None
    try:
        return max(0, int((datetime.fromisoformat(str(end)) - datetime.fromisoformat(str(start))).total_seconds() * 1000))
    except ValueError:
        return None
