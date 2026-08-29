import { Activity, CheckCircle2, Clock3, Database, ShieldCheck, Sparkles } from "lucide-react";
import type { EvaluationSummary } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";


export function EvaluationOverview({ summary }: { summary: EvaluationSummary }) {
  const { locale, t } = usePreferences();
  if (summary.runs.total === 0) {
    return (
      <div className="evaluationOverview historyDetailContent">
        <div className="evaluationEmpty">
          <Activity size={25} />
          <strong>{t("evaluation.empty")}</strong>
          <span>{t("evaluation.emptyHint")}</span>
        </div>
      </div>
    );
  }

  const rateMetrics = [
    { label: t("evaluation.completionRate"), value: formatRate(summary.rates.completion), icon: CheckCircle2 },
    { label: t("evaluation.testPassRate"), value: formatRate(summary.rates.test_pass), icon: ShieldCheck },
    { label: t("evaluation.patchAcceptance"), value: formatRate(summary.rates.patch_acceptance), icon: Sparkles },
  ];
  const averageMetrics = [
    [t("evaluation.modelCalls"), formatNumber(summary.averages.model_calls)],
    [t("evaluation.toolCalls"), formatNumber(summary.averages.tool_calls)],
    [t("evaluation.tokens"), formatNumber(summary.averages.total_tokens)],
    [t("evaluation.duration"), formatDuration(summary.averages.duration_ms, t("history.notAvailable"))],
  ];
  const governance = [
    [t("evaluation.approvals"), summary.governance.approval_requests],
    [t("evaluation.guardBlocks"), summary.governance.guard_blocks],
    [t("evaluation.compactions"), summary.governance.context_compactions],
    [t("evaluation.resumes"), summary.governance.resumes],
  ];

  return (
    <div className="evaluationOverview historyDetailContent">
      <header className="evaluationHeader">
        <div><span className="eyebrow">{t("evaluation.eyebrow")}</span><h3>{t("evaluation.title")}</h3><p>{t("evaluation.description")}</p></div>
        <span className="evaluationPrivacy"><Database size={13} />{t("evaluation.localOnly")}</span>
      </header>
      <section className="evaluationRateGrid">
        {rateMetrics.map(({ label, value, icon: Icon }) => <div key={label}><Icon size={16} /><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <section className="evaluationSection">
        <div className="evaluationSectionHeading"><div><h4>{t("evaluation.runHealth")}</h4><p>{t("evaluation.runCount", { count: summary.runs.total })}</p></div><Clock3 size={16} /></div>
        <div className="evaluationStatusList">
          {Object.entries(summary.runs.status).map(([status, count]) => (
            <div key={status}><span>{translateKnownText(locale, status)}</span><div><i style={{ width: `${Math.max(4, count / Math.max(1, summary.runs.terminal) * 100)}%` }} /></div><strong>{count}</strong></div>
          ))}
        </div>
        <div className="evaluationAverageGrid">
          {averageMetrics.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>
      <section className="evaluationSection evaluationSplit">
        <div><h4>{t("evaluation.governance")}</h4><dl>{governance.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
        <div><h4>{t("evaluation.failures")}</h4>{summary.failures.length ? <ol>{summary.failures.map((failure) => <li key={failure.category}><span>{translateKnownText(locale, failure.category)}</span><strong>{failure.count}</strong></li>)}</ol> : <p>{t("evaluation.noFailures")}</p>}</div>
      </section>
      {summary.evidence.evidence_gaps ? <div className="evaluationEvidenceNote">{t("evaluation.evidenceGaps", { count: summary.evidence.evidence_gaps })}</div> : null}
    </div>
  );
}

function formatRate(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDuration(value: number | null, fallback: string): string {
  if (value === null) return fallback;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}
