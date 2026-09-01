from pathlib import Path

from app.models import ExtensionSettings, GovernanceSettings
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.extensions import load_extension_catalog
from app.runtime.formal_program import compile_formal_program


ROOT = Path(__file__).resolve().parents[2]


def test_compile_formal_program_projects_contract_to_dsl() -> None:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml", task_mode="Bugfix")
    catalog, settings, _ = load_extension_catalog(ROOT, "Bugfix", fallback_agent_dir=ROOT / ".agent")

    program = compile_formal_program(
        run_id="run-formal",
        contract=contract,
        governance=GovernanceSettings(),
        extensions=catalog,
        extension_settings=settings,
    )

    assert program.calculus == "MiniAgent DSL / λA projection"
    assert "Loop(max_steps=20" in program.term
    assert "Route(ActionIR.type" in program.term
    assert "Guard(Tool[apply_patch], approval)" in program.term
    assert "fs.write" in program.effect
    assert program.grade.tool_calls == 60
    assert any(node.op == "Skill" for node in program.nodes)
    assert all(lint.status == "passed" for lint in program.lints)


def test_compile_formal_program_warns_on_unguarded_writes() -> None:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml", task_mode="Feature")
    contract.policies.apply_patch = "auto"

    program = compile_formal_program(run_id="run-warning", contract=contract)

    write_guard = next(lint for lint in program.lints if lint.id == "write_guard")
    assert write_guard.status == "warning"
    assert "apply_patch=auto" in write_guard.evidence
