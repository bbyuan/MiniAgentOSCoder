# Run History Delta

## ADDED Requirements

### RH-007 Ordered Conversation History

The Run Center SHALL persist conversation lineage and return all available turns in deterministic order without reading raw Trace content.

#### Scenario: Inspect a conversation

- GIVEN a root Run has two persisted follow-up Runs
- WHEN the client requests the conversation for any turn
- THEN the API SHALL return all three summaries ordered by turn index
- AND each summary SHALL expose its parent id without exposing prompts, code, or credentials
