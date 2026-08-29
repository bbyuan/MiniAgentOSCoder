import { ArrowRight, Clock3, FolderOpen, HardDrive, LoaderCircle } from "lucide-react";
import type { HistoryProject } from "../api/client";
import { usePreferences } from "../preferences";

interface ProjectLauncherProps {
  desktop: boolean;
  path: string;
  recentProjects: HistoryProject[];
  busy: boolean;
  onPathChange: (path: string) => void;
  onBrowse: () => void;
  onOpen: (path: string) => void;
}

export function ProjectLauncher({
  desktop,
  path,
  recentProjects,
  busy,
  onPathChange,
  onBrowse,
  onOpen,
}: ProjectLauncherProps) {
  const { locale, t } = usePreferences();

  return (
    <section className="projectLauncher" aria-labelledby="project-launcher-title">
      <div className="launcherIntro">
        <span className="stageEyebrow">{t("launcher.eyebrow")}</span>
        <h1 id="project-launcher-title">{t("launcher.title")}</h1>
        <p>{t("launcher.description")}</p>
      </div>

      <button className="openProjectAction" type="button" onClick={onBrowse} disabled={busy}>
        <span className="openProjectIcon"><FolderOpen size={21} /></span>
        <span>
          <strong>{busy ? t("launcher.opening") : t("launcher.open")}</strong>
          <small>{desktop ? t("launcher.openHint") : t("launcher.browserHint")}</small>
        </span>
        {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
      </button>

      <div className="pathFallback">
        <div className="pathDivider"><span>{desktop ? t("launcher.orPath") : t("launcher.browserPath")}</span></div>
        <div className="pathEntry">
          <HardDrive size={16} aria-hidden="true" />
          <input
            value={path}
            placeholder={t("launcher.pathPlaceholder")}
            aria-label={t("launcher.pathPlaceholder")}
            disabled={busy}
            onChange={(event) => onPathChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && path.trim()) onOpen(path.trim());
            }}
          />
          <button type="button" disabled={busy || !path.trim()} onClick={() => onOpen(path.trim())}>
            {t("launcher.openPath")}
          </button>
        </div>
      </div>

      <div className="recentProjects">
        <div className="recentHeading">
          <div><Clock3 size={15} /><h2>{t("launcher.recent")}</h2></div>
          <span>{t("launcher.localOnly")}</span>
        </div>
        {recentProjects.length === 0 ? (
          <p className="recentEmpty">{t("launcher.noRecent")}</p>
        ) : (
          <div className="recentProjectList">
            {recentProjects.slice(0, 5).map((project) => (
              <button
                type="button"
                key={project.project_id}
                disabled={busy}
                onClick={() => onOpen(project.path)}
              >
                <span className="recentProjectMark"><FolderOpen size={16} /></span>
                <span className="recentProjectCopy">
                  <strong>{basename(project.path)}</strong>
                  <small>{project.path}</small>
                </span>
                <span className="recentProjectMeta">
                  {t("launcher.runCount", { count: project.run_count })}
                  <small>{formatDate(project.last_opened_at, locale)}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

function formatDate(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
