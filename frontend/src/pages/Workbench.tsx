import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CircleDot, GitBranch } from "lucide-react";
import {
  daemonApi,
  type AgentContract,
  type ApprovalRequest,
  type ContextPack,
  type ContextCompactionResponse,
  type ExtensionResponse,
  type ExtensionSettings,
  type GovernanceResponse,
  type MemoryInput,
  type MemoryResponse,
  type ModelProviderStatus,
  type RecoveryResponse,
  type RunArtifacts,
  type RunMode,
  type RunReportResponse,
  type TraceEvent,
  type SandboxProfile,
  type ToolOverride,
} from "../api/client";
import { ActivityFeed } from "../components/ActivityFeed";
import { MetricStrip } from "../components/MetricStrip";
import { RuntimePanels } from "../components/RuntimePanels";
import { TaskComposer } from "../components/TaskComposer";
import { TopBar } from "../components/TopBar";
import { translateMode, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import { mockRun } from "../stores/mockRun";

const runCopy: Record<string, { title: TranslationKey; description: TranslationKey }> = {
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

export function Workbench() {
  const { locale, t } = usePreferences();
  const [workspacePath, setWorkspacePath] = useState("/Users/shaoboyuan/seecoder/MiniAgentOSCoder/examples/deepseek-bugfix");
  const [task, setTask] = useState(
    "Fix pricing.apply_discount so percentage calculations and validation satisfy all tests. Keep the change focused on pricing.py.",
  );
  const [mode, setMode] = useState<RunMode>("Bugfix");
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | undefined>();
  const [runStatus, setRunStatus] = useState(mockRun.status);
  const [contract, setContract] = useState<AgentContract | undefined>();
  const [contextPack, setContextPack] = useState<ContextPack | undefined>();
  const [contextBusy, setContextBusy] = useState(false);
  const [memory, setMemory] = useState<MemoryResponse>();
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [governance, setGovernance] = useState<GovernanceResponse>();
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionResponse>();
  const [extensionsBusy, setExtensionsBusy] = useState(false);
  const [artifacts, setArtifacts] = useState<RunArtifacts | undefined>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelProviderStatus | undefined>();
  const [finalMessage, setFinalMessage] = useState("");
  const [runBudget, setRunBudget] = useState<Record<string, number>>({});
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryResponse>();
  const [rollbackBusy, setRollbackBusy] = useState<string>();
  const [report, setReport] = useState<RunReportResponse>();
  const streamCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    daemonApi
      .health()
      .then(() => setConnection("connected"))
      .catch(() => setConnection("offline"));
    return () => streamCleanup.current?.();
  }, []);

  const displayContract = useMemo(() => {
    if (!contract) return mockRun.contract;
    return {
      effects: contract.effects.allow,
      policies: Object.entries(contract.policies).map(([key, value]) => `${key}: ${value}`),
    };
  }, [contract]);

  const displayPlan = artifacts?.plan ?? mockRun.plan;
  const displayDiff = artifacts?.diff_summary ?? mockRun.diff;
  const displayTests = artifacts?.test_summary ?? mockRun.tests;
  const runIsActive = [
    "running",
    "waiting_approval",
    "applying_patch",
    "testing",
    "repairing",
    "cancellation_requested",
  ].includes(runStatus);
  const runIsPrepared = Boolean(runId && runStatus === "planning");
  const displayStatus = runId ? runStatus : connection;
  const displayBudget = {
    modelCalls: runBudget.model_calls ?? 0,
    toolCalls: runBudget.tool_calls ?? 0,
    tokens: contextPack
      ? `${contextPack.budget_report.used_tokens}/${contextPack.budget_report.max_tokens}`
      : mockRun.budget.tokens,
  };
  const copy = runId
    ? runCopy[runStatus] ?? { title: "run.readyTitle" as TranslationKey, description: "run.readyDescription" as TranslationKey }
    : { title: "run.idleTitle" as TranslationKey, description: "run.idleDescription" as TranslationKey };

  async function prepareRun() {
    setBusy(true);
    setError(null);
    setFinalMessage("");
    setRunBudget({});
    setApproval(null);
    setRecovery(undefined);
    setReport(undefined);
    setMemory(undefined);
    setGovernance(undefined);
    setExtensions(undefined);
    setRollbackBusy(undefined);
    streamCleanup.current?.();
    streamCleanup.current = null;
    try {
      const project = await daemonApi.openProject(workspacePath);
      const [run, providerStatus] = await Promise.all([
        daemonApi.createRun({ project_id: project.project_id, task, mode }),
        daemonApi.getModelStatus(project.project_id).catch(() => undefined),
      ]);
      const [
        contextResponse,
        traceResponse,
        artifactResponse,
        recoveryResponse,
        reportResponse,
        memoryResponse,
        governanceResponse,
        extensionResponse,
      ] = await Promise.all([
        daemonApi.getContext(run.run_id),
        daemonApi.getTrace(run.run_id),
        daemonApi.getArtifacts(run.run_id),
        daemonApi.getCheckpoints(run.run_id),
        daemonApi.getReport(run.run_id),
        daemonApi.getMemory(run.run_id),
        daemonApi.getGovernance(run.run_id),
        daemonApi.getExtensions(run.run_id),
      ]);
      setRunId(run.run_id);
      setRunStatus(run.status);
      setContract(run.contract);
      setContextPack(contextResponse);
      setArtifacts(artifactResponse);
      setRecovery(recoveryResponse);
      setReport(reportResponse);
      setMemory(memoryResponse);
      setGovernance(governanceResponse);
      setExtensions(extensionResponse);
      setTraceEvents(traceResponse.events);
      setModelStatus(providerStatus);
      setConnection("connected");

      if (!providerStatus?.configured) {
        const issues = providerStatus?.issues.join(", ") || t("error.providerUnavailable");
        setError(t("error.modelSetup", { issues }));
        return;
      }

    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.prepareRun"));
    } finally {
      setBusy(false);
    }
  }

  async function launchRun() {
    if (!runId) return;
    if (!modelStatus?.configured) {
      const issues = modelStatus?.issues.join(", ") || t("error.providerUnavailable");
      setError(t("error.modelSetup", { issues }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const latestTrace = await daemonApi.getTrace(runId);
      setTraceEvents(latestTrace.events);
      const started = await daemonApi.startRun(runId);
      setRunStatus(started.status);
      subscribeToRun(runId, latestTrace.events.length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.startRun"));
    } finally {
      setBusy(false);
    }
  }

  function subscribeToRun(activeRunId: string, after: number) {
    streamCleanup.current?.();
    streamCleanup.current = daemonApi.streamRunEvents(
      activeRunId,
      after,
      (event) => {
        setTraceEvents((current) => [...current, event]);
        if (event.event === "approval.requested" && isApprovalRequest(event.payload.approval)) {
          setApproval(event.payload.approval);
          setRunStatus("waiting_approval");
        } else if (["approval.resolved", "approval.cancelled"].includes(event.event)) {
          setApproval(null);
        }
        if (["checkpoint.saved", "patch.snapshot.created", "repair.started", "repair.completed"].includes(event.event)) {
          daemonApi.getCheckpoints(activeRunId).then(setRecovery).catch(() => undefined);
        }
        if (event.event === "report.generated") {
          daemonApi.getReport(activeRunId).then(setReport).catch(() => undefined);
        }
        if (event.event.startsWith("context.")) {
          daemonApi.getContext(activeRunId).then(setContextPack).catch(() => undefined);
        }
        if (event.event.startsWith("memory.")) {
          daemonApi.getMemory(activeRunId).then(setMemory).catch(() => undefined);
        }
        if (["policy.evaluated", "sandbox.started", "sandbox.finished", "governance.updated"].includes(event.event)) {
          daemonApi.getGovernance(activeRunId).then(setGovernance).catch(() => undefined);
        }
        if (["extension.updated", "skill.activated"].includes(event.event)
          || event.event.startsWith("mcp.")
          || event.event.startsWith("hook.")) {
          daemonApi.getExtensions(activeRunId).then(setExtensions).catch(() => undefined);
        }
        const eventBudget = Object.fromEntries(
          Object.entries(event.payload).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
        );
        if (Object.keys(eventBudget).length > 0) {
          setRunBudget((current) => ({ ...current, ...eventBudget }));
        }
        const transitionedStatus = event.payload.status;
        if (event.event === "run.transitioned" && typeof transitionedStatus === "string") {
          setRunStatus(transitionedStatus);
          if (["waiting_approval", "testing", "repairing", "completed"].includes(transitionedStatus)) {
            daemonApi.getArtifacts(activeRunId).then(setArtifacts).catch(() => undefined);
          }
        }
        if (
          event.event === "run.transitioned" &&
          typeof transitionedStatus === "string" &&
          ["completed", "failed", "cancelled"].includes(transitionedStatus)
        ) {
          streamCleanup.current?.();
          streamCleanup.current = null;
          Promise.all([
            daemonApi.getRun(activeRunId),
            daemonApi.getArtifacts(activeRunId),
            daemonApi.getCheckpoints(activeRunId),
            daemonApi.getReport(activeRunId),
            daemonApi.getContext(activeRunId),
            daemonApi.getMemory(activeRunId),
            daemonApi.getGovernance(activeRunId),
            daemonApi.getExtensions(activeRunId),
          ]).then(([
            summary,
            latestArtifacts,
            latestRecovery,
            latestReport,
            latestContext,
            latestMemory,
            latestGovernance,
            latestExtensions,
          ]) => {
            setRunStatus(summary.status);
            setFinalMessage(summary.final_message || "");
            setRunBudget(summary.budget || {});
            setArtifacts(latestArtifacts);
            setRecovery(latestRecovery);
            setReport(latestReport);
            setContextPack(latestContext);
            setMemory(latestMemory);
            setGovernance(latestGovernance);
            setExtensions(latestExtensions);
          }).catch(() => undefined);
        }
      },
      () => setError(t("error.streamDisconnected")),
    );
  }

  async function cancelRun() {
    if (!runId) return;
    try {
      const cancelled = await daemonApi.cancelRun(runId);
      setRunStatus(cancelled.status);
      if (cancelled.status === "cancelled") {
        const [latestReport, latestGovernance, latestExtensions, latestTrace] = await Promise.all([
          daemonApi.getReport(runId),
          daemonApi.getGovernance(runId),
          daemonApi.getExtensions(runId),
          daemonApi.getTrace(runId),
        ]);
        setReport(latestReport);
        setGovernance(latestGovernance);
        setExtensions(latestExtensions);
        setTraceEvents(latestTrace.events);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.cancelRun"));
    }
  }

  async function approveAction() {
    if (!runId || approval === null) return;
    setApprovalBusy(true);
    setError(null);
    try {
      await daemonApi.approveAction(runId, approval.approval_id);
      const approvedTool = approval.target.tool;
      setApproval(null);
      setRunStatus(approvedTool === "apply_patch" ? "applying_patch" : "running");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.approveAction"));
    } finally {
      setApprovalBusy(false);
    }
  }

  async function denyAction(reason: string) {
    if (!runId || approval === null) return;
    setApprovalBusy(true);
    setError(null);
    try {
      await daemonApi.denyAction(runId, approval.approval_id, reason);
      setApproval(null);
      setRunStatus("repairing");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.denyAction"));
    } finally {
      setApprovalBusy(false);
    }
  }

  async function rollbackToCheckpoint(checkpointId: string) {
    if (!runId) return;
    setRollbackBusy(checkpointId);
    setError(null);
    try {
      await daemonApi.rollbackRun(runId, checkpointId);
      const [latestRecovery, latestArtifacts, latestTrace, latestReport] = await Promise.all([
        daemonApi.getCheckpoints(runId),
        daemonApi.getArtifacts(runId),
        daemonApi.getTrace(runId),
        daemonApi.getReport(runId),
      ]);
      setRecovery(latestRecovery);
      setArtifacts(latestArtifacts);
      setTraceEvents(latestTrace.events);
      setReport(latestReport);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.rollback"));
    } finally {
      setRollbackBusy(undefined);
    }
  }

  async function compactContext(targetRatio: number, confirmed: boolean): Promise<ContextCompactionResponse> {
    if (!runId) throw new Error(t("context.noRun"));
    setContextBusy(true);
    setError(null);
    try {
      const result = await daemonApi.compactContext(runId, targetRatio, confirmed);
      const [latestContext, latestRecovery] = await Promise.all([
        daemonApi.getContext(runId),
        daemonApi.getCheckpoints(runId),
      ]);
      setContextPack(latestContext);
      setRecovery(latestRecovery);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.compactContext"));
      throw caught;
    } finally {
      setContextBusy(false);
    }
  }

  async function refreshMemory() {
    if (!runId) return;
    const latest = await daemonApi.getMemory(runId);
    setMemory(latest);
  }

  async function createMemory(input: MemoryInput) {
    if (!runId) return;
    setMemoryBusy(true);
    setError(null);
    try {
      await daemonApi.createMemory(runId, input);
      await refreshMemory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.memoryWrite"));
      throw caught;
    } finally {
      setMemoryBusy(false);
    }
  }

  async function updateMemory(memoryId: string, input: Omit<MemoryInput, "scope">) {
    if (!runId) return;
    setMemoryBusy(true);
    setError(null);
    try {
      await daemonApi.updateMemory(runId, memoryId, input);
      await refreshMemory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.memoryWrite"));
      throw caught;
    } finally {
      setMemoryBusy(false);
    }
  }

  async function deleteMemory(memoryId: string) {
    if (!runId) return;
    setMemoryBusy(true);
    setError(null);
    try {
      await daemonApi.deleteMemory(runId, memoryId);
      await refreshMemory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.memoryDelete"));
      throw caught;
    } finally {
      setMemoryBusy(false);
    }
  }

  async function saveGovernance(
    profile: SandboxProfile,
    overrides: Record<string, ToolOverride>,
  ) {
    if (!runId) return;
    setGovernanceBusy(true);
    setError(null);
    try {
      const latestGovernance = await daemonApi.updateGovernance(runId, profile, overrides);
      const latestTrace = await daemonApi.getTrace(runId);
      setGovernance(latestGovernance);
      setTraceEvents(latestTrace.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.governanceWrite"));
      throw caught;
    } finally {
      setGovernanceBusy(false);
    }
  }

  async function saveExtensions(settings: ExtensionSettings) {
    if (!runId) return;
    setExtensionsBusy(true);
    setError(null);
    try {
      const latestExtensions = await daemonApi.updateExtensions(runId, settings);
      const latestTrace = await daemonApi.getTrace(runId);
      setExtensions(latestExtensions);
      setTraceEvents(latestTrace.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.extensionsWrite"));
      throw caught;
    } finally {
      setExtensionsBusy(false);
    }
  }

  return (
    <main className="appShell">
      <TopBar
        project={mockRun.project}
        status={displayStatus}
        model={modelStatus?.configured ? modelStatus.model : modelStatus ? t("top.modelSetup") : t("top.modelUnchecked")}
        modelConfigured={modelStatus?.configured}
      />

      <div className="workbenchLayout">
        <section className="runCanvas">
          <header className="runHeader">
            <div className="runHeading">
              <span className="eyebrow">{t("run.eyebrow")}</span>
              <h1>{t(copy.title)}</h1>
              <p>{finalMessage || t(copy.description)}</p>
            </div>
            <div className="runMeta">
              <span><GitBranch size={14} />{translateMode(locale, mode)}</span>
              {runId ? <span title={runId}><CircleDot size={14} />{runId.slice(-8)}</span> : null}
            </div>
          </header>

          <MetricStrip budget={displayBudget} phase={displayStatus} />
          <ActivityFeed events={traceEvents} active={runIsActive} />

          {error ? (
            <div className="errorBanner" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          ) : null}

          <TaskComposer
            workspacePath={workspacePath}
            task={task}
            mode={mode}
            disabled={busy || runStatus === "cancellation_requested" || !workspacePath || !task}
            running={runIsActive}
            prepared={runIsPrepared}
            onWorkspacePathChange={setWorkspacePath}
            onTaskChange={setTask}
            onModeChange={setMode}
            onSubmit={runIsPrepared ? launchRun : prepareRun}
            onCancel={cancelRun}
          />
        </section>

        <RuntimePanels
          plan={displayPlan}
          contract={displayContract}
          context={contextPack}
          contextBusy={contextBusy}
          memory={memory}
          memoryBusy={memoryBusy}
          governance={governance}
          governanceBusy={governanceBusy}
          extensions={extensions}
          extensionsBusy={extensionsBusy}
          diff={displayDiff}
          tests={displayTests}
          trace={traceEvents}
          runId={runId}
          runStatus={runStatus}
          approval={approval}
          approvalBusy={approvalBusy}
          recovery={recovery}
          report={report}
          rollbackBusy={rollbackBusy}
          onApprove={approveAction}
          onDeny={denyAction}
          onRollback={rollbackToCheckpoint}
          onCompactContext={compactContext}
          onCreateMemory={createMemory}
          onUpdateMemory={updateMemory}
          onDeleteMemory={deleteMemory}
          onSaveGovernance={saveGovernance}
          onSaveExtensions={saveExtensions}
        />
      </div>
    </main>
  );
}

function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ApprovalRequest>;
  return typeof candidate.approval_id === "string"
    && typeof candidate.run_id === "string"
    && typeof candidate.reason === "string"
    && typeof candidate.target === "object"
    && candidate.target !== null;
}
