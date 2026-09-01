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

The repository now includes the local Daemon API, a governed Tool Registry with workspace, validation, read-only Git, approved command, and patch tools, task-aware Context Pack retrieval, protected workspace `AGENTS.md` instructions and current Diffs, three-scope Memory Manager, deterministic Context Compression, Patch Pipeline, repair and rollback, mode-aware Completion Guard, pre-execution resource admission, governed phase-aware model routing, deterministic run reports, controlled Trace Replay, model Action IR executor, bounded autonomous Agent Loop, ordered policy evaluation, portable process sandboxing, progressive Skill activation, governed stdio MCP tools, trusted lifecycle Hooks, a persistent SQLite Run Center, and a Tauri desktop host with a bundled Python sidecar. Active changes remain documented under `openspec/changes/`.

Shared daemon API contract:

```text
openspec/api-contract.md
```

The installed backend also provides a `miniagent` CLI companion that calls the same Daemon API. Task inputs accept `/fix`, `/test`, `/review`, `/explain`, and `/spec` mode commands in both the Workbench and CLI; operational CLI commands cover cancellation, steering, approval, context compaction, checkpoint resume, replay, reports, local metrics, and isolated benchmarks. Terminal Runs can continue as an ordered conversation: each follow-up receives a bounded prior-result handoff while compiling a fresh contract and budget.

## First Development Target

P0 must deliver a real local coding-agent loop:

```text
open project -> scan workspace -> compile AgentContract -> plan -> build context
-> emit Action IR -> guard -> tool gateway -> patch -> approve -> test
-> observe/compact -> repair -> completion guard -> consolidate memory
-> report -> trace/replay
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
npm run check
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

Open `http://127.0.0.1:5173/`, choose a project, describe the requested result, and select **Start task**. The workbench prepares and launches the governed Run as one action. Use the secondary **Run settings** action only when a task needs a different Sandbox profile, tool policy, Skill, MCP Server, or Hook.

The guided workbench follows one primary path:

```text
open project -> describe task -> start task
-> approve only when required -> inspect result
```

Inactive runtime panels stay hidden until a Run exists. The desktop app uses the system folder picker; browser development retains an absolute-path field. Recently opened projects come from the local Run Center.

Run setup separates configuration responsibility:

```text
required: model Provider
automatic: Sandbox + Context + Completion Guard
optional: Skills + MCP Servers + Hooks
```

The full Inspector is hidden by default before and during execution. **Run settings** opens a focused, wide configuration surface before launch with only two choices: Safety and permissions for Sandbox/tool policy changes, and Extension capabilities for Skills, MCP Servers, and Hooks. **Run details** reveals Context, Memory, checkpoints, reports, traces, and execution evidence after launch. An approval request opens those details automatically so a blocking decision is never hidden. Default settings are sufficient for a normal run.

Before execution, the workbench shows a resource forecast for model calls, tool calls, tokens, wall time, and optional cost. Forecast ranges are estimates calibrated from numeric same-project history when available; AgentContract ceilings remain separate, enforced hard limits. Deterministic admission checks can warn about low headroom or missing validation, while impossible context or invalid hard limits block the model call before it is created. The workbench also shows the completion contract for the selected mode. Bugfix, Feature, and Spec Runs require a recorded change plus a successful test after the latest patch. Review Runs require read-only inspection and forbid applied patches; Chat Runs require an answer and a read-only workspace.

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

Use the History control in the top bar to open Run Center. It searches persisted runs by project, status, task, and archive state; shows structured completion evidence; reads reports and recent Trace evidence from the workspace; and compares exactly two runs across steps, model/tool calls, tokens, patches, repairs, tests, and changed files. **Local insights** aggregates completion, tests, cost, governance, and controlled failure categories from those Runs without returning task text, paths, code, prompts, Trace payloads, or credentials; the same numeric summary is available through `miniagent metrics`. Interrupted, failed, or cancelled runs with a persisted checkpoint expose **Prepare to continue**. The Daemon rebuilds the governed session under the original `run_id`, preserves cumulative contract usage, and returns to preflight review without automatically invoking the model. The same operation is available through `miniagent resume RUN_ID`, with optional `--checkpoint` and `--restore-workspace` flags. The Daemon stores the local catalog at `~/.miniagentos-coder/state.db` by default. Set `MINIAGENTOS_HOME` to relocate it; reports, traces, patches, checkpoints, and snapshots remain under each workspace's `runs/{run_id}/` directory.

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

Optional current provider prices can be added to the `models` mapping for a preflight USD estimate. Values are per one million tokens and are deliberately not supplied by the repository because provider prices change:

```yaml
models:
  input_price_per_million: 1.0   # replace with the provider's current rate
  output_price_per_million: 1.0  # replace with the provider's current rate
```

Omit either field to display token forecasts without a monetary estimate. Pricing never affects admission and is not treated as billing reconciliation.

### Optional Model Routing

The legacy root model configuration remains the default and needs no migration. To route different orchestrator phases explicitly, add named Profiles and policy:

```yaml
models:
  provider: openai-compatible
  default_model: primary-model
  api_key_env: PRIMARY_MODEL_KEY
  base_url: https://provider.example/v1

  routing:
    enabled: true
    default_profile: primary
    phase_routes:
      inspect: economy
      work: primary
      verify: economy
      repair: primary
    mode_routes:
      Review: economy
    fallback_profiles: [primary]

  profiles:
    primary:
      model: primary-model
      context_window: 128000
    economy:
      model: economy-model
      api_key_env: ECONOMY_MODEL_KEY
      context_window: 64000
```

Profiles inherit omitted Provider options from the root model mapping. Route precedence is mode policy, phase policy, then default Profile. Only `fallback_profiles` may replace an unavailable or context-limited preferred Profile. Preflight blocks before model creation when any required phase has no feasible route. Profile credentials remain environment variables and never appear in route-plan APIs or Trace.

In the desktop app, use **Configure model** when a project reports that its Provider is unavailable. The Rust host stores the key in the operating system credential manager (macOS Keychain, Windows Credential Manager, or Linux Secret Service), restarts the managed Daemon, and injects the credential only into that process environment. The Workbench never writes it to browser storage or a project file. Browser development continues to use the ignored root `.env` flow above.

Run execution uses a two-step API: `POST /runs` prepares a managed run and `POST /runs/{run_id}/start` schedules it. `GET /runs/{run_id}/admission` refreshes the forecast and deterministic launch checks, while `GET /runs/{run_id}/model-route` explains the selected Profile for inspection, work, verification, and repair. Start repeats both assessments and returns `409` before model creation when a hard check is blocked. `GET /runs/{run_id}/events/stream` provides cursor-based live events. Terminal runs write `runs/{run_id}/report.md`, applied patches accumulate in `patch.diff`, and `POST /runs/{run_id}/replay` returns a read-only event snapshot for the workbench timeline and future CLI use.

The Context view shows prompt budget, token composition, selection state, and audited compaction. The Memory view separates read-only Run memory, editable project memory, and explicitly confirmed long-term memory. Persistent entries live under the opened workspace's `.agent/memory/`; secret-like content and path escapes are rejected by the Daemon.

The Governance view is both a preflight control surface and an evidence viewer. It shows the effective policy for every registered tool, each ordered Guard decision and reason, and sandbox execution records. The current `portable-process` backend guarantees argv-based execution without a shell, workspace confinement for process cwd, sanitized environment variables, private runtime directories, timeout/process-group termination, and bounded returned output. It does not claim kernel network isolation, syscall filtering, or read-only mounts; those capabilities require a future container or OS-native backend.

The Extensions view loads `.agent/skills.yaml`, `.agent/mcp.yaml`, and `.agent/hooks.yaml`. Compatible Skills are recommended from the selected Run mode; the Planner first receives bounded Skill cards and loads a selected `SKILL.md` only through the governed `use_skill` action. Enabled stdio MCP Servers complete `initialize` and `tools/list`; discovered tools receive names such as `mcp__github__search_issues` and still pass Tool Gateway approval. Enabled Hooks run at `run.before`, `run.after`, `tool.before`, or `tool.after` through the same Sandbox backend. MCP and Hook declarations use argv arrays, never shell strings, and their command arguments and environment values are withheld from the API.

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

Additional Workbench fixtures live under `examples/`:

- `feature-contact-book`: Feature-mode contact import behavior with failing unittest coverage.
- `review-auth-service`: Review-mode security audit fixture with passing smoke tests but intentional risks.
- `skill-invoice-rules`: Bugfix fixture with project Skill, optional Hook/MCP declarations, domain rule context, and failing tests.
- `spec-cache-ttl`: Spec-mode OpenSpec change with failing TTL acceptance tests.

Offline Benchmark and Context ablation:

```text
make benchmark
# or: cd backend && .venv/bin/python -m app.cli benchmark
# inspect the available scenarios first:
cd backend && .venv/bin/python -m app.cli benchmark --list
```

The versioned tasks under `benchmarks/` run only in temporary fixture copies. The default Fixture Provider verifies the reproducibility of AgentRunLoop, Tool Gateway, Guard, Sandbox, Patch Pipeline, independent final tests, and report generation across `full_context` and `task_only`; it is deliberately labeled as runtime evidence rather than model quality. Use `--provider configured` only when you intentionally want to evaluate the locally configured model. JSON and Markdown reports include aligned metrics and candidate-minus-baseline deltas.

One-command verification after dependencies are installed:

```text
make verify
```

For a focused Web demo walkthrough and talking points, see:

```text
docs/演示脚本与汇报要点.md
```

## How To Work In This Repo

1. Read `AGENTS.md`.
2. Read `openspec/project.md`.
3. Pick the active change under `openspec/changes/`.
4. Implement tasks from `tasks.md`.
5. Update tasks only after validation.

## Definition Of Done

A completed task should map to an OpenSpec requirement, produce observable runtime behavior, include validation, and update the active `tasks.md` checkbox only after the work is verified.
