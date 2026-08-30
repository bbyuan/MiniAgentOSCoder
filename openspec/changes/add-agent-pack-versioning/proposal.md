# Add AgentPack Versioning

## Why

AgentPack should be more than a transient preview. A governed coding runtime needs a versioned record of the agent contract, model routing, governance, extension surface, and project profile so users can track how the runnable agent changes over time.

## What Changes

- Add project-local AgentPack version persistence under `.agent/agentpacks/versions/`.
- Add APIs to save the current AgentPack manifest and list saved versions.
- Add a Workbench version history section inside the AgentPack dialog.
- Keep saved summaries and manifests non-sensitive.

## Impact

- Writes only project metadata under `.agent/agentpacks/`.
- Does not export archives or import external AgentPacks yet.
- Does not include credentials, prompts, code contents, or trace payloads.
