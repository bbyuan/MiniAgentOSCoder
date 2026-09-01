import type { CompletionAssessment } from "../api/client";
import type { TranslationKey } from "../i18n";

type Translator = (key: TranslationKey, variables?: Record<string, string | number>) => string;

interface FailureDiagnosisInput {
  status: string;
  terminationReason?: string;
  observationError: string;
  completion?: CompletionAssessment | null;
  testsStatus?: string;
}

export function failureLeadMessage(
  terminationReason: string | undefined,
  observationError: string,
  t: Translator,
): string {
  if (terminationReason === "invalid_action_ir" || isInvalidActionError(observationError)) {
    return t("completion.failedLead.invalidAction");
  }
  if (terminationReason?.startsWith("max_")) return t("completion.failedLead.budget");
  if (terminationReason === "model_error") return t("completion.failedLead.model");
  if (terminationReason === "worker_error") return t("completion.failedLead.runtime");
  return t("completion.failedLead.generic");
}

export function isTestsNotRun(status: string | undefined): boolean {
  if (!status) return true;
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ["", "_", "not_run", "notrun", "\u672a\u8fd0\u884c", "\u6ca1\u6709\u8fd0\u884c", "\u672a\u6267\u884c"].includes(normalized);
}

export function buildFailureDiagnosis(input: FailureDiagnosisInput): { summary: TranslationKey; actions: TranslationKey[] } | null {
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
  if (input.terminationReason === "invalid_action_ir" || isInvalidActionError(input.observationError)) {
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
  if (input.terminationReason === "worker_error" || isTransitionError(input.observationError)) {
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

function isInvalidActionError(error: string): boolean {
  return /unable to recognize|\u65e0\u6cd5\u8bc6\u522b|action/i.test(error);
}

function isTransitionError(error: string): boolean {
  return /transition|\u9636\u6bb5\u5207\u6362/i.test(error);
}
