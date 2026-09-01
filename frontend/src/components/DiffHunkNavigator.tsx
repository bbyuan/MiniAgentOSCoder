import { ChevronDown, ChevronUp } from "lucide-react";
import { usePreferences } from "../preferences";

interface DiffHunkNavigatorProps {
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function DiffHunkNavigator({ current, total, onPrevious, onNext }: DiffHunkNavigatorProps) {
  const { t } = usePreferences();
  if (total <= 0) return null;

  return (
    <em className="workspaceDiffHunks">
      <button
        type="button"
        disabled={current <= 1}
        onClick={onPrevious}
        title={t("workspaceFiles.previousHunk")}
        aria-label={t("workspaceFiles.previousHunk")}
      >
        <ChevronUp size={14} />
      </button>
      {t("workspaceFiles.hunkPosition", { current, total })}
      <button
        type="button"
        disabled={current >= total}
        onClick={onNext}
        title={t("workspaceFiles.nextHunk")}
        aria-label={t("workspaceFiles.nextHunk")}
      >
        <ChevronDown size={14} />
      </button>
    </em>
  );
}
