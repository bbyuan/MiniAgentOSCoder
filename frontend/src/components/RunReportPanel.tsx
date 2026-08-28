import { Download, FileCheck2, FileText } from "lucide-react";
import type { RunReportResponse } from "../api/client";
import { usePreferences } from "../preferences";

interface RunReportPanelProps {
  report?: RunReportResponse;
}

export function RunReportPanel({ report }: RunReportPanelProps) {
  const { t } = usePreferences();

  function downloadReport() {
    if (!report?.available) return;
    const blob = new Blob([report.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.run_id}-report.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="inspectorSection reportSection">
      <div className="sectionHeader">
        <div>
          <h3>{t("report.title")}</h3>
          <span>{report?.generated_at ? formatGeneratedAt(report.generated_at) : t("report.notGenerated")}</span>
        </div>
        <FileText size={15} />
      </div>

      <div className="reportMetrics">
        <div>
          <FileCheck2 size={14} />
          <span>{t("report.patchArtifact")}</span>
          <strong>{report?.patch_available ? t("report.available") : t("report.unavailable")}</strong>
        </div>
        <div>
          <span>{t("report.patchCount")}</span>
          <strong>{report?.patch_count ?? 0}</strong>
        </div>
        <div>
          <span>{t("report.files")}</span>
          <strong>{report?.files.length ?? 0}</strong>
        </div>
      </div>

      {!report?.available ? <p className="emptyText reportEmpty">{t("report.empty")}</p> : (
        <>
          <div className="reportToolbar">
            <span>{t("report.markdown")}</span>
            <button
              type="button"
              className="iconButton"
              title={t("report.download")}
              aria-label={t("report.download")}
              onClick={downloadReport}
            >
              <Download size={14} />
            </button>
          </div>
          <pre className="reportDocument">{report.content}</pre>
        </>
      )}
    </section>
  );
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
