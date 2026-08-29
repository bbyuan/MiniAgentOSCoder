from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.runtime.commands import parse_command


TERMINAL_STATES = {"completed", "failed", "cancelled"}


class DaemonClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=30) as response:
                value = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Daemon returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Cannot connect to MiniAgentOS daemon at {self.base_url}: {exc.reason}") from exc
        if not isinstance(value, dict):
            raise RuntimeError("Daemon response must be a JSON object")
        return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="miniagent", description="MiniAgentOS Coder CLI companion")
    parser.add_argument("--url", default=os.getenv("MINIAGENTOS_DAEMON_URL", "http://127.0.0.1:8000"))
    commands = parser.add_subparsers(dest="command", required=True)

    open_parser = commands.add_parser("open", help="Open and scan a workspace")
    open_parser.add_argument("path")

    run_parser = commands.add_parser("run", help="Create and start a coding-agent run")
    run_parser.add_argument("task")
    run_parser.add_argument("--project")
    run_parser.add_argument("--mode", default="Bugfix", choices=["Bugfix", "Feature", "Review", "Chat", "Spec"])
    run_parser.add_argument("--prepare-only", action="store_true")

    for name in ("status", "cancel", "approval", "replay", "report"):
        child = commands.add_parser(name)
        child.add_argument("run_id")

    steer = commands.add_parser("steer", help="Append guidance to an active run")
    steer.add_argument("run_id")
    steer.add_argument("message")

    approve = commands.add_parser("approve")
    approve.add_argument("run_id")
    approve.add_argument("approval_id")

    deny = commands.add_parser("deny")
    deny.add_argument("run_id")
    deny.add_argument("approval_id")
    deny.add_argument("reason")

    compact = commands.add_parser("compact")
    compact.add_argument("run_id")
    compact.add_argument("--target", type=float, default=0.55)
    compact.add_argument("--confirm", action="store_true")

    resume = commands.add_parser("resume", help="Rehydrate a stopped run from a persisted checkpoint")
    resume.add_argument("run_id")
    resume.add_argument("--checkpoint")
    resume.add_argument("--restore-workspace", action="store_true")

    metrics = commands.add_parser("metrics", help="Show aggregate local run evidence")
    metrics.add_argument("--project")

    benchmark = commands.add_parser("benchmark", help="Run isolated local benchmark tasks")
    benchmark.add_argument("--manifest")
    benchmark.add_argument("--output")
    benchmark.add_argument("--config")
    benchmark.add_argument("--provider", choices=["fixture", "configured"], default="fixture")
    benchmark.add_argument("--variant", action="append", choices=["full_context", "task_only"])
    return parser


def execute(args: argparse.Namespace, client: DaemonClient) -> dict[str, Any]:
    command = args.command
    if command == "open":
        return client.request("POST", "/projects/open", {"path": args.path})
    if command == "run":
        project = client.request("POST", "/projects/open", {"path": args.project}) if args.project else client.request("GET", "/projects/current")
        parsed = parse_command(args.task, args.mode)
        if parsed.kind != "task" or not parsed.content:
            raise RuntimeError("Run requires a task command with non-empty content")
        run = client.request(
            "POST",
            "/runs",
            {"project_id": project["project_id"], "task": parsed.content, "mode": parsed.mode},
        )
        if not args.prepare_only:
            run["start"] = client.request("POST", f"/runs/{run['run_id']}/start")
        return run
    if command == "status":
        return client.request("GET", f"/runs/{args.run_id}")
    if command == "cancel":
        return client.request("POST", f"/runs/{args.run_id}/cancel")
    if command == "steer":
        return client.request("POST", f"/runs/{args.run_id}/steer", {"message": args.message})
    if command == "approval":
        return client.request("GET", f"/runs/{args.run_id}/approval")
    if command == "approve":
        return client.request("POST", f"/runs/{args.run_id}/approve", {"approval_id": args.approval_id, "mode": "approve_once"})
    if command == "deny":
        return client.request("POST", f"/runs/{args.run_id}/deny", {"approval_id": args.approval_id, "reason": args.reason})
    if command == "compact":
        return client.request("POST", f"/runs/{args.run_id}/context/compact", {"force": True, "target_ratio": args.target, "confirmed": args.confirm})
    if command == "replay":
        return client.request("POST", f"/runs/{args.run_id}/replay")
    if command == "report":
        return client.request("GET", f"/runs/{args.run_id}/report")
    if command == "resume":
        return client.request(
            "POST",
            f"/runs/{args.run_id}/resume",
            {
                "checkpoint_id": args.checkpoint,
                "restore_workspace": args.restore_workspace,
            },
        )
    if command == "metrics":
        suffix = f"?project_id={args.project}" if args.project else ""
        return client.request("GET", f"/evaluation/summary{suffix}")
    if command == "benchmark":
        from app.evaluation.benchmark import DEFAULT_CONFIG, DEFAULT_MANIFEST, DEFAULT_OUTPUT, VARIANTS, run_benchmark

        return run_benchmark(
            manifest_path=args.manifest or DEFAULT_MANIFEST,
            output_dir=args.output or DEFAULT_OUTPUT,
            config_path=args.config or DEFAULT_CONFIG,
            provider=args.provider,
            variants=args.variant or list(VARIANTS),
        )
    raise RuntimeError(f"Unsupported command: {command}")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = execute(args, DaemonClient(args.url))
    except (RuntimeError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
