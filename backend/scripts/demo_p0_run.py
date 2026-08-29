from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from app.context import build_workspace_index, scan_workspace, set_current_diff_item, write_project_profile
from app.models import RunPhase
from app.runtime.agent_loop import create_runtime_run
from app.runtime.artifacts import build_initial_context, build_initial_plan
from app.runtime.tracer import TraceWriter
from app.tools import PatchPipeline


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_SOURCE = PROJECT_ROOT / "examples" / "python-bugfix"
DEMO_WORKSPACE = Path(tempfile.gettempdir()) / "miniagentos-coder-demo-python-bugfix"
RUNS_DIR = PROJECT_ROOT / "runs"
CONFIG_PATH = PROJECT_ROOT / ".agent" / "config.yaml"


PATCH = """--- a/calculator.py
+++ b/calculator.py
@@ -1,3 +1,3 @@
 def add(left: int, right: int) -> int:
-    return left - right
+    return left + right
 
"""

BROKEN_CALCULATOR = """def add(left: int, right: int) -> int:
    return left - right

"""

CALCULATOR_TEST = """import unittest

from calculator import add


class CalculatorTest(unittest.TestCase):
    def test_adds_two_numbers(self) -> None:
        self.assertEqual(add(2, 3), 5)


if __name__ == "__main__":
    unittest.main()
"""


def main() -> None:
    if DEMO_WORKSPACE.exists():
        shutil.rmtree(DEMO_WORKSPACE)
    shutil.copytree(
        EXAMPLE_SOURCE,
        DEMO_WORKSPACE,
        ignore=shutil.ignore_patterns(".agent", "__pycache__", "runs"),
    )
    _reset_demo_fixture(DEMO_WORKSPACE)

    profile = scan_workspace(DEMO_WORKSPACE)
    write_project_profile(profile, DEMO_WORKSPACE)
    index = build_workspace_index(DEMO_WORKSPACE, DEMO_WORKSPACE / ".agent" / "index")

    run = create_runtime_run(
        task="Fix calculator.add so the example test passes",
        workspace=DEMO_WORKSPACE,
        config_path=CONFIG_PATH,
        runs_dir=RUNS_DIR,
    )
    tracer = TraceWriter(RUNS_DIR)

    plan = build_initial_plan("Bugfix", profile.to_dict())
    context_pack, explanation = build_initial_context(
        run,
        profile.to_dict(),
        plan,
        workspace_root=DEMO_WORKSPACE,
    )
    tracer.event(run.run_id, "context.pack.created", {"context": context_pack.to_dict()})

    before = _run_tests(DEMO_WORKSPACE)
    tracer.event(run.run_id, "test.before_patch", before)

    pipeline = PatchPipeline(DEMO_WORKSPACE)
    summary = pipeline.apply(PATCH)
    set_current_diff_item(context_pack, step=1, content=PATCH)
    tracer.event(run.run_id, "patch.applied", {"summary": asdict(summary)})

    after = _run_tests(DEMO_WORKSPACE)
    tracer.event(run.run_id, "test.after_patch", after)

    run.status = RunPhase.COMPLETED if after["ok"] else RunPhase.FAILED
    tracer.event(run.run_id, "run.completed", {"status": run.status.value})

    run_dir = RUNS_DIR / run.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "patch.diff").write_text(PATCH, encoding="utf-8")
    (run_dir / "report.md").write_text(
        _report(
            run.run_id,
            profile.to_dict(),
            len(index.files),
            before,
            after,
            [item["source"] for item in explanation if item["state"] in {"selected", "compressed"}],
        ),
        encoding="utf-8",
    )

    print(json.dumps({"run_id": run.run_id, "status": run.status.value, "run_dir": str(run_dir)}, ensure_ascii=False))


def _run_tests(workspace: Path) -> dict[str, object]:
    completed = subprocess.run(
        ["python3", "-B", "-m", "unittest", "discover"],
        cwd=workspace,
        text=True,
        capture_output=True,
        check=False,
    )
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def _reset_demo_fixture(workspace: Path) -> None:
    (workspace / "calculator.py").write_text(BROKEN_CALCULATOR, encoding="utf-8")
    (workspace / "test_calculator.py").write_text(CALCULATOR_TEST, encoding="utf-8")
    (workspace / "AGENTS.md").write_text(
        "# Demo Rules\n\nInspect the implementation and related test before applying the smallest patch.\n",
        encoding="utf-8",
    )


def _report(
    run_id: str,
    profile: dict[str, object],
    indexed_files: int,
    before: dict[str, object],
    after: dict[str, object],
    context_sources: list[str],
) -> str:
    return f"""# P0 Demo Run Report

Run: `{run_id}`

## Summary

The demo opened `examples/python-bugfix`, scanned the workspace, built a workspace index, created a Context Pack, applied an approved patch through Patch Pipeline, ran tests before and after the patch, and wrote trace/report artifacts.

## Project Profile

```json
{json.dumps(profile, ensure_ascii=False, indent=2)}
```

## Evidence

- Indexed files: {indexed_files}
- Selected context sources: {", ".join(context_sources)}
- Before patch tests passed: {before["ok"]}
- After patch tests passed: {after["ok"]}
- Patch artifact: `patch.diff`
- Trace artifact: `trace.jsonl`
"""


if __name__ == "__main__":
    main()
