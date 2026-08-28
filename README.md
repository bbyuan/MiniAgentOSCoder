# MiniAgentOS Coder

MiniAgentOS Coder is a local coding-agent runtime and desktop workbench.

Its core idea is:

```text
Contract-first, context-aware, traceable coding-agent runtime.
```

## What This Project Builds

- A local AgentOS-style runtime for coding agents.
- A single-machine AgentPaaS-style control plane for tools, skills, memory, runs, traces, and policies.
- A desktop workbench for observing plans, context, memory, diffs, approvals, tests, contracts, budget, and replay.
- A spec-driven development workflow based on `AGENTS.md`, `.agent/skills/*/SKILL.md`, and `openspec/`.

## Current Stage

The repository now includes the local Daemon API, guarded Tool Gateway, executable Context Pack, three-scope Memory Manager, deterministic Context Compression, Patch Pipeline, general tool approval, repair and rollback, deterministic run reports, controlled Trace Replay, model Action IR executor, bounded autonomous Agent Loop, ordered policy evaluation, portable process sandboxing, progressive Skill activation, governed stdio MCP tools, trusted lifecycle Hooks, a persistent SQLite Run Center, and a Tauri desktop host with a bundled Python sidecar. Active changes remain documented under `openspec/changes/`.

Shared daemon API contract:

```text
openspec/api-contract.md
```

## First Development Target

P0 must deliver a real local coding-agent loop:

```text
open project -> scan workspace -> compile AgentContract -> plan -> build context
-> emit Action IR -> guard -> tool gateway -> patch -> approve -> test
-> observe/compact -> repair -> consolidate memory -> report -> trace/replay
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

Open `http://127.0.0.1:5173/` and prepare a run. Before launch, the Governance view lets you choose the sandbox profile and tighten any tool to approval-required or denied. Launching locks those settings, starts the local Run Worker, and incrementally renders model, policy, sandbox, tool, budget, and terminal events from the SSE Trace stream.

The guided workbench follows one primary path:

```text
open project -> describe task -> analyze without edits -> review preflight
-> start execution -> approve guarded effects -> inspect result and replay
```

Inactive runtime panels stay hidden until a Run exists. The desktop app uses the system folder picker; browser development retains an absolute-path field. Recently opened projects come from the local Run Center.

Desktop development:

```text
cd backend
. .venv/bin/activate
pip install -e ".[dev,desktop]"

cd ../frontend
npm install
npm run desktop:dev
```

Production bundle for the current platform:

```text
cd frontend
npm run desktop:build
```

The build first creates the target-suffixed PyInstaller Daemon sidecar, then packages the Tauri application. macOS artifacts are written under `frontend/src-tauri/target/release/bundle/macos/` and `frontend/src-tauri/target/release/bundle/dmg/`. Local builds are not notarized for distribution.

Use the History control in the top bar to open Run Center. It searches persisted runs by project, status, task, and archive state; reads reports and recent Trace evidence from the workspace; and compares exactly two runs across steps, model/tool calls, tokens, patches, repairs, tests, and changed files. The Daemon stores the local catalog at `~/.miniagentos-coder/state.db` by default. Set `MINIAGENTOS_HOME` to relocate it; reports, traces, patches, checkpoints, and snapshots remain under each workspace's `runs/{run_id}/` directory.

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

In the desktop app, use **Configure model** when a project reports that its Provider is unavailable. The Rust host stores the key in the operating system credential manager (macOS Keychain, Windows Credential Manager, or Linux Secret Service), restarts the managed Daemon, and injects the credential only into that process environment. The Workbench never writes it to browser storage or a project file. Browser development continues to use the ignored root `.env` flow above.

Run execution uses a two-step API: `POST /runs` prepares a managed run and `POST /runs/{run_id}/start` schedules it. `GET /runs/{run_id}/events/stream` provides cursor-based live events. Terminal runs write `runs/{run_id}/report.md`, applied patches accumulate in `patch.diff`, and `POST /runs/{run_id}/replay` returns a read-only event snapshot for the workbench timeline and future CLI use.

The Context view shows prompt budget, token composition, selection state, and audited compaction. The Memory view separates read-only Run memory, editable project memory, and explicitly confirmed long-term memory. Persistent entries live under the opened workspace's `.agent/memory/`; secret-like content and path escapes are rejected by the Daemon.

The Governance view is both a preflight control surface and an evidence viewer. It shows the effective policy for every registered tool, each ordered Guard decision and reason, and sandbox execution records. The current `portable-process` backend guarantees argv-based execution without a shell, workspace confinement for process cwd, sanitized environment variables, private runtime directories, timeout/process-group termination, and bounded returned output. It does not claim kernel network isolation, syscall filtering, or read-only mounts; those capabilities require a future container or OS-native backend.

The Extensions view loads `.agent/skills.yaml`, `.agent/mcp.yaml`, and `.agent/hooks.yaml`. Compatible Skills are recommended from the selected Run mode and only activated `SKILL.md` files enter Planner context. Enabled stdio MCP Servers complete `initialize` and `tools/list`; discovered tools receive names such as `mcp__github__search_issues` and still pass Tool Gateway approval. Enabled Hooks run at `run.before`, `run.after`, `tool.before`, or `tool.after` through the same Sandbox backend. MCP and Hook declarations use argv arrays, never shell strings, and their command arguments and environment values are withheld from the API.

Minimal project declarations:

```yaml
# .agent/mcp.yaml
servers:
  - id: project-tools
    name: Project Tools
    transport: stdio
    command: [python3, scripts/project_mcp.py]
    timeout_seconds: 15
    env_allow: [PROJECT_TOOLS_TOKEN]
```

```yaml
# .agent/hooks.yaml
hooks:
  - id: preflight
    name: Project preflight
    event: run.before
    command: [python3, scripts/preflight.py]
    timeout_seconds: 10
    failure_policy: block
```

Declarations are inert until selected on a prepared Run. MiniAgentOS does not download servers or scripts, and the portable Sandbox limitations still apply.

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
