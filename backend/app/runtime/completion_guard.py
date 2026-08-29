from __future__ import annotations

from app.models import ActionObservation, CompletionAssessment, CompletionCheck


CODE_MODES = {"bugfix", "feature", "spec"}
READ_ACTIONS = {"list_files", "read_file", "search_code"}


def evaluate_completion(
    *,
    mode: str,
    final_message: str,
    observations: list[ActionObservation],
    attempt: int = 1,
) -> CompletionAssessment:
    normalized_mode = mode.strip() or "Unknown"
    mode_key = normalized_mode.lower()
    applied = [item for item in observations if item.action_type == "apply_patch" and item.ok]
    changed_files = _changed_files(applied)
    checks = [
        CompletionCheck(
            id="final_message",
            passed=bool(final_message.strip()),
            evidence="A non-empty completion summary was provided" if final_message.strip() else "No completion summary was provided",
        )
    ]

    if mode_key in CODE_MODES:
        checks.extend(
            [
                CompletionCheck(
                    id="applied_change",
                    passed=bool(applied),
                    evidence=f"{len(applied)} patch(es) applied" if applied else "No patch was applied",
                ),
                CompletionCheck(
                    id="changed_files",
                    passed=bool(changed_files),
                    evidence=f"Changed files: {', '.join(changed_files)}" if changed_files else "No changed-file evidence was recorded",
                ),
                _verified_after_latest_patch(observations),
            ]
        )
    elif mode_key in {"review", "chat"}:
        checks.append(
            CompletionCheck(
                id="no_workspace_changes",
                passed=not applied,
                evidence="No patch was applied" if not applied else f"{len(applied)} patch(es) were applied in a read-only mode",
            )
        )
        if mode_key == "review":
            inspections = [item for item in observations if item.action_type in READ_ACTIONS and item.ok]
            checks.append(
                CompletionCheck(
                    id="workspace_inspected",
                    passed=bool(inspections),
                    evidence=f"{len(inspections)} successful read-only inspection(s)" if inspections else "No successful read-only inspection was recorded",
                )
            )
    elif applied:
        checks.append(_verified_after_latest_patch(observations))

    failed = [check.id for check in checks if check.required and not check.passed]
    verdict = "blocked" if failed else "passed"
    summary = (
        f"Completion blocked by: {', '.join(failed)}"
        if failed
        else f"All {sum(check.required for check in checks)} required completion checks passed"
    )
    return CompletionAssessment(
        verdict=verdict,
        mode=normalized_mode,
        checks=checks,
        summary=summary,
        attempt=max(1, attempt),
    )


def completion_expectations(mode: str) -> list[str]:
    mode_key = mode.strip().lower()
    if mode_key in CODE_MODES:
        return ["final_message", "applied_change", "changed_files", "tests_after_change"]
    if mode_key == "review":
        return ["final_message", "no_workspace_changes", "workspace_inspected"]
    if mode_key == "chat":
        return ["final_message", "no_workspace_changes"]
    return ["final_message"]


def _changed_files(applied: list[ActionObservation]) -> list[str]:
    files: list[str] = []
    for observation in applied:
        values = observation.metadata.get("files", [])
        if isinstance(values, list):
            files.extend(str(value) for value in values if value)
    return list(dict.fromkeys(files))


def _verified_after_latest_patch(observations: list[ActionObservation]) -> CompletionCheck:
    latest_patch = max(
        (index for index, item in enumerate(observations) if item.action_type == "apply_patch" and item.ok),
        default=-1,
    )
    passing_tests = [
        item
        for item in observations[latest_patch + 1 :]
        if item.action_type == "run_test" and item.ok
    ]
    return CompletionCheck(
        id="tests_after_change",
        passed=latest_patch >= 0 and bool(passing_tests),
        evidence=(
            f"{len(passing_tests)} successful test run(s) after the latest patch"
            if passing_tests
            else "No successful test was recorded after the latest patch"
        ),
    )
