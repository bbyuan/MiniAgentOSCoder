import { useState } from "react";
import { FileCode2, FlaskConical, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";
import type { ApprovalRequest } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { PlanPanel, type PlanItem } from "./PlanPanel";
import { ApprovalPanel } from "./ApprovalPanel";

type InspectorTab = "overview" | "context" | "trace";

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
  trace: string[];
  runId?: string;
  approval: ApprovalRequest | null;
  approvalBusy: boolean;
  onApprove: () => void;
  onDeny: (reason: string) => void;
}

export function RuntimePanels({
  plan,
  contract,
  context,
  diff,
  tests,
  trace,
  runId,
  approval,
  approvalBusy,
  onApprove,
  onDeny,
}: RuntimePanelsProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const { locale, t } = usePreferences();
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "overview", label: t("inspector.overview") },
    { id: "context", label: t("inspector.context") },
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

        {activeTab === "trace" ? (
          <section className="inspectorSection traceSection">
            <div className="sectionHeader">
              <h3>{t("trace.title")}</h3>
              <Terminal size={15} />
            </div>
            {trace.length === 0 ? <p className="emptyText">{t("trace.empty")}</p> : (
              <div className="traceList">
                {trace.map((event, index) => (
                  <div key={`${event}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <code>{translateKnownText(locale, event)}</code>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
