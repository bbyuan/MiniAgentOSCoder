from __future__ import annotations

import json
from pathlib import Path

from app.context import discover_project_rules, retrieve_workspace_context
from app.context.pack_builder import ContextCandidate, build_context_pack, explain_context_items
from app.guards import redact_secrets
from app.models import ContextPack, DiffSummary, MemoryEntry, PlanStep, RunArtifacts, RunState, TestSummary, TraceEvent


def build_initial_plan(mode: str, project_profile: dict[str, object]) -> list[PlanStep]:
    test_commands = project_profile.get("test_commands", [])
    test_detail = ", ".join(test_commands) if isinstance(test_commands, list) and test_commands else "detect or request test command"
    return [
        PlanStep(id="scan", title="Scan workspace", state="done", detail="Project profile and index are available"),
        PlanStep(id="contract", title="Compile AgentContract", state="done", detail=f"Mode: {mode}"),
        PlanStep(id="context", title="Build Context Pack", state="active", detail="Select task, rules, profile, and relevant snippets"),
        PlanStep(id="inspect", title="Inspect relevant code", state="waiting", detail="Use read_file and search_code"),
        PlanStep(id="patch", title="Propose patch", state="waiting", detail="Patch Pipeline requires approval before apply"),
        PlanStep(id="test", title="Run validation", state="waiting", detail=test_detail),
        PlanStep(id="report", title="Write report", state="waiting", detail="Summarize diff, tests, budget, and trace"),
    ]


def build_initial_context(
    run: RunState,
    project_profile: dict[str, object],
    plan: list[PlanStep] | None = None,
    memories: list[MemoryEntry] | None = None,
    workspace_root: str | Path | None = None,
    prior_run: dict[str, object] | None = None,
) -> tuple[ContextPack, list[dict[str, object]]]:
    required = [
        ContextCandidate(
            id="user_task",
            type="user_task",
            source="user",
            reason="original task",
            content=run.task,
            priority=1.0,
        ),
        ContextCandidate(
            id="project_profile",
            type="project_profile",
            source=".agent/project-profile.json",
            reason="workspace scan result",
            content=str(project_profile),
            priority=0.9,
        ),
        ContextCandidate(
            id="current_plan",
            type="current_plan",
            source="runtime",
            reason="current execution plan",
            content="\n".join(f"{step.id}: {step.title} [{step.state}] - {step.detail}" for step in plan or []),
            priority=0.99,
        ),
    ]
    if prior_run is not None:
        required.append(_prior_run_candidate(prior_run))
    candidates: list[ContextCandidate] = []
    if workspace_root is not None:
        required.extend(discover_project_rules(workspace_root))
        candidates.extend(retrieve_workspace_context(workspace_root, run.task, project_profile))
    candidates.extend(
        ContextCandidate(
            id=memory.memory_id,
            type=f"memory_{memory.scope.value}",
            source=memory.source,
            reason=f"available {memory.scope.value} memory",
            content=memory.content,
            priority=0.7 if memory.scope.value == "long_term" else 0.65,
        )
        for memory in memories or []
    )
    pack, items = build_context_pack(run.run_id, required, candidates, max_tokens=32000)
    return pack, explain_context_items(items, pack)


def build_run_artifacts(
    run: RunState,
    project_profile: dict[str, object],
    trace_events: list[TraceEvent] | list[dict[str, object]],
    memories: list[MemoryEntry] | None = None,
    workspace_root: str | Path | None = None,
    prior_run: dict[str, object] | None = None,
) -> tuple[RunArtifacts, ContextPack]:
    plan = build_initial_plan(run.mode, project_profile)
    context_pack, context_explanation = build_initial_context(
        run,
        project_profile,
        plan,
        memories,
        workspace_root,
        prior_run,
    )
    for step in plan:
        if step.id == "context":
            step.state = "done"
            step.detail = "Task context is ready"
            break
    trace_summary = [
        str(event.event if isinstance(event, TraceEvent) else event.get("event", "unknown"))
        for event in trace_events
    ]
    artifacts = RunArtifacts(
        run_id=run.run_id,
        plan=plan,
        context_explanation=context_explanation,
        diff_summary=DiffSummary(),
        test_summary=TestSummary(command=_first_test_command(project_profile)),
        trace_summary=trace_summary,
    )
    return artifacts, context_pack


def _first_test_command(project_profile: dict[str, object]) -> str:
    commands = project_profile.get("test_commands", [])
    if isinstance(commands, list) and commands:
        return str(commands[0])
    return "Not selected"


def _prior_run_candidate(prior_run: dict[str, object]) -> ContextCandidate:
    changed_files = prior_run.get("changed_files", [])
    if not isinstance(changed_files, list):
        changed_files = []
    completion = prior_run.get("completion")
    completion_summary: dict[str, object] | None = None
    if isinstance(completion, dict):
        checks = completion.get("checks", [])
        completion_summary = {
            "verdict": str(completion.get("verdict", ""))[:40],
            "summary": redact_secrets(str(completion.get("summary", "")))[:1000],
            "checks": [
                {
                    "id": str(check.get("id", ""))[:120],
                    "passed": bool(check.get("passed", False)),
                    "evidence": redact_secrets(str(check.get("evidence", "")))[:500],
                }
                for check in checks[:12]
                if isinstance(check, dict)
            ] if isinstance(checks, list) else [],
        }
    parent_id = str(prior_run.get("run_id", ""))
    handoff = {
        "parent_run_id": parent_id,
        "turn_index": int(prior_run.get("turn_index", 0)),
        "task": redact_secrets(str(prior_run.get("task", "")))[:1500],
        "mode": str(prior_run.get("mode", ""))[:40],
        "status": str(prior_run.get("status", ""))[:40],
        "final_message": redact_secrets(str(prior_run.get("final_message", "")))[:4000],
        "changed_files": [str(path)[:300] for path in changed_files[:40]],
        "test_status": str(prior_run.get("test_status", ""))[:120],
        "completion": completion_summary,
    }
    return ContextCandidate(
        id="prior_run_summary",
        type="prior_run_summary",
        source=f"run:{parent_id}",
        reason="bounded conversation handoff",
        content=json.dumps(handoff, ensure_ascii=False, sort_keys=True),
        priority=0.98,
        metadata={
            "parent_run_id": parent_id,
            "conversation_id": str(prior_run.get("conversation_id", parent_id)),
            "turn_index": int(prior_run.get("turn_index", 0)),
            "bounded": True,
        },
    )
