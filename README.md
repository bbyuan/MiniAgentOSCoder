# MiniAgentOS Coder

MiniAgentOS Coder is a local coding-agent runtime and desktop workbench.

Its core idea is:

```text
Contract-first, context-aware, traceable coding-agent runtime.
```

## What This Project Builds

- A local AgentOS-style runtime for coding agents.
- A single-machine AgentPaaS-style control plane for tools, skills, memory, runs, traces, and policies.
- A desktop workbench for observing plans, context, diffs, approvals, tests, contracts, budget, and replay.
- A spec-driven development workflow based on `AGENTS.md`, `.agent/skills/*/SKILL.md`, and `openspec/`.

## Current Stage

The repository now includes the local Daemon API, guarded Tool Gateway, Context Pack, Patch Pipeline, trace/replay, run artifacts, model Action IR executor, and bounded autonomous Agent Loop. Active changes remain documented under `openspec/changes/`.

Shared daemon API contract:

```text
openspec/api-contract.md
```

## First Development Target

P0 must deliver a real local coding-agent loop:

```text
open project -> scan workspace -> compile AgentContract -> plan -> build context
-> emit Action IR -> guard -> tool gateway -> patch -> approve -> test
-> repair -> report -> trace/replay
```

## Development Commands

Backend:

```text
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
python -m pytest
```

Frontend:

```text
cd frontend
npm install
npm run dev
npm run build
```

Connected workbench:

```text
# terminal 1
cd backend
. .venv/bin/activate
uvicorn app.main:app --reload --env-file ../.env

# terminal 2
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`, keep the default example workspace path, and start a run. The workbench opens the project, prepares the contract and context, starts the local Run Worker, and incrementally renders model, action, tool, budget, and terminal events from the SSE Trace stream.

## Model Provider Configuration

The runtime supports OpenAI-compatible Chat Completions providers. The default configuration uses DeepSeek V4 Flash. Keep non-sensitive options in `.agent/config.yaml` and credentials in the ignored root `.env` file:

```text
cp .env.example .env
# Edit .env and replace the DEEPSEEK_API_KEY placeholder.

cd backend
. .venv/bin/activate
uvicorn app.main:app --reload --env-file ../.env
```

Use `deepseek-v4-flash` for lower-latency development runs or change `models.default_model` to `deepseek-v4-pro` for higher-quality runs. Both use `https://api.deepseek.com` through the OpenAI-compatible Chat Completions API. See the [official DeepSeek API guide](https://api-docs.deepseek.com/).

Never put the API key in `frontend/`, `.agent/config.yaml`, or committed source files. Check readiness through `GET /models/status`; the Daemon reports only the configured environment-variable name and never returns the credential value.

Run execution uses a two-step API: `POST /runs` prepares a managed run and `POST /runs/{run_id}/start` schedules it. `GET /runs/{run_id}/events/stream` provides cursor-based live events, while the existing `/events` endpoint remains a JSON snapshot for replay and CLI use.

P0 demo:

```text
cd backend
.venv/bin/python scripts/demo_p0_run.py
```

The demo copies `examples/python-bugfix` into a temporary workspace, scans it, builds a context pack, applies a patch through Patch Pipeline, runs tests before and after the patch, and writes artifacts under `runs/{run_id}/`.

One-command verification after dependencies are installed:

```text
make verify
```

## How To Work In This Repo

1. Read `AGENTS.md`.
2. Read `openspec/project.md`.
3. Pick the active change under `openspec/changes/`.
4. Implement tasks from `tasks.md`.
5. Update tasks only after validation.

## Definition Of Done

A completed task should map to an OpenSpec requirement, produce observable runtime behavior, include validation, and update the active `tasks.md` checkbox only after the work is verified.
