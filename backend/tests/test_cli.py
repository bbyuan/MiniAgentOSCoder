from argparse import Namespace

from app.cli import build_parser, execute
from app.runtime.commands import parse_command


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object] | None]] = []

    def request(self, method: str, path: str, payload=None):
        self.calls.append((method, path, payload))
        if path == "/projects/open" or path == "/projects/current":
            return {"project_id": "project-1"}
        if path == "/runs":
            return {"run_id": "run-1", "status": "planning"}
        return {"status": "ok"}


def test_parse_task_slash_commands_and_preserve_plain_tasks() -> None:
    review = parse_command("/review src/auth.py", "Bugfix")
    plain = parse_command("fix the parser", "Feature")
    compact = parse_command("/compact", "Bugfix")

    assert (review.kind, review.mode, review.content) == ("task", "Review", "src/auth.py")
    assert (plain.kind, plain.mode, plain.content) == ("task", "Feature", "fix the parser")
    assert (compact.kind, compact.command) == ("system", "/compact")


def test_cli_run_opens_project_creates_mode_aware_run_and_starts_it() -> None:
    args = build_parser().parse_args([
        "run",
        "/spec implement docs/filter.md",
        "--project",
        "/workspace/demo",
    ])
    client = FakeClient()

    result = execute(args, client)

    assert result["run_id"] == "run-1"
    assert client.calls == [
        ("POST", "/projects/open", {"path": "/workspace/demo"}),
        ("POST", "/runs", {"project_id": "project-1", "task": "implement docs/filter.md", "mode": "Spec"}),
        ("POST", "/runs/run-1/start", None),
    ]


def test_cli_control_commands_use_the_shared_daemon_api() -> None:
    client = FakeClient()
    compact = Namespace(command="compact", run_id="run-2", target=0.6, confirm=True)

    execute(compact, client)

    assert client.calls == [
        ("POST", "/runs/run-2/context/compact", {"force": True, "target_ratio": 0.6, "confirmed": True})
    ]


def test_cli_resume_selects_checkpoint_and_workspace_restore() -> None:
    client = FakeClient()
    args = build_parser().parse_args([
        "resume",
        "run-3",
        "--checkpoint",
        "checkpoint-2",
        "--restore-workspace",
    ])

    execute(args, client)

    assert client.calls == [
        (
            "POST",
            "/runs/run-3/resume",
            {"checkpoint_id": "checkpoint-2", "restore_workspace": True},
        )
    ]


def test_cli_metrics_supports_project_scope() -> None:
    client = FakeClient()
    args = build_parser().parse_args(["metrics", "--project", "project-1"])

    execute(args, client)

    assert client.calls == [("GET", "/evaluation/summary?project_id=project-1", None)]
