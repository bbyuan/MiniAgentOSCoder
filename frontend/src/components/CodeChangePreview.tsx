import type { RunArtifacts } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { DiffReview } from "./DiffReview";

interface CodeChangePreviewProps {
  artifacts?: RunArtifacts;
  compact?: boolean;
}

export function CodeChangePreview({ artifacts, compact = false }: CodeChangePreviewProps) {
  const { locale, t } = usePreferences();
  const diff = artifacts?.diff_summary;
  const tests = artifacts?.test_summary;
  const preview = artifacts?.diff_preview;
  const content = preview?.content ?? "";

  if (!diff || (diff.files === 0 && !preview?.available)) {
    return null;
  }

  return (
    <DiffReview
      title={t("codeDiff.changedFiles", { count: diff.files })}
      subtitle={t("codeDiff.reviewHint")}
      patch={content}
      insertions={diff.insertions}
      deletions={diff.deletions}
      statusLabel={tests ? translateKnownText(locale, tests.status) : t("codeDiff.resultTitle")}
      emptyLabel={t("codeDiff.noPreview")}
      truncated={preview?.truncated}
      compact={compact}
      tone="applied"
    />
  );
}
