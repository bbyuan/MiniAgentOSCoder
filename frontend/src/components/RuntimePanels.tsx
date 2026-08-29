import { useState } from "react";
import { Activity, FlaskConical, GitPullRequest, ShieldCheck } from "lucide-react";
import type {
  ContextCompactionResponse,
  ContextPack,
  ExtensionResponse,
  ExtensionSettings,
  GovernanceResponse,
  MemoryInput,
  MemoryResponse,
  RecoveryResponse,
  RunReportResponse,
  TraceEvent,
  SandboxProfile,
  ToolOverride,
} from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { PlanPanel, type PlanItem } from "./PlanPanel";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";
import { ContextPanel } from "./ContextPanel";
import { MemoryPanel } from "./MemoryPanel";
import { GovernancePanel } from "./GovernancePanel";
import { ExtensionPanel } from "./ExtensionPanel";

type InspectorTab = "overview" | "changes" | "diagnostics";
type DiagnosticView = "context" | "memory" | "extensions" | "governance" | "trace";

interface RuntimePanelsProps {
  plan: PlanItem[];
  contract: {
    effects: string[];
    policies: string[];
  };
  context?: ContextPack;
  contextBusy: boolean;
  memory?: MemoryResponse;
  memoryBusy: boolean;
  governance?: GovernanceResponse;
  governanceBusy: boolean;
  extensions?: ExtensionResponse;
  extensionsBusy: boolean;
  diff: {
    files: number;
    insertions: number;
    deletions: number;
    status: string;
  };
  tests: {
    command: string;
    status: string;
    passed: number;
    failed: number;
  };
  trace: TraceEvent[];
  runId?: string;
  runStatus: string;
  recovery?: RecoveryResponse;
  report?: RunReportResponse;
  rollbackBusy?: string;
  onRollback: (checkpointId: string) => void;
  onCompactContext: (targetRatio: number, confirmed: boolean) => Promise<ContextCompactionResponse>;
  onCreateMemory: (input: MemoryInput) => Promise<void>;
  onUpdateMemory: (memoryId: string, input: Omit<MemoryInput, "scope">) => Promise<void>;
  onDeleteMemory: (memoryId: string) => Promise<void>;
  onSaveGovernance: (profile: SandboxProfile, overrides: Record<string, ToolOverride>) => Promise<void>;
  onSaveExtensions: (settings: ExtensionSettings) => Promise<void>;
}

export function RuntimePanels({
  plan,
  contract,
  context,
  contextBusy,
  memory,
  memoryBusy,
  governance,
  governanceBusy,
  extensions,
  extensionsBusy,
  diff,
  tests,
  trace,
  runId,
  runStatus,
  recovery,
  report,
  rollbackBusy,
  onRollback,
  onCompactContext,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
  onSaveGovernance,
  onSaveExtensions,
}: RuntimePanelsProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [diagnosticView, setDiagnosticView] = useState<DiagnosticView>("context");
  const { locale, t } = usePreferences();
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "overview", label: t("inspector.overview") },
    { id: "changes", label: t("inspector.changes") },
    { id: "diagnostics", label: t("inspector.diagnostics") },
  ];

  return (
    <aside className="inspector">
      <div className="inspectorTop">
        <div>
          <span className="inspectorEyebrow">{t("inspector.title")}</span>
          <strong>{runId ? `${t("run.label")} ${runId.slice(-8)}` : "MiniAgentOS"}</strong>
        </div>
        <div className="inspectorTabs" role="tablist" aria-label={t("inspector.title")}>
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              id={`inspector-tab-${tab.id}`}
              aria-controls={`inspector-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="inspectorBody"
        role="tabpanel"
        id={`inspector-panel-${activeTab}`}
        aria-labelledby={`inspector-tab-${activeTab}`}
      >
        {activeTab === "overview" ? (
          <>
            <PlanPanel items={plan} />
            <section className="inspectorSection">
              <div className="sectionHeader">
                <h3>{t("contract.title")}</h3>
                <ShieldCheck size={15} />
              </div>
              <div className="subsectionLabel">{t("contract.effects")}</div>
              <div className="tagGrid">
                {contract.effects.map((effect) => <span key={effect}>{effect}</span>)}
              </div>
              <div className="subsectionLabel policyLabel">{t("contract.policies")}</div>
              <div className="policyList">
                {contract.policies.slice(0, 5).map((policy) => <span key={policy}>{policy}</span>)}
              </div>
            </section>

          </>
        ) : null}

        {activeTab === "changes" ? (
          <>
            <section className="inspectorSection signalGrid">
              <div className="signalItem">
                <div className="signalTitle"><GitPullRequest size={15} /><span>{t("diff.title")}</span></div>
                <strong>{translateKnownText(locale, diff.status)}</strong>
                <small>{t("diff.files", { count: diff.files })} · <b className="positive">+{diff.insertions}</b> / <b className="negative">-{diff.deletions}</b></small>
              </div>
              <div className="signalItem">
                <div className="signalTitle"><FlaskConical size={15} /><span>{t("tests.title")}</span></div>
                <strong>{translateKnownText(locale, tests.status)}</strong>
                <small>{tests.command} · {t("tests.passed", { count: tests.passed })} · {t("tests.failed", { count: tests.failed })}</small>
              </div>
            </section>
            <RunReportPanel report={report} />
            <RecoveryPanel recovery={recovery} busyCheckpoint={rollbackBusy} onRollback={onRollback} />
          </>
        ) : null}

        {activeTab === "diagnostics" ? (
          <>
            <section className="diagnosticChooser">
              <Activity size={15} />
              <select value={diagnosticView} onChange={(event) => setDiagnosticView(event.target.value as DiagnosticView)}>
                <option value="context">{t("inspector.context")}</option>
                <option value="memory">{t("inspector.memory")}</option>
                <option value="extensions">{t("inspector.extensions")}</option>
                <option value="governance">{t("inspector.governance")}</option>
                <option value="trace">{t("inspector.trace")}</option>
              </select>
            </section>
            {diagnosticView === "context" ? <ContextPanel context={context} busy={contextBusy} onCompact={onCompactContext} /> : null}
            {diagnosticView === "memory" ? <MemoryPanel memory={memory} busy={memoryBusy} onCreate={onCreateMemory} onUpdate={onUpdateMemory} onDelete={onDeleteMemory} /> : null}
            {diagnosticView === "extensions" ? <ExtensionPanel extensions={extensions} busy={extensionsBusy} onSave={onSaveExtensions} /> : null}
            {diagnosticView === "governance" ? <GovernancePanel governance={governance} busy={governanceBusy} onSave={onSaveGovernance} /> : null}
            {diagnosticView === "trace" ? <TraceReplayPanel runId={runId} runStatus={runStatus} events={trace} /> : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
