import { useMemo } from "react";
import type {
  AgentContract,
  ConversationResponse,
  RunArtifacts,
  TraceEvent,
} from "../api/client";
import { type Locale, type TranslationKey, translateKnownText } from "../i18n";

const RUN_COPY: Record<string, { title: TranslationKey; description: TranslationKey }> = {
  running: { title: "run.runningTitle", description: "run.runningDescription" },
  waiting_approval: { title: "run.approvalTitle", description: "run.approvalDescription" },
  applying_patch: { title: "run.applyingTitle", description: "run.applyingDescription" },
  testing: { title: "run.testingTitle", description: "run.testingDescription" },
  repairing: { title: "run.repairingTitle", description: "run.repairingDescription" },
  cancellation_requested: { title: "run.stoppingTitle", description: "run.runningDescription" },
  completed: { title: "run.completedTitle", description: "run.completedDescription" },
  failed: { title: "run.failedTitle", description: "run.failedDescription" },
  cancelled: { title: "run.cancelledTitle", description: "run.cancelledDescription" },
};

const FOLLOW_UP_TEMPLATES: TranslationKey[] = [
  "session.template.fixFailure",
  "session.template.addTests",
  "session.template.explainChanges",
];

const ACTIVE_STATUSES = new Set([
  "running",
  "waiting_approval",
  "applying_patch",
  "testing",
  "repairing",
  "cancellation_requested",
]);

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

type Translator = (
  key: TranslationKey,
  variables?: Record<string, string | number>,
) => string;

export interface RunViewModelInput {
  artifacts?: RunArtifacts;
  connection: string;
  contract?: AgentContract;
  conversation?: ConversationResponse;
  locale: Locale;
  runId?: string;
  runStatus: string;
  task: string;
  traceEvents: TraceEvent[];
  t: Translator;
}

export function useRunViewModel({
  artifacts,
  connection,
  contract,
  conversation,
  locale,
  runId,
  runStatus,
  task,
  traceEvents,
  t,
}: RunViewModelInput) {
  const displayContract = useMemo(() => {
    if (!contract) return { effects: [], policies: [], budget: undefined };
    return {
      effects: contract.effects.allow,
      policies: Object.entries(contract.policies).map(([name, value]) => ({ name, value })),
      budget: contract.cost_envelope,
    };
  }, [contract]);

  const steeringMessages = useMemo(() => {
    const applied = new Set(traceEvents.flatMap((event) => {
      const message = event.payload.message;
      return event.event === "user.guidance.applied" && typeof message === "string" ? [message] : [];
    }));
    return traceEvents.flatMap((event) => {
      const message = event.payload.message;
      return event.event === "user.guidance.queued" && typeof message === "string"
        ? [{ message, applied: applied.has(message) }]
        : [];
    });
  }, [traceEvents]);

  const copy = runId
    ? RUN_COPY[runStatus] ?? { title: "run.readyTitle" as TranslationKey, description: "run.readyDescription" as TranslationKey }
    : { title: "run.idleTitle" as TranslationKey, description: "run.idleDescription" as TranslationKey };

  return {
    currentTurnIndex: conversation?.turns.find((turn) => turn.run_id === runId)?.turn_index ?? 0,
    displayContract,
    displayDiff: artifacts?.diff_summary ?? { files: 0, insertions: 0, deletions: 0, status: "Not run" },
    displayPlan: artifacts?.plan ?? [],
    displayStatus: runId ? runStatus : connection,
    displayTask: translateKnownText(locale, task),
    displayTests: artifacts?.test_summary ?? { command: "-", status: "Not run", passed: 0, failed: 0 },
    runIsActive: ACTIVE_STATUSES.has(runStatus),
    runIsPrepared: Boolean(runId && runStatus === "planning"),
    runTitle: t(copy.title),
    steeringMessages,
    terminal: TERMINAL_STATUSES.has(runStatus),
    visibleFollowUpTemplates: runStatus === "completed"
      ? FOLLOW_UP_TEMPLATES.filter((template) => template !== "session.template.fixFailure")
      : FOLLOW_UP_TEMPLATES.filter((template) => template !== "session.template.addTests"),
  };
}
