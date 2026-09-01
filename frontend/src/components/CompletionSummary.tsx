import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileDiff,
  FlaskConical,
  ListChecks,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import type { TranslationKey } from "../i18n";
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
  onInspectRun?: () => void;
  onInspectChanges?: () => void;
  changeDecision?: "pending" | "accepted" | "reverted";
  changeReviewBusy?: boolean;
  canRejectChanges?: boolean;
  onAcceptChanges?: () => void;
  onRejectChanges?: () => void;
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
  changeReviewBusy = false,
  canRejectChanges = false,
  onAcceptChanges,
  onRejectChanges,
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
  const fullMessage = formatCompletionMessage(completionMessage);
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
  const testsWereRun = Boolean(tests && !["Not run", "Not Run", "not_run", "not run", "-"].includes(tests.status));
  const failedWithOnlyPassedTests = status !== "completed" && tests?.status === "Passed" && !hasCodeDiff;
  const showSignals = testsWereRun && !failedWithOnlyPassedTests;
  const leadMessage = status === "failed"
    ? failureLeadMessage(terminationReason, displayedObservationError, t)
    : messagePreview;
  const showFinalChangeReview = hasCodeDiff && Boolean(onInspectChanges || onAcceptChanges || onRejectChanges);

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
        <section className={`finalChangeReview state-${changeDecision}`}>
          <header>
            <FileDiff size={18} />
            <div>
              <strong>{t(changeDecision === "accepted" ? "completion.changeReview.acceptedTitle" : changeDecision === "reverted" ? "completion.changeReview.revertedTitle" : "completion.changeReview.title")}</strong>
              <p>{t(changeDecision === "accepted" ? "completion.changeReview.acceptedHint" : changeDecision === "reverted" ? "completion.changeReview.revertedHint" : "completion.changeReview.hint")}</p>
            </div>
          </header>
          <div className="finalChangeStats">
            <span>{t("diff.files", { count: diff?.files ?? 0 })}</span>
            <b className="positive">+{diff?.insertions ?? 0}</b>
            <b className="negative">-{diff?.deletions ?? 0}</b>
          </div>
          <div className="finalChangeActions">
            {onInspectChanges ? (
              <button type="button" className="secondary" onClick={onInspectChanges}>
                <FileDiff size={15} />
                {t("completion.changeReview.inspect")}
              </button>
            ) : null}
            {onRejectChanges ? (
              <button
                type="button"
                className="secondary danger"
                disabled={changeReviewBusy || !canRejectChanges || changeDecision === "accepted" || changeDecision === "reverted"}
                onClick={onRejectChanges}
              >
                <RotateCcw size={15} className={changeReviewBusy ? "spin" : ""} />
                {t("completion.changeReview.reject")}
              </button>
            ) : null}
            {onAcceptChanges ? (
              <button
                type="button"
                className="primary"
                disabled={changeReviewBusy || changeDecision === "accepted" || changeDecision === "reverted"}
                onClick={onAcceptChanges}
              >
                <Check size={15} />
                {t("completion.changeReview.accept")}
              </button>
            ) : null}
          </div>
          {!canRejectChanges && changeDecision === "pending" ? <small>{t("completion.changeReview.noSnapshot")}</small> : null}
        </section>
      ) : null}
      {showSignals ? (
        <div className="completionSignals">
          <div><FlaskConical size={16} /><span>{t("tests.title")}</span><strong>{tests ? translateKnownText(locale, tests.status) : t("history.notAvailable")}</strong></div>
        </div>
      ) : null}
      {showCompletionDetails ? (
        <details className="completionDetails">
          <summary>{t("completion.showDetails")}<ChevronDown size={14} /></summary>
          <div className="completionFullMessage">
            <p className="completionFullLead">{fullMessage.lead}</p>
            {fullMessage.items.length ? (
              <div className="completionDetailGrid">
                {fullMessage.items.map((item, index) => <article key={`${index}-${item}`}><span>{item}</span></article>)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      {showEvidence ? (
        <details className="completionEvidenceDisclosure">
          <summary>
            <ListChecks size={16} />
            <span><strong>{t("completion.evidenceTitle")}</strong><small>{completion?.verdict === "passed" ? t("completion.passed") : t("completion.notPassed")}</small></span>
            <ChevronDown size={15} />
          </summary>
          <div><CompletionEvidence assessment={completion} embedded /></div>
        </details>
      ) : null}
    </section>
  );
}

function failureLeadMessage(
  terminationReason: string | undefined,
  observationError: string,
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
): string {
  if (terminationReason === "invalid_action_ir" || /unable to recognize|无法识别|action/i.test(observationError)) {
    return t("completion.failedLead.invalidAction");
  }
  if (terminationReason?.startsWith("max_")) return t("completion.failedLead.budget");
  if (terminationReason === "model_error") return t("completion.failedLead.model");
  if (terminationReason === "worker_error") return t("completion.failedLead.runtime");
  return t("completion.failedLead.generic");
}

interface FailureDiagnosisInput {
  status: string;
  terminationReason?: string;
  observationError: string;
  completion?: CompletionAssessment | null;
  testsStatus?: string;
}

function buildFailureDiagnosis(input: FailureDiagnosisInput): { summary: TranslationKey; actions: TranslationKey[] } | null {
  if (input.status === "completed") return null;
  const failedChecks = input.completion?.checks.filter((check) => check.required && !check.passed).map((check) => check.id) ?? [];
  if (input.status === "cancelled") {
    return {
      summary: "diagnosis.summary.cancelled",
      actions: ["diagnosis.action.reviewTrace", "diagnosis.action.startFollowUp"],
    };
  }
  if (input.terminationReason?.startsWith("max_")) {
    return {
      summary: "diagnosis.summary.budget",
      actions: ["diagnosis.action.narrowTask", "diagnosis.action.reviewBudget"],
    };
  }
  if (input.terminationReason === "invalid_action_ir" || /unable to recognize|无法识别|action/i.test(input.observationError)) {
    return {
      summary: "diagnosis.summary.actionIr",
      actions: ["diagnosis.action.askPlan", "diagnosis.action.simplify"],
    };
  }
  if (input.terminationReason === "model_error") {
    return {
      summary: "diagnosis.summary.model",
      actions: ["diagnosis.action.checkModel", "diagnosis.action.retryFocused"],
    };
  }
  if (input.terminationReason === "worker_error" || /transition|阶段切换/i.test(input.observationError)) {
    return {
      summary: "diagnosis.summary.runtime",
      actions: ["diagnosis.action.reviewTrace", "diagnosis.action.retryBoundary"],
    };
  }
  if (failedChecks.length > 0) {
    return {
      summary: failedChecks.includes("tests_after_change") || input.testsStatus === "Failed"
        ? "diagnosis.summary.tests"
        : "diagnosis.summary.evidence",
      actions: ["diagnosis.action.collectEvidence", "diagnosis.action.startFollowUp"],
    };
  }
  return {
    summary: "diagnosis.summary.generic",
    actions: ["diagnosis.action.reviewTrace", "diagnosis.action.startFollowUp"],
  };
}

function localizeRuntimeError(error: string, locale: "zh" | "en"): string {
  const knownProviderErrors: Array<[RegExp, string, string]> = [
    [/Model provider request timed out/i, "模型服务请求超时。", "Model provider request timed out."],
    [/Model provider network request failed/i, "模型服务网络请求失败。", "Model provider network request failed."],
    [/Model provider returned invalid JSON/i, "模型服务返回了无效 JSON。", "Model provider returned invalid JSON."],
    [/Model provider returned HTTP (\d+)/i, "模型服务返回了 HTTP 错误。", "Model provider returned an HTTP error."],
  ];
  for (const [pattern, zh, en] of knownProviderErrors) {
    if (pattern.test(error)) return locale === "zh" ? zh : en;
  }
  const transition = error.match(/^Cannot transition run .+ from (\w+) to (\w+)$/);
  if (!transition) return translateKnownText(locale, error);
  const from = translateStatus(locale, transition[1]);
  const to = translateStatus(locale, transition[2]);
  return locale === "zh" ? `运行阶段切换失败：${from} → ${to}` : `Run phase transition failed: ${from} → ${to}`;
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

function formatCompletionMessage(message: string): { lead: string; items: string[] } {
  const normalized = message.replace(/\s+/g, " ").trim();
  const parts = splitCompletionMessage(normalized).map(cleanCompletionItem).filter(Boolean);
  if (parts.length <= 1) return { lead: normalized, items: [] };
  return { lead: parts[0], items: parts.slice(1, 7) };
}

function splitCompletionMessage(message: string): string[] {
  const prepared = message
    .replace(/\s+[-*]\s+(?=[A-Za-z0-9_.\u4e00-\u9fff])/g, "\n- ")
    .replace(/\s+(\d+[.、])\s+/g, "\n$1 ");
  const structuralParts = prepared.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  if (structuralParts.length > 1) return rebalanceCompletionParts(structuralParts);

  const semicolonParts = message.split(/[;；]/).map((part) => part.trim()).filter(Boolean);
  if (semicolonParts.length > 1) return rebalanceCompletionParts(semicolonParts);

  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < message.length; index += 1) {
    if (!"。！？.!?".includes(message[index])) continue;
    const part = message.slice(start, index + 1).trim();
    if (part) parts.push(part);
    start = index + 1;
  }
  const rest = message.slice(start).trim();
  if (rest) parts.push(rest);
  return rebalanceCompletionParts(parts.length ? parts : [message]);
}

function rebalanceCompletionParts(parts: string[]): string[] {
  const balanced: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.search(/[：:]/);
    if (trimmed.length > 180 && colonIndex > 12 && colonIndex < 80) {
      balanced.push(trimmed.slice(0, colonIndex + 1).trim());
      balanced.push(trimmed.slice(colonIndex + 1).trim());
    } else {
      balanced.push(trimmed);
    }
  }
  return balanced;
}

function cleanCompletionItem(item: string): string {
  return item.replace(/^[-*]\s+/, "").replace(/^\d+[.、]\s*/, "").trim();
}
