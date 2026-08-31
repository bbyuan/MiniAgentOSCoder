import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, FileDiff } from "lucide-react";
import { usePreferences } from "../preferences";

export interface DiffReviewProps {
  title: string;
  subtitle?: string;
  patch?: string;
  changedFiles?: string[];
  insertions?: number;
  deletions?: number;
  statusLabel?: string;
  emptyLabel?: string;
  truncated?: boolean;
  compact?: boolean;
  tone?: "applied" | "pending" | "neutral";
  actions?: ReactNode;
}

export function DiffReview({
  title,
  subtitle,
  patch = "",
  changedFiles = [],
  insertions,
  deletions,
  statusLabel,
  emptyLabel,
  truncated = false,
  compact = false,
  tone = "neutral",
  actions,
}: DiffReviewProps) {
  const { t } = usePreferences();
  const parsedFiles = useMemo(() => buildDiffFiles(patch, changedFiles), [patch, changedFiles]);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const selectedFile = parsedFiles.find((file) => file.path === selectedPath) ?? parsedFiles[0];
  const totalAdditions = insertions ?? parsedFiles.reduce((total, file) => total + file.additions, 0);
  const totalDeletions = deletions ?? parsedFiles.reduce((total, file) => total + file.deletions, 0);

  useEffect(() => {
    setSelectedPath((current) => {
      if (parsedFiles.some((file) => file.path === current)) return current;
      return parsedFiles[0]?.path ?? "";
    });
  }, [parsedFiles]);

  if (!parsedFiles.length) {
    return (
      <section className={`diffReview tone-${tone} ${compact ? "compact" : ""}`}>
        <header>
          <div>
            <FileDiff size={17} />
            <div>
              <strong>{title}</strong>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          {statusLabel ? <span className="diffReviewStatus"><Check size={14} />{statusLabel}</span> : null}
        </header>
        <p className="diffReviewEmpty">{emptyLabel ?? t("codeDiff.noPreview")}</p>
        {actions ? <div className="diffReviewActions">{actions}</div> : null}
      </section>
    );
  }

  return (
    <section className={`diffReview tone-${tone} ${compact ? "compact" : ""}`}>
      <header>
        <div>
          <FileDiff size={17} />
          <div>
            <strong>{title}</strong>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <div className="diffReviewStats" aria-label={t("codeDiff.stats")}>
          {statusLabel ? <span className="diffReviewStatus"><Check size={14} />{statusLabel}</span> : null}
          <span>{t("diff.files", { count: parsedFiles.length })}</span>
          <b className="positive">+{totalAdditions}</b>
          <b className="negative">-{totalDeletions}</b>
        </div>
      </header>

      <div className="diffReviewBody">
        <nav className="diffReviewFileList" aria-label={t("codeDiff.fileList")}>
          {parsedFiles.map((file) => (
            <button
              type="button"
              className={file.path === selectedFile.path ? "active" : ""}
              onClick={() => setSelectedPath(file.path)}
              key={file.path}
            >
              <span>{file.path}</span>
              <em>
                {file.hasPatch ? (
                  <>
                    <b className="positive">+{file.additions}</b>
                    <b className="negative">-{file.deletions}</b>
                  </>
                ) : t("codeDiff.noFileDiff")}
              </em>
            </button>
          ))}
        </nav>

        <div className="diffReviewViewer">
          <div className="diffReviewViewerHeader">
            <strong>{selectedFile.path}</strong>
            {selectedFile.hasPatch ? (
              <span><b className="positive">+{selectedFile.additions}</b><b className="negative">-{selectedFile.deletions}</b></span>
            ) : null}
          </div>
          {selectedFile.hasPatch ? (
            <pre tabIndex={0}>
              {selectedFile.lines.map((line, index) => (
                <code className={`line-${classifyDiffLine(line)}`} key={`${selectedFile.path}-${index}-${line}`}>
                  {line || " "}
                </code>
              ))}
            </pre>
          ) : (
            <p>{t("codeDiff.noFilePreview")}</p>
          )}
        </div>
      </div>

      {truncated ? <small className="diffReviewTruncated">{t("codeDiff.truncated")}</small> : null}
      {actions ? <div className="diffReviewActions">{actions}</div> : null}
    </section>
  );
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  lines: string[];
  hasPatch: boolean;
}

export function buildDiffFiles(patch: string, changedFiles: string[] = []): DiffFile[] {
  const parsed = parseUnifiedDiff(patch);
  const byPath = new Map(parsed.map((file) => [file.path, file]));

  for (const file of changedFiles) {
    if (!file || byPath.has(file)) continue;
    byPath.set(file, {
      path: file,
      additions: 0,
      deletions: 0,
      lines: [],
      hasPatch: false,
    });
  }

  return [...byPath.values()];
}

export function parseUnifiedDiff(patch: string): DiffFile[] {
  const content = patch.trim();
  if (!content) return [];

  const chunks = content.split(/\n(?=diff --git )/g);
  return chunks.flatMap((chunk, index) => {
    const lines = chunk.split("\n");
    const path = diffPath(lines) ?? (chunks.length === 1 && index === 0 ? "patch.diff" : "");
    if (!path) return [];

    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }

    return [{
      path,
      additions,
      deletions,
      lines,
      hasPatch: true,
    }];
  });
}

function diffPath(lines: string[]): string | undefined {
  for (const line of lines) {
    const git = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (git) return git[2];
    const rename = line.match(/^rename to (.+)$/);
    if (rename) return rename[1];
    const added = line.match(/^\+\+\+ (.+)$/);
    if (added && added[1] !== "/dev/null") return added[1].replace(/^b\//, "");
    const removed = line.match(/^--- (.+)$/);
    if (removed && removed[1] !== "/dev/null") return removed[1].replace(/^a\//, "");
  }
  return undefined;
}

function classifyDiffLine(line: string): "add" | "delete" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ")) {
    return "meta";
  }
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "delete";
  return "context";
}
