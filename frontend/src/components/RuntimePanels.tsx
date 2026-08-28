import { useState } from "react";
import { FileCode2, FlaskConical, GitPullRequest, ShieldCheck } from "lucide-react";
import type { ApprovalRequest, RecoveryResponse, RunReportResponse, TraceEvent } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { PlanPanel, type PlanItem } from "./PlanPanel";
import { ApprovalPanel } from "./ApprovalPanel";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";

type InspectorTab = "overview" | "context" | "recovery" | "report" | "trace";

interface RuntimePanelsProps {
  plan: PlanItem[];
  contract: {
    effects: string[];
    policies: string[];
  };
  context: Array<{ path: string; reason: string; tokens: number }>;
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
}

export function RuntimePanels({
  plan,
  contract,
  context,
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
}: RuntimePanelsProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const { locale, t } = usePreferences();
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "overview", label: t("inspector.overview") },
    { id: "context", label: t("inspector.context") },
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
          <section className="inspectorSection contextSection">
            <div className="sectionHeader">
              <h3>{t("context.title")}</h3>
              <FileCode2 size={15} />
            </div>
            {context.length === 0 ? <p className="emptyText">{t("context.empty")}</p> : (
              <div className="contextList">
                {context.map((item) => (
                  <article key={`${item.path}-${item.reason}`}>
                    <strong title={item.path}>{item.path}</strong>
                    <span>{translateKnownText(locale, item.reason)}</span>
                    <small>{t("context.tokens", { count: item.tokens })}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
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
