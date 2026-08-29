# Context Manager Delta

## ADDED Requirements

### CM-006 Bounded Prior-Run Handoff

The Context Manager SHALL represent conversation inheritance as one bounded, attributable Context Item and SHALL NOT replay prior prompts, Trace payloads, or tool outputs.

#### Scenario: Build follow-up context

- GIVEN a valid terminal parent Run has a final result and structured evidence
- WHEN the Daemon prepares its follow-up Run
- THEN the Context Pack SHALL include a required `prior_run_summary` item
- AND the item SHALL contain bounded outcome, changed-file, test, and completion evidence
- AND its metadata SHALL identify the parent Run and conversation turn
