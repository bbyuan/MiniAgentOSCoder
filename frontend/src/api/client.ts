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
}

export interface ContextPack {
  run_id: string;
  required_items: string[];
  selected_items: string[];
  compressed_items: string[];
  omitted_items: string[];
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
    throw new Error(`Request failed: ${response.status}`);
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
  getRun: (runId: string) => request<RunSummary>(`/runs/${runId}`),
  getContext: (runId: string) => request<ContextPack>(`/runs/${runId}/context`),
  getTrace: (runId: string) => request<TraceResponse>(`/runs/${runId}/trace`),
  replayRun: (runId: string) => request<TraceResponse>(`/runs/${runId}/replay`, { method: "POST" }),
};
