import type { ApprovalRequest, RecoveryResponse, RunArtifacts } from "../api/client";

export function basename(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

export function hasVisibleDiff(artifacts: RunArtifacts | undefined): boolean {
  const diff = artifacts?.diff_summary;
  return Boolean(diff && (diff.files > 0 || artifacts?.diff_preview?.available));
}

export function latestRestorableCheckpoint(recovery: RecoveryResponse | undefined): string | undefined {
  return recovery?.checkpoints
    .filter((point) => point.can_rollback && point.snapshot_available)
    .sort((left, right) => right.trace_offset - left.trace_offset)[0]?.checkpoint_id;
}

export function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ApprovalRequest>;
  return typeof candidate.approval_id === "string"
    && typeof candidate.run_id === "string"
    && typeof candidate.reason === "string"
    && typeof candidate.target === "object"
    && candidate.target !== null;
}

export function isEvidenceEvent(eventName: string): boolean {
  return eventName.startsWith("context.")
    || eventName.startsWith("model.")
    || eventName.startsWith("tool.")
    || eventName.startsWith("policy.")
    || eventName.startsWith("approval.")
    || eventName.startsWith("skill.")
    || eventName.startsWith("mcp.")
    || eventName.startsWith("hook.")
    || eventName.startsWith("completion.")
    || eventName.startsWith("repair.");
}

export function isRuntimeConnectionError(message: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed/i.test(message);
}
