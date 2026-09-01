from __future__ import annotations

from dataclasses import dataclass, field

from app.models.base import Serializable


@dataclass(slots=True)
class FormalProgramNode(Serializable):
    id: str
    op: str
    label: str
    detail: str = ""
    children: list["FormalProgramNode"] = field(default_factory=list)


@dataclass(slots=True)
class FormalProgramLint(Serializable):
    id: str
    status: str
    summary: str
    evidence: str


@dataclass(slots=True)
class FormalProgramGrade(Serializable):
    steps: int
    model_calls: int
    tool_calls: int
    input_tokens: int
    output_tokens: int
    wall_time_seconds: int
    expression: str


@dataclass(slots=True)
class FormalAgentProgram(Serializable):
    run_id: str
    calculus: str
    source: str
    input_type: str
    output_type: str
    term: str
    effect: str
    grade: FormalProgramGrade
    nodes: list[FormalProgramNode] = field(default_factory=list)
    lints: list[FormalProgramLint] = field(default_factory=list)
    trace_rules: list[str] = field(default_factory=list)
    highlights: list[str] = field(default_factory=list)
