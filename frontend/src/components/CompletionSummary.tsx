import { ArrowRight, Ban, CheckCircle2, CircleAlert, FileDiff, FlaskConical } from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { CompletionEvidence } from "./CompletionEvidence";

interface CompletionSummaryProps {
  status: string;
  message: string;
  artifacts?: RunArtifacts;
  completion?: CompletionAssessment | null;
  onNewTask: () => void;
}

export function CompletionSummary({ status, message, artifacts, completion, onNewTask }: CompletionSummaryProps) {
  const { locale, t } = usePreferences();
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "cancelled" ? Ban : CircleAlert;
  const diff = artifacts?.diff_summary;
  const tests = artifacts?.test_summary;

  return (
    <section className={`completionSummary tone-${status}`}>
      <div className="completionLead">
        <StatusIcon size={22} />
        <div>
          <strong>{t(status === "completed" ? "completion.done" : status === "cancelled" ? "completion.cancelled" : "completion.failed")}</strong>
          <p>{message || t("completion.noMessage")}</p>
        </div>
      </div>
      <div className="completionSignals">
        <div><FileDiff size={16} /><span>{t("diff.title")}</span><strong>{diff ? t("diff.files", { count: diff.files }) : t("history.notAvailable")}</strong></div>
        <div><FlaskConical size={16} /><span>{t("tests.title")}</span><strong>{tests ? translateKnownText(locale, tests.status) : t("history.notAvailable")}</strong></div>
      </div>
      <CompletionEvidence assessment={completion} />
      <button type="button" className="secondaryTextAction" onClick={onNewTask}>
        {t("completion.newTask")}<ArrowRight size={15} />
      </button>
    </section>
  );
}
