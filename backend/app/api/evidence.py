from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.store import store
from app.models import RunPhase
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["evidence"])


@router.get("/{run_id}/evidence")
def get_run_evidence(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project_id = store.run_projects.get(run_id)
    project = store.projects.get(project_id) if project_id is not None else None
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")

    trace = TraceWriter(project.path / "runs").read_events(run_id)
    context = store.contexts.get(run_id)
    artifacts = store.artifacts.get(run_id)
    result = store.run_results.get(run_id)
    items = [
        _context_evidence(context),
        _model_evidence(trace),
        _tool_evidence(trace),
        _governance_evidence(trace),
        _extension_evidence(trace),
        _test_evidence(artifacts.test_summary.to_dict() if artifacts is not None else None),
        _completion_evidence(result.completion.to_dict() if result is not None and result.completion is not None else None, run.status),
    ]
    ready = sum(1 for item in items if item["state"] == "ready")
    attention = sum(1 for item in items if item["state"] in {"warning", "failed"})
    score = round(ready / len(items), 2) if items else 0.0
    return {
        "run_id": run_id,
        "status": run.status.value,
        "score": score,
        "ready": ready,
        "attention": attention,
        "items": items,
        "privacy": {
            "content_collected": False,
            "fields_excluded": ["source_code", "tool_output", "prompt_content", "model_response_content"],
        },
    }


def _context_evidence(context) -> dict[str, object]:
    if context is None or context.budget_report is None:
        return _item("context", "pending", 0, "Context Pack is not available yet", "runtime")
    selected = set(context.selected_items + context.compressed_items)
    protocols = [
        item for item in context.items
        if item.id in selected and item.type in {"project_rules", "project_protocol"}
    ]
    detail = (
        f"{len(selected)} selected items, {context.budget_report.used_tokens}/"
        f"{context.budget_report.max_tokens} tokens, {len(protocols)} protocol items"
    )
    return _item("context", "ready" if selected else "pending", len(selected), detail, "context_pack")


def _model_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    requested = _count(trace, "model.requested")
    cached = _count(trace, "model.cache.hit")
    responded = _count(trace, "model.responded")
    errors = _count(trace, "model.error")
    state = "failed" if errors else "ready" if requested or cached or responded else "pending"
    detail = f"{requested} provider requests, {cached} cache hits, {responded} responses"
    return _item("model", state, requested + cached + responded, detail, "trace")


def _tool_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    executed = _count(trace, "tool.executed")
    failed = _count(trace, "tool.failed")
    rejected = _count(trace, "action.rejected")
    state = "failed" if failed else "warning" if rejected else "ready" if executed else "pending"
    detail = f"{executed} tool calls, {failed} failed, {rejected} rejected"
    return _item("tools", state, executed + failed + rejected, detail, "trace")


def _governance_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    evaluated = _count(trace, "policy.evaluated")
    requested = _count(trace, "approval.requested")
    resolved = _count(trace, "approval.resolved")
    pending = max(0, requested - resolved - _count(trace, "approval.cancelled"))
    state = "warning" if pending else "ready" if evaluated or requested else "pending"
    detail = f"{evaluated} policy evaluations, {requested} approvals, {pending} pending"
    return _item("governance", state, evaluated + requested + resolved, detail, "policy_engine")


def _extension_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    skills = _count(trace, "skill.activated")
    mcp_calls = _count(trace, "mcp.tool.called")
    hooks = _count(trace, "hook.started") + _count(trace, "hook.finished") + _count(trace, "hook.blocked")
    state = "ready" if skills or mcp_calls or hooks else "pending"
    detail = f"{skills} skill activations, {mcp_calls} MCP calls, {hooks} hook events"
    return _item("extensions", state, skills + mcp_calls + hooks, detail, "extension_runtime")


def _test_evidence(test_summary: dict[str, Any] | None) -> dict[str, object]:
    if not test_summary:
        return _item("tests", "pending", 0, "No test summary is available yet", "artifacts")
    status = str(test_summary.get("status", "Not run"))
    state = "ready" if status == "Passed" else "failed" if status == "Failed" else "pending"
    command = str(test_summary.get("command", "Not selected"))
    passed = int(test_summary.get("passed", 0) or 0)
    failed = int(test_summary.get("failed", 0) or 0)
    detail = f"{status}: {command}; {passed} passed, {failed} failed"
    return _item("tests", state, passed + failed, detail, "run_artifacts")


def _completion_evidence(completion: dict[str, Any] | None, status: RunPhase) -> dict[str, object]:
    if not completion:
        state = "pending" if status not in {RunPhase.COMPLETED, RunPhase.FAILED, RunPhase.CANCELLED} else "warning"
        return _item("completion", state, 0, "No structured completion assessment yet", "completion_guard")
    checks = completion.get("checks", [])
    passed = len([check for check in checks if isinstance(check, dict) and check.get("passed") is True])
    failed = len([check for check in checks if isinstance(check, dict) and check.get("required") is True and check.get("passed") is False])
    verdict = str(completion.get("verdict", "unknown"))
    state = "ready" if verdict == "passed" else "failed" if failed else "warning"
    detail = f"{verdict}: {passed} checks passed, {failed} required checks failed"
    return _item("completion", state, passed + failed, detail, "completion_guard")


def _item(kind: str, state: str, count: int, detail: str, source: str) -> dict[str, object]:
    return {
        "id": kind,
        "state": state,
        "count": count,
        "detail": detail,
        "source": source,
    }


def _count(trace: list[dict[str, Any]], event_name: str) -> int:
    return sum(1 for event in trace if event.get("event") == event_name)
