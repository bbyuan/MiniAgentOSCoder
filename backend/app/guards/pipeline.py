from __future__ import annotations

from collections.abc import Callable
from time import perf_counter

from app.models import DecisionStatus, GuardDecision


class GuardFailure(RuntimeError):
    def __init__(self, decision: GuardDecision, cause: Exception) -> None:
        super().__init__(decision.reason)
        self.decision = decision
        self.cause = cause


def evaluate_guard(
    guard: str,
    rule: str,
    check: Callable[[], None],
    *,
    allow_reason: str,
) -> GuardDecision:
    started = perf_counter()
    try:
        check()
    except Exception as exc:
        decision = GuardDecision(
            guard=guard,
            status=DecisionStatus.DENY,
            reason=str(exc),
            rule=rule,
            duration_ms=_elapsed_ms(started),
            metadata={"error_type": type(exc).__name__},
        )
        raise GuardFailure(decision, exc) from exc
    return GuardDecision(
        guard=guard,
        status=DecisionStatus.ALLOW,
        reason=allow_reason,
        rule=rule,
        duration_ms=_elapsed_ms(started),
    )


def skipped_guard(guard: str, rule: str, reason: str) -> GuardDecision:
    return GuardDecision(
        guard=guard,
        status=DecisionStatus.SKIPPED,
        reason=reason,
        rule=rule,
    )


def _elapsed_ms(started: float) -> float:
    return round((perf_counter() - started) * 1000, 3)

