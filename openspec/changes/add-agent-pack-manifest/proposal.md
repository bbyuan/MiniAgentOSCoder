# Add AgentPack Manifest

## Why

MiniAgentOS needs a visible unit of platformization. A user should be able to inspect the current project's reusable agent package without reading scattered `.agent` files, runtime contracts, model settings, Skills, MCP registries, and project profile output by hand.

## What Changes

- Add a read-only project AgentPack manifest API.
- Generate a non-sensitive `agentpack.v1` manifest from the project profile, Agent contract, governance settings, model routing, and extension catalog.
- Add a Workbench AgentPack dialog reachable from the project sidebar.
- Show summary cards and an inspectable raw manifest for demos and review.

## Impact

- Adds one read-only project API.
- No import/export archive is created yet.
- No credentials, prompts, code contents, or trace payloads are included.
