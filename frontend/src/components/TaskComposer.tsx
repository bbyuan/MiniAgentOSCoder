import { ArrowUp, SlidersHorizontal } from "lucide-react";
import type { RunMode } from "../api/client";

interface TaskComposerProps {
  workspacePath: string;
  task: string;
  mode: RunMode;
  disabled?: boolean;
  onWorkspacePathChange: (value: string) => void;
  onTaskChange: (value: string) => void;
  onModeChange: (value: RunMode) => void;
  onSubmit: () => void;
}

const modes: RunMode[] = ["Bugfix", "Feature", "Review", "Spec", "Chat"];

export function TaskComposer({
  workspacePath,
  task,
  mode,
  disabled,
  onWorkspacePathChange,
  onTaskChange,
  onModeChange,
  onSubmit,
}: TaskComposerProps) {
  return (
    <section className="composer">
      <input
        aria-label="Workspace path"
        className="pathInput"
        placeholder="/absolute/path/to/project"
        value={workspacePath}
        onChange={(event) => onWorkspacePathChange(event.target.value)}
      />
      <textarea
        aria-label="Task"
        placeholder="Ask the agent to fix a bug, implement a spec, or review a change..."
        value={task}
        onChange={(event) => onTaskChange(event.target.value)}
        rows={4}
      />
      <div className="composerFooter">
        <label className="softButton">
          <SlidersHorizontal size={16} />
          <select value={mode} onChange={(event) => onModeChange(event.target.value as RunMode)}>
            {modes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="sendButton" aria-label="Start run" disabled={disabled} onClick={onSubmit}>
          <ArrowUp size={18} />
        </button>
      </div>
    </section>
  );
}
