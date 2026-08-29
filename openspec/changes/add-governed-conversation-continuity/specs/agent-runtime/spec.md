# Agent Runtime Delta

## ADDED Requirements

### AR-017 Governed Conversation Continuity

The runtime SHALL represent a follow-up as a new governed Run linked to one terminal parent Run in the same project, and SHALL derive its conversation lineage on the server.

#### Scenario: Continue a completed Run

- GIVEN a completed Run belongs to the current project
- WHEN the user submits a follow-up task with that Run as parent
- THEN the Daemon SHALL create the next turn in the same conversation
- AND SHALL compile a fresh AgentContract and fresh cost envelope
- AND SHALL record the parent, conversation, and turn index in Trace and persistent history

#### Scenario: Reject invalid conversation inheritance

- GIVEN a requested parent belongs to another project or has not reached a terminal state
- WHEN a client attempts to create a follow-up
- THEN the Daemon SHALL reject the request
- AND SHALL NOT create or persist a child Run
