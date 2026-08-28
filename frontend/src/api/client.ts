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
    source: string;
    reason: string;
    tokens: number;
    priority: number;
    state: string;
  }>;
  budget_report: {
    max_tokens: number;
    used_tokens: number;
    remaining_tokens: number;
  };
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

export interface RunArtifacts {
  run_id: string;
  plan: PlanStep[];
  context_explanation: Array<{
    id: string;
    source: string;
    reason: string;
    tokens: number;
    priority: number;
    state: string;
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

const API_BASE = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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
  getContext: (runId: string) => request<ContextPack>(`/runs/${runId}/context`),
  getTrace: (runId: string) => request<TraceResponse>(`/runs/${runId}/trace`),
  replayRun: (runId: string) => request<TraceResponse>(`/runs/${runId}/replay`, { method: "POST" }),
  getModelStatus: (projectId?: string) =>
    request<ModelProviderStatus>(`/models/status${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
  streamRunEvents: (
    runId: string,
    after: number,
    onEvent: (event: TraceEvent) => void,
    onError?: () => void,
  ) => {
    const source = new EventSource(`${API_BASE}/runs/${runId}/events/stream?after=${after}`);
    source.addEventListener("trace", (message) => {
      onEvent(JSON.parse((message as MessageEvent<string>).data) as TraceEvent);
    });
    if (onError) {
      source.onerror = onError;
    }
    return () => source.close();
  },
};
