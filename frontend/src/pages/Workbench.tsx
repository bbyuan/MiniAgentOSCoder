import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Bot, PanelRightClose, PanelRightOpen, Square, UserRound } from "lucide-react";
import {
  daemonApi,
  type AgentContract,
  type ApprovalRequest,
  type ContextPack,
  type CompletionAssessment,
  type ContextCompactionResponse,
  type ExtensionResponse,
  type ExtensionSettings,
  type GovernanceResponse,
  type HistoryProject,
  type HistoryRun,
  type MemoryInput,
  type MemoryResponse,
  type ModelProviderStatus,
  type OpenProjectResponse,
  type RecoveryResponse,
  type RunArtifacts,
  type RunMode,
  type RunReportResponse,
  type TraceEvent,
  type SandboxProfile,
  type ToolOverride,
} from "../api/client";
import { ActivityFeed } from "../components/ActivityFeed";
import { AgentOSControlPlane, type ControlPlaneTarget } from "../components/AgentOSControlPlane";
import { AdvancedSetupPanel } from "../components/AdvancedSetupPanel";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { CompletionSummary } from "../components/CompletionSummary";
import { ModelSetupDialog } from "../components/ModelSetupDialog";
import { PreflightSummary } from "../components/PreflightSummary";
import { ProjectLauncher } from "../components/ProjectLauncher";
import { ProjectSidebar } from "../components/ProjectSidebar";
import { RunCenter } from "../components/RunCenter";
import { RuntimePanels } from "../components/RuntimePanels";
import { RunProgress } from "../components/RunProgress";
import { TaskSetup } from "../components/TaskSetup";
import { TopBar } from "../components/TopBar";
import { chooseProjectDirectory, isDesktopHost, saveDesktopModelCredential } from "../desktop/runtime";
import { translateMode, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

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
  const [workspacePath, setWorkspacePath] = useState("");
  const [project, setProject] = useState<OpenProjectResponse>();
  const [recentProjects, setRecentProjects] = useState<HistoryProject[]>([]);
  const [recentRuns, setRecentRuns] = useState<HistoryRun[]>([]);
  const [recentRunsBusy, setRecentRunsBusy] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<RunMode>("Feature");
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | undefined>();
  const [runStatus, setRunStatus] = useState("idle");
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
  const [terminationReason, setTerminationReason] = useState("");
  const [lastObservation, setLastObservation] = useState<Record<string, unknown>>({});
  const [followUpTask, setFollowUpTask] = useState("");
  const [completion, setCompletion] = useState<CompletionAssessment | null>();
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryResponse>();
  const [rollbackBusy, setRollbackBusy] = useState<string>();
  const [report, setReport] = useState<RunReportResponse>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRunId, setHistoryRunId] = useState<string>();
  const [modelSetupOpen, setModelSetupOpen] = useState(false);
  const [modelSetupBusy, setModelSetupBusy] = useState(false);
  const [modelSetupError, setModelSetupError] = useState<string>();
  const [runtimeDetailsOpen, setRuntimeDetailsOpen] = useState(false);
  const [runtimePanelTarget, setRuntimePanelTarget] = useState<ControlPlaneTarget>("overview");
  const streamCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    daemonApi
      .health()
      .then(async () => {
        setConnection("connected");
        const history = await daemonApi.getHistoryProjects().catch(() => undefined);
        if (history) setRecentProjects(history.projects);
      })
      .catch(() => setConnection("offline"));
    return () => streamCleanup.current?.();
  }, []);

  const displayContract = useMemo(() => {
    if (!contract) return { effects: [], policies: [], budget: undefined };
    return {
      effects: contract.effects.allow,
      policies: Object.entries(contract.policies).map(([name, value]) => ({ name, value })),
      budget: contract.cost_envelope,
    };
  }, [contract]);

  const displayPlan = artifacts?.plan ?? [];
  const displayDiff = artifacts?.diff_summary ?? { files: 0, insertions: 0, deletions: 0, status: "Not run" };
  const displayTests = artifacts?.test_summary ?? { command: "-", status: "Not run", passed: 0, failed: 0 };
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
  const copy = runId
    ? runCopy[runStatus] ?? { title: "run.readyTitle" as TranslationKey, description: "run.readyDescription" as TranslationKey }
    : { title: "run.idleTitle" as TranslationKey, description: "run.idleDescription" as TranslationKey };

  const terminal = ["completed", "failed", "cancelled"].includes(runStatus);

  async function openWorkspace(path: string) {
    if (!path.trim()) return;
    setProjectBusy(true);
    setError(null);
    try {
      const opened = await daemonApi.openProject(path.trim());
      const providerStatus = await daemonApi.getModelStatus(opened.project_id).catch(() => undefined);
      setProject(opened);
      setWorkspacePath(opened.path);
      setModelStatus(providerStatus);
      setConnection("connected");
      const history = await daemonApi.getHistoryProjects().catch(() => undefined);
      if (history) setRecentProjects(history.projects);
      await loadProjectRuns(opened.project_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.openProject"));
    } finally {
      setProjectBusy(false);
    }
  }

  async function loadProjectRuns(projectId = project?.project_id) {
    if (!projectId) return;
    setRecentRunsBusy(true);
    try {
      const response = await daemonApi.getHistoryRuns({ project_id: projectId, limit: 12 });
      setRecentRuns(response.runs);
    } catch {
      // The main workspace remains usable if history storage is temporarily unavailable.
    } finally {
      setRecentRunsBusy(false);
    }
  }

  function openHistory(runId?: string) {
    setHistoryRunId(runId);
    setHistoryOpen(true);
  }

  async function browseWorkspace() {
    try {
      const selected = await chooseProjectDirectory();
      if (selected) await openWorkspace(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.openProject"));
    }
  }

  async function saveModelCredential(apiKey: string) {
    if (!project) return;
    setModelSetupBusy(true);
    setModelSetupError(undefined);
    try {
      await saveDesktopModelCredential(apiKey);
      const reopened = await daemonApi.openProject(project.path);
      const providerStatus = await daemonApi.getModelStatus(reopened.project_id);
      setProject(reopened);
      setModelStatus(providerStatus);
      if (runId) resetRunState(false);
      setModelSetupOpen(false);
    } catch (caught) {
      setModelSetupError(caught instanceof Error ? caught.message : t("modelSetup.failed"));
    } finally {
      setModelSetupBusy(false);
    }
  }

  async function prepareRun(startImmediately = false, requestedTask = task) {
    if (!project) return;
    setBusy(true);
    setError(null);
    setFinalMessage("");
    setTerminationReason("");
    setLastObservation({});
    setCompletion(undefined);
    setApproval(null);
    setRecovery(undefined);
    setReport(undefined);
    setMemory(undefined);
    setGovernance(undefined);
    setExtensions(undefined);
    setRollbackBusy(undefined);
    setRuntimeDetailsOpen(false);
    setRuntimePanelTarget("overview");
    streamCleanup.current?.();
    streamCleanup.current = null;
    try {
      const [run, providerStatus] = await Promise.all([
        daemonApi.createRun({ project_id: project.project_id, task: requestedTask, mode }),
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
      void loadProjectRuns(project.project_id);
      if (startImmediately) {
        if (!providerStatus?.configured) {
          setModelSetupOpen(true);
          throw new Error(t("error.modelSetup", { issues: providerStatus?.issues.join(", ") || t("error.providerUnavailable") }));
        }
        const started = await daemonApi.startRun(run.run_id);
        setRunStatus(started.status);
        void loadProjectRuns(project.project_id);
        subscribeToRun(run.run_id, traceResponse.events.length);
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
    setRuntimeDetailsOpen(false);
    try {
      const latestTrace = await daemonApi.getTrace(runId);
      setTraceEvents(latestTrace.events);
      const started = await daemonApi.startRun(runId);
      setRunStatus(started.status);
      void loadProjectRuns();
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
          setRuntimePanelTarget("governance");
          setRuntimeDetailsOpen(true);
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
        if (["policy.evaluated", "tool.executed", "tool.failed"].includes(event.event)) {
          daemonApi.getArtifacts(activeRunId).then(setArtifacts).catch(() => undefined);
        }
        if (["extension.updated", "skill.activated"].includes(event.event)
          || event.event.startsWith("mcp.")
          || event.event.startsWith("hook.")) {
          daemonApi.getExtensions(activeRunId).then(setExtensions).catch(() => undefined);
        }
        const transitionedStatus = event.payload.status;
        if (event.event === "run.transitioned" && typeof transitionedStatus === "string") {
          setRunStatus(transitionedStatus);
          daemonApi.getArtifacts(activeRunId).then(setArtifacts).catch(() => undefined);
          void loadProjectRuns();
        }
        if (event.event === "run.budget_exceeded" && typeof event.payload.termination_reason === "string") {
          setTerminationReason(event.payload.termination_reason);
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
            setTerminationReason(summary.termination_reason || "");
            setLastObservation(summary.last_observation || {});
            setCompletion(summary.completion);
            setArtifacts(latestArtifacts);
            setRecovery(latestRecovery);
            setReport(latestReport);
            setContextPack(latestContext);
            setMemory(latestMemory);
            setGovernance(latestGovernance);
            setExtensions(latestExtensions);
            void loadProjectRuns();
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

  async function discardPreparedRun() {
    if (!runId) return;
    setBusy(true);
    setError(null);
    try {
      await daemonApi.cancelRun(runId);
      resetRunState();
      void loadProjectRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.cancelRun"));
    } finally {
      setBusy(false);
    }
  }

  function resetRunState(clearTask = false) {
    streamCleanup.current?.();
    streamCleanup.current = null;
    setRunId(undefined);
    setRunStatus("idle");
    setContract(undefined);
    setContextPack(undefined);
    setMemory(undefined);
    setGovernance(undefined);
    setExtensions(undefined);
    setArtifacts(undefined);
    setTraceEvents([]);
    setFinalMessage("");
    setTerminationReason("");
    setLastObservation({});
    setFollowUpTask("");
    setCompletion(undefined);
    setApproval(null);
    setRecovery(undefined);
    setReport(undefined);
    setRollbackBusy(undefined);
    setRuntimeDetailsOpen(false);
    setRuntimePanelTarget("overview");
    setError(null);
    if (clearTask) setTask("");
  }

  function changeProject() {
    resetRunState(true);
    setProject(undefined);
    setWorkspacePath("");
    setModelStatus(undefined);
    setRecentRuns([]);
  }

  function startNewTask() {
    if (runIsPrepared) {
      void discardPreparedRun();
      return;
    }
    resetRunState(true);
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

  async function startFollowUp() {
    const nextTask = followUpTask.trim();
    if (!nextTask) return;
    setTask(nextTask);
    setFollowUpTask("");
    await prepareRun(true, nextTask);
  }

  function openControlPlaneTarget(target: ControlPlaneTarget) {
    setRuntimePanelTarget(target);
    setRuntimeDetailsOpen(true);
  }

  return (
    <main className="appShell">
      <TopBar
        project={project ? basename(project.path) : t("top.noProject")}
        status={displayStatus}
        model={modelStatus?.configured ? modelStatus.model : modelStatus ? t("top.modelSetup") : t("top.modelUnchecked")}
        modelConfigured={modelStatus?.configured}
        onOpenHistory={() => openHistory()}
        onConfigureModel={() => setModelSetupOpen(true)}
      />

      {!project ? (
        <div className="guidedStage">
          {error ? <ErrorBanner message={error} /> : null}
          <ProjectLauncher
            desktop={isDesktopHost()}
            path={workspacePath}
            recentProjects={recentProjects}
            busy={projectBusy}
            onPathChange={setWorkspacePath}
            onBrowse={browseWorkspace}
            onOpen={openWorkspace}
          />
        </div>
      ) : (
        <div className="productFrame">
          <ProjectSidebar
            project={project}
            runs={recentRuns}
            activeRunId={runId}
            newTaskDisabled={runIsActive}
            navigationLocked={runIsActive || runIsPrepared}
            loading={recentRunsBusy}
            onNewTask={startNewTask}
            onChangeProject={changeProject}
            onOpenRun={(selectedRunId) => openHistory(selectedRunId)}
            onOpenHistory={() => openHistory()}
            onRefresh={() => void loadProjectRuns()}
          />
          <div className="productContent">
      {!runId ? (
        <div className="guidedStage taskStage">
          {error ? <ErrorBanner message={error} /> : null}
          <TaskSetup
            task={task}
            mode={mode}
            busy={busy}
            model={modelStatus}
            onTaskChange={setTask}
            onModeChange={setMode}
            onStart={() => prepareRun(true)}
            onReviewSettings={() => prepareRun(false)}
            onConfigureModel={() => setModelSetupOpen(true)}
          />
        </div>
      ) : (
        <div className={`workbenchLayout ${runIsPrepared ? "preflightLayout preflightSimpleLayout" : runtimeDetailsOpen ? "" : "runSimpleLayout"}`}>
          <section className={`runCanvas ${runIsPrepared ? "preflightCanvas" : ""}`}>
            {runIsPrepared ? (
              <>
                {error ? <ErrorBanner message={error} /> : null}
                <PreflightSummary
                  mode={mode}
                  task={task}
                  model={modelStatus}
                  busy={busy}
                  onBack={discardPreparedRun}
                  onLaunch={launchRun}
                  onConfigureModel={() => setModelSetupOpen(true)}
                >
                  <AgentOSControlPlane
                    variant="manifest"
                    mode={mode}
                    contract={contract}
                    context={contextPack}
                    memory={memory}
                    governance={governance}
                    extensions={extensions}
                    recovery={recovery}
                  />
                  <AdvancedSetupPanel
                    governance={governance}
                    governanceBusy={governanceBusy}
                    extensions={extensions}
                    extensionsBusy={extensionsBusy}
                    onSaveGovernance={saveGovernance}
                    onSaveExtensions={saveExtensions}
                  />
                </PreflightSummary>
              </>
            ) : (
              <>
          <header className="runHeader sessionRunHeader">
            <div className="runHeading">
              <span className="eyebrow">{t("session.currentTask")}</span>
              <h1>{t("session.title")}</h1>
              <p>{basename(project.path)} · {translateMode(locale, mode)}</p>
            </div>
            <div className="runHeaderControls">
              <button
                type="button"
                className="runDetailsAction"
                onClick={() => {
                  if (!runtimeDetailsOpen) setRuntimePanelTarget("overview");
                  setRuntimeDetailsOpen((current) => !current);
                }}
              >
                {runtimeDetailsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                {t(runtimeDetailsOpen ? "run.hideDetails" : "run.showDetails")}
              </button>
            </div>
          </header>

          <section className="conversationTurn userTurn">
            <div className="turnAvatar"><UserRound size={16} /></div>
            <div className="turnBody">
              <span>{t("session.you")}</span>
              <p>{task}</p>
            </div>
          </section>

          <section className="conversationTurn agentTurn">
            <div className="turnAvatar"><Bot size={16} /></div>
            <div className="turnBody">
              <span>MiniAgentOS</span>
              <strong>{t(copy.title)}</strong>
              {!terminal ? <p>{t(copy.description)}</p> : null}
            </div>
          </section>

          <AgentOSControlPlane
            variant="runtime"
            mode={mode}
            contract={contract}
            context={contextPack}
            memory={memory}
            governance={governance}
            extensions={extensions}
            recovery={recovery}
            activeTarget={runtimeDetailsOpen ? runtimePanelTarget : undefined}
            onOpen={openControlPlaneTarget}
          />

          {displayPlan.length ? <RunProgress items={displayPlan} /> : null}

          {approval ? (
            <div className="inlineApproval">
              <ApprovalPanel approval={approval} busy={approvalBusy} onApprove={approveAction} onDeny={denyAction} />
            </div>
          ) : null}

          {terminal ? (
            <CompletionSummary
              status={runStatus}
              message={finalMessage}
              terminationReason={terminationReason}
              lastObservation={lastObservation}
              artifacts={artifacts}
              completion={completion}
              onNewTask={() => resetRunState(true)}
            />
          ) : null}
          <ActivityFeed events={traceEvents} status={runStatus} />

          {error ? <ErrorBanner message={error} /> : null}

          {runIsActive ? (
            <div className="activeRunControls">
              <span>{t("run.safeStopHint")}</span>
              <button type="button" disabled={busy || runStatus === "cancellation_requested"} onClick={cancelRun}>
                <Square size={12} fill="currentColor" />{t("composer.cancel")}
              </button>
            </div>
          ) : null}

          {terminal ? (
            <section className="followUpComposer">
              <label htmlFor="follow-up-task">{t("session.followUp")}</label>
              <div>
                <textarea
                  id="follow-up-task"
                  rows={2}
                  value={followUpTask}
                  placeholder={t("session.followUpPlaceholder")}
                  onChange={(event) => setFollowUpTask(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && followUpTask.trim()) {
                      event.preventDefault();
                      void startFollowUp();
                    }
                  }}
                />
                <button type="button" disabled={!followUpTask.trim() || busy} onClick={() => void startFollowUp()} title={t("session.sendFollowUp")} aria-label={t("session.sendFollowUp")}>
                  <ArrowUp size={17} />
                </button>
              </div>
              <span>{t("session.followUpHint")}</span>
            </section>
          ) : null}
              </>
            )}
        </section>

        {!runIsPrepared && runtimeDetailsOpen ? <RuntimePanels
          key={`${runId}-${runtimePanelTarget}`}
          initialTarget={runtimePanelTarget}
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
          recovery={recovery}
          report={report}
          rollbackBusy={rollbackBusy}
          onRollback={rollbackToCheckpoint}
          onCompactContext={compactContext}
          onCreateMemory={createMemory}
          onUpdateMemory={updateMemory}
          onDeleteMemory={deleteMemory}
          onSaveGovernance={saveGovernance}
          onSaveExtensions={saveExtensions}
        /> : null}
        </div>
      )}
          </div>
        </div>
      )}
      <RunCenter
        open={historyOpen}
        initialRunId={historyRunId}
        initialProjectId={project?.project_id}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryRunId(undefined);
          void loadProjectRuns();
        }}
      />
      <ModelSetupDialog
        open={modelSetupOpen}
        desktop={isDesktopHost()}
        busy={modelSetupBusy}
        error={modelSetupError}
        onClose={() => {
          if (!modelSetupBusy) {
            setModelSetupOpen(false);
            setModelSetupError(undefined);
          }
        }}
        onSave={saveModelCredential}
      />
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="errorBanner" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  );
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
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
