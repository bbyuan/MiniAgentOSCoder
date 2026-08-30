# Change: Add Demo Walkthrough Docs

## Motivation
The product has enough runtime surfaces for a Web demo, but the repository needs a concise walkthrough that explains the intended evaluation path and the system's AgentOS/PaaS differentiation.

## Proposal
- Add a Chinese demo script and reporting guide for mentor/examiner walkthroughs.
- Document the recommended Web-first demo flow from project opening to trace replay.
- Clarify how to explain AgentContract, context engineering, tool governance, extensions, completion evidence, and failure recovery.
- Update root verification commands so frontend quality gates are part of `make verify`.

## Non-Goals
- Do not package or build the desktop shell.
- Do not change runtime semantics.
