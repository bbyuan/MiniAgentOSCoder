import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import {
  daemonApi,
  type AgentContract,
  type ApprovalRequest,
  type ContextPack,
  type CompletionAssessment,
  type CreateMCPServerRequest,
  type CreateHookRequest,
  type CreateSkillRequest,
  type ConversationResponse,
  type ContextCompactionResponse,
  type ExtensionResponse,
  type ExtensionSettings,
  type FormalAgentProgram,
  type GovernanceResponse,
  type HistoryProject,
  type HistoryRunDetail,
  type HistoryRun,
  type MemoryInput,
  type MemoryResponse,
  type ModelConfigurationSnapshot,
  type ModelProviderStatus,
  type ModelRoutePlan,
  type OpenProjectResponse,
  type RecoveryResponse,
  type RunEvidenceLedger,
  type RunArtifacts,
  type RunAdmission,
  type RunMode,
  type RunReportResponse,
  type TraceEvent,
  type SandboxProfile,
  type ToolOverride,
} from "../api/client";
import { AgentPackDialog } from "../components/AgentPackDialog";
import { AdmissionSummary } from "../components/AdmissionSummary";
import { AgentOSControlPlane, type ControlPlaneTarget } from "../components/AgentOSControlPlane";
import { AdvancedSetupPanel } from "../components/AdvancedSetupPanel";
import { CompletionSummary } from "../components/CompletionSummary";
import { ConversationHistory } from "../components/ConversationHistory";
import { ErrorBanner } from "../components/ErrorBanner";
import { FollowUpComposer } from "../components/FollowUpComposer";
import { ModelSetupDialog } from "../components/ModelSetupDialog";
import { ModelRouteSummary } from "../components/ModelRouteSummary";
import { PreflightControlDeck } from "../components/PreflightControlDeck";
import { PreflightSummary } from "../components/PreflightSummary";
import { ProjectLauncher } from "../components/ProjectLauncher";
import { ProjectSidebar } from "../components/ProjectSidebar";
import { RunCenter } from "../components/RunCenter";
import { RunChangeReviewPill } from "../components/RunChangeReviewPill";
import { RuntimePanels } from "../components/RuntimePanels";
import { RuntimeConnectionPanel } from "../components/RuntimeConnectionPanel";
import { RuntimeConfigStrip } from "../components/RuntimeConfigStrip";
import { RunStatusDeck } from "../components/RunStatusDeck";
import { RunSteeringComposer } from "../components/RunSteeringComposer";
import { SplashScreen } from "../components/SplashScreen";
import { TaskSetup } from "../components/TaskSetup";
import { TopBar } from "../components/TopBar";
import { WorkspaceFilesDialog } from "../components/WorkspaceFilesDialog";
import { chooseProjectDirectory, isDesktopHost, saveDesktopModelCredential } from "../desktop/runtime";
import { localizeErrorMessage, translateMode } from "../i18n";
import { usePreferences } from "../preferences";
import { basename, hasVisibleDiff, isRuntimeConnectionError } from "../run/helpers";
import { useAgentPackState } from "../run/useAgentPackState";
import { loadRunResources, type RunResources } from "../run/resources";
import { useRunSubscription } from "../run/useRunSubscription";
import { useWorkspaceReview } from "../run/useWorkspaceReview";
import { focusedChangePath, focusedPatchHunk } from "../run/patchFocus";
import { useRunViewModel } from "../run/viewModel";
import { parseTaskCommand } from "../taskCommands";

interface LoadedRunHeader {
  run_id: string;
  status: string;
  contract?: AgentContract;
  admission?: RunAdmission;
  model_route?: ModelRoutePlan;
  formal_program?: FormalAgentProgram;
}

export function Workbench() {
  const { locale, t } = usePreferences();
  const [showSplash, setShowSplash] = useState(true);
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
  const [admission, setAdmission] = useState<RunAdmission | undefined>();
  const [modelRoute, setModelRoute] = useState<ModelRoutePlan | undefined>();
  const [contextPack, setContextPack] = useState<ContextPack | undefined>();
  const [contextBusy, setContextBusy] = useState(false);
  const [memory, setMemory] = useState<MemoryResponse>();
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [governance, setGovernance] = useState<GovernanceResponse>();
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionResponse>();
  const [extensionsBusy, setExtensionsBusy] = useState(false);
  const [formalProgram, setFormalProgram] = useState<FormalAgentProgram>();
  const [artifacts, setArtifacts] = useState<RunArtifacts | undefined>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelProviderStatus | undefined>();
  const [modelConfig, setModelConfig] = useState<ModelConfigurationSnapshot | undefined>();
  const [finalMessage, setFinalMessage] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [lastObservation, setLastObservation] = useState<Record<string, unknown>>({});
  const [followUpTask, setFollowUpTask] = useState("");
  const [steeringBusy, setSteeringBusy] = useState(false);
  const [completion, setCompletion] = useState<CompletionAssessment | null>();
  const [conversation, setConversation] = useState<ConversationResponse>();
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryResponse>();
  const [evidence, setEvidence] = useState<RunEvidenceLedger>();
  const [report, setReport] = useState<RunReportResponse>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRunId, setHistoryRunId] = useState<string>();
  const [modelSetupOpen, setModelSetupOpen] = useState(false);
  const [modelSetupBusy, setModelSetupBusy] = useState(false);
  const [modelSetupError, setModelSetupError] = useState<string>();
  const [runtimeDetailsOpen, setRuntimeDetailsOpen] = useState(false);
  const [runtimePanelTarget, setRuntimePanelTarget] = useState<ControlPlaneTarget>("overview");
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);
  const agentPackState = useAgentPackState({ project, mode, locale, t });

  const { subscribeToRun, stopRunStream } = useRunSubscription({
    t,
    onProjectRunsRefresh: () => void loadProjectRuns(),
    onGovernanceApproval: () => {
      setRuntimePanelTarget("governance");
      setRuntimeDetailsOpen(true);
    },
    setError,
    setTraceEvents,
    setApproval,
    setRunStatus,
    setArtifacts,
    setRecovery,
    setReport,
    setEvidence,
    setContextPack,
    setMemory,
    setGovernance,
    setExtensions,
    setConversation,
    setFinalMessage,
    setTerminationReason,
    setLastObservation,
    setCompletion,
  });

  useEffect(() => {
    void refreshConnection();
  }, []);

  const {
    currentTurnIndex,
    displayContract,
    displayDiff,
    displayPlan,
    displayStatus,
    displayTask,
    displayTests,
    runIsActive,
    runIsPrepared,
    runTitle,
    steeringMessages,
    terminal,
    visibleFollowUpTemplates,
  } = useRunViewModel({
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
  });

  const workspaceReview = useWorkspaceReview({
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
  });
  const pendingPatchFocusPath = approval?.target.tool === "apply_patch"
    ? focusedChangePath(approval.target.patch, approval.target.files ?? [])
    : undefined;
  const pendingPatchChangeSet = approval?.target.tool === "apply_patch"
    ? {
        title: t("workspaceFiles.pendingChanges"),
        patch: approval.target.patch,
        changedFiles: approval.target.files ?? [],
        focusPath: pendingPatchFocusPath,
        focusHunk: focusedPatchHunk(approval.target.patch, pendingPatchFocusPath),
        insertions: approval.target.additions,
        deletions: approval.target.deletions,
        kind: "pending" as const,
      }
    : undefined;

  function applyLoadedRun(
    run: LoadedRunHeader,
    taskValue: string,
    modeValue: RunMode,
    resources: RunResources,
    artifactsOverride?: RunArtifacts,
  ) {
    setTask(taskValue);
    setMode(modeValue);
    setRunId(run.run_id);
    setRunStatus(run.status);
    setContract(run.contract);
    setAdmission(run.admission);
    setModelRoute(run.model_route);
    setFormalProgram(run.formal_program ?? resources.formalProgram);
    applyRunResources(resources, artifactsOverride);
    clearTerminalState();
  }

  function applyRunResources(resources: RunResources, artifactsOverride?: RunArtifacts) {
    setContextPack(resources.context);
    setArtifacts(artifactsOverride ?? resources.artifacts);
    setRecovery(resources.recovery);
    setReport(resources.report);
    setEvidence(resources.evidence);
    setMemory(resources.memory);
    setGovernance(resources.governance);
    setExtensions(resources.extensions);
    setFormalProgram(resources.formalProgram);
    setConversation(resources.conversation);
    setTraceEvents(resources.trace.events);
  }

  function clearTerminalState() {
    setFinalMessage("");
    setTerminationReason("");
    setLastObservation({});
    setCompletion(undefined);
    setApproval(null);
    setRuntimeDetailsOpen(false);
    setRuntimePanelTarget("overview");
    workspaceReview.closeWorkspaceFiles();
  }

  async function refreshConnection() {
    setConnection("checking");
    try {
      await daemonApi.health();
      setConnection("connected");
      setError((current) => current && isRuntimeConnectionError(current) ? null : current);
      const history = await daemonApi.getHistoryProjects().catch(() => undefined);
      if (history) setRecentProjects(history.projects);
    } catch {
      setConnection("offline");
    }
  }

  async function openWorkspace(path: string) {
    if (!path.trim()) return;
    setProjectBusy(true);
    setError(null);
    try {
      const opened = await daemonApi.openProject(path.trim());
      const [providerStatus, configurationSnapshot] = await Promise.all([
        daemonApi.getModelStatus(opened.project_id).catch(() => undefined),
        daemonApi.getModelConfig(opened.project_id).catch(() => undefined),
      ]);
      setProject(opened);
      setWorkspacePath(opened.path);
      setModelStatus(providerStatus);
      setModelConfig(configurationSnapshot);
      setConnection("connected");
      const history = await daemonApi.getHistoryProjects().catch(() => undefined);
      if (history) setRecentProjects(history.projects);
      await loadProjectRuns(opened.project_id);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.openProject")));
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

  async function resumeHistoricalRun(historicalRunId: string) {
    setBusy(true);
    setError(null);
    stopRunStream();
    try {
      const resumed = await daemonApi.resumeRun(historicalRunId);
      const [
        resources,
        providerStatus,
        configurationSnapshot,
      ] = await Promise.all([
        loadRunResources(resumed.run_id),
        daemonApi.getModelStatus(resumed.project.project_id).catch(() => undefined),
        daemonApi.getModelConfig(resumed.project.project_id).catch(() => undefined),
      ]);

      setProject(resumed.project);
      setWorkspacePath(resumed.project.path);
      setModelStatus(providerStatus);
      setModelConfig(configurationSnapshot);
      applyLoadedRun(resumed, resumed.task, resumed.mode, resources, resumed.artifacts);
      setConnection("connected");
      setHistoryOpen(false);
      setHistoryRunId(undefined);
      void loadProjectRuns(resumed.project.project_id);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("history.resumeError")));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function continueHistoricalRun(detail: HistoryRunDetail, nextTask: string) {
    const requestedTask = nextTask.trim();
    if (!requestedTask) return;
    setBusy(true);
    setError(null);
    setHistoryOpen(false);
    stopRunStream();
    try {
      const opened = project?.path === detail.run.project_path
        ? project
        : await daemonApi.openProject(detail.run.project_path);
      const baseMode = detail.run.mode as RunMode;
      const parsedTask = parseTaskCommand(requestedTask, baseMode);
      if (!parsedTask.task) {
        setError(t("error.emptyTask"));
        return;
      }
      const [providerStatus, configurationSnapshot] = await Promise.all([
        daemonApi.getModelStatus(opened.project_id).catch(() => undefined),
        daemonApi.getModelConfig(opened.project_id).catch(() => undefined),
      ]);
      if (!providerStatus?.configured) {
        setProject(opened);
        setWorkspacePath(opened.path);
        setModelStatus(providerStatus);
        setModelConfig(configurationSnapshot);
        setModelSetupOpen(true);
        throw new Error(t("error.modelSetup", { issues: providerStatus?.issues.join(", ") || t("error.providerUnavailable") }));
      }

      const run = await daemonApi.createRun({
        project_id: opened.project_id,
        task: parsedTask.task,
        mode: parsedTask.mode,
        parent_run_id: detail.run.run_id,
      });
      const resources = await loadRunResources(run.run_id);

      setProject(opened);
      setWorkspacePath(opened.path);
      setModelStatus(providerStatus);
      setModelConfig(configurationSnapshot);
      applyLoadedRun(run, parsedTask.task, parsedTask.mode, resources);
      setConnection("connected");

      if (run.admission?.can_start === false) {
        throw new Error(t("admission.launchBlocked"));
      }
      const started = await daemonApi.startRun(run.run_id);
      setRunStatus(started.status);
      void loadProjectRuns(opened.project_id);
      subscribeToRun(run.run_id, resources.trace.events.length);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("history.resumeError")));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function browseWorkspace() {
    try {
      const selected = await chooseProjectDirectory();
      if (selected) await openWorkspace(selected);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.openProject")));
    }
  }

  async function saveModelCredential(apiKey: string) {
    if (!project) return;
    setModelSetupBusy(true);
    setModelSetupError(undefined);
    try {
      await saveDesktopModelCredential(apiKey);
      const reopened = await daemonApi.openProject(project.path);
      const [providerStatus, configurationSnapshot] = await Promise.all([
        daemonApi.getModelStatus(reopened.project_id),
        daemonApi.getModelConfig(reopened.project_id).catch(() => undefined),
      ]);
      setProject(reopened);
      setModelStatus(providerStatus);
      setModelConfig(configurationSnapshot);
      if (runId) resetRunState(false);
      setModelSetupOpen(false);
    } catch (caught) {
      setModelSetupError(localizeErrorMessage(locale, caught, t("modelSetup.failed")));
    } finally {
      setModelSetupBusy(false);
    }
  }

  async function prepareRun(startImmediately = false, requestedTask = task, parentRunId?: string) {
    if (!project) return;
    const parsedTask = parseTaskCommand(requestedTask, mode);
    if (!parsedTask.task) {
      setError(t("error.emptyTask"));
      return;
    }
    setBusy(true);
    setError(null);
    clearTerminalState();
    setConversation(undefined);
    setRecovery(undefined);
    setReport(undefined);
    setEvidence(undefined);
    setMemory(undefined);
    setGovernance(undefined);
    setExtensions(undefined);
    setFormalProgram(undefined);
    stopRunStream();
    try {
      const [run, providerStatus] = await Promise.all([
        daemonApi.createRun({
          project_id: project.project_id,
          task: parsedTask.task,
          mode: parsedTask.mode,
          parent_run_id: parentRunId,
        }),
        daemonApi.getModelStatus(project.project_id).catch(() => undefined),
      ]);
      const resources = await loadRunResources(run.run_id);
      applyLoadedRun(run, parsedTask.task, parsedTask.mode, resources);
      setModelStatus(providerStatus);
      setConnection("connected");
      void loadProjectRuns(project.project_id);
      if (startImmediately) {
        if (!providerStatus?.configured) {
          setModelSetupOpen(true);
          throw new Error(t("error.modelSetup", { issues: providerStatus?.issues.join(", ") || t("error.providerUnavailable") }));
        }
        if (run.admission?.can_start === false) {
          throw new Error(t("admission.launchBlocked"));
        }
        const started = await daemonApi.startRun(run.run_id);
        setRunStatus(started.status);
        void loadProjectRuns(project.project_id);
        subscribeToRun(run.run_id, resources.trace.events.length);
      }
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.prepareRun")));
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
      const [latestTrace, latestAdmission, latestModelRoute, latestFormalProgram] = await Promise.all([
        daemonApi.getTrace(runId),
        daemonApi.getAdmission(runId),
        daemonApi.getModelRoute(runId),
        daemonApi.getFormalProgram(runId),
      ]);
      setTraceEvents(latestTrace.events);
      setAdmission(latestAdmission);
      setModelRoute(latestModelRoute);
      setFormalProgram(latestFormalProgram);
      if (!latestAdmission.can_start) {
        setError(t("admission.launchBlocked"));
        return;
      }
      const started = await daemonApi.startRun(runId);
      setRunStatus(started.status);
      void loadProjectRuns();
      subscribeToRun(runId, latestTrace.events.length);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.startRun")));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!runId) return;
    try {
      const cancelled = await daemonApi.cancelRun(runId);
      setRunStatus(cancelled.status);
      if (cancelled.status === "cancelled") {
        const [
          latestReport,
          latestEvidence,
          latestGovernance,
          latestExtensions,
          latestFormalProgram,
          latestTrace,
          latestConversation,
        ] = await Promise.all([
          daemonApi.getReport(runId),
          daemonApi.getEvidence(runId),
          daemonApi.getGovernance(runId),
          daemonApi.getExtensions(runId),
          daemonApi.getFormalProgram(runId),
          daemonApi.getTrace(runId),
          daemonApi.getConversation(runId),
        ]);
        setReport(latestReport);
        setEvidence(latestEvidence);
        setGovernance(latestGovernance);
        setExtensions(latestExtensions);
        setFormalProgram(latestFormalProgram);
        setTraceEvents(latestTrace.events);
        setConversation(latestConversation);
      }
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.cancelRun")));
    }
  }

  async function steerRun(message: string) {
    if (!runId) return;
    setSteeringBusy(true);
    setError(null);
    try {
      await daemonApi.steerRun(runId, message);
      if (approval) {
        setApproval(null);
        setRunStatus("repairing");
      }
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.steerRun")));
      throw caught;
    } finally {
      setSteeringBusy(false);
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
      setError(localizeErrorMessage(locale, caught, t("error.cancelRun")));
    } finally {
      setBusy(false);
    }
  }

  function resetRunState(clearTask = false) {
    stopRunStream();
    setRunId(undefined);
    setRunStatus("idle");
    setContract(undefined);
    setAdmission(undefined);
    setModelRoute(undefined);
    setContextPack(undefined);
    setMemory(undefined);
    setGovernance(undefined);
    setExtensions(undefined);
    setFormalProgram(undefined);
    setArtifacts(undefined);
    setTraceEvents([]);
    setFinalMessage("");
    setTerminationReason("");
    setLastObservation({});
    setFollowUpTask("");
    setSteeringBusy(false);
    setCompletion(undefined);
    setConversation(undefined);
    setApproval(null);
    setRecovery(undefined);
    setReport(undefined);
    setEvidence(undefined);
    setRuntimeDetailsOpen(false);
    setRuntimePanelTarget("overview");
    workspaceReview.closeWorkspaceFiles();
    setError(null);
    if (clearTask) setTask("");
  }

  function changeProject() {
    resetRunState(true);
    setProject(undefined);
    setWorkspacePath("");
    setModelStatus(undefined);
    setModelConfig(undefined);
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
      setError(localizeErrorMessage(locale, caught, t("error.approveAction")));
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
      setError(localizeErrorMessage(locale, caught, t("error.denyAction")));
    } finally {
      setApprovalBusy(false);
    }
  }

  async function compactContext(targetRatio: number, confirmed: boolean): Promise<ContextCompactionResponse> {
    if (!runId) throw new Error(t("context.noRun"));
    setContextBusy(true);
    setError(null);
    try {
      const result = await daemonApi.compactContext(runId, targetRatio, confirmed);
      const [latestContext, latestRecovery, latestEvidence, latestAdmission, latestModelRoute] = await Promise.all([
        daemonApi.getContext(runId),
        daemonApi.getCheckpoints(runId),
        daemonApi.getEvidence(runId),
        daemonApi.getAdmission(runId),
        daemonApi.getModelRoute(runId),
      ]);
      setContextPack(latestContext);
      setRecovery(latestRecovery);
      setEvidence(latestEvidence);
      setAdmission(latestAdmission);
      setModelRoute(latestModelRoute);
      return result;
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.compactContext")));
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
      setError(localizeErrorMessage(locale, caught, t("error.memoryWrite")));
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
      setError(localizeErrorMessage(locale, caught, t("error.memoryWrite")));
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
      setError(localizeErrorMessage(locale, caught, t("error.memoryDelete")));
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
      const [latestTrace, latestFormalProgram] = await Promise.all([
        daemonApi.getTrace(runId),
        daemonApi.getFormalProgram(runId),
      ]);
      setGovernance(latestGovernance);
      setFormalProgram(latestFormalProgram);
      setTraceEvents(latestTrace.events);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.governanceWrite")));
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
      const [latestTrace, latestAdmission, latestModelRoute, latestFormalProgram] = await Promise.all([
        daemonApi.getTrace(runId),
        daemonApi.getAdmission(runId),
        daemonApi.getModelRoute(runId),
        daemonApi.getFormalProgram(runId),
      ]);
      setExtensions(latestExtensions);
      setFormalProgram(latestFormalProgram);
      setTraceEvents(latestTrace.events);
      setAdmission(latestAdmission);
      setModelRoute(latestModelRoute);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.extensionsWrite")));
      throw caught;
    } finally {
      setExtensionsBusy(false);
    }
  }

  async function createSkill(request: CreateSkillRequest) {
    if (!runId) return;
    setExtensionsBusy(true);
    setError(null);
    try {
      const latestExtensions = await daemonApi.createSkill(runId, request);
      const latestFormalProgram = await daemonApi.getFormalProgram(runId);
      setExtensions(latestExtensions);
      setFormalProgram(latestFormalProgram);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.extensionsWrite")));
      throw caught;
    } finally {
      setExtensionsBusy(false);
    }
  }

  async function createMCPServer(request: CreateMCPServerRequest) {
    if (!runId) return;
    setExtensionsBusy(true);
    setError(null);
    try {
      const latestExtensions = await daemonApi.createMCPServer(runId, request);
      const latestFormalProgram = await daemonApi.getFormalProgram(runId);
      setExtensions(latestExtensions);
      setFormalProgram(latestFormalProgram);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.extensionsWrite")));
      throw caught;
    } finally {
      setExtensionsBusy(false);
    }
  }

  async function createHook(request: CreateHookRequest) {
    if (!runId) return;
    setExtensionsBusy(true);
    setError(null);
    try {
      const latestExtensions = await daemonApi.createHook(runId, request);
      const latestFormalProgram = await daemonApi.getFormalProgram(runId);
      setExtensions(latestExtensions);
      setFormalProgram(latestFormalProgram);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("error.extensionsWrite")));
      throw caught;
    } finally {
      setExtensionsBusy(false);
    }
  }

  async function startFollowUp() {
    const nextTask = followUpTask.trim();
    const parentRunId = runId;
    if (!nextTask || !parentRunId) return;
    setFollowUpTask("");
    await prepareRun(true, nextTask, parentRunId);
  }

  function useFollowUpSuggestion(message: string) {
    setFollowUpTask(message);
    window.setTimeout(() => followUpInputRef.current?.focus(), 0);
  }

  function openControlPlaneTarget(target: ControlPlaneTarget) {
    setRuntimePanelTarget(target);
    setRuntimeDetailsOpen(true);
  }

  return (
    <main className="appShell">
      {showSplash ? <SplashScreen onEnter={() => setShowSplash(false)} /> : null}
      <TopBar
        project={project ? basename(project.path) : t("top.noProject")}
        status={displayStatus}
        model={modelStatus?.configured
          ? modelStatus.routing_enabled
            ? t("modelRoute.profileCount", { count: modelStatus.configured_profiles ?? 0 })
            : modelStatus.model
          : modelStatus ? t("top.modelSetup") : t("top.modelUnchecked")}
        modelConfigured={modelStatus?.configured}
        onOpenHistory={() => openHistory()}
        onConfigureModel={() => setModelSetupOpen(true)}
      />

      {!project ? (
        <div className="guidedStage">
          {connection !== "connected" ? (
            <RuntimeConnectionPanel status={connection} onRetry={() => void refreshConnection()} />
          ) : (
            <>
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
            </>
          )}
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
            onOpenFiles={workspaceReview.openWorkspaceFiles}
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
        <div className={`workbenchLayout ${runIsPrepared ? "preflightLayout preflightSimpleLayout" : "runSimpleLayout"}`}>
          <section className={`runCanvas ${runIsPrepared ? "preflightCanvas" : ""}`}>
            {runIsPrepared ? (
              <>
                {error ? <ErrorBanner message={error} /> : null}
                <PreflightSummary
                  mode={mode}
                  task={task}
                  model={modelStatus}
                  busy={busy}
                  launchAllowed={admission?.can_start !== false}
                  onBack={discardPreparedRun}
                  onLaunch={launchRun}
                  onConfigureModel={() => setModelSetupOpen(true)}
                >
                  <PreflightControlDeck
                    model={modelStatus}
                    admission={admission}
                    contract={contract}
                    context={contextPack}
                    governance={governance}
                    agentPackDrift={agentPackState.drift}
                    onOpenAgentPack={() => void agentPackState.openDialog()}
                  />
                  <details className="preflightAdvancedDetails" open>
                    <summary>
                      <span>{t("runSettings.advancedDetails")}</span>
                      <ChevronDown size={15} />
                    </summary>
                    <div>
                      <AdmissionSummary admission={admission} />
                      <ModelRouteSummary plan={modelRoute} />
                      <AgentOSControlPlane
                        variant="manifest"
                        mode={mode}
                        contract={contract}
                        formalProgram={formalProgram}
                        context={contextPack}
                        memory={memory}
                        governance={governance}
                        extensions={extensions}
                      />
                      <AdvancedSetupPanel
                        governance={governance}
                        governanceBusy={governanceBusy}
                        extensions={extensions}
                        extensionsBusy={extensionsBusy}
                        onSaveGovernance={saveGovernance}
                        onSaveExtensions={saveExtensions}
                        onCreateSkill={createSkill}
                        onCreateMCPServer={createMCPServer}
                        onCreateHook={createHook}
                      />
                    </div>
                  </details>
                </PreflightSummary>
              </>
            ) : (
              <>
          <header className="runSessionHero">
            <div>
              <span className="eyebrow">{basename(project.path)} · {translateMode(locale, mode)} · {t("conversation.turn", { count: currentTurnIndex + 1 })}</span>
              <h1>{runTitle}</h1>
              <p>{displayTask}</p>
            </div>
          </header>

          <ConversationHistory conversation={conversation} currentRunId={runId} />

          <RuntimeConfigStrip
            contract={contract}
            formalProgram={formalProgram}
            context={contextPack}
            evidence={evidence}
            extensions={extensions}
            governance={governance}
            memory={memory}
            model={modelStatus}
            status={runStatus}
            trace={traceEvents}
            onOpen={openControlPlaneTarget}
          />

          {!terminal ? (
            <RunStatusDeck
              status={runStatus}
              plan={displayPlan}
              trace={traceEvents}
              onInspectChangeSet={workspaceReview.openPendingChanges}
              onOpenControlPlane={() => {
                setRuntimePanelTarget("overview");
                setRuntimeDetailsOpen(true);
              }}
            />
          ) : null}

          {steeringMessages.map((guidance, index) => (
            <section className="conversationTurn userTurn steeringTurn" key={`${guidance.message}-${index}`}>
              <div className="turnAvatar"><UserRound size={16} /></div>
              <div className="turnBody">
                <span>{t("session.you")}</span>
                <p>{guidance.message}</p>
                <small>{t(guidance.applied ? "steering.applied" : "steering.queued")}</small>
              </div>
            </section>
          ))}

          {terminal ? (
            <CompletionSummary
              status={runStatus}
              message={finalMessage}
              terminationReason={terminationReason}
              lastObservation={lastObservation}
              artifacts={artifacts}
              completion={completion}
              onInspectChanges={hasVisibleDiff(artifacts) ? workspaceReview.openArtifactChanges : undefined}
              changeDecision={artifacts?.change_review?.status as "pending" | "accepted" | "reverted" | undefined}
              onInspectRun={() => {
                setRuntimePanelTarget("overview");
                setRuntimeDetailsOpen(true);
              }}
            />
          ) : null}

          {runIsActive ? (
            <RunSteeringComposer
              status={runStatus}
              busy={steeringBusy}
              stopping={runStatus === "cancellation_requested"}
              queuedCount={steeringMessages.filter((guidance) => !guidance.applied).length}
              appliedCount={steeringMessages.filter((guidance) => guidance.applied).length}
              changeReview={
                pendingPatchChangeSet ? (
                  <RunChangeReviewPill
                    title={t("approval.patchNeedsReview")}
                    meta={t("approval.compactPatchSummary", {
                      count: pendingPatchChangeSet.changedFiles.length,
                      additions: pendingPatchChangeSet.insertions,
                      deletions: pendingPatchChangeSet.deletions,
                    })}
                    decisionRequired
                    busy={approvalBusy}
                    onInspect={() => workspaceReview.openPendingChanges(pendingPatchChangeSet)}
                  />
                ) : approval ? (
                  <RunChangeReviewPill
                    title={t("approval.commandReviewTitle")}
                    meta={t("approval.commandReviewHint")}
                    inspectLabel={t("approval.inspectAction")}
                    decisionRequired
                    busy={approvalBusy}
                    onInspect={() => {
                      setRuntimePanelTarget("overview");
                      setRuntimeDetailsOpen(true);
                    }}
                    onAccept={approveAction}
                    onReject={() => denyAction(t("approval.defaultDenyReason"))}
                  />
                ) : !approval && displayDiff.files > 0 ? (
                  <RunChangeReviewPill
                    title={t("run.changeShortcutLabel")}
                    meta={t("run.changeShortcut", { count: displayDiff.files })}
                    onInspect={workspaceReview.openArtifactChanges}
                  />
                ) : undefined
              }
              onSend={steerRun}
              onStop={() => void cancelRun()}
            />
          ) : null}

          {terminal ? (
            <FollowUpComposer
              value={followUpTask}
              busy={busy}
              templates={visibleFollowUpTemplates}
              inputRef={followUpInputRef}
              onChange={setFollowUpTask}
              onSubmit={() => void startFollowUp()}
              onUseTemplate={(template) => useFollowUpSuggestion(t(template))}
            />
          ) : null}

          {error ? <ErrorBanner message={error} /> : null}
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
          formalProgram={formalProgram}
          diff={displayDiff}
          tests={displayTests}
          trace={traceEvents}
          evidence={evidence}
          runId={runId}
          runStatus={runStatus}
          recovery={recovery}
          report={report}
          rollbackBusy={workspaceReview.rollbackBusy}
          onRollback={workspaceReview.rollbackToCheckpoint}
          onCompactContext={compactContext}
          onCreateMemory={createMemory}
          onUpdateMemory={updateMemory}
          onDeleteMemory={deleteMemory}
          onSaveGovernance={saveGovernance}
          onSaveExtensions={saveExtensions}
          onCreateSkill={createSkill}
          onCreateMCPServer={createMCPServer}
          onCreateHook={createHook}
          onClose={() => setRuntimeDetailsOpen(false)}
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
        onResume={resumeHistoricalRun}
        onContinue={continueHistoricalRun}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryRunId(undefined);
          void loadProjectRuns();
        }}
      />
      <WorkspaceFilesDialog
        open={workspaceReview.workspaceFilesOpen}
        project={project}
        changeSet={workspaceReview.workspaceChangeSet}
        reviewActions={
          workspaceReview.workspaceChangeSet?.kind === "pending" && approval?.target.tool === "apply_patch"
            ? {
                busy: approvalBusy,
                canAccept: true,
                canReject: true,
                onAccept: () => {
                  void approveAction().finally(workspaceReview.closeWorkspaceFiles);
                },
                onReject: () => {
                  void denyAction(t("approval.defaultDenyReason")).finally(workspaceReview.closeWorkspaceFiles);
                },
              }
            : workspaceReview.appliedReviewActions
        }
        onClose={workspaceReview.closeWorkspaceFiles}
      />
      <ModelSetupDialog
        open={modelSetupOpen}
        desktop={isDesktopHost()}
        busy={modelSetupBusy}
        error={modelSetupError}
        status={modelStatus}
        config={modelConfig}
        onClose={() => {
          if (!modelSetupBusy) {
            setModelSetupOpen(false);
            setModelSetupError(undefined);
          }
        }}
        onSave={saveModelCredential}
      />
      <AgentPackDialog
        open={agentPackState.open}
        loading={agentPackState.busy}
        versionBusy={agentPackState.versionBusy}
        error={agentPackState.error}
        manifest={agentPackState.manifest}
        versions={agentPackState.versions}
        drift={agentPackState.drift}
        onClose={agentPackState.closeDialog}
        onRefresh={() => void agentPackState.refresh()}
        onSaveVersion={() => void agentPackState.saveVersion()}
      />
    </main>
  );
}
