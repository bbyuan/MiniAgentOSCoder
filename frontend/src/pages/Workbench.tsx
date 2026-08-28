import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CircleDot, GitBranch } from "lucide-react";
import {
  daemonApi,
  type AgentContract,
  type ContextPack,
  type ModelProviderStatus,
  type RunArtifacts,
  type RunMode,
  type TraceEvent,
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
  cancellation_requested: { title: "run.stoppingTitle", description: "run.runningDescription" },
  completed: { title: "run.completedTitle", description: "run.completedDescription" },
  failed: { title: "run.failedTitle", description: "run.failedDescription" },
  cancelled: { title: "run.cancelledTitle", description: "run.cancelledDescription" },
};

export function Workbench() {
  const { locale, t } = usePreferences();
  const [workspacePath, setWorkspacePath] = useState("/Users/shaoboyuan/seecoder/MiniAgentOSCoder/examples/python-bugfix");
  const [task, setTask] = useState("Fix calculator.add so the example test passes");
  const [mode, setMode] = useState<RunMode>("Bugfix");
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | undefined>();
  const [runStatus, setRunStatus] = useState(mockRun.status);
  const [contract, setContract] = useState<AgentContract | undefined>();
  const [contextPack, setContextPack] = useState<ContextPack | undefined>();
  const [artifacts, setArtifacts] = useState<RunArtifacts | undefined>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelProviderStatus | undefined>();
  const [finalMessage, setFinalMessage] = useState("");
  const [runBudget, setRunBudget] = useState<Record<string, number>>({});
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

  const displayContext = useMemo(() => {
    if (!contextPack) return mockRun.context;
    const explanation = artifacts?.context_explanation ?? contextPack.explanation ?? [];
    if (explanation.length > 0) {
      return explanation.map((item) => ({
        path: item.source,
        reason: item.reason,
        tokens: item.tokens,
      }));
    }
    return [{
      path: "required",
      reason: contextPack.required_items.join(", ") || "none",
      tokens: contextPack.budget_report.used_tokens,
    }];
  }, [artifacts, contextPack]);

  const displayPlan = artifacts?.plan ?? mockRun.plan;
  const displayDiff = artifacts?.diff_summary ?? mockRun.diff;
  const displayTests = artifacts?.test_summary ?? mockRun.tests;
  const displayTrace = traceEvents.map((event) => event.event);
  const runIsActive = ["running", "cancellation_requested"].includes(runStatus);
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

  async function startRun() {
    setBusy(true);
    setError(null);
    setFinalMessage("");
    setRunBudget({});
    streamCleanup.current?.();
    streamCleanup.current = null;
    try {
      const project = await daemonApi.openProject(workspacePath);
      const [run, providerStatus] = await Promise.all([
        daemonApi.createRun({ project_id: project.project_id, task, mode }),
        daemonApi.getModelStatus(project.project_id).catch(() => undefined),
      ]);
      const [contextResponse, traceResponse, artifactResponse] = await Promise.all([
        daemonApi.getContext(run.run_id),
        daemonApi.getTrace(run.run_id),
        daemonApi.getArtifacts(run.run_id),
      ]);
      setRunId(run.run_id);
      setRunStatus(run.status);
      setContract(run.contract);
      setContextPack(contextResponse);
      setArtifacts(artifactResponse);
      setTraceEvents(traceResponse.events);
      setModelStatus(providerStatus);
      setConnection("connected");

      if (!providerStatus?.configured) {
        const issues = providerStatus?.issues.join(", ") || t("error.providerUnavailable");
        setError(t("error.modelSetup", { issues }));
        return;
      }

      const started = await daemonApi.startRun(run.run_id);
      setRunStatus(started.status);
      streamCleanup.current = daemonApi.streamRunEvents(
        run.run_id,
        traceResponse.events.length,
        (event) => {
          setTraceEvents((current) => [...current, event]);
          const eventBudget = Object.fromEntries(
            Object.entries(event.payload).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
          );
          if (Object.keys(eventBudget).length > 0) {
            setRunBudget((current) => ({ ...current, ...eventBudget }));
          }
          if (["run.finished", "run.failed", "run.cancelled", "run.budget_exceeded"].includes(event.event)) {
            const eventStatus = event.payload.status;
            if (typeof eventStatus === "string") setRunStatus(eventStatus);
          }
          const transitionedStatus = event.payload.status;
          if (
            event.event === "run.transitioned" &&
            typeof transitionedStatus === "string" &&
            ["completed", "failed", "cancelled"].includes(transitionedStatus)
          ) {
            streamCleanup.current?.();
            streamCleanup.current = null;
            daemonApi.getRun(run.run_id).then((summary) => {
              setRunStatus(summary.status);
              setFinalMessage(summary.final_message || "");
              setRunBudget(summary.budget || {});
            });
          }
        },
        () => setError(t("error.streamDisconnected")),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.startRun"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!runId) return;
    try {
      const cancelled = await daemonApi.cancelRun(runId);
      setRunStatus(cancelled.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error.cancelRun"));
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
            onWorkspacePathChange={setWorkspacePath}
            onTaskChange={setTask}
            onModeChange={setMode}
            onSubmit={startRun}
            onCancel={cancelRun}
          />
        </section>

        <RuntimePanels
          plan={displayPlan}
          contract={displayContract}
          context={displayContext}
          diff={displayDiff}
          tests={displayTests}
          trace={displayTrace}
          runId={runId}
        />
      </div>
    </main>
  );
}
