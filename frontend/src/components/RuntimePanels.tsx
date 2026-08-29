import { useState } from "react";
import { Check, CircleGauge, FlaskConical, Gauge, GitPullRequest, ShieldCheck } from "lucide-react";
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
import { translateKnownText, translateStatus, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import type { ControlPlaneTarget } from "./AgentOSControlPlane";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";
import { ContextPanel } from "./ContextPanel";
import { MemoryPanel } from "./MemoryPanel";
import { GovernancePanel } from "./GovernancePanel";
import { ExtensionPanel } from "./ExtensionPanel";

type ControlView = ControlPlaneTarget | "trace";

interface RuntimePanelsProps {
  initialTarget?: ControlPlaneTarget;
  contract: {
    effects: string[];
    policies: Array<{ name: string; value: string }>;
    budget?: {
      max_steps: number;
      max_model_calls: number;
      max_tool_calls: number;
      max_wall_time_seconds: number;
    };
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
  initialTarget = "overview",
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
  const [activeView, setActiveView] = useState<ControlView>(initialTarget);
  const { locale, t } = usePreferences();

  return (
    <aside className="inspector">
      <div className="inspectorTop">
        <div className="inspectorTitleRow">
          <div>
            <span className="inspectorEyebrow">{t("control.runtimeTitle")}</span>
            <strong>{runId ? `${t("run.label")} ${runId.slice(-8)}` : "MiniAgentOS"}</strong>
          </div>
          <span className={`inspectorRunState tone-${runStatus}`}>{translateStatus(locale, runStatus)}</span>
        </div>
        <label className="controlViewPicker" htmlFor="control-plane-view">
          <span>{t("inspector.view")}</span>
          <select id="control-plane-view" value={activeView} onChange={(event) => setActiveView(event.target.value as ControlView)}>
            <optgroup label={t("inspector.group.execution")}>
              <option value="overview">{t("inspector.overview")}</option>
              <option value="changes">{t("inspector.changes")}</option>
            </optgroup>
            <optgroup label={t("inspector.group.intelligence")}>
              <option value="context">{t("inspector.context")}</option>
              <option value="memory">{t("inspector.memory")}</option>
            </optgroup>
            <optgroup label={t("inspector.group.governance")}>
              <option value="governance">{t("inspector.governance")}</option>
              <option value="extensions">{t("inspector.extensions")}</option>
              <option value="trace">{t("inspector.trace")}</option>
            </optgroup>
          </select>
        </label>
      </div>

      <div className="inspectorBody" id={`control-view-${activeView}`}>
        {activeView === "overview" ? (
          <section className="inspectorSection controlOverviewSection">
            <div className="sectionHeader controlOverviewHeader">
              <div><h3>{t("control.overviewTitle")}</h3><span>{t("control.overviewDescription")}</span></div>
              <ShieldCheck size={17} />
            </div>

            <div className="contractAssurance">
              <span><Check size={16} /></span>
              <div><strong>{t("control.governedTitle")}</strong><p>{t("control.governedDescription")}</p></div>
            </div>

            <div className="subsectionLabel">{t("control.capabilitiesTitle")}</div>
            <ul className="capabilityList">
              {contract.effects.map((effect) => (
                <li key={effect}><Check size={13} /><span>{effectLabel(effect, t)}</span></li>
              ))}
            </ul>

            <div className="subsectionLabel policyLabel">{t("control.budgetTitle")}</div>
            <div className="controlBudgetGrid">
              <div><CircleGauge size={15} /><span>{t("control.maxSteps")}</span><strong>{contract.budget?.max_steps ?? 0}</strong></div>
              <div><Gauge size={15} /><span>{t("control.maxTools")}</span><strong>{contract.budget?.max_tool_calls ?? 0}</strong></div>
              <div><ShieldCheck size={15} /><span>{t("control.maxMinutes")}</span><strong>{Math.ceil((contract.budget?.max_wall_time_seconds ?? 0) / 60)}</strong></div>
            </div>

            <details className="policyDisclosure">
              <summary>{t("control.policyDetails", { count: contract.policies.length })}</summary>
              <ul>
                {contract.policies.map((policy) => (
                  <li key={policy.name}>
                    <span>{policy.name.split("_").join(" ")}</span>
                    <strong>{translateKnownText(locale, policy.value)}</strong>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}

        {activeView === "changes" ? (
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

        {activeView === "context" ? <ContextPanel context={context} busy={contextBusy} onCompact={onCompactContext} /> : null}
        {activeView === "memory" ? <MemoryPanel memory={memory} busy={memoryBusy} onCreate={onCreateMemory} onUpdate={onUpdateMemory} onDelete={onDeleteMemory} /> : null}
        {activeView === "extensions" ? <ExtensionPanel extensions={extensions} busy={extensionsBusy} onSave={onSaveExtensions} /> : null}
        {activeView === "governance" ? <GovernancePanel governance={governance} busy={governanceBusy} onSave={onSaveGovernance} /> : null}
        {activeView === "trace" ? <TraceReplayPanel runId={runId} runStatus={runStatus} events={trace} /> : null}
      </div>
    </aside>
  );
}

function effectLabel(effect: string, t: (key: TranslationKey, values?: Record<string, string | number>) => string): string {
  const labels: Record<string, TranslationKey> = {
    "fs.read": "effect.fs.read",
    "fs.write": "effect.fs.write",
    "shell.exec": "effect.shell.exec",
    "test.run": "effect.test.run",
    "state.memory": "effect.state.memory",
    "mcp.call": "effect.mcp.call",
  };
  return labels[effect] ? t(labels[effect]) : effect;
}
