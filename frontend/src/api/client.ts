export type RunMode = "Bugfix" | "Feature" | "Review" | "Spec" | "Chat";

export interface CreateRunRequest {
  project_id: string;
  task: string;
  mode: RunMode;
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
    max_wall_time_seconds: number;
  };
  policies: Record<string, string>;
}

export interface RunSummary {
  run_id: string;
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
}

export interface StartRunResponse {
  run_id: string;
  status: string;
  events_url: string;
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
    patch: { available: boolean; path: string };
  };
  report: { available: boolean; content: string; truncated: boolean };
  trace: { available: boolean; event_count: number; recent_events: TraceEvent[] };
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

let apiBase = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:8000";

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
  createRun: (body: CreateRunRequest) =>
    request<RunSummary>("/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startRun: (runId: string) =>
    request<StartRunResponse>(`/runs/${runId}/start`, { method: "POST" }),
  cancelRun: (runId: string) =>
    request<{ run_id: string; status: string }>(`/runs/${runId}/cancel`, { method: "POST" }),
  getRun: (runId: string) => request<RunSummary>(`/runs/${runId}`),
  getArtifacts: (runId: string) => request<RunArtifacts>(`/runs/${runId}/artifacts`),
  getReport: (runId: string) => request<RunReportResponse>(`/runs/${runId}/report`),
  getContext: (runId: string) => request<ContextPack>(`/runs/${runId}/context`),
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
