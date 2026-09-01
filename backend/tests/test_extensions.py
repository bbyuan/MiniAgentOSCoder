from __future__ import annotations

from pathlib import Path
import sys

import pytest

from app.models import (
    ActionIR,
    ActiveSkill,
    ExtensionSettings,
    HookEvent,
    HookFailurePolicy,
    HookManifest,
    MCPServerManifest,
    SkillManifest,
)
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.extensions import load_extension_catalog, validate_extension_settings
from app.runtime.hooks import HookBlocked, HookPipeline
from app.runtime.mcp import MCPRuntime
from app.runtime.planner import build_action_request
from app.runtime.sandbox import SandboxExecutor
from app.runtime.tracer import TraceWriter
from app.tools import ToolApprovalDecision, ToolGateway


ROOT = Path(__file__).resolve().parents[2]
FAKE_MCP = Path(__file__).parent / "fixtures" / "fake_mcp_server.py"


def test_catalog_recommends_mode_skills_and_allows_manual_selection(tmp_path: Path) -> None:
    catalog, settings, registry = load_extension_catalog(
        tmp_path,
        "Review",
        fallback_agent_dir=ROOT / ".agent",
    )

    assert registry == (ROOT / ".agent" / "skills.yaml").resolve()
    assert settings.active_skill_ids == ["code-review"]
    assert next(skill for skill in catalog.skills if skill.id == "code-review").recommended is True

    validate_extension_settings(
        catalog,
        ExtensionSettings(active_skill_ids=["bugfix"]),
        "Review",
    )


def test_planner_discloses_only_active_skill_content() -> None:
    skill = ActiveSkill(
        id="review",
        name="Review",
        description="Review code",
        path=".agent/skills/review/SKILL.md",
        content="Prioritize correctness findings.",
        digest="abc",
    )
    request = build_action_request("review", compile_agent_contract(ROOT / ".agent" / "config.yaml"), [], skills=[skill])

    assert request.metadata["active_skill_ids"] == ["review"]
    assert "Prioritize correctness findings." in request.messages[1].content


def test_planner_discloses_skill_card_without_loading_instructions() -> None:
    card = SkillManifest(
        id="review",
        name="Review",
        description="Inspect correctness and security",
        path=".agent/skills/review/SKILL.md",
        default_tools=["read_file", "search_code"],
    )

    request = build_action_request(
        "review",
        compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        [],
        skill_cards=[card],
    )

    assert request.metadata["available_skill_ids"] == ["review"]
    assert request.metadata["active_skill_ids"] == []
    assert "Inspect correctness and security" in request.messages[1].content
    assert "Prioritize correctness findings." not in request.messages[1].content


def test_stdio_mcp_tool_is_registered_and_stays_behind_gateway_approval(tmp_path: Path) -> None:
    events: list[tuple[str, dict[str, object]]] = []
    sandbox = SandboxExecutor(tmp_path, "run-mcp")
    runtime = MCPRuntime(
        [
            MCPServerManifest(
                id="fake",
                name="Fake MCP",
                command=[sys.executable, str(FAKE_MCP)],
            )
        ],
        tmp_path,
        "run-mcp",
        sandbox,
        lambda event, payload: events.append((event, payload)),
    )
    gateway = ToolGateway(
        workspace_root=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        approval_handler=lambda action, descriptor, preview: ToolApprovalDecision(approved=True),
        run_id="run-mcp",
    )
    try:
        registrations = runtime.registrations()
        for descriptor, handler in registrations:
            gateway.register(descriptor, handler)
        result = gateway.call(
            ActionIR(type="mcp__fake__echo", rationale="echo", params={"message": "hello"})
        )
    finally:
        runtime.close()

    assert registrations[0][0].approval_policy.value == "approval_required"
    assert result.ok is True
    assert result.output == "echo:hello"
    assert [event for event, _ in events] == [
        "mcp.server.started",
        "mcp.tools.discovered",
        "mcp.tool.called",
        "mcp.server.stopped",
    ]


def test_hook_pipeline_runs_in_sandbox_and_block_policy_stops_before_event(tmp_path: Path) -> None:
    tracer = TraceWriter(tmp_path / "runs")
    sandbox = SandboxExecutor(tmp_path, "run-hooks")
    marker = tmp_path / "hook.txt"
    successful = HookManifest(
        id="record-run",
        name="Record run",
        event=HookEvent.RUN_BEFORE,
        command=[sys.executable, "-c", f"from pathlib import Path; Path({str(marker)!r}).write_text('ok')"],
    )
    blocking = HookManifest(
        id="quality-gate",
        name="Quality gate",
        event=HookEvent.TOOL_BEFORE,
        command=[sys.executable, "-c", "raise SystemExit(2)"],
        failure_policy=HookFailurePolicy.BLOCK,
    )
    pipeline = HookPipeline("run-hooks", [successful, blocking], sandbox, tracer)

    pipeline.execute(HookEvent.RUN_BEFORE)
    with pytest.raises(HookBlocked, match="quality-gate"):
        pipeline.execute(HookEvent.TOOL_BEFORE, action=ActionIR(type="read_file", rationale="read"))

    events = tracer.read_events("run-hooks")
    assert marker.read_text(encoding="utf-8") == "ok"
    assert [event["event"] for event in events].count("hook.finished") == 2
    assert events[-1]["payload"]["ok"] is False
