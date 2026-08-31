import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileCode2, FileText, Folder, FolderTree, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { daemonApi, type OpenProjectResponse, type WorkspaceFileContent, type WorkspaceFileItem } from "../api/client";
import { localizeErrorMessage, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface WorkspaceFilesDialogProps {
  open: boolean;
  project?: OpenProjectResponse;
  onClose: () => void;
}

export function WorkspaceFilesDialog({ open, project, onClose }: WorkspaceFilesDialogProps) {
  const { locale, t } = usePreferences();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WorkspaceFileItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState<WorkspaceFileContent>();
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState("");

  const files = useMemo(() => items.filter((item) => item.kind === "file"), [items]);
  const selectedItem = files.find((item) => item.path === selectedPath);

  useEffect(() => {
    if (!open || !project) return;
    setQuery("");
    setSelectedPath("");
    setContent(undefined);
    void loadFiles("");
  }, [open, project?.project_id]);

  useEffect(() => {
    if (!open || !project) return;
    const timer = window.setTimeout(() => void loadFiles(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || !project || !selectedPath) return;
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
  }, [open, project?.project_id, selectedPath]);

  if (!open || !project) return null;

  async function loadFiles(nextQuery = query) {
    if (!project) return;
    setLoadingFiles(true);
    setError("");
    try {
      const response = await daemonApi.getProjectFiles(project.project_id, nextQuery);
      setItems(response.items);
      setTruncated(response.truncated);
      const nextFiles = response.items.filter((item) => item.kind === "file");
      setSelectedPath((current) => nextFiles.some((item) => item.path === current) ? current : nextFiles[0]?.path ?? "");
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("workspaceFiles.loadFailed")));
    } finally {
      setLoadingFiles(false);
    }
  }

  return (
    <div className="workspaceFilesBackdrop" role="presentation">
      <section className="workspaceFilesDialog" role="dialog" aria-modal="true" aria-label={t("workspaceFiles.title")}>
        <header className="workspaceFilesHeader">
          <div>
            <span className="eyebrow">{t("workspaceFiles.eyebrow")}</span>
            <h2>{t("workspaceFiles.title")}</h2>
            <p>{project.path}</p>
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
          <span>{t("workspaceFiles.count", { count: files.length })}</span>
        </div>

        {error ? (
          <div className="workspaceFilesError"><AlertCircle size={16} />{error}</div>
        ) : null}

        <div className="workspaceFilesBody">
          <nav className="workspaceFilesList" aria-label={t("workspaceFiles.fileList")}>
            {loadingFiles && !items.length ? (
              <div className="workspaceFilesLoading"><LoaderCircle className="spin" size={16} />{t("workspaceFiles.loading")}</div>
            ) : null}
            {files.map((file) => (
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
                <em>{formatBytes(file.size)}</em>
              </button>
            ))}
            {!loadingFiles && !files.length ? (
              <p className="workspaceFilesEmpty">{t("workspaceFiles.empty")}</p>
            ) : null}
          </nav>

          <article className="workspaceFilePreview">
            {selectedItem ? (
              <>
                <header>
                  <div>
                    <FolderTree size={16} />
                    <span>
                      <strong>{selectedItem.path}</strong>
                      <small>{selectedItem.language || t("workspaceFiles.textFile")} · {formatBytes(selectedItem.size)}</small>
                    </span>
                  </div>
                </header>
                {loadingContent ? (
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
