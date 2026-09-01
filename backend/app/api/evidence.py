from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.store import store
from app.guards import redact_secrets
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
        _prompt_evidence(trace),
        _context_evidence(context),
        _model_evidence(trace),
        _role_evidence(trace),
        _tool_evidence(trace),
        _governance_evidence(trace),
        _extension_evidence(trace),
        _memory_evidence(trace),
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
    details = [
        _detail("context_tokens", f"{context.budget_report.used_tokens}/{context.budget_report.max_tokens}"),
        _detail("context_protocols", str(len(protocols))),
        *_limited_details("context_item", [item.source for item in protocols], limit=4),
    ]
    return _item("context", "ready" if selected else "pending", len(selected), detail, "context_pack", details)


def _prompt_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    request_events = [event for event in trace if event.get("event") == "model.requested"]
    latest_layers = _latest_prompt_layers(request_events)
    layer_count = len(latest_layers)
    state = "ready" if layer_count else "pending"
    token_total = sum(int(layer.get("tokens", 0) or 0) for layer in latest_layers)
    detail = f"{layer_count} prompt layers, approximately {token_total} tokens"
    details = [
        _detail("prompt_layer", f"{_safe_value(str(layer.get('id', 'layer')))}: {int(layer.get('tokens', 0) or 0)}")
        for layer in latest_layers[:6]
    ]
    return _item("prompt", state, layer_count, detail, "planner", details)


def _model_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    requested = _count(trace, "model.requested")
    cached = _count(trace, "model.cache.hit")
    responded = _count(trace, "model.responded")
    errors = _count(trace, "model.error")
    state = "failed" if errors else "ready" if requested or cached or responded else "pending"
    detail = f"{requested} provider requests, {cached} cache hits, {responded} responses"
    model_names = _model_names(trace)
    details = [
        _detail("model_provider_requests", str(requested)),
        _detail("model_cache_hits", str(cached)),
        *_limited_details("model_name", model_names, limit=4),
    ]
    return _item("model", state, requested + cached + responded, detail, "trace", details)


def _role_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    reviews = _count(trace, "agent.review.completed")
    verifications = _count(trace, "agent.verification.completed")
    warnings = sum(
        1 for event in trace
        if event.get("event") == "agent.review.completed"
        and isinstance(event.get("payload"), dict)
        and isinstance(event["payload"].get("assessment"), dict)
        and event["payload"]["assessment"].get("verdict") == "needs_attention"
    )
    state = "warning" if warnings else "ready" if reviews or verifications else "pending"
    detail = f"{reviews} reviewer checks, {verifications} verifier checks, {warnings} warnings"
    details = [
        _detail("agent_review", str(reviews), "warning" if warnings else "ready"),
        _detail("agent_verification", str(verifications)),
        _detail("agent_warning", str(warnings), "warning" if warnings else "ready"),
    ]
    return _item("agent_roles", state, reviews + verifications, detail, "role_board", details)


def _tool_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    executed = _count(trace, "tool.executed")
    failed = _count(trace, "tool.failed")
    rejected = _count(trace, "action.rejected")
    state = "failed" if failed else "warning" if rejected else "ready" if executed else "pending"
    detail = f"{executed} tool calls, {failed} failed, {rejected} rejected"
    details = [
        *_limited_details("tool_type", _action_types(trace, {"tool.executed", "tool.failed"}), limit=5),
        _detail("tool_failed", str(failed), "failed" if failed else "ready"),
        _detail("tool_rejected", str(rejected), "warning" if rejected else "ready"),
    ]
    return _item("tools", state, executed + failed + rejected, detail, "trace", details)


def _governance_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    evaluated = _count(trace, "policy.evaluated")
    requested = _count(trace, "approval.requested")
    resolved = _count(trace, "approval.resolved")
    pending = max(0, requested - resolved - _count(trace, "approval.cancelled"))
    state = "warning" if pending else "ready" if evaluated or requested else "pending"
    detail = f"{evaluated} policy evaluations, {requested} approvals, {pending} pending"
    details = [
        _detail("policy_evaluations", str(evaluated)),
        _detail("approval_requested", str(requested)),
        _detail("approval_resolved", str(resolved)),
        _detail("approval_pending", str(pending), "warning" if pending else "ready"),
    ]
    return _item("governance", state, evaluated + requested + resolved, detail, "policy_engine", details)


def _extension_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    skills = _count(trace, "skill.activated")
    mcp_calls = _count(trace, "mcp.tool.called")
    hooks = _count(trace, "hook.started") + _count(trace, "hook.finished") + _count(trace, "hook.blocked")
    state = "ready" if skills or mcp_calls or hooks else "pending"
    detail = f"{skills} skill activations, {mcp_calls} MCP calls, {hooks} hook events"
    details = [
        *_limited_details("skill_id", _payload_values(trace, "skill.activated", "skill_id"), limit=4),
        *_limited_details("mcp_tool", _payload_values(trace, "mcp.tool.called", "tool"), limit=4),
        _detail("hook_events", str(hooks)),
    ]
    return _item("extensions", state, skills + mcp_calls + hooks, detail, "extension_runtime", details)


def _memory_evidence(trace: list[dict[str, Any]]) -> dict[str, object]:
    written = _count(trace, "memory.written")
    failed = _count(trace, "memory.failed")
    latest = _latest_memory_recommendations(trace)
    state = "failed" if failed else "ready" if written or latest else "pending"
    detail = f"{len(latest)} recommendations, {written} writes, {failed} failed"
    details = [
        _detail("memory_recommendations", str(len(latest))),
        _detail("memory_written", str(written)),
        _detail("memory_failed", str(failed), "failed" if failed else "ready"),
    ]
    return _item("memory", state, len(latest) + written, detail, "memory_manager", details)


def _test_evidence(test_summary: dict[str, Any] | None) -> dict[str, object]:
    if not test_summary:
        return _item("tests", "pending", 0, "No test summary is available yet", "artifacts")
    status = str(test_summary.get("status", "Not run"))
    state = "ready" if status == "Passed" else "failed" if status == "Failed" else "pending"
    command = str(test_summary.get("command", "Not selected"))
    passed = int(test_summary.get("passed", 0) or 0)
    failed = int(test_summary.get("failed", 0) or 0)
    detail = f"{status}: {_safe_value(command)}; {passed} passed, {failed} failed"
    details = [
        _detail("test_status", status, state),
        _detail("test_command", _safe_value(command)),
        _detail("test_passed", str(passed)),
        _detail("test_failed", str(failed), "failed" if failed else "ready"),
    ]
    return _item("tests", state, passed + failed, detail, "run_artifacts", details)


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
    check_details = [
        _detail(
            "completion_check",
            f"{_safe_value(str(check.get('id', 'unknown')))}: {'passed' if check.get('passed') else 'missing'}",
            "ready" if check.get("passed") else "failed" if check.get("required") else "warning",
        )
        for check in checks
        if isinstance(check, dict)
    ]
    details = [_detail("completion_verdict", verdict, state), *check_details[:6]]
    return _item("completion", state, passed + failed, detail, "completion_guard", details)


def _item(
    kind: str,
    state: str,
    count: int,
    detail: str,
    source: str,
    details: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "id": kind,
        "state": state,
        "count": count,
        "detail": detail,
        "source": source,
        "details": details or [],
    }


def _count(trace: list[dict[str, Any]], event_name: str) -> int:
    return sum(1 for event in trace if event.get("event") == event_name)


def _detail(label: str, value: str, state: str = "ready") -> dict[str, object]:
    return {"label": label, "value": _safe_value(value), "state": state}


def _limited_details(label: str, values: list[str], *, limit: int) -> list[dict[str, object]]:
    return [_detail(label, value) for value in _unique(values)[:limit]]


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = _safe_value(value)
        if not clean or clean in seen:
            continue
        seen.add(clean)
        result.append(clean)
    return result


def _safe_value(value: str, *, limit: int = 120) -> str:
    redacted = redact_secrets(value).replace("\n", " ").strip()
    return redacted if len(redacted) <= limit else f"{redacted[: limit - 3]}..."


def _payload_values(trace: list[dict[str, Any]], event_name: str, key: str) -> list[str]:
    values: list[str] = []
    for event in trace:
        if event.get("event") != event_name:
            continue
        payload = event.get("payload", {})
        if isinstance(payload, dict) and isinstance(payload.get(key), str):
            values.append(payload[key])
    return values


def _action_types(trace: list[dict[str, Any]], event_names: set[str]) -> list[str]:
    actions: list[str] = []
    for event in trace:
        if event.get("event") not in event_names:
            continue
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            continue
        action = payload.get("action")
        if isinstance(action, dict) and isinstance(action.get("type"), str):
            actions.append(action["type"])
            continue
        result = payload.get("result")
        if isinstance(result, dict) and isinstance(result.get("tool"), str):
            actions.append(result["tool"])
    return actions


def _model_names(trace: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for event in trace:
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            continue
        response = payload.get("response")
        if isinstance(response, dict) and isinstance(response.get("model"), str):
            names.append(response["model"])
        request = payload.get("request")
        if isinstance(request, dict) and isinstance(request.get("model"), str):
            names.append(request["model"])
    return names


def _latest_prompt_layers(request_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for event in reversed(request_events):
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            continue
        request = payload.get("request", {})
        if not isinstance(request, dict):
            continue
        metadata = request.get("metadata", {})
        if not isinstance(metadata, dict):
            continue
        layers = metadata.get("prompt_layers", [])
        if isinstance(layers, list):
            return [layer for layer in layers if isinstance(layer, dict)]
    return []


def _latest_memory_recommendations(trace: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for event in reversed(trace):
        if event.get("event") != "memory.written":
            continue
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            return []
        recommendations = payload.get("recommendations", [])
        if isinstance(recommendations, list):
            return [item for item in recommendations if isinstance(item, dict)]
    return []
