from app.models import (
    ActionIR,
    AgentContract,
    ApprovalRequest,
    ContextPack,
    ContextPackBudget,
    RunPhase,
    RunState,
    ToolDescriptor,
    TraceEvent,
)
from app.models.tool import ApprovalPolicy, RiskLevel


def test_action_ir_serializes_to_plain_dict() -> None:
    action = ActionIR(type="read_file", rationale="inspect target", params={"path": "src/app.py"})

    assert action.to_dict()["type"] == "read_file"
    assert action.to_dict()["params"]["path"] == "src/app.py"


def test_agent_contract_defaults_include_cost_envelope() -> None:
    contract = AgentContract(agent_id="miniagent-coder")

    data = contract.to_dict()

    assert data["agent_id"] == "miniagent-coder"
    assert data["cost_envelope"]["max_steps"] == 20
    assert data["policies"]["apply_patch"] == "approval_required"


def test_run_state_serializes_enum_values() -> None:
    state = RunState(run_id="run-001", task="fix test", status=RunPhase.SCANNING)

    assert state.to_dict()["status"] == "scanning"


def test_tool_descriptor_serializes_policy_and_risk() -> None:
    tool = ToolDescriptor(
        name="read_file",
        description="Read a file",
        effect="fs.read",
        risk=RiskLevel.LOW,
        approval_policy=ApprovalPolicy.AUTO,
        input_schema={"path": "string"},
    )

    data = tool.to_dict()

    assert data["risk"] == "low"
    assert data["approval_policy"] == "auto"


def test_context_pack_budget_round_trip() -> None:
    pack = ContextPack(
        run_id="run-001",
        required_items=["user_task"],
        budget_report=ContextPackBudget(max_tokens=100, used_tokens=40, remaining_tokens=60),
    )

    assert pack.to_dict()["budget_report"]["remaining_tokens"] == 60


def test_trace_and_approval_models_serialize() -> None:
    trace = TraceEvent(run_id="run-001", event="approval_requested", payload={"approval_id": "appr-001"})
    approval = ApprovalRequest(
        approval_id="appr-001",
        run_id="run-001",
        action_id="act-001",
        risk="medium",
        effect="fs.write",
        reason="apply patch",
        target={"files": ["src/app.py"]},
    )

    assert trace.to_dict()["payload"]["approval_id"] == "appr-001"
    assert approval.to_dict()["options"][0] == "approve_once"

