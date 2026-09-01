import { useState, type Dispatch, type SetStateAction } from "react";
import {
  daemonApi,
  type OpenProjectResponse,
  type RecoveryResponse,
  type RunArtifacts,
  type RunEvidenceLedger,
  type RunReportResponse,
  type TraceEvent,
} from "../api/client";
import { localizeErrorMessage, type Locale, type TranslationKey } from "../i18n";
import type { WorkspaceChangeReviewActions, WorkspaceChangeSet } from "../components/WorkspaceFilesDialog";
import { hasVisibleDiff, latestRestorableCheckpoint } from "./helpers";

type Translator = (key: TranslationKey, variables?: Record<string, string | number>) => string;

interface WorkspaceReviewStateInput {
  runId?: string;
  project?: OpenProjectResponse;
  artifacts?: RunArtifacts;
  recovery?: RecoveryResponse;
  locale: Locale;
  t: Translator;
  setArtifacts: Dispatch<SetStateAction<RunArtifacts | undefined>>;
  setRecovery: Dispatch<SetStateAction<RecoveryResponse | undefined>>;
  setTraceEvents: Dispatch<SetStateAction<TraceEvent[]>>;
  setReport: Dispatch<SetStateAction<RunReportResponse | undefined>>;
  setEvidence: Dispatch<SetStateAction<RunEvidenceLedger | undefined>>;
  setError: Dispatch<SetStateAction<string | null>>;
  loadProjectRuns: () => void | Promise<void>;
}

export function useWorkspaceReview({
  runId,
  project,
  artifacts,
  recovery,
  locale,
  t,
  setArtifacts,
  setRecovery,
  setTraceEvents,
  setReport,
  setEvidence,
  setError,
  loadProjectRuns,
}: WorkspaceReviewStateInput) {
  const [workspaceFilesOpen, setWorkspaceFilesOpen] = useState(false);
  const [workspaceChangeSet, setWorkspaceChangeSet] = useState<WorkspaceChangeSet>();
  const [rollbackBusy, setRollbackBusy] = useState<string>();

  function openWorkspaceFiles() {
    if (!project) return;
    setWorkspaceChangeSet(undefined);
    setWorkspaceFilesOpen(true);
  }

  function openPendingChanges(changeSet: WorkspaceChangeSet) {
    setWorkspaceChangeSet(changeSet);
    setWorkspaceFilesOpen(true);
  }

  function openArtifactChanges() {
    const diff = artifacts?.diff_summary;
    if (!diff) return;
    setWorkspaceChangeSet({
      title: t("workspaceFiles.appliedChanges"),
      patch: artifacts?.diff_preview?.content ?? "",
      changedFiles: [],
      insertions: diff.insertions,
      deletions: diff.deletions,
      kind: "applied",
    });
    setWorkspaceFilesOpen(true);
  }

  function closeWorkspaceFiles() {
    setWorkspaceFilesOpen(false);
    setWorkspaceChangeSet(undefined);
  }

  async function refreshRunReviewState() {
    if (!runId) return;
    const [latestRecovery, latestArtifacts, latestTrace, latestReport, latestEvidence] = await Promise.all([
      daemonApi.getCheckpoints(runId),
      daemonApi.getArtifacts(runId),
      daemonApi.getTrace(runId),
      daemonApi.getReport(runId),
      daemonApi.getEvidence(runId),
    ]);
    setRecovery(latestRecovery);
    setArtifacts(latestArtifacts);
    setTraceEvents(latestTrace.events);
    setReport(latestReport);
    setEvidence(latestEvidence);
  }

  async function rollbackToCheckpoint(checkpointId: string) {
    if (!runId) return;
    setRollbackBusy(checkpointId);
    setError(null);
    try {
      await daemonApi.rollbackRun(runId, checkpointId);
      await refreshRunReviewState();
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.rollback")));
    } finally {
      setRollbackBusy(undefined);
    }
  }

  async function rejectLatestChanges() {
    const checkpointId = latestRestorableCheckpoint(recovery);
    if (!checkpointId) return;
    await rollbackToCheckpoint(checkpointId);
    if (runId) {
      daemonApi.getArtifacts(runId).then(setArtifacts).catch(() => undefined);
    }
  }

  async function acceptLatestChanges() {
    if (!runId) return;
    setRollbackBusy("accept");
    setError(null);
    try {
      const response = await daemonApi.acceptRunChanges(runId);
      const latestArtifacts = await daemonApi.getArtifacts(runId);
      setArtifacts({
        ...latestArtifacts,
        change_review: response.change_review,
      });
      const latestTrace = await daemonApi.getTrace(runId);
      setTraceEvents(latestTrace.events);
      Promise.all([daemonApi.getReport(runId), daemonApi.getEvidence(runId)])
        .then(([latestReport, latestEvidence]) => {
          setReport(latestReport);
          setEvidence(latestEvidence);
        })
        .catch(() => undefined);
      void loadProjectRuns();
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.acceptChanges")));
    } finally {
      setRollbackBusy(undefined);
    }
  }

  const appliedReviewActions: WorkspaceChangeReviewActions | undefined =
    workspaceChangeSet?.kind === "applied" && hasVisibleDiff(artifacts)
      ? {
          review: artifacts?.change_review,
          busy: Boolean(rollbackBusy),
          canAccept: true,
          canReject: Boolean(latestRestorableCheckpoint(recovery)),
          onAccept: () => void acceptLatestChanges(),
          onReject: () => void rejectLatestChanges(),
        }
      : undefined;

  return {
    workspaceFilesOpen,
    workspaceChangeSet,
    rollbackBusy,
    appliedReviewActions,
    openWorkspaceFiles,
    openPendingChanges,
    openArtifactChanges,
    closeWorkspaceFiles,
    rollbackToCheckpoint,
  };
}
