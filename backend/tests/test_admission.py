from app.models import AgentContract, ContextPack, ContextPackBudget, CostEnvelope, RunState
from app.runtime.admission import build_run_admission
from app.runtime.model_provider import ModelProviderConfig


def _admission(
    *,
    history: list[dict[str, object]] | None = None,
    context_tokens: int = 1200,
    limits: CostEnvelope | None = None,
    prices: tuple[float, float] | None = None,
):
    model_config = ModelProviderConfig()
    if prices is not None:
        model_config.input_price_per_million = prices[0]
        model_config.output_price_per_million = prices[1]
    return build_run_admission(
        run=RunState(run_id="run-admission", task="Fix the parser", mode="Bugfix"),
        contract=AgentContract(agent_id="test", cost_envelope=limits or CostEnvelope()),
        context_pack=ContextPack(
            run_id="run-admission",
            budget_report=ContextPackBudget(
                max_tokens=120000,
                used_tokens=context_tokens,
                remaining_tokens=max(0, 120000 - context_tokens),
            ),
        ),
        project_profile={"test_commands": ["pytest"]},
        model_config=model_config,
        history_samples=history or [],
    )


def test_admission_uses_heuristics_without_history() -> None:
    admission = _admission()

    assert admission.can_start is True
    assert admission.basis == "heuristic"
    assert admission.confidence == "low"
    assert admission.resources["model_calls"].expected == 9
    assert admission.cost.configured is False
    assert next(check for check in admission.checks if check.id == "forecast_confidence").status == "info"


def test_admission_calibrates_from_numeric_history() -> None:
    history = [
        {
            "model_calls": calls,
            "tool_calls": calls + 2,
            "input_tokens": calls * 1000,
            "output_tokens": calls * 300,
            "created_at": "2026-08-30T10:00:00+00:00",
            "completed_at": f"2026-08-30T10:0{calls}:00+00:00",
        }
        for calls in (3, 5, 7)
    ]

    admission = _admission(history=history)

    assert admission.basis == "history"
    assert admission.confidence == "medium"
    assert admission.sample_size == 3
    assert admission.resources["model_calls"].expected == 5
    assert admission.resources["wall_time_seconds"].expected == 300


def test_admission_blocks_context_that_exceeds_hard_ceiling() -> None:
    admission = _admission(
        context_tokens=1001,
        limits=CostEnvelope(max_input_tokens=1000),
    )

    assert admission.can_start is False
    assert admission.decision == "blocked"
    assert next(check for check in admission.checks if check.id == "context_fit").status == "blocked"


def test_admission_computes_cost_only_when_prices_are_configured() -> None:
    admission = _admission(prices=(1.0, 2.0))

    assert admission.cost.configured is True
    assert admission.cost.currency == "USD"
    assert admission.cost.expected is not None
    assert admission.cost.high is not None
    assert admission.cost.ceiling == 0.16
