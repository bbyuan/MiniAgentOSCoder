import { useEffect, useRef } from "react";
import { daemonApi, type ApprovalRequest, type ContextPack, type ConversationResponse, type ExtensionResponse, type GovernanceResponse, type MemoryResponse, type RecoveryResponse, type RunArtifacts, type RunEvidenceLedger, type RunReportResponse, type RunSummary, type TraceEvent } from "../api/client";
import type { TranslationKey } from "../i18n";
import { isApprovalRequest, isEvidenceEvent } from "./helpers";
import { loadRunResources, type RunResources } from "./resources";

type Translator = (key: TranslationKey, variables?: Record<string, string | number>) => string;

interface RunSubscriptionOptions {
  t: Translator;
  onProjectRunsRefresh: () => void;
  onGovernanceApproval: () => void;
  setError: (message: string | null) => void;
  setTraceEvents: React.Dispatch<React.SetStateAction<TraceEvent[]>>;
  setApproval: React.Dispatch<React.SetStateAction<ApprovalRequest | null>>;
  setRunStatus: React.Dispatch<React.SetStateAction<string>>;
  setArtifacts: React.Dispatch<React.SetStateAction<RunArtifacts | undefined>>;
  setRecovery: React.Dispatch<React.SetStateAction<RecoveryResponse | undefined>>;
  setReport: React.Dispatch<React.SetStateAction<RunReportResponse | undefined>>;
  setEvidence: React.Dispatch<React.SetStateAction<RunEvidenceLedger | undefined>>;
  setContextPack: React.Dispatch<React.SetStateAction<ContextPack | undefined>>;
  setMemory: React.Dispatch<React.SetStateAction<MemoryResponse | undefined>>;
  setGovernance: React.Dispatch<React.SetStateAction<GovernanceResponse | undefined>>;
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionResponse | undefined>>;
  setConversation: React.Dispatch<React.SetStateAction<ConversationResponse | undefined>>;
  setFinalMessage: React.Dispatch<React.SetStateAction<string>>;
  setTerminationReason: React.Dispatch<React.SetStateAction<string>>;
  setLastObservation: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setCompletion: React.Dispatch<React.SetStateAction<RunSummary["completion"] | undefined>>;
}

export function useRunSubscription(options: RunSubscriptionOptions) {
  const streamCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => streamCleanup.current?.(), []);

  function stopRunStream() {
    streamCleanup.current?.();
    streamCleanup.current = null;
  }

  function subscribeToRun(activeRunId: string, after: number) {
    stopRunStream();
    streamCleanup.current = daemonApi.streamRunEvents(
      activeRunId,
      after,
      (event) => handleRunEvent(activeRunId, event, options, stopRunStream),
      () => options.setError(options.t("error.streamDisconnected")),
    );
  }

  return { subscribeToRun, stopRunStream };
}

function handleRunEvent(
  activeRunId: string,
  event: TraceEvent,
  options: RunSubscriptionOptions,
  stopRunStream: () => void,
) {
  options.setTraceEvents((current) => [...current, event]);
  if (event.event === "approval.requested" && isApprovalRequest(event.payload.approval)) {
    options.setApproval(event.payload.approval);
    options.setRunStatus("waiting_approval");
    options.onGovernanceApproval();
  } else if (["approval.resolved", "approval.cancelled"].includes(event.event)) {
    options.setApproval(null);
  }

  refreshEventResources(activeRunId, event, options);

  const transitionedStatus = event.payload.status;
  if (event.event === "run.transitioned" && typeof transitionedStatus === "string") {
    options.setRunStatus(transitionedStatus);
    daemonApi.getArtifacts(activeRunId).then(options.setArtifacts).catch(() => undefined);
    options.onProjectRunsRefresh();
  }
  if (event.event === "run.budget_exceeded" && typeof event.payload.termination_reason === "string") {
    options.setTerminationReason(event.payload.termination_reason);
  }
  if (
    event.event === "run.transitioned" &&
    typeof transitionedStatus === "string" &&
    ["completed", "failed", "cancelled"].includes(transitionedStatus)
  ) {
    stopRunStream();
    Promise.all([
      daemonApi.getRun(activeRunId),
      loadRunResources(activeRunId),
    ]).then(([summary, resources]) => {
      applyTerminalRunState(summary, resources, options);
      options.onProjectRunsRefresh();
    }).catch(() => undefined);
  }
}

function refreshEventResources(activeRunId: string, event: TraceEvent, options: RunSubscriptionOptions) {
  if (["checkpoint.saved", "patch.snapshot.created", "repair.started", "repair.completed"].includes(event.event)) {
    daemonApi.getCheckpoints(activeRunId).then(options.setRecovery).catch(() => undefined);
  }
  if (event.event === "report.generated") {
    daemonApi.getReport(activeRunId).then(options.setReport).catch(() => undefined);
  }
  if (event.event.startsWith("context.")) {
    daemonApi.getContext(activeRunId).then(options.setContextPack).catch(() => undefined);
  }
  if (event.event.startsWith("memory.")) {
    daemonApi.getMemory(activeRunId).then(options.setMemory).catch(() => undefined);
  }
  if (["policy.evaluated", "sandbox.started", "sandbox.finished", "governance.updated"].includes(event.event)) {
    daemonApi.getGovernance(activeRunId).then(options.setGovernance).catch(() => undefined);
  }
  if (["policy.evaluated", "tool.executed", "tool.failed"].includes(event.event)) {
    daemonApi.getArtifacts(activeRunId).then(options.setArtifacts).catch(() => undefined);
  }
  if (event.event === "extension.updated" || event.event.startsWith("skill.")
    || event.event.startsWith("mcp.")
    || event.event.startsWith("hook.")) {
    daemonApi.getExtensions(activeRunId).then(options.setExtensions).catch(() => undefined);
  }
  if (isEvidenceEvent(event.event)) {
    daemonApi.getEvidence(activeRunId).then(options.setEvidence).catch(() => undefined);
  }
}

function applyTerminalRunState(summary: RunSummary, resources: RunResources, options: RunSubscriptionOptions) {
  options.setRunStatus(summary.status);
  options.setFinalMessage(summary.final_message || "");
  options.setTerminationReason(summary.termination_reason || "");
  options.setLastObservation(summary.last_observation || {});
  options.setCompletion(summary.completion);
  options.setArtifacts(resources.artifacts);
  options.setRecovery(resources.recovery);
  options.setReport(resources.report);
  options.setEvidence(resources.evidence);
  options.setContextPack(resources.context);
  options.setMemory(resources.memory);
  options.setGovernance(resources.governance);
  options.setExtensions(resources.extensions);
  options.setConversation(resources.conversation);
}
