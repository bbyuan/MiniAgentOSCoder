import json
from pathlib import Path

import pytest

from app.evaluation.benchmark import DEFAULT_CONFIG, DEFAULT_MANIFEST, describe_benchmark_catalog, load_benchmark_tasks, run_benchmark


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_fixture_benchmark_runs_governed_variants_and_writes_reports(tmp_path: Path) -> None:
    source = PROJECT_ROOT / "benchmarks" / "projects" / "python-add" / "calculator.py"
    before = source.read_text(encoding="utf-8")

    report = run_benchmark(
        manifest_path=DEFAULT_MANIFEST,
        output_dir=tmp_path,
        config_path=DEFAULT_CONFIG,
        provider="fixture",
    )

    assert report["provider"] == "fixture"
    assert report["claim"] == "runtime_reproducibility"
    assert report["task_count"] == 2
    assert len(report["results"]) == 4
    assert all(result["success"] for result in report["results"])
    assert report["aggregates"]["full_context"]["success_rate"] == 1.0
    assert report["aggregates"]["task_only"]["success_rate"] == 1.0
    assert report["aggregates"]["full_context"]["average_context_tokens"] > report["aggregates"]["task_only"]["average_context_tokens"]
    assert report["deltas"]["baseline"] == "full_context"
    assert report["deltas"]["candidate"] == "task_only"
    assert report["deltas"]["candidate_minus_baseline"]["average_context_tokens"] < 0
    assert source.read_text(encoding="utf-8") == before

    latest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
    markdown = (tmp_path / "latest.md").read_text(encoding="utf-8")
    assert latest["claim"] == "runtime_reproducibility"
    assert "not model-quality claims" in markdown
    assert "Ablation Delta" in markdown
    assert "miniagentos-bench-" not in json.dumps(latest)


def test_benchmark_can_select_one_variant(tmp_path: Path) -> None:
    report = run_benchmark(
        manifest_path=DEFAULT_MANIFEST,
        output_dir=tmp_path,
        config_path=DEFAULT_CONFIG,
        variants=["task_only"],
    )

    assert report["variants"] == ["task_only"]
    assert report["deltas"] is None
    assert len(report["results"]) == 2


def test_benchmark_catalog_lists_runnable_scenarios() -> None:
    catalog = describe_benchmark_catalog(DEFAULT_MANIFEST)

    assert catalog["schema_version"] == "v1"
    assert catalog["task_count"] == 2
    assert catalog["variants"] == ["full_context", "task_only"]
    first = catalog["tasks"][0]
    assert first["id"] == "py-add-001"
    assert first["mode"] == "Bugfix"
    assert first["test_command"] == "python3 -B -m unittest discover -v"
    assert first["expected_changed_files"] == ["calculator.py"]
    assert first["fixture_steps"] == 5


def test_benchmark_manifest_rejects_duplicate_ids(tmp_path: Path) -> None:
    manifest = tmp_path / "tasks.jsonl"
    task = {
        "id": "duplicate",
        "project": "demo",
        "mode": "Bugfix",
        "task": "fix",
        "test_argv": ["python3", "-m", "unittest"],
        "fixture_actions": [],
    }
    manifest.write_text(f"{json.dumps(task)}\n{json.dumps(task)}\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing or duplicated"):
        load_benchmark_tasks(manifest)


def test_benchmark_rejects_unknown_variant(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="variants"):
        run_benchmark(
            manifest_path=DEFAULT_MANIFEST,
            output_dir=tmp_path,
            variants=["unsafe_baseline"],
        )
