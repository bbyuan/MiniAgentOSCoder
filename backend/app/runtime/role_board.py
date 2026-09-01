from __future__ import annotations

from dataclasses import dataclass, field

from app.guards import redact_secrets
from app.models import ActionIR, ActionObservation, AgentContract, RunArtifacts, RunLoopResult, RunPhase, RunState


READ_ACTIONS = {"list_files", "read_file", "search_code", "git_status", "git_diff"}
CHANGE_ACTIONS = {"apply_patch"}
VERIFY_ACTIONS = {"run_test", "run_lint"}


@dataclass(slots=True)
class RoleCheck:
    id: str
    passed: bool
    detail: str

    def to_dict(self) -> dict[str, object]:
        return {"id": self.id, "passed": self.passed, "detail": self.detail}


@dataclass(slots=True)
class RoleAssessment:
    role: str
    verdict: str
    rationale: str
    checks: list[RoleCheck] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "role": self.role,
            "verdict": self.verdict,
            "rationale": self.rationale,
            "checks": [check.to_dict() for check in self.checks],
        }


@dataclass(slots=True)
class MemoryRecommendation:
    kind: str
    scope: str
    importance: int
    reason: str
    content: str
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "scope": self.scope,
            "importance": self.importance,
            "reason": self.reason,
            "content_preview": redact_secrets(self.content[:240]),
            "tags": list(self.tags),
        }


def review_planned_action(
    action: ActionIR,
    *,
    contract: AgentContract,
    phase: str,
    observations: list[ActionObservation],
) -> RoleAssessment:
    mode = contract.program.mode.lower()
    checks = [
        RoleCheck(
            id="effect_within_contract",
            passed=_action_effect_allowed(action.type, contract),
            detail=f"{action.type} is checked against the compiled AgentContract",
        ),
        RoleCheck(
            id="phase_fit",
            passed=_action_matches_phase(action.type, phase),
            detail=f"{action.type} requested during {phase} phase",
        ),
        RoleCheck(
            id="read_only_mode",
            passed=not (mode in {"review", "chat"} and action.type in CHANGE_ACTIONS),
            detail=f"{contract.program.mode} mode should avoid workspace changes",
        ),
    ]
    if action.type == "finish":
        checks.append(
            RoleCheck(
                id="finish_has_observations",
                passed=bool(observations) or mode == "chat",
                detail=f"{len(observations)} observation(s) recorded before finish",
            )
        )
    failed = [check for check in checks if not check.passed]
    return RoleAssessment(
        role="Reviewer",
        verdict="needs_attention" if failed else "ready",
        rationale=(
            f"{len(failed)} review check(s) need attention before {action.type}"
            if failed
            else f"{action.type} is aligned with contract and current phase"
        ),
        checks=checks,
    )


def verify_observation(observation: ActionObservation, *, phase: str) -> RoleAssessment:
    checks = [
        RoleCheck(
            id="observation_recorded",
            passed=True,
            detail=f"{observation.action_type} produced a governed observation",
        ),
        RoleCheck(
            id="tool_result_ok",
            passed=observation.ok,
            detail=observation.error or "Tool result succeeded",
        ),
    ]
    if observation.action_type in VERIFY_ACTIONS:
        checks.append(
            RoleCheck(
                id="validation_signal",
                passed=observation.ok,
                detail="Validation output is available for completion gating",
            )
        )
    return RoleAssessment(
        role="Verifier",
        verdict="verified" if observation.ok else "failed",
        rationale=(
            f"{observation.action_type} is usable evidence for the {phase} phase"
            if observation.ok
            else f"{observation.action_type} failed and should feed repair planning"
        ),
        checks=checks,
    )


def recommend_memory_candidates(
    run: RunState,
    result: RunLoopResult,
    artifacts: RunArtifacts | None,
) -> list[MemoryRecommendation]:
    recommendations: list[MemoryRecommendation] = []
    if result.status == RunPhase.COMPLETED:
        recommendations.append(
            MemoryRecommendation(
                kind="run_summary",
                scope="project",
                importance=80,
                reason="Completed runs become future project context.",
                content=_run_summary(run, result, artifacts),
                tags=[run.mode.lower(), result.status.value],
            )
        )
    if run.test_status:
        recommendations.append(
            MemoryRecommendation(
                kind="validation_command",
                scope="project",
                importance=70 if run.test_status == "Passed" else 55,
                reason="The validation command helps future runs choose the right check.",
                content=f"Latest validation status: {run.test_status}",
                tags=["validation", run.mode.lower()],
            )
        )
    if run.repair_attempts > 0:
        recommendations.append(
            MemoryRecommendation(
                kind="repair_pattern",
                scope="project",
                importance=65,
                reason="Repair attempts reveal useful failure and recovery patterns.",
                content=f"Repair attempts: {run.repair_attempts}; status: {run.repair_status}",
                tags=["repair", run.mode.lower()],
            )
        )
    return sorted(recommendations, key=lambda item: item.importance, reverse=True)


def _action_effect_allowed(action_type: str, contract: AgentContract) -> bool:
    if action_type in {"finish", "use_skill"}:
        return True
    action_effects = {
        "list_files": "fs.read",
        "read_file": "fs.read",
        "search_code": "fs.read",
        "git_status": "fs.read",
        "git_diff": "fs.read",
        "apply_patch": "fs.write",
        "run_test": "test.run",
        "run_lint": "test.run",
        "run_command": "shell.exec",
    }
    effect = action_effects.get(action_type)
    return effect is None or effect in contract.effects.allow


def _action_matches_phase(action_type: str, phase: str) -> bool:
    if action_type in {"finish", "use_skill"}:
        return True
    if phase == "inspect":
        return action_type in READ_ACTIONS
    if phase == "verify":
        return action_type in READ_ACTIONS | VERIFY_ACTIONS
    if phase == "repair":
        return True
    return True


def _run_summary(run: RunState, result: RunLoopResult, artifacts: RunArtifacts | None) -> str:
    test = artifacts.test_summary if artifacts is not None else None
    return "\n".join(
        [
            f"Task: {run.task}",
            f"Outcome: {result.status.value} ({result.termination_reason})",
            f"Changed files: {', '.join(run.changed_files) or 'none'}",
            f"Validation: {test.status if test is not None else run.test_status or 'Not run'}",
            f"Final: {result.final_message or 'No final message'}",
        ]
    )
