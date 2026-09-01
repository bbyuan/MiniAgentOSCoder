export type TracePhase =
  | "applying_patch"
  | "cancelled"
  | "completed"
  | "created"
  | "failed"
  | "inspect"
  | "planning"
  | "repair"
  | "testing"
  | "verify"
  | "waiting_approval"
  | "work";

export type WorkItemPhase =
  | "change"
  | "context"
  | "inspect"
  | "summary"
  | "validate";

export interface PhaseGroup<T extends { phase: WorkItemPhase; time: string }> {
  key: string;
  phase: WorkItemPhase;
  items: T[];
}

export function workPhaseFromTracePayload(payload: Record<string, unknown>): WorkItemPhase | undefined {
  const request = asRecord(payload.request);
  const metadata = asRecord(request?.metadata);
  const phase = tracePhaseValue(payload.phase) ?? tracePhaseValue(metadata?.capability_phase);
  if (!phase) return undefined;
  return uiPhaseFromTracePhase(phase);
}

export function uiPhaseFromTracePhase(phase: TracePhase): WorkItemPhase {
  if (phase === "inspect") return "inspect";
  if (phase === "work" || phase === "repair" || phase === "waiting_approval" || phase === "applying_patch") return "change";
  if (phase === "verify" || phase === "testing") return "validate";
  if (phase === "completed" || phase === "failed" || phase === "cancelled") return "summary";
  return "context";
}

export function buildPhaseGroups<T extends { phase: WorkItemPhase; time: string }>(items: T[]): Array<PhaseGroup<T>> {
  const groups: Array<PhaseGroup<T>> = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    if (current?.phase === item.phase) {
      current.items.push(item);
      continue;
    }
    groups.push({ key: `${groups.length}-${item.phase}-${item.time}`, phase: item.phase, items: [item] });
  }
  return groups;
}

function tracePhaseValue(value: unknown): TracePhase | undefined {
  if (typeof value !== "string") return undefined;
  return isTracePhase(value) ? value : undefined;
}

function isTracePhase(value: string): value is TracePhase {
  return [
    "applying_patch",
    "cancelled",
    "completed",
    "created",
    "failed",
    "inspect",
    "planning",
    "repair",
    "testing",
    "verify",
    "waiting_approval",
    "work",
  ].includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
