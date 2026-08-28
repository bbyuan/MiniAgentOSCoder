import { useEffect, useMemo, useRef, useState } from "react";
import {
  daemonApi,
  type AgentContract,
  type ContextPack,
  type ModelProviderStatus,
  type RunArtifacts,
  type RunMode,
  type TraceEvent,
} from "../api/client";
import { MetricStrip } from "../components/MetricStrip";
import { PlanPanel } from "../components/PlanPanel";
import { RuntimePanels } from "../components/RuntimePanels";
import { TaskComposer } from "../components/TaskComposer";
import { TopBar } from "../components/TopBar";
import { mockRun } from "../stores/mockRun";

export function Workbench() {
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
    if (!contract) {
      return mockRun.contract;
    }
    return {
      effects: contract.effects.allow,
      policies: Object.entries(contract.policies).map(([key, value]) => `${key}: ${value}`),
    };
  }, [contract]);

  const displayContext = useMemo(() => {
    if (!contextPack) {
      return mockRun.context;
    }
    const explanation = artifacts?.context_explanation ?? contextPack.explanation ?? [];
    if (explanation.length > 0) {
      return explanation.map((item) => ({
        path: item.source,
        reason: `${item.reason} · ${item.state}`,
        tokens: item.tokens,
      }));
    }
    return [
      {
        path: "required",
        reason: contextPack.required_items.join(", ") || "none",
        tokens: contextPack.budget_report.used_tokens,
      },
    ];
  }, [artifacts, contextPack]);

  const displayTrace = traceEvents.length > 0 ? traceEvents.map((event) => event.event) : mockRun.trace;
  const displayPlan = artifacts?.plan ?? mockRun.plan;
  const displayDiff = artifacts?.diff_summary ?? mockRun.diff;
  const displayTests = artifacts?.test_summary ?? mockRun.tests;
  const runIsActive = ["running", "cancellation_requested"].includes(runStatus);
  const displayBudget = {
    modelCalls: runBudget.model_calls ?? 0,
    toolCalls: runBudget.tool_calls ?? 0,
    tokens: contextPack
      ? `${contextPack.budget_report.used_tokens}/${contextPack.budget_report.max_tokens}`
      : mockRun.budget.tokens,
  };

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
        const issues = providerStatus?.issues.join(", ") || "provider status unavailable";
        setError(`Model setup required: ${issues}`);
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
            if (typeof eventStatus === "string") {
              setRunStatus(eventStatus);
            }
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
        () => setError("Live event stream disconnected"),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start run");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!runId) {
      return;
    }
    try {
      const cancelled = await daemonApi.cancelRun(runId);
      setRunStatus(cancelled.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to cancel run");
    }
  }

  return (
    <main className="appShell">
      <TopBar
        project={mockRun.project}
        mode={mode}
        status={`${connection} · ${runStatus}`}
        model={modelStatus?.configured ? modelStatus.model : modelStatus ? "Model setup needed" : "Model unchecked"}
        modelConfigured={modelStatus?.configured}
      />
      <div className="workspace">
        <section className="leftRail">
          <button className="railItem active">Chat</button>
          <button className="railItem">Plan</button>
          <button className="railItem">Diff</button>
          <button className="railItem">Tests</button>
          <button className="railItem">Trace</button>
        </section>

        <section className="mainColumn">
          <MetricStrip budget={displayBudget} />
          <section className="conversation">
            <div className="emptyState">
              <span className="eyebrow">Contract-first runtime</span>
              <h1>
                {runStatus === "completed"
                  ? "Run completed."
                  : runStatus === "running"
                    ? "Agent run in progress."
                    : runStatus === "cancellation_requested"
                      ? "Stopping at a safe boundary."
                  : runId
                    ? "Managed run is ready."
                    : "Start a managed coding-agent run."}
              </h1>
              <p>
                {finalMessage
                  ? finalMessage
                  : runId
                  ? `Run ${runId} compiled a contract and loaded runtime artifacts from the daemon.`
                  : "The runtime will compile a contract, build context, request approval for patches, run tests, and preserve trace."}
              </p>
              {error ? <p className="errorLine">{error}</p> : null}
            </div>
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
        </section>

        <section className="sideColumn">
          <PlanPanel items={displayPlan} />
          <RuntimePanels
            contract={displayContract}
            context={displayContext}
            diff={displayDiff}
            tests={displayTests}
            trace={displayTrace}
            runId={runId}
          />
        </section>
      </div>
    </main>
  );
}
