# MiniAgentOS Coder Benchmark

This suite runs only in temporary copies of the versioned projects under `benchmarks/projects/`. It never opens a user workspace.

Offline reproducibility check:

```text
cd backend
.venv/bin/python -m app.evaluation.benchmark
```

Configured-model experiment:

```text
cd backend
.venv/bin/python -m app.evaluation.benchmark --provider configured
```

Use `--variant full_context` or `--variant task_only` to select an ablation. Fixture results prove that the Harness and governed execution path are reproducible; they do not measure general model quality. Reports are written to `benchmarks/results/latest.json` and `latest.md` plus a timestamped directory.
