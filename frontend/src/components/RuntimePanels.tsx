import { useState } from "react";
import { FlaskConical, GitPullRequest, ShieldCheck } from "lucide-react";
import type {
  ApprovalRequest,
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
import { ApprovalPanel } from "./ApprovalPanel";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";
import { ContextPanel } from "./ContextPanel";
import { MemoryPanel } from "./MemoryPanel";
import { GovernancePanel } from "./GovernancePanel";
import { ExtensionPanel } from "./ExtensionPanel";

type InspectorTab = "overview" | "context" | "memory" | "extensions" | "governance" | "recovery" | "report" | "trace";

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
  approval: ApprovalRequest | null;
  approvalBusy: boolean;
  recovery?: RecoveryResponse;
  report?: RunReportResponse;
  rollbackBusy?: string;
  onApprove: () => void;
  onDeny: (reason: string) => void;
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
  approval,
  approvalBusy,
  recovery,
  report,
  rollbackBusy,
  onApprove,
  onDeny,
  onRollback,
  onCompactContext,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
  onSaveGovernance,
  onSaveExtensions,
}: RuntimePanelsProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const { locale, t } = usePreferences();
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "overview", label: t("inspector.overview") },
    { id: "context", label: t("inspector.context") },
    { id: "memory", label: t("inspector.memory") },
    { id: "extensions", label: t("inspector.extensions") },
    { id: "governance", label: t("inspector.governance") },
    { id: "recovery", label: t("inspector.recovery") },
    { id: "report", label: t("inspector.report") },
    { id: "trace", label: t("inspector.trace") },
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

            <ApprovalPanel
              approval={approval}
              busy={approvalBusy}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          </>
        ) : null}

        {activeTab === "context" ? (
          <ContextPanel context={context} busy={contextBusy} onCompact={onCompactContext} />
        ) : null}

        {activeTab === "memory" ? (
          <MemoryPanel
            memory={memory}
            busy={memoryBusy}
            onCreate={onCreateMemory}
            onUpdate={onUpdateMemory}
            onDelete={onDeleteMemory}
          />
        ) : null}

        {activeTab === "governance" ? (
          <GovernancePanel governance={governance} busy={governanceBusy} onSave={onSaveGovernance} />
        ) : null}

        {activeTab === "extensions" ? (
          <ExtensionPanel extensions={extensions} busy={extensionsBusy} onSave={onSaveExtensions} />
        ) : null}

        {activeTab === "recovery" ? (
          <RecoveryPanel
            recovery={recovery}
            busyCheckpoint={rollbackBusy}
            onRollback={onRollback}
          />
        ) : null}

        {activeTab === "report" ? <RunReportPanel report={report} /> : null}

        {activeTab === "trace" ? (
          <TraceReplayPanel runId={runId} runStatus={runStatus} events={trace} />
        ) : null}
      </div>
    </aside>
  );
}
