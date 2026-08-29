import type { RunMode } from "./api/client";

const taskCommands: Record<string, RunMode> = {
  "/fix": "Bugfix",
  "/test": "Bugfix",
  "/review": "Review",
  "/explain": "Chat",
  "/spec": "Spec",
};

export function parseTaskCommand(value: string, defaultMode: RunMode): { task: string; mode: RunMode } {
  const content = value.trim();
  if (!content.startsWith("/")) return { task: content, mode: defaultMode };
  const separator = content.indexOf(" ");
  const command = (separator === -1 ? content : content.slice(0, separator)).toLowerCase();
  const mode = taskCommands[command];
  if (!mode) return { task: content, mode: defaultMode };
  return { task: separator === -1 ? "" : content.slice(separator + 1).trim(), mode };
}
