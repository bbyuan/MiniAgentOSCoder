import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    daemonApi
      .health()
      .then(() => setConnection("connected"))
      .catch(() => setConnection("offline"));
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

  async function startRun() {
    setBusy(true);
    setError(null);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start run");
      setConnection("offline");
    } finally {
      setBusy(false);
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
          <MetricStrip budget={mockRun.budget} />
          <section className="conversation">
            <div className="emptyState">
              <span className="eyebrow">Contract-first runtime</span>
              <h1>{runId ? "Daemon-backed run created." : "Start a managed coding-agent run."}</h1>
              <p>
                {runId
                  ? `Run ${runId} compiled a contract and loaded runtime artifacts from the daemon.`
                  : "The runtime will compile a contract, build context, request approval for patches, run tests, and preserve trace."}
              </p>
              {error ? <p className="errorLine">{error}</p> : null}
            </div>
            <TaskComposer
              workspacePath={workspacePath}
              task={task}
              mode={mode}
              disabled={busy || !workspacePath || !task}
              onWorkspacePathChange={setWorkspacePath}
              onTaskChange={setTask}
              onModeChange={setMode}
              onSubmit={startRun}
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
