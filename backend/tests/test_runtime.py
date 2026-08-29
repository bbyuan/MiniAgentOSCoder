import json
from pathlib import Path

import pytest

from app.models import Checkpoint, RunPhase, RunState, TraceEvent
from app.runtime.action_parser import ActionParseError, parse_action_ir
from app.runtime.agent_loop import create_runtime_run
from app.runtime.checkpoint import CheckpointStore
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.skills import load_skill_cards
from app.runtime.state_machine import InvalidRunTransition, transition_run
from app.runtime.tracer import TraceWriter


ROOT = Path(__file__).resolve().parents[2]


def test_compile_agent_contract_from_project_config() -> None:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml", task_mode="Bugfix")

    assert contract.agent_id == "miniagent-coder"
    assert contract.program.mode == "Bugfix"
    assert "fs.read" in contract.effects.allow
    assert contract.policies.apply_patch == "approval_required"


def test_parse_action_ir_accepts_valid_json() -> None:
    action = parse_action_ir('{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}')

    assert action.type == "read_file"
    assert action.params["path"] == "app.py"
    assert action.role == "Orchestrator"


def test_parse_action_ir_supplies_missing_rationale() -> None:
    action = parse_action_ir('{"type":"search_code","params":{"query":"import unittest"}}')

    assert action.rationale == "Execute search_code"


def test_parse_action_ir_rejects_free_form_text() -> None:
    with pytest.raises(ActionParseError):
        parse_action_ir("please run pytest")


def test_run_state_machine_accepts_and_rejects_transitions() -> None:
    state = RunState(run_id="run-001", task="fix bug")

    transition_run(state, RunPhase.SCANNING)
    assert state.status == RunPhase.SCANNING

    with pytest.raises(InvalidRunTransition):
        transition_run(state, RunPhase.COMPLETED)


def test_testing_phase_can_pause_for_a_follow_up_patch_approval() -> None:
    state = RunState(run_id="run-repair", task="repair", status=RunPhase.TESTING)

    transition_run(state, RunPhase.WAITING_APPROVAL)

    assert state.status == RunPhase.WAITING_APPROVAL


def test_trace_writer_appends_jsonl(tmp_path: Path) -> None:
    writer = TraceWriter(tmp_path)
    event = TraceEvent(run_id="run-001", event="contract.compiled", payload={"ok": True})

    trace_path = writer.append(event)
    events = writer.read_events("run-001")

    assert trace_path.name == "trace.jsonl"
    assert events[0]["event"] == "contract.compiled"
    assert events[0]["payload"]["ok"] is True


def test_trace_writer_ignores_incomplete_trailing_event(tmp_path: Path) -> None:
    writer = TraceWriter(tmp_path)
    writer.event("run-001", "complete.event", {"ok": True})
    trace_path = writer.trace_path("run-001")
    with trace_path.open("a", encoding="utf-8") as handle:
        handle.write('{"event":"partial')

    events = writer.read_events("run-001")

    assert [event["event"] for event in events] == ["complete.event"]


def test_checkpoint_store_saves_checkpoint(tmp_path: Path) -> None:
    store = CheckpointStore(tmp_path)
    checkpoint = Checkpoint(
        checkpoint_id="ckpt-001",
        run_id="run-001",
        step=1,
        status=RunPhase.WAITING_APPROVAL,
        run_state={"status": "waiting_approval"},
        context_summary="patch approval pending",
    )

    path = store.save(checkpoint)

    assert json.loads(path.read_text(encoding="utf-8"))["status"] == "waiting_approval"
    assert store.load("run-001", "ckpt-001") is not None
    assert [item.checkpoint_id for item in store.list("run-001")] == ["ckpt-001"]


def test_load_skill_cards_from_registry() -> None:
    cards = load_skill_cards(ROOT / ".agent" / "skills.yaml")

    assert [card.id for card in cards][:2] == ["bugfix", "feature"]
    assert "read_file" in cards[0].default_tools


def test_create_runtime_run_records_initial_trace(tmp_path: Path) -> None:
    run = create_runtime_run(
        task="fix bug",
        workspace=ROOT,
        config_path=ROOT / ".agent" / "config.yaml",
        runs_dir=tmp_path,
    )

    events = TraceWriter(tmp_path).read_events(run.run_id)

    assert run.status == RunPhase.PLANNING
    assert [event["event"] for event in events] == [
        "run.created",
        "run.transitioned",
        "contract.compiled",
        "run.transitioned",
    ]
