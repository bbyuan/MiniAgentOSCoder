import { CheckCircle2, ChevronDown, FileDiff, FlaskConical } from "lucide-react";
import type { RunArtifacts } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

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
  const lines = content.split("\n").slice(0, compact ? 80 : 140);
  const files = extractChangedFiles(content);

  if (!diff || (diff.files === 0 && !preview?.available)) {
    return null;
  }

  return (
    <section className={`codeChangePreview ${compact ? "compact" : ""}`} aria-label={t("codeDiff.title")}>
      <header>
        <div>
          <FileDiff size={16} />
          <strong>{t("codeDiff.changedFiles", { count: diff.files })}</strong>
        </div>
        <span>
          <b className="positive">+{diff.insertions}</b>
          <b className="negative">-{diff.deletions}</b>
        </span>
      </header>

      <div className="codeChangeResultBar">
        <span>
          <CheckCircle2 size={14} />
          {t("codeDiff.resultTitle")}
        </span>
        {tests ? (
          <span>
            <FlaskConical size={14} />
            {translateKnownText(locale, tests.status)}
          </span>
        ) : null}
      </div>

      {files.length ? (
        <div className="codeChangeFiles">
          {files.map((file) => <code key={file}>{file}</code>)}
        </div>
      ) : null}

      {preview?.available && lines.length ? (
        <details className="codeDiffBlock">
          <summary>
            <span>{t("codeDiff.preview")}</span>
            <ChevronDown size={14} />
          </summary>
          <pre>
            {lines.map((line, index) => (
              <code className={`line-${classifyDiffLine(line)}`} key={`${index}-${line}`}>
                {line || " "}
              </code>
            ))}
          </pre>
          {preview.truncated ? <small>{t("codeDiff.truncated")}</small> : null}
        </details>
      ) : (
        <p>{t("codeDiff.noPreview")}</p>
      )}
    </section>
  );
}

function extractChangedFiles(content: string): string[] {
  const files = new Set<string>();
  for (const line of content.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const file = line.replace(/^\+\+\+\s+/, "").replace(/^b\//, "").trim();
    if (file && file !== "/dev/null") files.add(file);
  }
  return [...files].slice(0, 8);
}

function classifyDiffLine(line: string): "add" | "delete" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("# ")) {
    return "meta";
  }
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "delete";
  return "context";
}
