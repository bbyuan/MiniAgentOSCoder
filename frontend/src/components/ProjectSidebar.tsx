import { Boxes, CheckCircle2, CircleAlert, Clock3, FolderGit2, History, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import type { AgentPackDrift, HistoryRun, OpenProjectResponse } from "../api/client";
import { translateStatus, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface ProjectSidebarProps {
  project: OpenProjectResponse;
  runs: HistoryRun[];
  activeRunId?: string;
  newTaskDisabled: boolean;
  navigationLocked: boolean;
  loading: boolean;
  agentPackDrift?: AgentPackDrift;
  onNewTask: () => void;
  onChangeProject: () => void;
  onOpenRun: (runId: string) => void;
  onOpenHistory: () => void;
  onOpenAgentPack: () => void;
  onRefresh: () => void;
}

const agentPackBadgeLabels: Record<string, TranslationKey> = {
  stable: "sidebar.agentPack.stable",
  changed: "sidebar.agentPack.changed",
  empty: "sidebar.agentPack.empty",
  loading: "sidebar.agentPack.loading",
};

function RunIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={14} />;
  if (["failed", "interrupted"].includes(status)) return <CircleAlert size={14} />;
  if (["running", "waiting_approval", "testing", "repairing", "applying_patch"].includes(status)) {
    return <LoaderCircle className="spin" size={14} />;
  }
  return <Clock3 size={14} />;
}

export function ProjectSidebar({
  project,
  runs,
  activeRunId,
  newTaskDisabled,
  navigationLocked,
  loading,
  agentPackDrift,
  onNewTask,
  onChangeProject,
  onOpenRun,
  onOpenHistory,
  onOpenAgentPack,
  onRefresh,
}: ProjectSidebarProps) {
  const { locale, t } = usePreferences();
  const packState = agentPackDrift
    ? agentPackDrift.has_versions
      ? agentPackDrift.drift ? "changed" : "stable"
      : "empty"
    : "loading";

  return (
    <aside className="projectSidebar">
      <button className="sidebarProject" type="button" onClick={onChangeProject} disabled={navigationLocked} title={t(navigationLocked ? "sidebar.runningLocked" : "sidebar.changeProject")}>
        <span><FolderGit2 size={16} /></span>
        <span><strong>{basename(project.path)}</strong><small>{project.path}</small></span>
      </button>

      <button className="sidebarNewTask" type="button" onClick={onNewTask} disabled={newTaskDisabled} title={newTaskDisabled ? t("sidebar.runningLocked") : t("sidebar.newTask")}>
        <Plus size={16} />
        <span>{t("sidebar.newTask")}</span>
      </button>

      <div className="sidebarSectionHeader">
        <span>{t("sidebar.recentTasks")}</span>
        <button type="button" onClick={onRefresh} disabled={loading} title={t("history.refresh")} aria-label={t("history.refresh")}>
          <RefreshCw className={loading ? "spin" : ""} size={13} />
        </button>
      </div>

      <nav className="sidebarRuns" aria-label={t("sidebar.recentTasks")}>
        {runs.length ? runs.slice(0, 5).map((run) => (
          <button
            type="button"
            className={run.run_id === activeRunId ? "active" : ""}
            aria-current={run.run_id === activeRunId ? "page" : undefined}
            key={run.run_id}
            onClick={() => onOpenRun(run.run_id)}
          >
            <span className={`sidebarRunIcon tone-${run.status}`}><RunIcon status={run.status} /></span>
            <span className="sidebarRunCopy">
              <strong>{run.task}</strong>
              <small>{translateStatus(locale, run.status)} · {formatDate(run.updated_at, locale)}</small>
            </span>
          </button>
        )) : <p>{t("sidebar.noTasks")}</p>}
      </nav>

      <div className="sidebarUtilities">
        <button className="sidebarHistory" type="button" onClick={onOpenHistory}>
          <History size={15} />
          <span>{t("sidebar.allHistory")}</span>
        </button>
        <button className="sidebarAgentPack" type="button" onClick={onOpenAgentPack}>
          <Boxes size={15} />
          <span>{t("sidebar.agentPack")}</span>
          {packState === "changed" ? <small className={`sidebarAgentPackBadge state-${packState}`}>{t(agentPackBadgeLabels[packState])}</small> : null}
        </button>
      </div>
    </aside>
  );
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

function formatDate(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(date);
}
