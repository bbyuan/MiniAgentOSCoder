# Add evidence ledger details

## Why

The runtime evidence ledger gives a useful readiness summary, but reviewers and users need a small amount of structured detail to understand why each evidence area is ready or blocked. The details must remain privacy-preserving and avoid exposing source code, prompt content, model output, or tool output.

## What Changes

- Add bounded evidence details to context, model, tool, governance, extension, test, and completion ledger items.
- Include safe identifiers such as protocol paths, model names, tool types, approval counts, test status, and completion check IDs.
- Update the workbench evidence cards to show compact detail chips.
- Refresh the ledger during live evidence-producing events, not only at terminal states.

## Impact

The control plane becomes easier to audit during demos: it can explain which runtime signals support the current state while preserving local privacy boundaries.
