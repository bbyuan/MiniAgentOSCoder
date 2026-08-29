# Proposal: Add Governed Model Routing

## Why

MiniAgentOS currently creates one model client for an entire Run. Inspection, implementation, verification, and repair therefore use the same model even when their quality, latency, context, and cost needs differ. The new admission forecast can describe likely demand, but the runtime still cannot turn that information into an explainable scheduling decision.

## What Changes

- Extend the existing model configuration with optional named Profiles and explicit phase/mode routing policy.
- Preserve the current single-model configuration as a synthesized `default` Profile.
- Compile a route plan before launch using Run mode, capability phase, selected Context size, Profile availability, and explicit fallback order.
- Select the concrete model before Prompt Cache lookup and include the route identity in the cache namespace.
- Block launch when no allowed and configured Profile can serve a required phase or fit the selected Context.
- Record bounded route decisions in Trace and expose the route plan through the Daemon API and bilingual Web preflight.
- Attribute model calls and token use to selected Profiles without exposing prompts, credentials, or private Provider configuration.

## Scope

This change implements local, sequential model routing inside the existing orchestrator. It does not add remote schedulers, concurrent subagents, automatic vendor discovery, online price lookup, or desktop packaging.
