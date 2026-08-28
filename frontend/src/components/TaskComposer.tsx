import { ArrowUp, FolderOpen, SlidersHorizontal, Square } from "lucide-react";
import type { RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface TaskComposerProps {
  workspacePath: string;
  task: string;
  mode: RunMode;
  disabled?: boolean;
  running?: boolean;
  onWorkspacePathChange: (value: string) => void;
  onTaskChange: (value: string) => void;
  onModeChange: (value: RunMode) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const modes: RunMode[] = ["Bugfix", "Feature", "Review", "Spec", "Chat"];

export function TaskComposer({
  workspacePath,
  task,
  mode,
  disabled,
  running,
  onWorkspacePathChange,
  onTaskChange,
  onModeChange,
  onSubmit,
  onCancel,
}: TaskComposerProps) {
  const { locale, t } = usePreferences();

  return (
    <section className="composer">
      <label className="workspaceField">
        <FolderOpen size={15} aria-hidden="true" />
        <span>{t("composer.workspace")}</span>
        <input
          aria-label={t("composer.workspace")}
          placeholder={t("composer.workspacePlaceholder")}
          value={workspacePath}
          disabled={running}
          onChange={(event) => onWorkspacePathChange(event.target.value)}
        />
      </label>
      <textarea
        aria-label={t("composer.taskPlaceholder")}
        placeholder={t("composer.taskPlaceholder")}
        value={task}
        disabled={running}
        onChange={(event) => onTaskChange(event.target.value)}
        rows={4}
      />
      <div className="composerFooter">
        <label className="modeControl">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span className="srOnly">{t("composer.mode")}</span>
          <select
            value={mode}
            disabled={running}
            aria-label={t("composer.mode")}
            onChange={(event) => onModeChange(event.target.value as RunMode)}
          >
            {modes.map((item) => (
              <option key={item} value={item}>
                {translateMode(locale, item)}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button
            type="button"
            className="primaryAction stopButton"
            aria-label={t("composer.cancel")}
            title={t("composer.cancel")}
            disabled={disabled}
            onClick={onCancel}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className="primaryAction"
            aria-label={t("composer.start")}
            title={t("composer.start")}
            disabled={disabled}
            onClick={onSubmit}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
