from __future__ import annotations

from dataclasses import dataclass, field

from app.models.base import Serializable


@dataclass(slots=True)
class ResourceForecast(Serializable):
    low: int
    expected: int
    high: int
    ceiling: int
    unit: str


@dataclass(slots=True)
class CostForecast(Serializable):
    configured: bool = False
    currency: str = "USD"
    expected: float | None = None
    high: float | None = None
    ceiling: float | None = None


@dataclass(slots=True)
class AdmissionCheck(Serializable):
    id: str
    status: str
    summary: str
    evidence: str


@dataclass(slots=True)
class RunAdmission(Serializable):
    run_id: str
    decision: str
    can_start: bool
    basis: str
    confidence: str
    sample_size: int
    resources: dict[str, ResourceForecast] = field(default_factory=dict)
    cost: CostForecast = field(default_factory=CostForecast)
    checks: list[AdmissionCheck] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
