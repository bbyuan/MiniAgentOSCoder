import { ArrowRight, Ban, CheckCircle2, ChevronDown, CircleAlert, FileDiff, FlaskConical } from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import { translateKnownText, translateStatus } from "../i18n";
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
  const completionMessage = message.trim() || t("completion.noMessage");
  const messagePreview = previewCompletionMessage(completionMessage);
  const hasMoreMessage = messagePreview !== completionMessage;
  const observationError = typeof lastObservation?.error === "string" ? lastObservation.error : "";
  const displayedObservationError = localizeRuntimeError(observationError, locale);
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
          <p>{messagePreview}</p>
        </div>
      </div>
      {status === "failed" && (reason || observationError) ? (
        <div className="completionFailureReason">
          <strong>{t("completion.failureReason")}</strong>
          {reason ? <p>{reason}</p> : null}
          {displayedObservationError && displayedObservationError !== reason ? <code>{displayedObservationError}</code> : null}
        </div>
      ) : null}
      <div className="completionSignals">
        <div><FileDiff size={16} /><span>{t("diff.title")}</span><strong>{diff ? t("diff.files", { count: diff.files }) : t("history.notAvailable")}</strong></div>
        <div><FlaskConical size={16} /><span>{t("tests.title")}</span><strong>{tests ? translateKnownText(locale, tests.status) : t("history.notAvailable")}</strong></div>
      </div>
      {hasMoreMessage ? (
        <details className="completionDetails">
          <summary>{t("completion.showDetails")}<ChevronDown size={14} /></summary>
          <p>{completionMessage}</p>
        </details>
      ) : null}
      <CompletionEvidence assessment={completion} />
      <button type="button" className="secondaryTextAction" onClick={onNewTask}>
        {t("completion.newTask")}<ArrowRight size={15} />
      </button>
    </section>
  );
}

function localizeRuntimeError(error: string, locale: "zh" | "en"): string {
  const transition = error.match(/^Cannot transition run .+ from (\w+) to (\w+)$/);
  if (!transition) return translateKnownText(locale, error);
  const from = translateStatus(locale, transition[1]);
  const to = translateStatus(locale, transition[2]);
  return locale === "zh" ? `运行阶段切换失败：${from} → ${to}` : `Run phase transition failed: ${from} → ${to}`;
}

function previewCompletionMessage(message: string, limit = 180): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;

  const firstSentence = normalized.match(/^.*?[.!?。！？](?=\s|$)/)?.[0];
  if (firstSentence && firstSentence.length >= 32 && firstSentence.length <= limit) {
    return firstSentence;
  }

  const candidate = normalized.slice(0, limit);
  const lastSpace = candidate.lastIndexOf(" ");
  const safeEnd = lastSpace >= Math.floor(limit * 0.65) ? lastSpace : limit;
  return `${candidate.slice(0, safeEnd).trimEnd()}...`;
}
