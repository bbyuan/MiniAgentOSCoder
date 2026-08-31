import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileDiff,
  FlaskConical,
  ListChecks,
  MessageSquarePlus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { CompletionAssessment, RunArtifacts } from "../api/client";
import type { TranslationKey } from "../i18n";
import { translateKnownText, translateStatus } from "../i18n";
import { usePreferences } from "../preferences";
import { CodeChangePreview } from "./CodeChangePreview";
import { CompletionEvidence } from "./CompletionEvidence";

interface CompletionSummaryProps {
  status: string;
  message: string;
  terminationReason?: string;
  lastObservation?: Record<string, unknown>;
  artifacts?: RunArtifacts;
  completion?: CompletionAssessment | null;
  onNewTask: () => void;
  onInspectRun?: () => void;
  onUseFollowUp?: (message: string) => void;
}

export function CompletionSummary({
  status,
  message,
  terminationReason,
  lastObservation,
  artifacts,
  completion,
  onNewTask,
  onInspectRun,
  onUseFollowUp,
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
  const diagnosis = buildFailureDiagnosis({
    status,
    terminationReason,
    observationError: displayedObservationError,
    completion,
    testsStatus: tests?.status,
  });
  const nextActions = buildNextActions(status, tests?.status);
  const showEvidence = status === "completed" || completion?.verdict === "passed";
  const hasCodeDiff = Boolean(diff && (diff.files > 0 || artifacts?.diff_preview?.available));
  const showSignals = Boolean(tests) || (status === "completed" && !hasCodeDiff);

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
      <CodeChangePreview artifacts={artifacts} />
      {showSignals ? (
        <div className="completionSignals">
          {!hasCodeDiff ? <div><FileDiff size={16} /><span>{t("diff.title")}</span><strong>{diff ? t("diff.files", { count: diff.files }) : t("history.notAvailable")}</strong></div> : null}
          <div><FlaskConical size={16} /><span>{t("tests.title")}</span><strong>{tests ? translateKnownText(locale, tests.status) : t("history.notAvailable")}</strong></div>
        </div>
      ) : null}
      {hasMoreMessage ? (
        <details className="completionDetails">
          <summary>{t("completion.showDetails")}<ChevronDown size={14} /></summary>
          <p>{completionMessage}</p>
        </details>
      ) : null}
      {showEvidence ? <CompletionEvidence assessment={completion} /> : null}
      <section className="completionNextActions" aria-label={t("completion.nextActions")}>
        {status === "completed" ? (
          <header>
            <Sparkles size={16} />
            <div>
              <strong>{t("completion.nextActions")}</strong>
              <span>{t("completion.nextActions.ready")}</span>
            </div>
          </header>
        ) : null}
        <div>
          {nextActions.map((action) => (
            <button
              type="button"
              onClick={() => {
                if (action.kind === "inspect") {
                  onInspectRun?.();
                } else if (action.kind === "new") {
                  onNewTask();
                } else {
                  onUseFollowUp?.(t(action.prompt));
                }
              }}
              key={action.label}
            >
              <action.icon size={15} />
              <span>{t(action.label)}</span>
              <small>{t(action.description)}</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

type NextAction = {
  kind: "follow_up" | "inspect" | "new";
  icon: typeof MessageSquarePlus;
  label: TranslationKey;
  description: TranslationKey;
  prompt: TranslationKey;
};

function buildNextActions(status: string, testsStatus?: string): NextAction[] {
  if (status === "completed") {
    const verifyAction: NextAction = testsStatus === "Passed"
      ? {
          kind: "follow_up",
          icon: ListChecks,
          label: "completion.nextAction.expandTests",
          description: "completion.nextAction.expandTests.desc",
          prompt: "completion.followUp.expandTests",
        }
      : {
          kind: "follow_up",
          icon: FlaskConical,
          label: "completion.nextAction.verify",
          description: "completion.nextAction.verify.desc",
          prompt: "completion.followUp.verify",
        };
    return [
      verifyAction,
      {
        kind: "follow_up",
        icon: MessageSquarePlus,
        label: "completion.nextAction.continue",
        description: "completion.nextAction.continue.desc",
        prompt: "completion.followUp.continue",
      },
      {
        kind: "new",
        icon: ArrowRight,
        label: "completion.nextAction.new",
        description: "completion.nextAction.new.desc",
        prompt: "completion.followUp.new",
      },
    ];
  }
  return [
    {
      kind: "follow_up",
      icon: RotateCcw,
      label: "completion.nextAction.retry",
      description: "completion.nextAction.retry.desc",
      prompt: "completion.followUp.retry",
    },
    {
      kind: "follow_up",
      icon: MessageSquarePlus,
      label: "completion.nextAction.narrow",
      description: "completion.nextAction.narrow.desc",
      prompt: "completion.followUp.narrow",
    },
  ];
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
