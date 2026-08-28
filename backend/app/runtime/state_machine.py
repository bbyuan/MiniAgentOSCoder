from __future__ import annotations

from app.models import RunPhase, RunState


class InvalidRunTransition(ValueError):
    pass


ALLOWED_TRANSITIONS: dict[RunPhase, set[RunPhase]] = {
    RunPhase.CREATED: {RunPhase.SCANNING, RunPhase.CANCELLED, RunPhase.FAILED},
    RunPhase.SCANNING: {RunPhase.PLANNING, RunPhase.CANCELLED, RunPhase.FAILED},
    RunPhase.PLANNING: {RunPhase.RUNNING, RunPhase.CANCELLED, RunPhase.FAILED},
    RunPhase.RUNNING: {
        RunPhase.WAITING_APPROVAL,
        RunPhase.APPLYING_PATCH,
        RunPhase.TESTING,
        RunPhase.COMPLETED,
        RunPhase.PAUSED,
        RunPhase.CANCELLED,
        RunPhase.FAILED,
    },
    RunPhase.WAITING_APPROVAL: {RunPhase.RUNNING, RunPhase.APPLYING_PATCH, RunPhase.REPAIRING, RunPhase.CANCELLED},
    RunPhase.APPLYING_PATCH: {RunPhase.TESTING, RunPhase.REPAIRING, RunPhase.FAILED},
    RunPhase.TESTING: {RunPhase.REPAIRING, RunPhase.COMPLETED, RunPhase.FAILED},
    RunPhase.REPAIRING: {
        RunPhase.RUNNING,
        RunPhase.WAITING_APPROVAL,
        RunPhase.TESTING,
        RunPhase.COMPLETED,
        RunPhase.CANCELLED,
        RunPhase.FAILED,
    },
    RunPhase.PAUSED: {RunPhase.RUNNING, RunPhase.CANCELLED},
    RunPhase.COMPLETED: set(),
    RunPhase.CANCELLED: set(),
    RunPhase.FAILED: set(),
}


def transition_run(state: RunState, next_phase: RunPhase) -> RunState:
    allowed = ALLOWED_TRANSITIONS[state.status]
    if next_phase not in allowed:
        raise InvalidRunTransition(f"Cannot transition run {state.run_id} from {state.status} to {next_phase}")
    state.status = next_phase
    return state
