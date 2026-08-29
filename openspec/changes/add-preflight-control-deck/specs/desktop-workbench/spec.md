## ADDED Requirements

### DW-024 Preflight Control Deck

The Workbench SHALL present a consolidated preflight control deck before detailed audit panels so users can understand launch readiness, enforceable bounds, and phase routing without searching through advanced settings.

#### Scenario: Review launch readiness

- GIVEN a Run has been prepared but not launched
- WHEN the preflight page is displayed
- THEN the Workbench SHALL show model readiness, admission decision, hard budget, context usage, governance boundary, extension count, and cost state in a single top-level deck
- AND blocked, warning, ready, and setup-required states SHALL be visually distinct
- AND long task text or model names SHALL not overlap adjacent controls

#### Scenario: Review phase routing at a glance

- GIVEN the prepared Run includes a model route plan
- WHEN the preflight control deck is displayed
- THEN inspect, work, verify, and repair phases SHALL show selected model state in order
- AND fallback or blocked routes SHALL be visually distinguishable from normal configured routes

#### Scenario: Use localized preflight

- GIVEN the user has selected Chinese or English
- WHEN the preflight control deck is displayed
- THEN ordinary labels and explanatory copy SHALL use the selected locale
- AND technical identifiers such as model names, Profile ids, and protocol names SHALL preserve their original form
