import {
  Ban,
  CheckCircle2,
  CircleAlert,
  FileDiff,
  FlaskConical,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { buildFailureDiagnosis, failureLeadMessage, isTestsNotRun } from "../run/completionDiagnosis";
import { localizeRuntimeError } from "../run/localizedText";
import { CompletionEvidence } from "./CompletionEvidence";
import { MarkdownDocument } from "./MarkdownDocument";

interface CompletionSummaryProps {
  status: string;
  message: string;
  terminationReason?: string;
  lastObservation?: Record<string, unknown>;
  artifacts?: RunArtifacts;
  completion?: CompletionAssessment | null;
  onInspectRun?: () => void;
  onInspectChanges?: () => void;
  changeDecision?: "pending" | "accepted" | "reverted";
}

export function CompletionSummary({
  status,
  message,
  terminationReason,
  lastObservation,
  artifacts,
  completion,
  onInspectRun,
  onInspectChanges,
  changeDecision = "pending",
}: CompletionSummaryProps) {
  const { locale, t } = usePreferences();
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "cancelled" ? Ban : CircleAlert;
  const diff = artifacts?.diff_summary;
  const tests = artifacts?.test_summary;
  const hasCompletionMessage = Boolean(message.trim());
  const completionMessage = hasCompletionMessage ? message.trim() : t("completion.noMessage");
  const messagePreview = previewCompletionMessage(completionMessage);
  const hasMoreMessage = messagePreview !== completionMessage;
  const showLeadMessage = status !== "completed";
  const showCompletionDetails = status === "completed" ? hasCompletionMessage : hasMoreMessage;
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
  const diagnosis = buildFailureDiagnosis({
    status,
    terminationReason,
    observationError: displayedObservationError,
    completion,
    testsStatus: tests?.status,
  });
  const showEvidence = status === "completed" || completion?.verdict === "passed";
  const hasCodeDiff = Boolean(diff && (diff.files > 0 || artifacts?.diff_preview?.available));
  const testsWereRun = Boolean(tests && !isTestsNotRun(tests.status));
  const failedWithOnlyPassedTests = status !== "completed" && tests?.status === "Passed" && !hasCodeDiff;
  const showSignals = testsWereRun && !failedWithOnlyPassedTests;
  const leadMessage = status === "failed"
    ? failureLeadMessage(terminationReason, displayedObservationError, t)
    : messagePreview;
  const showFinalChangeReview = hasCodeDiff && Boolean(onInspectChanges);

  return (
    <section className={`completionSummary tone-${status}`}>
      <div className="completionLead">
        <StatusIcon size={22} />
        <div>
          <strong>{t(status === "completed" ? "completion.done" : status === "cancelled" ? "completion.cancelled" : "completion.failed")}</strong>
          {showLeadMessage ? <p>{leadMessage}</p> : null}
        </div>
      </div>
      {status === "failed" && (reason || observationError) ? (
        <div className="completionFailureReason">
          <strong>{t("completion.failureReason")}</strong>
          {reason ? <p>{reason}</p> : null}
          {displayedObservationError && displayedObservationError !== reason ? <code>{displayedObservationError}</code> : null}
        </div>
      ) : null}
      {failedWithOnlyPassedTests ? (
        <div className="completionContextNote">
          <FlaskConical size={16} />
          <span>{t("completion.testsContextOnly")}</span>
        </div>
      ) : null}
      {diagnosis ? (
        <section className="completionDiagnosis" aria-label={t("diagnosis.title")}>
          <header>
            <CircleAlert size={17} />
            <div>
              <strong>{t("diagnosis.title")}</strong>
              <span>{t(diagnosis.summary)}</span>
            </div>
          </header>
          <div className="diagnosisActions">
            {diagnosis.actions.map((action) => (
              <article key={action}>
                <CheckCircle2 size={14} />
                <span>{t(action)}</span>
              </article>
            ))}
          </div>
          {onInspectRun ? (
            <button type="button" onClick={onInspectRun}>
              <ShieldCheck size={15} />
              {t("diagnosis.inspect")}
            </button>
          ) : null}
        </section>
      ) : null}
      {showFinalChangeReview ? (
        <section className={`completionChangeLink state-${changeDecision}`}>
          <div>
            <FileDiff size={16} />
            <span>
              <strong>{t(changeDecision === "accepted" ? "completion.changeReview.acceptedTitle" : changeDecision === "reverted" ? "completion.changeReview.revertedTitle" : "completion.changeReview.title")}</strong>
              <small>{t(changeDecision === "accepted" ? "completion.changeReview.acceptedHint" : changeDecision === "reverted" ? "completion.changeReview.revertedHint" : "completion.changeReview.hint")}</small>
            </span>
          </div>
          <span className="completionChangeStats">
            <span>{t("diff.files", { count: diff?.files ?? 0 })}</span>
            <b className="positive">+{diff?.insertions ?? 0}</b>
            <b className="negative">-{diff?.deletions ?? 0}</b>
          </span>
          <button type="button" onClick={onInspectChanges}>
            {t("completion.changeReview.inspect")}
          </button>
        </section>
      ) : null}
      {showSignals ? (
        <div className="completionSignals">
          <div><FlaskConical size={16} /><span>{t("tests.title")}</span><strong>{tests ? translateKnownText(locale, tests.status) : t("history.notAvailable")}</strong></div>
        </div>
      ) : null}
      {showCompletionDetails ? (
        <section className="completionDetails completionDetailsStatic">
          <header>
            <span className="completionDisclosureCopy">
              <span className="completionDisclosureTitle">{t("completion.showDetails")}</span>
              <small>{t("completion.summaryHint")}</small>
            </span>
          </header>
          <MarkdownDocument className="completionFullMessage" content={completionMessage} />
        </section>
      ) : null}
      {showEvidence ? (
        <section className="completionDetails completionEvidenceDisclosure completionDetailsStatic">
          <header>
            <ListChecks size={16} />
            <span><strong>{t("completion.evidenceTitle")}</strong><small>{completion?.verdict === "passed" ? t("completion.passed") : t("completion.notPassed")}</small></span>
          </header>
          <div><CompletionEvidence assessment={completion} embedded /></div>
        </section>
      ) : null}
    </section>
  );
}

function previewCompletionMessage(message: string, limit = 120): string {
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
