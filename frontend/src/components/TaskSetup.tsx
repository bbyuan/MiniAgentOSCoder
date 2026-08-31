import { AlertTriangle, ArrowUp, CheckCircle2, MessageSquareText, SlidersHorizontal, Sparkles, Wrench } from "lucide-react";
import type { ModelProviderStatus, RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface TaskSetupProps {
  task: string;
  mode: RunMode;
  busy: boolean;
  model?: ModelProviderStatus;
  onTaskChange: (task: string) => void;
  onModeChange: (mode: RunMode) => void;
  onStart: () => void;
  onReviewSettings: () => void;
  onConfigureModel: () => void;
}

const taskModes: RunMode[] = ["Bugfix", "Feature", "Review", "Spec", "Chat"];

const examples: Record<RunMode, "task.example.bugfix" | "task.example.feature" | "task.example.review" | "task.example.spec" | "task.example.chat"> = {
  Bugfix: "task.example.bugfix",
  Feature: "task.example.feature",
  Review: "task.example.review",
  Spec: "task.example.spec",
  Chat: "task.example.chat",
};

export function TaskSetup({
  task,
  mode,
  busy,
  model,
  onTaskChange,
  onModeChange,
  onStart,
  onReviewSettings,
  onConfigureModel,
}: TaskSetupProps) {
  const { locale, t } = usePreferences();
  const modelReady = model?.configured === true;
  const modelState = modelReady ? "ready" : model ? "blocked" : "checking";

  return (
    <section className="taskSetup productTaskSetup" aria-labelledby="task-setup-title">
      <header className="taskIntro productTaskIntro">
        <h1 id="task-setup-title">{t("task.title")}</h1>
        <p>{t("task.description")}</p>
      </header>

      {!task.trim() ? (
        <div className="taskQuickStarts" aria-label={t("task.quickStart")}>
          <button type="button" onClick={() => { onModeChange("Bugfix"); onTaskChange(t(examples.Bugfix)); }}>
            <Wrench size={15} /><span>{t("task.quickFix")}</span>
          </button>
          <button type="button" onClick={() => { onModeChange("Review"); onTaskChange(t(examples.Review)); }}>
            <CheckCircle2 size={15} /><span>{t("task.quickReview")}</span>
          </button>
          <button type="button" onClick={() => { onModeChange("Chat"); onTaskChange(t(examples.Chat)); }}>
            <MessageSquareText size={15} /><span>{t("task.quickExplore")}</span>
          </button>
        </div>
      ) : null}

      {!modelReady ? (
        <div className={`taskModelGate state-${modelState}`}>
          <span>{modelState === "checking" ? <Sparkles size={16} /> : <AlertTriangle size={16} />}</span>
          <div><strong>{t(modelState === "checking" ? "task.startChecking" : "task.startBlocked")}</strong><small>{t(modelState === "checking" ? "task.startCheckingHint" : "task.startBlockedHint")}</small></div>
          {modelState === "blocked" ? <button type="button" onClick={onConfigureModel}>{t("task.configureModel")}</button> : null}
        </div>
      ) : null}

      <div className="taskComposerProduct">
        <label className="srOnly" htmlFor="task-description">{t("task.instruction")}</label>
        <textarea
          id="task-description"
          value={task}
          disabled={busy}
          rows={8}
          placeholder={t("task.placeholder")}
          onChange={(event) => onTaskChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && task.trim() && modelReady && !busy) {
              event.preventDefault();
              onStart();
            }
          }}
        />

        <div className="taskComposerToolbar">
          <div className="taskComposerOptions">
            <label className="taskTypeSelect">
              <span>{t("task.type")}</span>
              <select
                value={mode}
                disabled={busy}
                aria-label={t("task.type")}
                onChange={(event) => onModeChange(event.target.value as RunMode)}
              >
                {taskModes.map((item) => <option value={item} key={item}>{translateMode(locale, item)}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="exampleFillAction"
              disabled={busy}
              onClick={() => onTaskChange(t(examples[mode]))}
              title={t("task.tryExample")}
            >
              <Sparkles size={15} />
              <span>{t("task.tryExample")}</span>
            </button>
          </div>

          <div className="taskPrimaryActions">
            {task.trim() ? (
              <button
                type="button"
                className="runSettingsAction"
                disabled={busy || !modelReady}
                onClick={onReviewSettings}
              >
                <SlidersHorizontal size={16} />{t("task.reviewSettings")}
              </button>
            ) : null}
            <button
              type="button"
              className="startTaskAction"
              disabled={busy || !task.trim() || !modelReady}
              onClick={onStart}
            >
              {busy ? t("task.starting") : t("task.start")}
              <ArrowUp size={17} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
