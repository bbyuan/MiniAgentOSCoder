import { ArrowRight, Ban, CheckCircle2, CircleAlert, FileDiff, FlaskConical } from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { CompletionEvidence } from "./CompletionEvidence";

interface CompletionSummaryProps {
  status: string;
  message: string;
  terminationReason?: string;
  lastObservation?: Record<string, unknown>;
  artifacts?: RunArtifacts;
  completion?: CompletionAssessment | null;
  onNewTask: () => void;
}

export function CompletionSummary({
  status,
  message,
  terminationReason,
  lastObservation,
  artifacts,
  completion,
  onNewTask,
}: CompletionSummaryProps) {
  const { locale, t } = usePreferences();
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "cancelled" ? Ban : CircleAlert;
  const diff = artifacts?.diff_summary;
  const tests = artifacts?.test_summary;
  const observationError = typeof lastObservation?.error === "string" ? lastObservation.error : "";
  const knownReasons: Record<string, string> = {
    max_output_tokens: t("completion.reason.max_output_tokens"),
    max_input_tokens: t("completion.reason.max_input_tokens"),
    max_model_calls: t("completion.reason.max_model_calls"),
    max_tool_calls: t("completion.reason.max_tool_calls"),
    max_steps: t("completion.reason.max_steps"),
    max_wall_time_seconds: t("completion.reason.max_wall_time_seconds"),
    invalid_action_ir: t("completion.reason.invalid_action_ir"),
    model_error: t("completion.reason.model_error"),
    worker_error: t("completion.reason.worker_error"),
  };
  const reason = terminationReason ? knownReasons[terminationReason] ?? terminationReason : "";

  return (
    <section className={`completionSummary tone-${status}`}>
      <div className="completionLead">
        <StatusIcon size={22} />
        <div>
          <strong>{t(status === "completed" ? "completion.done" : status === "cancelled" ? "completion.cancelled" : "completion.failed")}</strong>
          <p>{message || t("completion.noMessage")}</p>
        </div>
      </div>
      {status === "failed" && (reason || observationError) ? (
        <div className="completionFailureReason">
          <strong>{t("completion.failureReason")}</strong>
          {reason ? <p>{reason}</p> : null}
          {observationError && observationError !== reason ? <code>{observationError}</code> : null}
        </div>
      ) : null}
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
