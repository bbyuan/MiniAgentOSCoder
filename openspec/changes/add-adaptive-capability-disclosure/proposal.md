# Proposal: Add Adaptive Capability Disclosure

## Why

The runtime currently presents every registered tool and every enabled Skill instruction to the model on every planning turn. That increases context cost, weakens phase guidance, and makes the Web control plane describe configuration rather than the capabilities actually exposed to the agent.

## What Changes

- Build a phase-aware tool menu for every planning turn.
- Expose only Skill cards initially and add a governed `use_skill` control action for loading full `SKILL.md` instructions.
- Record menu construction, Skill-card disclosure, Skill activation, and rejected Skill requests in Trace.
- Show the current capability phase, disclosed tools, and loaded Skills in the Web control plane.
- Preserve Tool Gateway, AgentContract, Guard, and approval enforcement as the final execution boundary.

## Scope

This change modifies the local runtime and Web workbench only. It does not add multi-agent execution or package a desktop client.
