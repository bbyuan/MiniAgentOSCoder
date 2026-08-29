from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.guards import redact_secrets
from app.models import AgentContract, ContextPack, RunArtifacts, RunLoopResult, RunState


class RunArtifactWriter:
    def __init__(
        self,
        workspace: str | Path,
        run_id: str,
        *,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if not run_id or run_id in {".", ".."} or Path(run_id).name != run_id:
            raise ValueError("Run id is invalid")
        self.workspace = Path(workspace).resolve()
        self.run_id = run_id
        self.run_dir = self.workspace / "runs" / run_id
        self.now = now

    @property
    def patch_path(self) -> Path:
        return self.run_dir / "patch.diff"

    @property
    def report_path(self) -> Path:
        return self.run_dir / "report.md"

    def append_patch(self, patch: str, sequence: int) -> Path:
        if not patch.strip():
            raise ValueError("Applied patch artifact must not be empty")
        self.run_dir.mkdir(parents=True, exist_ok=True)
        prefix = "\n" if self.patch_path.exists() and self.patch_path.stat().st_size else ""
        block = f"{prefix}# Applied patch {sequence}\n{patch.rstrip()}\n"
        with self.patch_path.open("a", encoding="utf-8") as handle:
            handle.write(redact_secrets(block))
        return self.patch_path

    def write_report(
        self,
        *,
        run: RunState,
        contract: AgentContract,
        context_pack: ContextPack,
        artifacts: RunArtifacts | None,
        result: RunLoopResult,
        trace_events: list[dict[str, Any]],
    ) -> Path:
        self.run_dir.mkdir(parents=True, exist_ok=True)
        test = artifacts.test_summary if artifacts is not None else None
        diff = artifacts.diff_summary if artifacts is not None else None
        budget = run.budget
        selected_context = context_pack.selected_items or context_pack.required_items
        policies = contract.policies.to_dict()
        generated_at = self.now().astimezone(timezone.utc).isoformat()
        policy_evaluations = [event for event in trace_events if event.get("event") == "policy.evaluated"]
        denied_evaluations = [
            event for event in policy_evaluations
            if isinstance(event.get("payload"), dict)
            and isinstance(event["payload"].get("evaluation"), dict)
            and event["payload"]["evaluation"].get("outcome") != "allowed"
        ]
        sandbox_executions = [event for event in trace_events if event.get("event") == "sandbox.finished"]
        active_skills = [event for event in trace_events if event.get("event") == "skill.activated"]
        mcp_servers = [event for event in trace_events if event.get("event") == "mcp.server.started"]
        mcp_calls = [event for event in trace_events if event.get("event") == "mcp.tool.called"]
        hook_executions = [event for event in trace_events if event.get("event") == "hook.finished"]
        completion_lines = _completion_lines(result)

        report = "\n".join(
            [
                "# MiniAgentOS Coder Run Report",
                "",
                f"Generated: `{generated_at}`",
                "",
                "## Outcome",
                "",
                f"- Run: `{run.run_id}`",
                f"- Status: `{result.status.value}`",
                f"- Mode: `{run.mode}`",
                f"- Termination: `{result.termination_reason}`",
                f"- Steps: {result.steps}",
                f"- Repair attempts: {run.repair_attempts} (`{run.repair_status}`)",
                f"- Rolled back to: `{run.rolled_back_to or 'none'}`",
                "",
                "## Task",
                "",
                _text_block(run.task),
                "",
                "## Final Answer",
                "",
                _text_block(result.final_message or "No final message was produced."),
                "",
                "## Completion Guard",
                "",
                *completion_lines,
                "",
                "## Changes",
                "",
                f"- Applied patches: {run.applied_patches}",
                f"- Patch artifact: `{'patch.diff' if self.patch_path.exists() else 'not available'}`",
                f"- Diff status: `{diff.status if diff is not None else 'Unavailable'}`",
                f"- Files in latest change: {diff.files if diff is not None else 0}",
                f"- Latest insertions/deletions: +{diff.insertions if diff is not None else 0} / -{diff.deletions if diff is not None else 0}",
                f"- Current changed files: {_inline_list(run.changed_files)}",
                "",
                "## Validation",
                "",
                f"- Status: `{test.status if test is not None else 'Not run'}`",
                f"- Command: `{test.command if test is not None else 'Not selected'}`",
                f"- Passed: {test.passed if test is not None else 0}",
                f"- Failed: {test.failed if test is not None else 0}",
                "",
                "## Budget",
                "",
                f"- Model calls: {budget.get('model_calls', 0)}",
                f"- Tool calls: {budget.get('tool_calls', 0)}",
                f"- Input tokens: {budget.get('input_tokens', 0)}",
                f"- Output tokens: {budget.get('output_tokens', 0)}",
                f"- Total tokens: {budget.get('total_tokens', 0)}",
                "",
                "## Agent Contract",
                "",
                f"- Agent: `{contract.agent_id}`",
                f"- Config version: `{contract.config_version}`",
                f"- Allowed effects: {_inline_list(contract.effects.allow)}",
                f"- Denied effects: {_inline_list(contract.effects.deny)}",
                f"- Policies: {_mapping_list(policies)}",
                "",
                "## Extensions",
                "",
                f"- Active skills: {_event_ids(active_skills, 'skill_id')}",
                f"- MCP servers started: {_event_ids(mcp_servers, 'server_id')}",
                f"- MCP tool calls: {len(mcp_calls)}",
                f"- Hook executions: {len(hook_executions)}",
                "",
                "## Context And Trace",
                "",
                f"- Selected context: {_inline_list(selected_context)}",
                f"- Compressed context: {_inline_list(context_pack.compressed_items)}",
                f"- Omitted context: {_inline_list(context_pack.omitted_items)}",
                f"- Context compactions: {context_pack.compaction_count}",
                f"- Context threshold: `{context_pack.threshold_state}`",
                f"- Memory references: {_inline_list(run.memory_refs)}",
                f"- Policy evaluations: {len(policy_evaluations)} ({len(denied_evaluations)} denied)",
                f"- Sandbox executions: {len(sandbox_executions)}",
                f"- Trace events before report: {len(trace_events)}",
                f"- Trace artifact: `trace.jsonl`",
                "",
                "This report is a deterministic summary. `trace.jsonl` remains the authoritative event record.",
                "",
            ]
        )
        self.report_path.write_text(redact_secrets(report), encoding="utf-8")
        return self.report_path


def _text_block(value: str, limit: int = 4000) -> str:
    text = value.strip()
    if len(text) > limit:
        text = f"{text[:limit]}\n\n[truncated]"
    return text or "None."


def _inline_list(values: list[str]) -> str:
    return ", ".join(f"`{value}`" for value in values) if values else "none"


def _mapping_list(values: dict[str, object]) -> str:
    return ", ".join(f"`{key}={value}`" for key, value in sorted(values.items())) if values else "none"


def _event_ids(events: list[dict[str, Any]], key: str) -> str:
    values = [
        str(event["payload"][key])
        for event in events
        if isinstance(event.get("payload"), dict) and event["payload"].get(key)
    ]
    return _inline_list(list(dict.fromkeys(values)))


def _completion_lines(result: RunLoopResult) -> list[str]:
    assessment = result.completion
    if assessment is None:
        return ["- Assessment: `not available`"]
    lines = [
        f"- Verdict: `{assessment.verdict}`",
        f"- Mode: `{assessment.mode}`",
        f"- Attempt: {assessment.attempt}",
        f"- Summary: {assessment.summary}",
    ]
    lines.extend(
        f"- [{'x' if check.passed else ' '}] `{check.id}`: {check.evidence}"
        for check in assessment.checks
    )
    return lines
