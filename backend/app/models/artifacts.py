from __future__ import annotations

from dataclasses import dataclass, field

from app.models.base import Serializable


@dataclass(slots=True)
class PlanStep(Serializable):
    id: str
    title: str
    state: str
    detail: str = ""


@dataclass(slots=True)
class DiffSummary(Serializable):
    status: str = "No patch proposed"
    files: int = 0
    insertions: int = 0
    deletions: int = 0


@dataclass(slots=True)
class TestSummary(Serializable):
    status: str = "Not run"
    command: str = "Not selected"
    passed: int = 0
    failed: int = 0


@dataclass(slots=True)
class RunArtifacts(Serializable):
    run_id: str
    plan: list[PlanStep] = field(default_factory=list)
    context_explanation: list[dict[str, object]] = field(default_factory=list)
    diff_summary: DiffSummary = field(default_factory=DiffSummary)
    test_summary: TestSummary = field(default_factory=TestSummary)
    trace_summary: list[str] = field(default_factory=list)

