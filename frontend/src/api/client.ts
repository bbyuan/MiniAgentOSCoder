export type RunMode = "Bugfix" | "Feature" | "Review" | "Spec" | "Chat";

export interface CreateRunRequest {
  project_id: string;
  task: string;
  mode: RunMode;
  parent_run_id?: string | null;
}

export interface SteerRunResponse {
  run_id: string;
  status: "queued";
  applies_at: "next_safe_boundary";
}

export interface OpenProjectResponse {
  project_id: string;
  path: string;
  profile_path: string;
  status: string;
  profile: {
    languages: string[];
    package_managers: string[];
    test_commands: string[];
    entrypoints: string[];
  };
}

export interface WorkspaceFileItem {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number;
  language: string;
  modified_at: number;
}

export interface WorkspaceFilesResponse {
  project_id: string;
  root: string;
  items: WorkspaceFileItem[];
  total: number;
  truncated: boolean;
}

export interface WorkspaceFileContent {
  project_id: string;
  path: string;
  available: boolean;
  content: string;
  language: string;
  size: number;
  truncated: boolean;
  reason: string;
}

export interface AgentContract {
  agent_id: string;
  effects: {
    allow: string[];
    deny: string[];
  };
  cost_envelope: {
    max_steps: number;
    max_model_calls: number;
    max_tool_calls: number;
    max_input_tokens: number;
    max_output_tokens: number;
    max_wall_time_seconds: number;
  };
  policies: Record<string, string>;
}

export interface ResourceForecast {
  low: number;
  expected: number;
  high: number;
  ceiling: number;
  unit: "calls" | "tokens" | "seconds";
}

export interface AdmissionCheck {
  id: string;
  status: "passed" | "warning" | "blocked" | "info";
  summary: string;
  evidence: string;
}

export interface RunAdmission {
  run_id: string;
  decision: "ready" | "warning" | "blocked";
  can_start: boolean;
  basis: "heuristic" | "hybrid" | "history";
  confidence: "low" | "medium" | "high";
  sample_size: number;
  resources: Record<string, ResourceForecast>;
  cost: {
    configured: boolean;
    currency: string;
    expected?: number | null;
    high?: number | null;
    ceiling?: number | null;
  };
  checks: AdmissionCheck[];
  assumptions: string[];
}

export interface ModelRouteSelection {
  phase: "inspect" | "work" | "verify" | "repair";
  preferred_profile_id: string;
  profile_id: string;
  provider: string;
  model: string;
  reason: "mode_policy" | "phase_policy" | "default_policy" | "fallback_unavailable" | "fallback_context_window" | "no_feasible_profile";
  fallback: boolean;
  configured: boolean;
  context_window?: number | null;
  issues: string[];
}

export interface ModelRoutePlan {
  run_id: string;
  enabled: boolean;
  strategy: "single" | "policy";
  decision: "ready" | "fallback" | "blocked";
  can_start: boolean;
  mode: RunMode;
  context_tokens: number;
  default_profile_id: string;
  routes: Record<string, ModelRouteSelection>;
  profiles: Array<{
    profile_id: string;
    provider: string;
    model: string;
    configured: boolean;
    context_window?: number | null;
    issues: string[];
  }>;
  issues: string[];
}

export interface RunSummary {
  run_id: string;
  conversation_id?: string;
  parent_run_id?: string | null;
  turn_index?: number;
  status: string;
  phase: string;
  current_action?: string;
  contract?: AgentContract;
  artifacts?: RunArtifacts;
  plan?: PlanStep[];
  budget?: Record<string, number>;
  last_observation?: Record<string, unknown>;
  termination_reason?: string;
  final_message?: string;
  repair_attempts?: number;
  repair_status?: string;
  last_checkpoint_id?: string;
  rolled_back_to?: string;
  completion?: CompletionAssessment | null;
  completion_expectations?: string[];
  admission?: RunAdmission;
  model_route?: ModelRoutePlan;
}

export interface ConversationTurn {
  run_id: string;
  conversation_id: string;
  parent_run_id?: string | null;
  turn_index: number;
  task: string;
  mode: RunMode;
  status: string;
  created_at: string;
  completed_at?: string | null;
  final_message: string;
  termination_reason: string;
  changed_files: string[];
  test_status: string;
  completion?: CompletionAssessment | null;
}

export interface ConversationResponse {
  conversation_id: string;
  current_run_id: string;
  turns: ConversationTurn[];
}

export interface CompletionCheck {
  id: string;
  passed: boolean;
  evidence: string;
  required: boolean;
}

export interface CompletionAssessment {
  verdict: "passed" | "blocked";
  mode: string;
  checks: CompletionCheck[];
  summary: string;
  attempt: number;
}

export interface PlanStep {
  id: string;
  title: string;
  state: string;
  detail: string;
}

export interface ContextPack {
  run_id: string;
  required_items: string[];
  selected_items: string[];
  compressed_items: string[];
  omitted_items: string[];
  explanation?: Array<{
    id: string;
    type: string;
    source: string;
    reason: string;
    tokens: number;
    priority: number;
    state: string;
    summary: string;
    metadata?: {
      path?: string;
      start_line?: number;
      end_line?: number;
      score?: number;
      matched_terms?: string[];
      trusted?: boolean;
      bounded?: boolean;
      [key: string]: unknown;
    };
  }>;
  budget_report: {
    max_tokens: number;
    used_tokens: number;
    remaining_tokens: number;
  };
  composition: Record<string, number>;
  threshold_state: "normal" | "warning" | "high" | "critical";
  compaction_count: number;
}

export interface ContextCompactionResponse {
  run_id: string;
  status: "skipped" | "compacted" | "confirmation_required";
  before_tokens: number;
  after_tokens: number;
  target_tokens: number;
  compacted_items: string[];
  omitted_items: string[];
  threshold_state: ContextPack["threshold_state"];
  confirmation_required: boolean;
  reason: string;
}

export interface RunEvidenceItem {
  id: "context" | "model" | "tools" | "governance" | "extensions" | "tests" | "completion" | string;
  state: "ready" | "pending" | "warning" | "failed";
  count: number;
  detail: string;
  source: string;
  details: Array<{
    label: string;
    value: string;
    state: "ready" | "pending" | "warning" | "failed" | string;
  }>;
}

export interface RunEvidenceLedger {
  run_id: string;
  status: string;
  score: number;
  ready: number;
  attention: number;
  items: RunEvidenceItem[];
  privacy: {
    content_collected: false;
    fields_excluded: string[];
  };
}

export type MemoryScope = "short_term" | "project" | "long_term";

export interface MemoryEntry {
  memory_id: string;
  scope: MemoryScope;
  kind: string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
  run_id?: string;
  tags: string[];
}

export interface MemoryResponse {
  run_id: string;
  entries: Record<MemoryScope, MemoryEntry[]>;
  counts: Record<MemoryScope, number>;
}

export interface MemoryInput {
  scope: Exclude<MemoryScope, "short_term">;
  kind: string;
  content: string;
  tags: string[];
  confirmed: boolean;
}

export type SandboxProfile = "standard" | "strict";
export type ToolOverride = "inherit" | "approval_required" | "deny";

export interface GuardDecision {
  guard: string;
  status: "allow" | "deny" | "skipped";
  reason: string;
  rule: string;
  duration_ms: number;
  metadata: Record<string, unknown>;
}

export interface PolicyEvaluation {
  evaluation_id: string;
  run_id: string;
  action_id: string;
  tool: string;
  effect: string;
  risk: string;
  sandbox_profile: SandboxProfile;
  outcome: "pending" | "allowed" | "denied" | "approval_denied";
  effective_policy: string;
  decisions: GuardDecision[];
}

export interface GovernanceTool {
  name: string;
  description: string;
  effect: string;
  risk: string;
  approval_policy: string;
  timeout_seconds: number;
  metadata: Record<string, unknown>;
  override: ToolOverride;
  effective_policy: string;
}

export interface SandboxExecution {
  sandbox_id: string;
  run_id: string;
  profile: SandboxProfile;
  backend: string;
  executable: string;
  timeout_seconds: number;
  returncode?: number;
  duration_ms: number;
  timed_out: boolean;
  output_truncated: boolean;
  termination_reason: string;
}

export interface GovernanceResponse {
  run_id: string;
  editable: boolean;
  settings: {
    sandbox_profile: SandboxProfile;
    tool_overrides: Record<string, ToolOverride>;
  };
  capabilities: {
    backend: string;
    guarantees: string[];
    limitations: string[];
    profiles: SandboxProfile[];
  };
  contract: {
    effects: { allow: string[]; deny: string[] };
    policies: Record<string, string>;
  };
  tools: GovernanceTool[];
  evaluations: PolicyEvaluation[];
  executions: SandboxExecution[];
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  path: string;
  modes: string[];
  default_tools: string[];
  risk: string;
  recommended: boolean;
  compatible?: boolean;
  valid: boolean;
  errors: string[];
}

export interface MCPServerManifest {
  id: string;
  name: string;
  transport: "stdio";
  timeout_seconds: number;
  env_allow: string[];
  effect: string;
  risk: string;
  executable: string;
  argument_count: number;
  valid: boolean;
  errors: string[];
}

export interface HookManifest {
  id: string;
  name: string;
  event: "run.before" | "run.after" | "tool.before" | "tool.after";
  timeout_seconds: number;
  failure_policy: "warn" | "block";
  executable: string;
  argument_count: number;
  valid: boolean;
  errors: string[];
}

export interface ExtensionSettings {
  active_skill_ids: string[];
  enabled_mcp_server_ids: string[];
  enabled_hook_ids: string[];
}

export interface CreateSkillRequest {
  id: string;
  name: string;
  description: string;
  content: string;
  modes?: RunMode[];
  default_tools?: string[];
  risk?: string;
}

export interface CreateMCPServerRequest {
  id: string;
  name: string;
  command: string[];
  env_allow?: string[];
  timeout_seconds?: number;
  risk?: string;
}

export interface CreateHookRequest {
  id: string;
  name: string;
  event: "run.before" | "run.after" | "tool.before" | "tool.after";
  command: string[];
  timeout_seconds?: number;
  failure_policy?: "warn" | "block";
}

export interface ExtensionResponse {
  run_id: string;
  editable: boolean;
  catalog: {
    skills: SkillManifest[];
    mcp_servers: MCPServerManifest[];
    hooks: HookManifest[];
    diagnostics: string[];
  };
  settings: ExtensionSettings;
  summary: {
    enabled_total: number;
    available_total: number;
    diagnostic_count: number;
    skills_active: number;
    skills_available: number;
    mcp_enabled: number;
    mcp_available: number;
    mcp_tools_discovered: number;
    hooks_enabled: number;
    hooks_available: number;
    runtime_events: number;
    runtime_failures: number;
    has_runtime_activation: boolean;
  };
  discovered_tools: Array<{
    server_id: string;
    tools: string[];
    tool_count: number;
  }>;
  evidence: TraceEvent[];
}

export interface TraceEvent {
  time: string;
  run_id: string;
  event: string;
  role: string;
  payload: Record<string, unknown>;
}

export interface TraceResponse {
  run_id: string;
  events: TraceEvent[];
  trace_path?: string;
}

export interface ReplayResponse extends TraceResponse {
  replayed: boolean;
  read_only: boolean;
  event_count: number;
}

export interface RunArtifacts {
  run_id: string;
  plan: PlanStep[];
  context_explanation: Array<{
    id: string;
    type: string;
    source: string;
    reason: string;
    tokens: number;
    priority: number;
    state: string;
    summary: string;
  }>;
  diff_summary: {
    status: string;
    files: number;
    insertions: number;
    deletions: number;
  };
  diff_preview?: {
    available: boolean;
    content: string;
    truncated: boolean;
  };
  test_summary: {
    status: string;
    command: string;
    passed: number;
    failed: number;
  };
  trace_summary: string[];
}

export interface ModelProviderStatus {
  provider: string;
  model: string;
  api_key_env: string;
  base_url: string;
  configured: boolean;
  issues: string[];
  routing_enabled?: boolean;
  configured_profiles?: number;
  total_profiles?: number;
}

export interface ModelConfigurationSnapshot {
  project_id: string;
  config_path: string;
  source: "project" | "default";
  routing: {
    enabled: boolean;
    strategy: "single" | "policy";
    default_profile_id: string;
    phase_routes: Record<string, string>;
    mode_routes: Record<string, string>;
    fallback_profile_ids: string[];
  };
  profiles: Array<{
    profile_id: string;
    provider: string;
    model: string;
    api_key_env: string;
    base_url: string;
    configured: boolean;
    issues: string[];
    context_window?: number | null;
    pricing_configured: boolean;
  }>;
}

export interface AgentPackManifest {
  manifest_version: string;
  project_id: string;
  digest: string;
  workspace: {
    name: string;
    profile: {
      languages?: string[];
      package_managers?: string[];
      test_commands?: string[];
      entrypoints?: string[];
      [key: string]: unknown;
    };
  };
  agent: {
    id: string;
    name: string;
    mode: string;
    roles: string[];
  };
  contract: AgentContract;
  governance: {
    sandbox_profile: SandboxProfile;
    effect_policy_count: number;
    tool_policy_count: number;
  };
  models: {
    routing_enabled: boolean;
    strategy: "single" | "policy";
    default_profile_id: string;
    phase_routes: Record<string, string>;
    mode_routes: Record<string, string>;
    fallback_profile_ids: string[];
    profiles: Array<{
      profile_id: string;
      provider: string;
      model: string;
      api_key_env: string;
      configured: boolean;
      issues: string[];
      context_window?: number | null;
      pricing_configured: boolean;
    }>;
  };
  extensions: {
    skills_registry: string;
    skills: {
      available: number;
      recommended: number;
      active_by_default: string[];
    };
    mcp_servers: {
      available: number;
      valid: number;
    };
    hooks: {
      available: number;
      valid: number;
    };
    diagnostics: string[];
  };
  provenance: {
    generated_at: string;
    config_source: "project" | "default";
    config_path: string;
    config_digest: string;
    project_profile_digest: string;
  };
}

export interface AgentPackVersion {
  version_id: string;
  manifest_version: string;
  digest: string;
  generated_at: string;
  agent_id: string;
  agent_name: string;
  mode: string;
  max_steps: number;
  model_strategy: "single" | "policy" | string;
  model_profiles: number;
  active_skills: number;
  path: string;
}

export interface AgentPackDriftSection {
  id: "agent" | "contract" | "governance" | "models" | "extensions" | "workspace" | string;
  changed: boolean;
  current_digest: string;
  latest_digest?: string | null;
}

export interface AgentPackDrift {
  project_id: string;
  current_digest: string;
  latest_version?: AgentPackVersion | null;
  has_versions: boolean;
  drift: boolean;
  sections: AgentPackDriftSection[];
  changed_sections: string[];
  recommendation: "create_first_version" | "up_to_date" | "save_version" | string;
}

export interface ProjectProtocolItem {
  id: string;
  type: "agent_doc" | "skill" | "openspec_spec" | "openspec_change" | string;
  title: string;
  path: string;
  status: "active" | "draft" | string;
  summary: string;
}

export interface ProjectProtocols {
  project_id: string;
  workspace: string;
  summary: {
    total: number;
    active: number;
    draft: number;
    agent_docs: number;
    skills: number;
    openspec_specs: number;
    openspec_changes: number;
  };
  items: ProjectProtocolItem[];
  recommendations: string[];
}

export interface StartRunResponse {
  run_id: string;
  status: string;
  events_url: string;
}

export interface ResumeRunResponse {
  run_id: string;
  status: "planning";
  task: string;
  mode: RunMode;
  checkpoint_id: string;
  workspace_restored: boolean;
  project: OpenProjectResponse;
  contract: AgentContract;
  artifacts: RunArtifacts;
  admission: RunAdmission;
  model_route: ModelRoutePlan;
}

export interface ApprovalRequest {
  approval_id: string;
  run_id: string;
  action_id: string;
  risk: string;
  effect: string;
  reason: string;
  target: {
    tool: string;
    patch: string;
    command?: string;
    files: string[];
    additions: number;
    deletions: number;
    [key: string]: unknown;
  };
  options: string[];
}

export interface RecoveryPoint {
  checkpoint_id: string;
  run_id: string;
  step: number;
  status: string;
  trace_offset: number;
  files: string[];
  snapshot_available: boolean;
  can_rollback: boolean;
}

export interface RecoveryResponse {
  run_id: string;
  repair_attempts: number;
  repair_status: string;
  rolled_back_to?: string;
  checkpoints: RecoveryPoint[];
}

export interface RollbackResponse {
  run_id: string;
  checkpoint_id: string;
  status: string;
  files: string[];
  restored: number;
  removed: number;
}

export interface RunReportResponse {
  run_id: string;
  available: boolean;
  content: string;
  path?: string;
  generated_at?: string;
  patch_available: boolean;
  patch_count: number;
  files: string[];
}

export interface HistoryProject {
  project_id: string;
  path: string;
  profile: Record<string, unknown>;
  created_at: string;
  last_opened_at: string;
  run_count: number;
  latest_status?: string;
  latest_run_at?: string;
}

export interface HistoryRun {
  run_id: string;
  project_id: string;
  conversation_id: string;
  parent_run_id?: string | null;
  turn_index: number;
  project_path: string;
  task: string;
  mode: string;
  status: string;
  phase: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  termination_reason: string;
  final_message: string;
  budget: Record<string, number>;
  changed_files: string[];
  applied_patches: number;
  repair_attempts: number;
  steps: number;
  model_calls: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  test_status: string;
  report_path: string;
  trace_path: string;
  patch_path: string;
  archived: boolean;
  duration_ms?: number;
  completion?: CompletionAssessment | null;
}

export interface HistoryRunDetail {
  run: HistoryRun & { project_profile: Record<string, unknown> };
  artifacts: {
    report: { available: boolean; path: string; truncated: boolean };
    trace: { available: boolean; path: string; event_count: number };
    patch: { available: boolean; path: string; truncated: boolean };
  };
  report: { available: boolean; content: string; truncated: boolean };
  trace: { available: boolean; event_count: number; recent_events: TraceEvent[] };
  patch: { available: boolean; content: string; truncated: boolean };
  resume: {
    available: boolean;
    checkpoint_count: number;
    latest_checkpoint_id?: string;
    snapshot_available: boolean;
  };
}

export interface HistoryComparison {
  runs: Array<Pick<HistoryRun, "run_id" | "task" | "mode" | "status" | "test_status" | "duration_ms" | "changed_files">>;
  metrics: Array<{ key: string; left: number; right: number; delta: number }>;
}

export interface HistoryRunFilters {
  project_id?: string;
  status?: string;
  query?: string;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface EvaluationSummary {
  scope: { project_id?: string; local_only: boolean };
  runs: {
    total: number;
    terminal: number;
    active: number;
    status: Record<string, number>;
  };
  rates: {
    completion: number | null;
    test_pass: number | null;
    patch_acceptance: number | null;
  };
  averages: {
    steps: number | null;
    model_calls: number | null;
    tool_calls: number | null;
    total_tokens: number | null;
    repair_attempts: number | null;
    duration_ms: number | null;
  };
  governance: {
    approval_requests: number;
    approvals_granted: number;
    guard_blocks: number;
    context_compactions: number;
    resumes: number;
  };
  optimization: {
    provider_requests: number;
    model_cache_hits: number;
    avoided_provider_rate: number | null;
  };
  failures: Array<{ category: string; count: number; share: number | null }>;
  evidence: { trace_runs: number; evidence_gaps: number };
  privacy: { content_collected: false; fields_excluded: string[] };
}

let apiBase = import.meta.env.VITE_DAEMON_URL ?? "http://127.0.0.1:8000";

export function configureDesktopDaemon(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("Desktop Daemon must use a loopback HTTP URL");
  }
  apiBase = parsed.origin;
}

export function getDaemonBase(): string {
  return apiBase;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail || "";
    } catch {
      // The status code remains useful when an intermediary returns a non-JSON error.
    }
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const daemonApi = {
  health: () => request<{ status: string }>("/health"),
  selectProjectDirectory: () =>
    request<{ path: string | null; cancelled: boolean }>("/projects/select-directory", { method: "POST" }),
  openProject: (path: string) =>
    request<OpenProjectResponse>("/projects/open", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  getAgentPack: (projectId: string, mode?: RunMode) =>
    request<AgentPackManifest>(`/projects/${projectId}/agent-pack${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`),
  getAgentPackVersions: (projectId: string) =>
    request<{ project_id: string; versions: AgentPackVersion[] }>(`/projects/${projectId}/agent-pack/versions`),
  getAgentPackDrift: (projectId: string, mode?: RunMode) =>
    request<AgentPackDrift>(`/projects/${projectId}/agent-pack/drift${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`),
  getProjectProtocols: (projectId: string) =>
    request<ProjectProtocols>(`/projects/${projectId}/protocols`),
  getProjectFiles: (projectId: string, query = "") =>
    request<WorkspaceFilesResponse>(
      `/projects/${projectId}/files${query ? `?query=${encodeURIComponent(query)}` : ""}`,
    ),
  getProjectFileContent: (projectId: string, path: string) =>
    request<WorkspaceFileContent>(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`),
  saveAgentPackVersion: (projectId: string, mode?: RunMode) =>
    request<{ project_id: string; version: AgentPackVersion }>(
      `/projects/${projectId}/agent-pack/versions${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`,
      { method: "POST" },
    ),
  createRun: (body: CreateRunRequest) =>
    request<RunSummary>("/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startRun: (runId: string) =>
    request<StartRunResponse>(`/runs/${runId}/start`, { method: "POST" }),
  resumeRun: (runId: string, checkpointId?: string, restoreWorkspace = false) =>
    request<ResumeRunResponse>(`/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({ checkpoint_id: checkpointId, restore_workspace: restoreWorkspace }),
    }),
  cancelRun: (runId: string) =>
    request<{ run_id: string; status: string }>(`/runs/${runId}/cancel`, { method: "POST" }),
  steerRun: (runId: string, message: string) =>
    request<SteerRunResponse>(`/runs/${runId}/steer`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  getRun: (runId: string) => request<RunSummary>(`/runs/${runId}`),
  getAdmission: (runId: string) => request<RunAdmission>(`/runs/${runId}/admission`),
  getModelRoute: (runId: string) => request<ModelRoutePlan>(`/runs/${runId}/model-route`),
  getConversation: (runId: string) => request<ConversationResponse>(`/runs/${runId}/conversation`),
  getArtifacts: (runId: string) => request<RunArtifacts>(`/runs/${runId}/artifacts`),
  getReport: (runId: string) => request<RunReportResponse>(`/runs/${runId}/report`),
  getContext: (runId: string) => request<ContextPack>(`/runs/${runId}/context`),
  getEvidence: (runId: string) => request<RunEvidenceLedger>(`/runs/${runId}/evidence`),
  compactContext: (runId: string, targetRatio: number, confirmed = false) =>
    request<ContextCompactionResponse>(`/runs/${runId}/context/compact`, {
      method: "POST",
      body: JSON.stringify({ force: true, target_ratio: targetRatio, confirmed }),
    }),
  getMemory: (runId: string) => request<MemoryResponse>(`/runs/${runId}/memory`),
  getGovernance: (runId: string) => request<GovernanceResponse>(`/runs/${runId}/governance`),
  updateGovernance: (
    runId: string,
    sandboxProfile: SandboxProfile,
    toolOverrides: Record<string, ToolOverride>,
  ) => request<GovernanceResponse>(`/runs/${runId}/governance`, {
    method: "PUT",
    body: JSON.stringify({ sandbox_profile: sandboxProfile, tool_overrides: toolOverrides }),
  }),
  getExtensions: (runId: string) => request<ExtensionResponse>(`/runs/${runId}/extensions`),
  updateExtensions: (runId: string, settings: ExtensionSettings) =>
    request<ExtensionResponse>(`/runs/${runId}/extensions`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  createSkill: (runId: string, body: CreateSkillRequest) =>
    request<ExtensionResponse>(`/runs/${runId}/extensions/skills`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createMCPServer: (runId: string, body: CreateMCPServerRequest) =>
    request<ExtensionResponse>(`/runs/${runId}/extensions/mcp-servers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createHook: (runId: string, body: CreateHookRequest) =>
    request<ExtensionResponse>(`/runs/${runId}/extensions/hooks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createMemory: (runId: string, input: MemoryInput) =>
    request<{ run_id: string; entry: MemoryEntry }>(`/runs/${runId}/memory`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMemory: (runId: string, memoryId: string, input: Omit<MemoryInput, "scope">) =>
    request<{ run_id: string; entry: MemoryEntry }>(`/runs/${runId}/memory/${memoryId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteMemory: (runId: string, memoryId: string) =>
    request<{ run_id: string; deleted: string; scope: MemoryScope }>(`/runs/${runId}/memory/${memoryId}`, {
      method: "DELETE",
    }),
  getTrace: (runId: string) => request<TraceResponse>(`/runs/${runId}/trace`),
  getApproval: (runId: string) =>
    request<{ approval: ApprovalRequest | null }>(`/runs/${runId}/approval`),
  getCheckpoints: (runId: string) => request<RecoveryResponse>(`/runs/${runId}/checkpoints`),
  rollbackRun: (runId: string, checkpointId: string) =>
    request<RollbackResponse>(`/runs/${runId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ checkpoint_id: checkpointId }),
    }),
  approveAction: (runId: string, approvalId: string) =>
    request<{ status: string }>(`/runs/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId, mode: "approve_once" }),
    }),
  denyAction: (runId: string, approvalId: string, reason: string) =>
    request<{ status: string }>(`/runs/${runId}/deny`, {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId, reason }),
    }),
  replayRun: (runId: string) => request<ReplayResponse>(`/runs/${runId}/replay`, { method: "POST" }),
  getModelStatus: (projectId?: string) =>
    request<ModelProviderStatus>(`/models/status${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  getModelConfig: (projectId?: string) =>
    request<ModelConfigurationSnapshot>(`/models/config${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  getHistoryProjects: () =>
    request<{ projects: HistoryProject[]; total: number }>("/history/projects"),
  getHistoryRuns: (filters: HistoryRunFilters = {}) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.size ? `?${query.toString()}` : "";
    return request<{ runs: HistoryRun[]; total: number; limit: number; offset: number }>(`/history/runs${suffix}`);
  },
  getHistoryRun: (runId: string) => request<HistoryRunDetail>(`/history/runs/${runId}`),
  compareHistoryRuns: (runIds: [string, string]) =>
    request<HistoryComparison>("/history/compare", {
      method: "POST",
      body: JSON.stringify({ run_ids: runIds }),
    }),
  archiveHistoryRun: (runId: string, archived: boolean) =>
    request<{ run_id: string; archived: boolean }>(`/history/runs/${runId}/archive`, {
      method: "PUT",
      body: JSON.stringify({ archived }),
    }),
  getEvaluationSummary: (projectId?: string) =>
    request<EvaluationSummary>(`/evaluation/summary${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  streamRunEvents: (
    runId: string,
    after: number,
    onEvent: (event: TraceEvent) => void,
    onError?: () => void,
  ) => {
    const source = new EventSource(`${apiBase}/runs/${runId}/events/stream?after=${after}`);
    source.addEventListener("trace", (message) => {
      onEvent(JSON.parse((message as MessageEvent<string>).data) as TraceEvent);
    });
    if (onError) {
      source.onerror = onError;
    }
    return () => source.close();
  },
};
