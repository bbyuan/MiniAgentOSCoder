from app.models import ActionIR, ActionObservation, AgentContract, EffectSet
from app.runtime.role_board import review_planned_action, verify_observation


def test_reviewer_flags_disallowed_write_actions() -> None:
    contract = AgentContract("agent", effects=EffectSet(allow=["fs.read"]))
    action = ActionIR(type="apply_patch", rationale="fix the bug")

    assessment = review_planned_action(action, contract=contract, phase="work", observations=[])

    assert assessment.role == "Reviewer"
    assert assessment.verdict == "needs_attention"
    assert any(check.id == "effect_within_contract" and not check.passed for check in assessment.checks)


def test_verifier_marks_failed_validation_as_repair_signal() -> None:
    observation = ActionObservation(step=3, action_type="run_test", ok=False, error="1 failed")

    assessment = verify_observation(observation, phase="verify")

    assert assessment.role == "Verifier"
    assert assessment.verdict == "failed"
    assert any(check.id == "validation_signal" and not check.passed for check in assessment.checks)
