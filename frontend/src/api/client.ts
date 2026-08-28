export type RunMode = "Bugfix" | "Feature" | "Review" | "Spec" | "Chat";

export interface CreateRunRequest {
  project_id: string;
  task: string;
  mode: RunMode;
}

export interface RunSummary {
  run_id: string;
  status: string;
  phase: string;
  current_action?: string;
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
  createRun: (body: CreateRunRequest) =>
    request<RunSummary>("/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRun: (runId: string) => request<RunSummary>(`/runs/${runId}`),
};

