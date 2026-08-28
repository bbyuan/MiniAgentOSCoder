## ADDED Requirements

### Requirement: Desktop host supervises one local Daemon
The desktop host SHALL start one loopback-only Daemon on an available port, wait for bounded health readiness, expose its URL to the Workbench, and terminate the managed process on application exit.

#### Scenario: Desktop starts successfully
- **WHEN** a user launches MiniAgentOS Coder
- **THEN** the host SHALL create an application data directory, start the Daemon, verify `/health`, and render the Workbench against that dynamic URL

#### Scenario: Daemon fails to become ready
- **WHEN** the managed Daemon exits early or misses the readiness deadline
- **THEN** the desktop SHALL render a diagnostic failure state and SHALL NOT leave the Workbench waiting indefinitely

#### Scenario: Second instance starts
- **WHEN** MiniAgentOS Coder is already running and another instance starts
- **THEN** the existing window SHALL be focused and no second Daemon SHALL be created

### Requirement: Desktop and browser share one API client
The Workbench SHALL obtain its API base from the trusted desktop host when embedded and SHALL retain environment/default URL behavior during browser development.

#### Scenario: Browser development
- **WHEN** the Workbench runs outside Tauri
- **THEN** it SHALL use `VITE_DAEMON_URL` or the documented localhost default without requiring a desktop API

### Requirement: Release bundles a self-contained Daemon sidecar
The release build SHALL package the Python Daemon and default Agent configuration as a target-suffixed external binary so end users do not need Python installed.

#### Scenario: Build for a target platform
- **WHEN** the desktop release build runs on a supported platform
- **THEN** it SHALL build the sidecar for that platform's target triple before Tauri creates the application bundle
