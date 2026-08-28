from __future__ import annotations

from app.context.pack_builder import ContextCandidate, build_context_pack, explain_context_items
from app.models import ContextPack, DiffSummary, PlanStep, RunArtifacts, RunState, TestSummary, TraceEvent


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


def build_initial_context(run: RunState, project_profile: dict[str, object]) -> tuple[ContextPack, list[dict[str, object]]]:
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
    ]
    pack, items = build_context_pack(run.run_id, required, [], max_tokens=32000)
    return pack, explain_context_items(items, pack)


def build_run_artifacts(
    run: RunState,
    project_profile: dict[str, object],
    trace_events: list[TraceEvent] | list[dict[str, object]],
) -> tuple[RunArtifacts, ContextPack]:
    context_pack, context_explanation = build_initial_context(run, project_profile)
    trace_summary = [
        str(event.event if isinstance(event, TraceEvent) else event.get("event", "unknown"))
        for event in trace_events
    ]
    artifacts = RunArtifacts(
        run_id=run.run_id,
        plan=build_initial_plan(run.mode, project_profile),
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

