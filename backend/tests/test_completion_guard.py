from app.models import ActionObservation
from app.runtime.completion_guard import completion_expectations, evaluate_completion


def observation(action_type: str, ok: bool = True, **metadata: object) -> ActionObservation:
    return ActionObservation(step=1, action_type=action_type, ok=ok, metadata=metadata)


def test_bugfix_requires_a_verified_outcome() -> None:
    blocked = evaluate_completion(
        mode="Bugfix",
        final_message="Fixed",
        observations=[],
    )
    passed = evaluate_completion(
        mode="Bugfix",
        final_message="Fixed and verified",
        observations=[
            observation("apply_patch", files=["app.py"]),
            observation("run_test"),
        ],
        attempt=2,
    )

    assert blocked.verdict == "blocked"
    assert {check.id for check in blocked.checks if not check.passed} == {
        "change_or_verified_existing",
        "validation",
    }
    assert passed.verdict == "passed"
    assert passed.attempt == 2


def test_bugfix_can_finish_without_a_patch_when_existing_behavior_is_verified() -> None:
    assessment = evaluate_completion(
        mode="Bugfix",
        final_message="The requested behavior is already present and verified.",
        observations=[
            observation("read_file"),
            observation("run_test"),
        ],
    )

    assert assessment.verdict == "passed"
    assert [check.id for check in assessment.checks] == [
        "final_message",
        "change_or_verified_existing",
        "validation",
    ]


def test_test_before_latest_patch_does_not_satisfy_code_mode() -> None:
    assessment = evaluate_completion(
        mode="Feature",
        final_message="Implemented",
        observations=[
            observation("run_test"),
            observation("apply_patch", files=["feature.py"]),
        ],
    )

    check = next(item for item in assessment.checks if item.id == "validation")
    assert check.passed is False
    assert assessment.verdict == "blocked"


def test_review_requires_inspection_and_forbids_changes() -> None:
    blocked = evaluate_completion(
        mode="Review",
        final_message="Reviewed",
        observations=[observation("apply_patch", files=["unsafe.py"])],
    )
    passed = evaluate_completion(
        mode="Review",
        final_message="No findings",
        observations=[observation("search_code")],
    )

    assert blocked.verdict == "blocked"
    assert passed.verdict == "passed"


def test_chat_only_requires_answer_and_no_changes() -> None:
    assert evaluate_completion(mode="Chat", final_message="Here is the answer", observations=[]).verdict == "passed"
    assert evaluate_completion(
        mode="Chat",
        final_message="Changed it",
        observations=[observation("apply_patch", files=["app.py"])],
    ).verdict == "blocked"


def test_completion_expectations_are_mode_specific() -> None:
    assert completion_expectations("Spec") == ["final_message", "change_or_verified_existing", "validation"]
    assert completion_expectations("Review") == ["final_message", "no_workspace_changes", "workspace_inspected"]
    assert completion_expectations("Chat") == ["final_message", "no_workspace_changes"]
