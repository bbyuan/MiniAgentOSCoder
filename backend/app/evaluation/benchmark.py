from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import shutil
import tempfile
from time import perf_counter
from typing import Any
from uuid import uuid4

from app.context import build_workspace_index, scan_workspace
from app.models import RunPhase, RunState
from app.runtime.artifacts import build_initial_context, build_initial_plan
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import QueuedStaticModelClient
from app.runtime.model_provider import create_model_client
from app.runtime.run_loop import AgentRunLoop
from app.runtime.sandbox import SandboxExecutor
from app.runtime.tracer import TraceWriter
from app.tools import ToolApprovalDecision, ToolGateway, create_builtin_tool_registry


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MANIFEST = PROJECT_ROOT / "benchmarks" / "tasks.jsonl"
DEFAULT_OUTPUT = PROJECT_ROOT / "benchmarks" / "results"
DEFAULT_CONFIG = PROJECT_ROOT / ".agent" / "config.yaml"
VARIANTS = ("full_context", "task_only")


@dataclass(frozen=True, slots=True)
class BenchmarkTask:
    task_id: str
    project: str
    mode: str
    task: str
    test_argv: list[str]
    expected_changed_files: list[str]
    fixture_actions: list[dict[str, Any]]


def run_benchmark(
    *,
    manifest_path: str | Path = DEFAULT_MANIFEST,
    output_dir: str | Path = DEFAULT_OUTPUT,
    config_path: str | Path = DEFAULT_CONFIG,
    provider: str = "fixture",
    variants: list[str] | tuple[str, ...] = VARIANTS,
) -> dict[str, object]:
    if provider not in {"fixture", "configured"}:
        raise ValueError(f"Unsupported benchmark provider: {provider}")
    selected_variants = list(dict.fromkeys(variants))
    if not selected_variants or any(variant not in VARIANTS for variant in selected_variants):
        raise ValueError(f"Benchmark variants must be selected from: {', '.join(VARIANTS)}")

    manifest = Path(manifest_path).expanduser().resolve()
    tasks = load_benchmark_tasks(manifest)
    project_root = manifest.parent / "projects"
    results: list[dict[str, object]] = []
    for variant in selected_variants:
        for task in tasks:
            source = (project_root / task.project).resolve()
            if not source.is_dir() or not source.is_relative_to(project_root.resolve()):
                raise ValueError(f"Benchmark project is unavailable: {task.project}")
            with tempfile.TemporaryDirectory(prefix=f"miniagentos-bench-{task.task_id}-") as temporary:
                workspace = Path(temporary) / "workspace"
                shutil.copytree(source, workspace)
                results.append(
                    _run_task(
                        task,
                        variant=variant,
                        provider=provider,
                        workspace=workspace,
                        config_path=Path(config_path).expanduser().resolve(),
                    )
                )

    generated_at = datetime.now(timezone.utc).isoformat()
    aggregates = {
        variant: _aggregate([result for result in results if result["variant"] == variant])
        for variant in selected_variants
    }
    report: dict[str, object] = {
        "schema_version": "v1",
        "generated_at": generated_at,
        "provider": provider,
        "claim": (
            "runtime_reproducibility"
            if provider == "fixture"
            else "configured_model_quality"
        ),
        "variants": selected_variants,
        "task_count": len(tasks),
        "runtime": {
            "python": platform.python_version(),
            "system": platform.system(),
            "machine": platform.machine(),
        },
        "results": results,
        "aggregates": aggregates,
        "deltas": _variant_deltas(aggregates, selected_variants),
    }
    _write_report(report, Path(output_dir).expanduser().resolve())
    return report


def load_benchmark_tasks(path: str | Path) -> list[BenchmarkTask]:
    manifest = Path(path)
    tasks: list[BenchmarkTask] = []
    seen: set[str] = set()
    for line_number, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid benchmark JSON at line {line_number}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"Benchmark task at line {line_number} must be an object")
        task_id = str(item.get("id", "")).strip()
        if not task_id or task_id in seen:
            raise ValueError(f"Benchmark task id is missing or duplicated at line {line_number}")
        seen.add(task_id)
        test_argv = item.get("test_argv")
        fixture_actions = item.get("fixture_actions")
        if not isinstance(test_argv, list) or not test_argv or not all(isinstance(value, str) for value in test_argv):
            raise ValueError(f"Benchmark task {task_id} requires a string test_argv")
        if not isinstance(fixture_actions, list) or not all(isinstance(value, dict) for value in fixture_actions):
            raise ValueError(f"Benchmark task {task_id} requires Fixture Action IR objects")
        tasks.append(
            BenchmarkTask(
                task_id=task_id,
                project=str(item.get("project", "")),
                mode=str(item.get("mode", "Bugfix")),
                task=str(item.get("task", "")),
                test_argv=[str(value) for value in test_argv],
                expected_changed_files=[str(value) for value in item.get("expected_changed_files", [])],
                fixture_actions=fixture_actions,
            )
        )
    if not tasks:
        raise ValueError("Benchmark manifest does not contain tasks")
    return tasks


def _run_task(
    task: BenchmarkTask,
    *,
    variant: str,
    provider: str,
    workspace: Path,
    config_path: Path,
) -> dict[str, object]:
    run_id = f"bench-{task.task_id}-{uuid4().hex[:8]}"
    tracer = TraceWriter(workspace / "runs")
    profile = scan_workspace(workspace)
    build_workspace_index(workspace, workspace / ".agent" / "index")
    contract = compile_agent_contract(config_path, task_mode=task.mode, project_profile=profile.to_dict())
    plan = build_initial_plan(task.mode, profile.to_dict())
    context_pack, _ = build_initial_context(
        _benchmark_run(run_id, task),
        profile.to_dict(),
        plan,
        workspace_root=workspace if variant == "full_context" else None,
    )
    sandbox = SandboxExecutor(
        workspace,
        run_id,
        event_handler=lambda event, payload: tracer.event(run_id, event, payload),
    )
    gateway = ToolGateway(
        workspace_root=workspace,
        contract=contract,
        approval_handler=lambda action, descriptor, preview: _approve_benchmark_patch(
            tracer,
            run_id,
            action.type,
        ),
        policy_handler=lambda evaluation: tracer.event(
            run_id,
            "policy.evaluated",
            {"evaluation": evaluation.to_dict()},
        ),
        sandbox_validator=sandbox.validate_argv,
        run_id=run_id,
    )
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace, sandbox):
        gateway.register(descriptor, handler, preflight)
    model_client = (
        QueuedStaticModelClient([json.dumps(action, ensure_ascii=False) for action in task.fixture_actions])
        if provider == "fixture"
        else create_model_client(config_path)
    )

    started = perf_counter()
    result = AgentRunLoop(
        run_id=run_id,
        gateway=gateway,
        model_client=model_client,
        tracer=tracer,
    ).run(
        task=task.task,
        contract=contract,
        context_pack=context_pack,
        mode=task.mode,
    )
    validation, _ = sandbox.run(task.test_argv, timeout_seconds=60)
    duration_ms = round((perf_counter() - started) * 1000, 2)
    changed_files = sorted({
        str(path)
        for observation in result.observations
        if observation.action_type == "apply_patch" and observation.ok
        for path in observation.metadata.get("files", [])
    })
    expected_files = sorted(task.expected_changed_files)
    tests_passed = validation.returncode == 0 and not validation.timed_out
    success = result.status == RunPhase.COMPLETED and tests_passed and changed_files == expected_files
    events = tracer.read_events(run_id)
    return {
        "task_id": task.task_id,
        "variant": variant,
        "provider": provider,
        "success": success,
        "status": result.status.value,
        "termination_reason": result.termination_reason,
        "tests_passed": tests_passed,
        "changed_files_match": changed_files == expected_files,
        "changed_file_count": len(changed_files),
        "steps": result.steps,
        "model_calls": result.model_calls,
        "tool_calls": result.tool_calls,
        "input_tokens": result.token_usage.get("input_tokens", 0),
        "output_tokens": result.token_usage.get("output_tokens", 0),
        "total_tokens": result.token_usage.get("total_tokens", 0),
        "duration_ms": duration_ms,
        "approval_requests": sum(1 for event in events if event.get("event") == "benchmark.approval"),
        "guard_blocks": sum(
            1
            for event in events
            if event.get("event") == "policy.evaluated"
            and isinstance(event.get("payload"), dict)
            and isinstance(event["payload"].get("evaluation"), dict)
            and event["payload"]["evaluation"].get("outcome") != "allowed"
        ),
        "context_tokens": context_pack.budget_report.used_tokens if context_pack.budget_report else 0,
    }


def _benchmark_run(run_id: str, task: BenchmarkTask) -> RunState:
    return RunState(run_id=run_id, task=task.task, status=RunPhase.PLANNING, mode=task.mode)


def _approve_benchmark_patch(tracer: TraceWriter, run_id: str, action_type: str) -> ToolApprovalDecision:
    tracer.event(
        run_id,
        "benchmark.approval",
        {"action_type": action_type, "decision": "isolated_fixture_auto_approval"},
    )
    return ToolApprovalDecision(approved=True, reason="Isolated benchmark workspace")


def _aggregate(results: list[dict[str, object]]) -> dict[str, object]:
    count = len(results)
    return {
        "runs": count,
        "success_rate": _rate(sum(bool(result["success"]) for result in results), count),
        "test_pass_rate": _rate(sum(bool(result["tests_passed"]) for result in results), count),
        "average_model_calls": _mean(results, "model_calls"),
        "average_tool_calls": _mean(results, "tool_calls"),
        "average_total_tokens": _mean(results, "total_tokens"),
        "average_context_tokens": _mean(results, "context_tokens"),
        "average_duration_ms": _mean(results, "duration_ms"),
        "approval_requests": sum(int(result["approval_requests"]) for result in results),
        "guard_blocks": sum(int(result["guard_blocks"]) for result in results),
        "failure_categories": dict(sorted(Counter(
            str(result["termination_reason"])
            for result in results
            if not bool(result["success"])
        ).items())),
    }


def _mean(results: list[dict[str, object]], key: str) -> float | None:
    return round(sum(float(result[key]) for result in results) / len(results), 2) if results else None


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _variant_deltas(
    aggregates: dict[str, dict[str, object]],
    variants: list[str],
) -> dict[str, object] | None:
    if len(variants) != 2:
        return None
    baseline, candidate = variants
    keys = (
        "success_rate",
        "test_pass_rate",
        "average_model_calls",
        "average_tool_calls",
        "average_total_tokens",
        "average_context_tokens",
        "average_duration_ms",
        "approval_requests",
        "guard_blocks",
    )
    return {
        "baseline": baseline,
        "candidate": candidate,
        "candidate_minus_baseline": {
            key: (
                None
                if aggregates[baseline][key] is None or aggregates[candidate][key] is None
                else round(float(aggregates[candidate][key]) - float(aggregates[baseline][key]), 4)
            )
            for key in keys
        },
    }


def _write_report(report: dict[str, object], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = output_dir / timestamp
    suffix = 1
    while run_dir.exists():
        suffix += 1
        run_dir = output_dir / f"{timestamp}-{suffix}"
    run_dir.mkdir()
    json_text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    markdown = _markdown_report(report)
    (run_dir / "report.json").write_text(json_text, encoding="utf-8")
    (run_dir / "report.md").write_text(markdown, encoding="utf-8")
    _atomic_write(output_dir / "latest.json", json_text)
    _atomic_write(output_dir / "latest.md", markdown)


def _atomic_write(path: Path, content: str) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def _markdown_report(report: dict[str, object]) -> str:
    claim = str(report["claim"])
    claim_note = (
        "Fixture Provider results verify runtime reproducibility; they are not model-quality claims."
        if claim == "runtime_reproducibility"
        else "Configured Provider results measure this local model configuration and task set only."
    )
    lines = [
        "# MiniAgentOS Coder Benchmark",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Provider: `{report['provider']}`",
        f"Claim: `{claim}`",
        "",
        f"> {claim_note}",
        "",
        "## Variant Summary",
        "",
        "| Variant | Runs | Success | Tests | Model calls | Tool calls | Tokens | Context tokens | Duration ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    aggregates = report["aggregates"]
    if isinstance(aggregates, dict):
        for variant, metrics in aggregates.items():
            if not isinstance(metrics, dict):
                continue
            lines.append(
                f"| {variant} | {metrics['runs']} | {_percent(metrics['success_rate'])} | "
                f"{_percent(metrics['test_pass_rate'])} | {metrics['average_model_calls']} | "
                f"{metrics['average_tool_calls']} | {metrics['average_total_tokens']} | "
                f"{metrics['average_context_tokens']} | {metrics['average_duration_ms']} |"
            )
    deltas = report.get("deltas")
    if isinstance(deltas, dict):
        lines.extend([
            "",
            "## Ablation Delta",
            "",
            f"Candidate `{deltas['candidate']}` minus baseline `{deltas['baseline']}`:",
            "",
            "```json",
            json.dumps(deltas["candidate_minus_baseline"], indent=2, sort_keys=True),
            "```",
        ])
    lines.extend(["", "## Task Results", "", "| Task | Variant | Status | Tests | Files | Steps |", "|---|---|---|---|---|---:|"])
    results = report["results"]
    if isinstance(results, list):
        for result in results:
            if isinstance(result, dict):
                lines.append(
                    f"| {result['task_id']} | {result['variant']} | "
                    f"{'pass' if result['success'] else 'fail'} | "
                    f"{'pass' if result['tests_passed'] else 'fail'} | "
                    f"{'match' if result['changed_files_match'] else 'mismatch'} | {result['steps']} |"
                )
    return "\n".join(lines) + "\n"


def _percent(value: object) -> str:
    return "N/A" if value is None else f"{round(float(value) * 100)}%"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the isolated MiniAgentOS Coder benchmark")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--provider", choices=["fixture", "configured"], default="fixture")
    parser.add_argument("--variant", action="append", choices=list(VARIANTS))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = run_benchmark(
        manifest_path=args.manifest,
        output_dir=args.output,
        config_path=args.config,
        provider=args.provider,
        variants=args.variant or list(VARIANTS),
    )
    print(json.dumps({"provider": report["provider"], "aggregates": report["aggregates"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
