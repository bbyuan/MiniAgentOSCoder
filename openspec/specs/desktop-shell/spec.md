# Desktop Shell Spec

## Requirements

### DS-001 Managed Local Daemon

The desktop host SHALL start exactly one loopback-only Daemon on an available port, wait for bounded health readiness, expose its URL to the Workbench, and terminate the managed process on application exit.

#### Scenario: Desktop starts successfully

- GIVEN the bundled or development Daemon is available
- WHEN MiniAgentOS Coder launches
- THEN the host SHALL create the application data directory
- AND start and health-check the Daemon before rendering the Workbench

#### Scenario: Daemon cannot become ready

- GIVEN the managed Daemon exits early or misses the readiness deadline
- WHEN desktop initialization completes
- THEN the shell SHALL render a diagnostic retry state
- AND SHALL NOT leave the Workbench waiting indefinitely

### DS-002 Single Desktop Instance

The desktop host SHALL allow one application instance and one managed Daemon per user session.

#### Scenario: A second instance starts

- GIVEN MiniAgentOS Coder is already running
- WHEN another instance is opened
- THEN the existing window SHALL be focused
- AND no second Daemon SHALL be created

### DS-003 Shared Browser And Desktop Client

The Workbench SHALL obtain a dynamic API base from the trusted desktop host when embedded and SHALL retain environment or localhost configuration during browser development.

#### Scenario: Workbench runs in a browser

- GIVEN no Tauri host is present
- WHEN the frontend initializes
- THEN it SHALL use `VITE_DAEMON_URL` or the documented localhost default
- AND SHALL NOT require desktop commands

### DS-004 Self-Contained Release Sidecar

The production release SHALL bundle the Python Daemon and default Agent configuration as a target-suffixed external binary.

#### Scenario: Build a desktop release

- GIVEN frontend, Rust, Python, and PyInstaller dependencies are installed
- WHEN `npm run desktop:build` runs
- THEN the target sidecar SHALL be built before Tauri packaging
- AND the resulting application SHALL not require an end-user Python installation

### DS-005 Minimum Native Capabilities

The desktop shell SHALL expose only the native capabilities needed by the Workbench workflow.

#### Scenario: Select a project

- GIVEN the Workbench requests a local project
- WHEN the folder picker opens
- THEN the shell SHALL allow a single directory selection
- AND SHALL NOT grant general frontend filesystem read or write permissions

### DS-006 Operating System Credential Storage

The desktop shell SHALL store model credentials through the operating system credential manager and inject them only into the managed Daemon environment.

#### Scenario: Save and apply a credential

- GIVEN the user submits a valid non-empty API key
- WHEN the shell saves it successfully
- THEN the managed Daemon SHALL restart with the credential in its environment
- AND no command response SHALL include the credential value
