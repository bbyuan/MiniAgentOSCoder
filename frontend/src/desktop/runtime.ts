import { configureDesktopDaemon, daemonApi, getDaemonBase } from "../api/client";


export interface DesktopRuntimeStatus {
  embedded: boolean;
  environment: "browser" | "development" | "production";
  state: "browser" | "starting" | "ready" | "failed";
  daemon_url?: string;
  pid?: number;
  message?: string;
}

export function isDesktopHost(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function chooseProjectDirectory(): Promise<string | null> {
  if (isDesktopHost()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    return open({
      directory: true,
      multiple: false,
      title: "Open code project",
    });
  }
  const selected = await daemonApi.selectProjectDirectory();
  return selected.path;
}

export async function initializeDesktopRuntime(): Promise<DesktopRuntimeStatus> {
  if (!isDesktopHost()) {
    return {
      embedded: false,
      environment: "browser",
      state: "browser",
      daemon_url: getDaemonBase(),
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const status = await invoke<DesktopRuntimeStatus>("desktop_runtime_status");
  return applyRuntimeStatus(status);
}

export async function restartDesktopRuntime(): Promise<DesktopRuntimeStatus> {
  if (!isDesktopHost()) return initializeDesktopRuntime();
  const { invoke } = await import("@tauri-apps/api/core");
  const status = await invoke<DesktopRuntimeStatus>("restart_desktop_runtime");
  return applyRuntimeStatus(status);
}

export async function saveDesktopModelCredential(apiKey: string): Promise<DesktopRuntimeStatus> {
  if (!isDesktopHost()) {
    throw new Error("Secure credential setup is only available in the desktop app");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const status = await invoke<DesktopRuntimeStatus>("save_model_credential", { apiKey });
  return applyRuntimeStatus(status);
}

function applyRuntimeStatus(status: DesktopRuntimeStatus): DesktopRuntimeStatus {
  if (status.state === "ready" && status.daemon_url) {
    configureDesktopDaemon(status.daemon_url);
  }
  return status;
}
