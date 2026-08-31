import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Check,
  Clock3,
  FileText,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  daemonApi,
  type HistoryComparison,
  type EvaluationSummary,
  type HistoryProject,
  type HistoryRun,
  type HistoryRunDetail,
} from "../api/client";
import { translateKnownText, translateMode, translateStatus, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import { localizeRunReport } from "../reportLocalization";
import { CompletionEvidence } from "./CompletionEvidence";
import { EvaluationOverview } from "./EvaluationOverview";


interface RunCenterProps {
  open: boolean;
  initialRunId?: string;
  initialProjectId?: string;
  onResume: (runId: string) => Promise<void>;
  onContinue: (detail: HistoryRunDetail, task: string) => Promise<void>;
  onClose: () => void;
}

const statuses = ["", "planning", "running", "waiting_approval", "completed", "failed", "cancelled", "interrupted"];
const metricKeys: Record<string, TranslationKey> = {
  steps: "history.metric.steps",
  model_calls: "history.metric.modelCalls",
  tool_calls: "history.metric.toolCalls",
  input_tokens: "history.metric.inputTokens",
  output_tokens: "history.metric.outputTokens",
  total_tokens: "history.metric.totalTokens",
  applied_patches: "history.metric.patches",
  repair_attempts: "history.metric.repairs",
};

export function RunCenter({ open, initialRunId, initialProjectId, onResume, onContinue, onClose }: RunCenterProps) {
  const { locale, t } = usePreferences();
  const [projects, setProjects] = useState<HistoryProject[]>([]);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [total, setTotal] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [detail, setDetail] = useState<HistoryRunDetail>();
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<HistoryComparison>();
  const [evaluation, setEvaluation] = useState<EvaluationSummary>();
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string>();

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.project_id, basename(project.path)])),
    [projects],
  );

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId ?? "");
    void refresh(true, initialProjectId);
    if (initialRunId) void inspectRun(initialRunId);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, initialRunId, initialProjectId]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [open, projectId, status, query, includeArchived]);

  async function refresh(loadProjects = false, projectOverride?: string) {
    setLoading(true);
    setError(undefined);
    try {
      const [projectResponse, runResponse] = await Promise.all([
        loadProjects ? daemonApi.getHistoryProjects() : Promise.resolve(undefined),
        daemonApi.getHistoryRuns({
          project_id: projectOverride ?? (projectId || undefined),
          status: status || undefined,
          query: query.trim() || undefined,
          include_archived: includeArchived,
        }),
      ]);
      if (projectResponse) setProjects(projectResponse.projects);
      setRuns(runResponse.runs);
      setTotal(runResponse.total);
      if (detail && !runResponse.runs.some((run) => run.run_id === detail.run.run_id)) {
        setDetail(undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("history.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    void refresh();
  }

  async function inspectRun(runId: string) {
    setDetailLoading(true);
    setComparison(undefined);
    setEvaluationOpen(false);
    setError(undefined);
    try {
      setDetail(await daemonApi.getHistoryRun(runId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("history.loadError"));
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleSelected(runId: string) {
    setComparison(undefined);
    setSelected((current) => {
      if (current.includes(runId)) return current.filter((item) => item !== runId);
      return current.length < 2 ? [...current, runId] : current;
    });
  }

  async function compareRuns() {
    if (selected.length !== 2) return;
    setDetailLoading(true);
    setError(undefined);
    try {
      setComparison(await daemonApi.compareHistoryRuns(selected as [string, string]));
      setDetail(undefined);
      setEvaluationOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("history.compareError"));
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleArchive() {
    if (!detail) return;
    setDetailLoading(true);
    try {
      const archived = !detail.run.archived;
      await daemonApi.archiveHistoryRun(detail.run.run_id, archived);
      setDetail({ ...detail, run: { ...detail.run, archived } });
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("history.archiveError"));
    } finally {
      setDetailLoading(false);
    }
  }

  async function resumeRun() {
    if (!detail) return;
    setDetailLoading(true);
    setError(undefined);
    try {
      await onResume(detail.run.run_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("history.resumeError"));
    } finally {
      setDetailLoading(false);
    }
  }

  async function showEvaluation() {
    setDetailLoading(true);
    setError(undefined);
    setDetail(undefined);
    setComparison(undefined);
    setEvaluationOpen(true);
    try {
      setEvaluation(await daemonApi.getEvaluationSummary(projectId || undefined));
    } catch (caught) {
      setEvaluation(undefined);
      setError(caught instanceof Error ? caught.message : t("evaluation.loadError"));
    } finally {
      setDetailLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="runCenterBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="runCenter" role="dialog" aria-modal="true" aria-labelledby="run-center-title">
        <header className="runCenterHeader">
          <div>
            <span className="eyebrow">{t("history.eyebrow")}</span>
            <h2 id="run-center-title">{t("history.title")}</h2>
          </div>
          <div className="runCenterHeaderActions">
            <span>{t("history.total", { count: total })}</span>
            <button className={`historyInsightsButton ${evaluationOpen ? "active" : ""}`} type="button" onClick={() => void showEvaluation()}>
              <BarChart3 size={15} />{t("evaluation.action")}
            </button>
            <button className="iconButton" type="button" title={t("history.refresh")} aria-label={t("history.refresh")} onClick={() => void refresh(true)}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
            <button className="iconButton" type="button" title={t("history.close")} aria-label={t("history.close")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="runCenterBody">
          <aside className="historyFilters">
            <form onSubmit={submitFilters}>
              <label>
                <span>{t("history.search")}</span>
                <div className="historySearch">
                  <Search size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("history.searchPlaceholder")} />
                </div>
              </label>
              <label>
                <span>{t("history.project")}</span>
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">{t("history.allProjects")}</option>
                  {projects.map((project) => <option key={project.project_id} value={project.project_id}>{basename(project.path)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("history.status")}</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {statuses.map((item) => <option key={item || "all"} value={item}>{item ? translateStatus(locale, item) : t("history.allStatuses")}</option>)}
                </select>
              </label>
              <label className="historyCheckbox">
                <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
                <span>{t("history.showArchived")}</span>
              </label>
              <button className="historyFilterButton" type="submit" disabled={loading}>
                <Search size={15} />{t("history.applyFilters")}
              </button>
            </form>

            <div className="historyCompareControl">
              <div>
                <strong>{t("history.compare")}</strong>
                <span>{t("history.selected", { count: selected.length })}</span>
              </div>
              <button type="button" onClick={() => void compareRuns()} disabled={selected.length !== 2}>
                <GitCompareArrows size={15} />{t("history.compareAction")}
              </button>
              {selected.length ? <button className="historyClearButton" type="button" onClick={() => { setSelected([]); setComparison(undefined); }}>{t("history.clearSelection")}</button> : null}
            </div>
          </aside>

          <div className="historyRunList" aria-busy={loading}>
            {error ? <div className="historyError">{error}</div> : null}
            {!loading && runs.length === 0 ? (
              <div className="historyEmpty"><Clock3 size={24} /><strong>{t("history.empty")}</strong><span>{t("history.emptyHint")}</span></div>
            ) : null}
            {runs.map((run) => (
              <article key={run.run_id} className={`historyRunRow ${detail?.run.run_id === run.run_id ? "active" : ""}`} onClick={() => void inspectRun(run.run_id)}>
                <label className="runCompareCheck" title={t("history.selectCompare")} onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(run.run_id)} disabled={!selected.includes(run.run_id) && selected.length === 2} onChange={() => toggleSelected(run.run_id)} />
                  <span>{selected.includes(run.run_id) ? <Check size={12} /> : null}</span>
                </label>
                <div className="historyRunCopy">
                  <div className="historyRunTitle"><strong>{run.task}</strong>{run.archived ? <Archive size={13} /> : null}</div>
                  <div className="historyRunMeta"><span>{projectNames.get(run.project_id) ?? basename(run.project_path)}</span><span>{translateMode(locale, run.mode)}</span><span>{formatDate(run.updated_at, locale)}</span></div>
                  <div className="historyRunSignals"><span className={`historyStatus tone-${run.status}`}>{translateStatus(locale, run.status)}</span><span>{run.total_tokens.toLocaleString()} tokens</span><span>{run.tool_calls} {t("history.toolsShort")}</span></div>
                </div>
              </article>
            ))}
          </div>

          <div className="historyDetail" aria-busy={detailLoading}>
            {evaluationOpen && evaluation ? <EvaluationOverview summary={evaluation} /> : comparison ? <ComparisonView comparison={comparison} onBack={() => setComparison(undefined)} /> : detail ? (
              <RunDetail
                detail={detail}
                busy={detailLoading}
                onArchive={() => void toggleArchive()}
                onResume={() => void resumeRun()}
                onContinue={onContinue}
                onBack={() => setDetail(undefined)}
              />
            ) : !evaluationOpen ? (
              <div className="historyEmpty historyDetailEmpty"><FileText size={25} /><strong>{t("history.chooseRun")}</strong><span>{t("history.chooseRunHint")}</span></div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function RunDetail({
  detail,
  busy,
  onArchive,
  onResume,
  onContinue,
  onBack,
}: {
  detail: HistoryRunDetail;
  busy: boolean;
  onArchive: () => void;
  onResume: () => void;
  onContinue: (detail: HistoryRunDetail, task: string) => Promise<void>;
  onBack: () => void;
}) {
  const { locale, t } = usePreferences();
  const [followUp, setFollowUp] = useState("");
  const { run } = detail;
  const continueEligible = ["completed", "failed", "cancelled", "interrupted"].includes(run.status);
  const resumeEligible = ["interrupted", "failed", "cancelled"].includes(run.status);
  async function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    const nextTask = followUp.trim();
    if (!nextTask) return;
    await onContinue(detail, nextTask);
    setFollowUp("");
  }

  return (
    <div className="historyDetailContent">
      <header className="historyDetailHeader">
        <button className="iconButton historyBackButton" type="button" onClick={onBack} title={t("history.back")} aria-label={t("history.back")}><ArrowLeft size={17} /></button>
        <div><span className={`historyStatus tone-${run.status}`}>{translateStatus(locale, run.status)}</span><h3>{run.task}</h3><p>{basename(run.project_path)} · {translateMode(locale, run.mode)} · {formatDate(run.created_at, locale)}</p></div>
        <button className="iconButton" type="button" onClick={onArchive} title={run.archived ? t("history.restore") : t("history.archive")} aria-label={run.archived ? t("history.restore") : t("history.archive")}>
          {run.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
        </button>
      </header>
      {continueEligible ? (
        <section className="historyContinueBand">
          <div>
            <strong>{t("history.continueTitle")}</strong>
            <span>{t("history.continueDescription")}</span>
          </div>
          <form onSubmit={(event) => void submitFollowUp(event)}>
            <textarea
              rows={3}
              value={followUp}
              placeholder={t("history.continuePlaceholder")}
              onChange={(event) => setFollowUp(event.target.value)}
            />
            <button type="submit" disabled={busy || !followUp.trim()}>
              <ArrowRight size={15} />
              {t(busy ? "history.continuing" : "history.continueAction")}
            </button>
          </form>
        </section>
      ) : null}
      {resumeEligible ? (
        <section className={`historyResumeBand ${detail.resume.available ? "" : "unavailable"}`}>
          <div>
            <strong>{t(detail.resume.available ? "history.resumeTitle" : "history.resumeUnavailableTitle")}</strong>
            <span>{t(detail.resume.available ? "history.resumeDescription" : "history.resumeUnavailableDescription")}</span>
          </div>
          {detail.resume.available ? (
            <button type="button" disabled={busy} onClick={onResume}>
              <RotateCcw size={15} className={busy ? "spin" : ""} />
              {t(busy ? "history.resuming" : "history.resumeAction")}
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="historyMetricGrid">
        <Metric label={t("history.metric.steps")} value={run.steps} />
        <Metric label={t("history.metric.modelCalls")} value={run.model_calls} />
        <Metric label={t("history.metric.toolCalls")} value={run.tool_calls} />
        <Metric label={t("history.metric.totalTokens")} value={run.total_tokens.toLocaleString()} />
        <Metric label={t("history.metric.patches")} value={run.applied_patches} />
        <Metric label={t("history.metric.duration")} value={formatDuration(run.duration_ms, t("history.notAvailable"))} />
      </div>
      <DetailSection title={t("history.result")}>
        <p>{run.final_message || run.termination_reason || t("history.noResult")}</p>
        <div className="historyEvidenceLine"><span>{t("history.tests")}</span><strong>{translateKnownText(locale, run.test_status)}</strong><span>{t("history.traceEvents")}</span><strong>{detail.trace.event_count}</strong></div>
      </DetailSection>
      <section className="historyDetailSection">
        <CompletionEvidence assessment={run.completion} />
      </section>
      <DetailSection title={t("history.changedFiles")}>
        {run.changed_files.length ? <ul className="historyFileList">{run.changed_files.map((file) => <li key={file}><code>{file}</code></li>)}</ul> : <p>{t("history.noChangedFiles")}</p>}
      </DetailSection>
      <DetailSection title={t("history.report")}>
        {detail.report.available ? <pre className="historyReport">{localizeRunReport(detail.report.content, locale)}</pre> : <p>{t("history.reportUnavailable")}</p>}
        {detail.report.truncated ? <span className="historyNote">{t("history.reportTruncated")}</span> : null}
      </DetailSection>
      <DetailSection title={t("history.recentTrace")}>
        {detail.trace.recent_events.length ? <ol className="historyTrace">{detail.trace.recent_events.map((event, index) => <li key={`${event.time}-${index}`}><time>{formatTime(event.time)}</time><code>{translateKnownText(locale, event.event)}</code></li>)}</ol> : <p>{t("history.traceUnavailable")}</p>}
      </DetailSection>
    </div>
  );
}

function ComparisonView({ comparison, onBack }: { comparison: HistoryComparison; onBack: () => void }) {
  const { locale, t } = usePreferences();
  const [left, right] = comparison.runs;
  return (
    <div className="historyDetailContent">
      <header className="comparisonHeader"><button className="iconButton historyBackButton" type="button" onClick={onBack} title={t("history.back")} aria-label={t("history.back")}><ArrowLeft size={17} /></button><div><span className="eyebrow">{t("history.comparison")}</span><h3>{t("history.comparisonTitle")}</h3></div></header>
      <div className="comparisonRuns"><div><span>{t("history.baseline")}</span><strong>{left.task}</strong><code>{left.run_id.slice(-8)}</code></div><div><span>{t("history.candidate")}</span><strong>{right.task}</strong><code>{right.run_id.slice(-8)}</code></div></div>
      <div className="comparisonTable">
        <div className="comparisonRow comparisonLabels"><span>{t("history.metric")}</span><span>{t("history.baseline")}</span><span>{t("history.candidate")}</span><span>{t("history.delta")}</span></div>
        {comparison.metrics.map((metric) => <div className="comparisonRow" key={metric.key}><strong>{t(metricKeys[metric.key] ?? "history.metric")}</strong><span>{metric.left.toLocaleString()}</span><span>{metric.right.toLocaleString()}</span><span className={metric.delta === 0 ? "neutral" : metric.delta < 0 ? "lower" : "higher"}>{metric.delta > 0 ? "+" : ""}{metric.delta.toLocaleString()}</span></div>)}
      </div>
      <div className="comparisonOutcome"><div><span>{t("history.tests")}</span><strong>{translateKnownText(locale, left.test_status)}</strong><span>{t("history.files")}</span><strong>{left.changed_files.length}</strong></div><div><span>{t("history.tests")}</span><strong>{translateKnownText(locale, right.test_status)}</strong><span>{t("history.files")}</span><strong>{right.changed_files.length}</strong></div></div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="historyDetailSection"><h4>{title}</h4>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function formatDate(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(value: number | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}
