# Desktop Workbench Delta

## ADDED Requirements

### DW-022 Run Forecast Preflight

The Workbench SHALL show expected resource demand, forecast range, confidence basis, contract ceilings, and admission warnings before launch without presenting estimates as guaranteed limits.

#### Scenario: Review a prepared Run

- GIVEN the Daemon has prepared a Run forecast
- WHEN the user reviews Web preflight
- THEN model calls, tool calls, tokens, time, and optional cost SHALL be visible as expected values and ranges
- AND forecast confidence and historical sample count SHALL be visible
- AND blocking, warning, and passing admission checks SHALL have distinct states
