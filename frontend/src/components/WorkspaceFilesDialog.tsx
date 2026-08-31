import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileCode2, FileDiff, FileText, Folder, FolderTree, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { daemonApi, type OpenProjectResponse, type WorkspaceFileContent, type WorkspaceFileItem } from "../api/client";
import { localizeErrorMessage, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import { buildDiffFiles } from "./DiffReview";

export interface WorkspaceChangeSet {
  title: string;
  patch: string;
  changedFiles: string[];
  insertions: number;
  deletions: number;
}

interface WorkspaceFilesDialogProps {
  open: boolean;
  project?: OpenProjectResponse;
  changeSet?: WorkspaceChangeSet;
  onClose: () => void;
}

export function WorkspaceFilesDialog({ open, project, changeSet, onClose }: WorkspaceFilesDialogProps) {
  const { locale, t } = usePreferences();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WorkspaceFileItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState<WorkspaceFileContent>();
  const [previewMode, setPreviewMode] = useState<"source" | "diff">("source");
  const [fileScope, setFileScope] = useState<"changes" | "all">("all");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState("");

  const files = useMemo(() => items.filter((item) => item.kind === "file"), [items]);
  const changed = useMemo(() => buildDiffFiles(changeSet?.patch ?? "", changeSet?.changedFiles ?? []), [changeSet]);
  const changedByPath = useMemo(() => new Map(changed.map((file) => [file.path, file])), [changed]);
  const hasChanges = Boolean(changeSet && changed.length > 0);
  const displayFiles = useMemo<WorkspaceFileItem[]>(() => {
    const byPath = new Map(files.map((file) => [file.path, file]));
    for (const file of changed) {
      if (byPath.has(file.path)) continue;
      byPath.set(file.path, {
        path: file.path,
        name: file.path.split("/").pop() || file.path,
        kind: "file",
        size: 0,
        language: "",
        modified_at: 0,
      });
    }
    return [...byPath.values()].sort((left, right) => {
      const leftChanged = changedByPath.has(left.path) ? 0 : 1;
      const rightChanged = changedByPath.has(right.path) ? 0 : 1;
      return leftChanged - rightChanged || left.path.localeCompare(right.path);
    });
  }, [files, changed, changedByPath]);
  const visibleFiles = useMemo(() => {
    if (!hasChanges || fileScope === "all") return displayFiles;
    return displayFiles.filter((file) => changedByPath.has(file.path));
  }, [changedByPath, displayFiles, fileScope, hasChanges]);
  const selectedItem = displayFiles.find((item) => item.path === selectedPath);
  const selectedDiff = changedByPath.get(selectedPath);

  useEffect(() => {
    if (!open || !project) return;
    setQuery("");
    const firstChanged = firstChangedPath(changeSet?.patch ?? "", changeSet?.changedFiles ?? []);
    setSelectedPath(changeSet?.changedFiles[0] ?? firstChanged ?? "");
    setPreviewMode(changeSet ? "diff" : "source");
    setFileScope(changeSet ? "changes" : "all");
    setContent(undefined);
    void loadFiles("");
  }, [open, project?.project_id, changeSet?.title]);

  useEffect(() => {
    if (!open || !project) return;
    const timer = window.setTimeout(() => void loadFiles(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || !project || !selectedPath) return;
    if (!files.some((file) => file.path === selectedPath)) {
      setContent(undefined);
      setLoadingContent(false);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setError("");
    daemonApi.getProjectFileContent(project.project_id, selectedPath)
      .then((next) => {
        if (!cancelled) setContent(next);
      })
      .catch((caught) => {
        if (!cancelled) setError(localizeErrorMessage(locale, caught, t("workspaceFiles.loadContentFailed")));
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project?.project_id, selectedPath, files]);

  if (!open || !project) return null;

  function showChangedFiles() {
    setFileScope("changes");
    const changedPath = firstChangedPath(changeSet?.patch ?? "", changeSet?.changedFiles ?? []);
    if (changedPath && !changedByPath.has(selectedPath)) {
      setSelectedPath(changedPath);
      setPreviewMode("diff");
    }
  }

  async function loadFiles(nextQuery = query) {
    if (!project) return;
    setLoadingFiles(true);
    setError("");
    try {
      const response = await daemonApi.getProjectFiles(project.project_id, nextQuery);
      setItems(response.items);
      setTruncated(response.truncated);
      const nextFiles = response.items.filter((item) => item.kind === "file");
      setSelectedPath((current) => {
        if (nextFiles.some((item) => item.path === current) || changedByPath.has(current)) return current;
        const changedPath = firstChangedPath(changeSet?.patch ?? "", changeSet?.changedFiles ?? []);
        return changedPath ?? nextFiles[0]?.path ?? "";
      });
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("workspaceFiles.loadFailed")));
    } finally {
      setLoadingFiles(false);
    }
  }

  return (
    <div className="workspaceFilesBackdrop" role="presentation">
      <section className={`workspaceFilesDialog ${hasChanges ? "withChanges" : ""}`} role="dialog" aria-modal="true" aria-label={t("workspaceFiles.title")}>
        <header className="workspaceFilesHeader">
          <div>
            <span className="eyebrow">{t("workspaceFiles.eyebrow")}</span>
            <h2>{t("workspaceFiles.title")}</h2>
            <p>{changeSet ? changeSet.title : project.path}</p>
          </div>
          <div className="workspaceFilesHeaderActions">
            <button type="button" onClick={() => void loadFiles()} disabled={loadingFiles} title={t("history.refresh")} aria-label={t("history.refresh")}>
              <RefreshCw className={loadingFiles ? "spin" : ""} size={17} />
            </button>
            <button type="button" onClick={onClose} title={t("workspaceFiles.close")} aria-label={t("workspaceFiles.close")}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="workspaceFilesToolbar">
          <label>
            <Search size={16} />
            <input value={query} placeholder={t("workspaceFiles.search")} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span>{hasChanges ? t("workspaceFiles.changeCount", { count: changed.length, additions: changeSet?.insertions ?? 0, deletions: changeSet?.deletions ?? 0 }) : t("workspaceFiles.count", { count: files.length })}</span>
        </div>

        {hasChanges ? (
          <div className="workspaceChangeRail">
            <div>
              <strong>{t("workspaceFiles.changeRailTitle")}</strong>
              <span>{t("workspaceFiles.changeRailHint")}</span>
            </div>
            <div className="workspaceScopeTabs" role="tablist" aria-label={t("workspaceFiles.scope")}>
              <button type="button" className={fileScope === "changes" ? "active" : ""} onClick={showChangedFiles}>
                <FileDiff size={15} />
                {t("workspaceFiles.changedOnly")}
              </button>
              <button type="button" className={fileScope === "all" ? "active" : ""} onClick={() => setFileScope("all")}>
                <FolderTree size={15} />
                {t("workspaceFiles.allFiles")}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="workspaceFilesError"><AlertCircle size={16} />{error}</div>
        ) : null}

        <div className="workspaceFilesBody">
          <nav className="workspaceFilesList" aria-label={t("workspaceFiles.fileList")}>
            {loadingFiles && !items.length ? (
              <div className="workspaceFilesLoading"><LoaderCircle className="spin" size={16} />{t("workspaceFiles.loading")}</div>
            ) : null}
            {visibleFiles.map((file) => (
              <button
                type="button"
                className={file.path === selectedPath ? "active" : ""}
                onClick={() => setSelectedPath(file.path)}
                key={file.path}
              >
                {file.language ? <FileCode2 size={15} /> : <FileText size={15} />}
                <span>
                  <strong>{file.name}</strong>
                  <small>{file.path}</small>
                </span>
                {changedByPath.has(file.path) ? (
                  <em className="changed">{t("workspaceFiles.changedBadge")}</em>
                ) : (
                  <em>{formatBytes(file.size)}</em>
                )}
              </button>
            ))}
            {!loadingFiles && !visibleFiles.length ? (
              <p className="workspaceFilesEmpty">{t("workspaceFiles.empty")}</p>
            ) : null}
          </nav>

          <article className="workspaceFilePreview">
            {selectedItem ? (
              <>
                <header>
                  <div className="workspaceFileIdentity">
                    {selectedDiff ? <FileDiff size={16} /> : <FolderTree size={16} />}
                    <span>
                      <strong>{selectedItem.path}</strong>
                      <small>{selectedItem.language || t("workspaceFiles.textFile")} · {formatBytes(selectedItem.size)}</small>
                    </span>
                  </div>
                  {selectedDiff ? (
                    <div className="workspacePreviewTabs" role="tablist" aria-label={t("workspaceFiles.previewMode")}>
                      <button type="button" className={previewMode === "source" ? "active" : ""} onClick={() => setPreviewMode("source")}>{t("workspaceFiles.sourceTab")}</button>
                      <button type="button" className={previewMode === "diff" ? "active" : ""} onClick={() => setPreviewMode("diff")}>{t("workspaceFiles.diffTab")}</button>
                    </div>
                  ) : null}
                </header>
                {previewMode === "diff" && selectedDiff ? (
                  <div className="workspaceDiffPreview">
                    <div><strong>{selectedDiff.path}</strong><span><b className="positive">+{selectedDiff.additions}</b><b className="negative">-{selectedDiff.deletions}</b></span></div>
                    {selectedDiff.hasPatch ? (
                      <pre tabIndex={0}>
                        {selectedDiff.lines.map((line, index) => (
                          <code className={`line-${classifyDiffLine(line)}`} key={`${selectedDiff.path}-${index}-${line}`}>
                            {line || " "}
                          </code>
                        ))}
                      </pre>
                    ) : <p>{t("codeDiff.noFilePreview")}</p>}
                  </div>
                ) : loadingContent ? (
                  <div className="workspaceFilesLoading preview"><LoaderCircle className="spin" size={16} />{t("workspaceFiles.loadingContent")}</div>
                ) : content?.available ? (
                  <>
                    <pre tabIndex={0}>
                      {content.content.split("\n").map((line, index) => (
                        <code key={`${content.path}-${index}`}>
                          <span>{index + 1}</span>
                          <b>{line || " "}</b>
                        </code>
                      ))}
                    </pre>
                    {content.truncated ? <small className="workspaceFileNote">{t("workspaceFiles.truncated")}</small> : null}
                  </>
                ) : (
                  <div className="workspaceFileUnavailable">
                    <Folder size={18} />
                    <strong>{t("workspaceFiles.unavailable")}</strong>
                    <span>{localizedUnavailableReason(content?.reason, t)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="workspaceFilePlaceholder">
                <FolderTree size={22} />
                <strong>{t("workspaceFiles.pickFile")}</strong>
                <span>{t("workspaceFiles.pickFileHint")}</span>
              </div>
            )}
          </article>
        </div>

        {truncated ? <footer>{t("workspaceFiles.truncatedList")}</footer> : null}
      </section>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function localizedUnavailableReason(reason: string | undefined, t: (key: TranslationKey) => string): string {
  if (reason === "File is too large to preview") return t("workspaceFiles.tooLarge");
  if (reason === "Binary files cannot be previewed") return t("workspaceFiles.binary");
  return t("workspaceFiles.noContent");
}

function firstChangedPath(patch: string, changedFiles: string[]): string | undefined {
  return changedFiles[0] ?? buildDiffFiles(patch, changedFiles)[0]?.path;
}

function classifyDiffLine(line: string): "add" | "delete" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ")) {
    return "meta";
  }
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "delete";
  return "context";
}
