import { ArrowRight, Bug, FileSearch, KeyRound, Lightbulb, MessageSquare, Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModelProviderStatus, OpenProjectResponse, RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface TaskSetupProps {
  project: OpenProjectResponse;
  task: string;
  mode: RunMode;
  busy: boolean;
  model?: ModelProviderStatus;
  onTaskChange: (task: string) => void;
  onModeChange: (mode: RunMode) => void;
  onAnalyze: () => void;
  onChangeProject: () => void;
  onConfigureModel: () => void;
}

const taskModes: Array<{ mode: RunMode; icon: LucideIcon; description: "task.mode.bugfix" | "task.mode.feature" | "task.mode.review" | "task.mode.spec" | "task.mode.chat" }> = [
  { mode: "Bugfix", icon: Bug, description: "task.mode.bugfix" },
  { mode: "Feature", icon: Plus, description: "task.mode.feature" },
  { mode: "Review", icon: FileSearch, description: "task.mode.review" },
  { mode: "Spec", icon: Lightbulb, description: "task.mode.spec" },
  { mode: "Chat", icon: MessageSquare, description: "task.mode.chat" },
];

const examples: Record<RunMode, "task.example.bugfix" | "task.example.feature" | "task.example.review" | "task.example.spec" | "task.example.chat"> = {
  Bugfix: "task.example.bugfix",
  Feature: "task.example.feature",
  Review: "task.example.review",
  Spec: "task.example.spec",
  Chat: "task.example.chat",
};

export function TaskSetup({
  project,
  task,
  mode,
  busy,
  model,
  onTaskChange,
  onModeChange,
  onAnalyze,
  onChangeProject,
  onConfigureModel,
}: TaskSetupProps) {
  const { locale, t } = usePreferences();

  return (
    <section className="taskSetup" aria-labelledby="task-setup-title">
      <div className="activeProjectBar">
        <div>
          <span>{t("task.project")}</span>
          <strong>{basename(project.path)}</strong>
          <small>{project.path}</small>
        </div>
        <button type="button" onClick={onChangeProject}>{t("task.changeProject")}</button>
      </div>

      <header className="taskIntro">
        <span className="stageEyebrow">{t("task.eyebrow")}</span>
        <h1 id="task-setup-title">{t("task.title")}</h1>
        <p>{t("task.description")}</p>
      </header>

      {model && !model.configured ? (
        <div className="taskModelNotice">
          <KeyRound size={17} />
          <div><strong>{t("task.modelNeeded")}</strong><span>{t("task.modelNeededHint")}</span></div>
          <button type="button" onClick={onConfigureModel}>{t("task.configureModel")}</button>
        </div>
      ) : null}

      <div className="taskModeGroup" role="radiogroup" aria-label={t("composer.mode")}>
        {taskModes.map(({ mode: item, icon: Icon, description }) => (
          <button
            type="button"
            role="radio"
            aria-checked={mode === item}
            className={mode === item ? "active" : ""}
            key={item}
            disabled={busy}
            onClick={() => onModeChange(item)}
          >
            <Icon size={17} />
            <span>
              <strong>{translateMode(locale, item)}</strong>
              <small>{t(description)}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="taskComposerLarge">
        <label htmlFor="task-description">{t("task.instruction")}</label>
        <textarea
          id="task-description"
          value={task}
          disabled={busy}
          rows={7}
          placeholder={t("task.placeholder")}
          onChange={(event) => onTaskChange(event.target.value)}
        />
        <div className="taskExample">
          <Sparkles size={14} />
          <span>{t("task.tryExample")}</span>
          <button type="button" disabled={busy} onClick={() => onTaskChange(t(examples[mode]))}>
            {t(examples[mode])}
          </button>
        </div>
        <div className="taskSubmitRow">
          <p>{t("task.analyzeHint")}</p>
          <button className="textPrimaryAction" type="button" disabled={busy || !task.trim()} onClick={onAnalyze}>
            {busy ? t("task.analyzing") : t("task.analyze")}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div className="projectSignals" aria-label={t("task.detected") }>
        <span>{t("task.detected")}</span>
        {project.profile.languages.slice(0, 4).map((language) => <code key={language}>{language}</code>)}
        {project.profile.package_managers.slice(0, 3).map((manager) => <code key={manager}>{manager}</code>)}
        {project.profile.test_commands.length ? <small>{t("task.testCommands", { count: project.profile.test_commands.length })}</small> : null}
      </div>
    </section>
  );
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}
