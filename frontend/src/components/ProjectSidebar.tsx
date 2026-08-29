import { CheckCircle2, CircleAlert, Clock3, FolderGit2, History, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import type { HistoryRun, OpenProjectResponse } from "../api/client";
import { translateStatus } from "../i18n";
import { usePreferences } from "../preferences";

interface ProjectSidebarProps {
  project: OpenProjectResponse;
  runs: HistoryRun[];
  activeRunId?: string;
  newTaskDisabled: boolean;
  navigationLocked: boolean;
  loading: boolean;
  onNewTask: () => void;
  onChangeProject: () => void;
  onOpenRun: (runId: string) => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
}

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
  onNewTask,
  onChangeProject,
  onOpenRun,
  onOpenHistory,
  onRefresh,
}: ProjectSidebarProps) {
  const { locale, t } = usePreferences();

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
        {runs.length ? runs.slice(0, 8).map((run) => (
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

      <button className="sidebarHistory" type="button" onClick={onOpenHistory}>
        <History size={15} />
        <span>{t("sidebar.allHistory")}</span>
      </button>
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
