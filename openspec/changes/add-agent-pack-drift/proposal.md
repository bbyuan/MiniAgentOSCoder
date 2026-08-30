# Add AgentPack Drift Detection

## Why

AgentPack can already be generated and saved as a local manifest, but users still need a quick answer to a product-level question: is the current agent contract still aligned with the latest saved baseline?

Without drift detection, changes to model routing, governance policy, extensions, or project profile are easy to miss before a run or handoff.

## What Changes

- Add a read-only backend drift endpoint for comparing the current AgentPack against the latest saved AgentPack version.
- Compare stable sections only: agent, contract, governance, models, extensions, and workspace.
- Ignore naturally volatile fields such as generation time, manifest digest, and saved version id.
- Show drift status in the AgentPack dialog with clear recommendations:
  - create the first baseline
  - current manifest is aligned
  - review changes and save a new version

## Non-Goals

- No cloud sync.
- No package export.
- No desktop packaging changes.
