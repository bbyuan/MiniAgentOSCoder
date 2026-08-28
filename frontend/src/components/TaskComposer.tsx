import { ArrowUp, FolderOpen, Play, SlidersHorizontal, Square, X } from "lucide-react";
import type { RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface TaskComposerProps {
  workspacePath: string;
  task: string;
  mode: RunMode;
  disabled?: boolean;
  running?: boolean;
  prepared?: boolean;
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
  prepared,
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
          disabled={running || prepared}
          onChange={(event) => onWorkspacePathChange(event.target.value)}
        />
      </label>
      <textarea
        aria-label={t("composer.taskPlaceholder")}
        placeholder={t("composer.taskPlaceholder")}
        value={task}
        disabled={running || prepared}
        onChange={(event) => onTaskChange(event.target.value)}
        rows={4}
      />
      <div className="composerFooter">
        <label className="modeControl">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span className="srOnly">{t("composer.mode")}</span>
          <select
            value={mode}
            disabled={running || prepared}
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
        ) : prepared ? (
          <div className="composerPreparedActions">
            <button
              type="button"
              className="iconButton"
              aria-label={t("composer.discard")}
              title={t("composer.discard")}
              disabled={disabled}
              onClick={onCancel}
            >
              <X size={15} />
            </button>
            <button
              type="button"
              className="primaryAction"
              aria-label={t("composer.launch")}
              title={t("composer.launch")}
              disabled={disabled}
              onClick={onSubmit}
            >
              <Play size={16} fill="currentColor" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="primaryAction"
            aria-label={t("composer.prepare")}
            title={t("composer.prepare")}
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
