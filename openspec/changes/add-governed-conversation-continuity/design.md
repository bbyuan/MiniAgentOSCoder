# Design: Governed Conversation Continuity

## Run lineage

Every Run has:

- `conversation_id`: the root Run id for a conversation.
- `parent_run_id`: the immediately preceding Run, or null for a root Run.
- `turn_index`: zero-based position inside the conversation.

A follow-up can reference only a terminal Run from the same project. The Daemon derives lineage from persisted state rather than trusting client-provided conversation metadata.

## Bounded context handoff

The next Context Pack receives one required `prior_run_summary` item containing only:

- parent Run id, mode, status, and task;
- bounded final answer;
- changed file names and test status;
- completion verdict and check outcomes.

The handoff excludes raw prompts, full Trace payloads, tool outputs, credentials, and old Context Pack content. Normal Context Pack budgeting and compaction remain applicable.

## Independent governance

Conversation lineage is context, not authority. Each turn creates a new Run, recompiles AgentContract, resets cost budgets, reloads current project rules and memory, and snapshots current extension and governance settings. A prior approval never authorizes a new action.

## Web interaction

The main conversation surface shows earlier user tasks and agent outcomes as compact prior turns. The current turn remains fully expanded with live progress, steering, approval, and completion evidence. The follow-up composer creates and starts the next linked Run in one action.

## Observability

Trace records `conversation.follow_up.created` with lineage ids and turn index. Context inspection identifies the inherited item and its source Run. The Run Center can return the ordered conversation without reading workspace Trace files.
