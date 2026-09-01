import type { TraceEvent } from "../api/client";
import { type Locale, type TranslationKey, translateKnownText } from "../i18n";

export type WorkItemKind =
  | "action"
  | "approval"
  | "cancelled"
  | "context"
  | "danger"
  | "fileDiff"
  | "fileEdit"
  | "fileRead"
  | "fileSearch"
  | "fileTree"
  | "memory"
  | "model"
  | "runtime"
  | "sandbox"
  | "success"
  | "terminal"
  | "user";

export interface ProcessEvent {
  title: string;
  detail: string;
  chips: string[];
  output?: string;
  outputLabel?: string;
}

export interface WorkItem extends ProcessEvent {
  kind: WorkItemKind;
  tone: string;
  time: string;
}

type Translator = (
  key: TranslationKey,
  variables?: Record<string, string | number>,
) => string;

export function eventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function buildWorkItems(events: TraceEvent[], locale: Locale, t: Translator): WorkItem[] {
  const completedActionIds = new Set(
    events
      .filter((event) => ["tool.executed", "tool.failed", "approval.requested", "action.rejected"].includes(event.event))
      .map(actionIdFrom)
      .filter((id): id is string => Boolean(id)),
  );
  return events.filter((event, index) => (
    isProcessEvent(event, completedActionIds) && !isResolvedModelRequest(events, index)
  )).map((event) => {
    const presentation = workPresentation(event);
    return {
      ...processEvent(event, locale, t),
      kind: presentation.kind,
      tone: presentation.tone,
      time: event.time,
    };
  });
}

function isResolvedModelRequest(events: TraceEvent[], index: number): boolean {
  const event = events[index];
  if (event.event !== "model.requested") return false;
  const step = event.payload.step;
  for (const next of events.slice(index + 1)) {
    if (next.event === "model.requested") return true;
    if (step !== undefined && next.payload.step !== undefined && next.payload.step !== step) return false;
    if ([
      "action.parsed",
      "tool.executed",
      "tool.failed",
      "approval.requested",
      "action.rejected",
      "model.failed",
    ].includes(next.event)) {
      return true;
    }
  }
  return false;
}

export function activityState(status: string): {
  key: "activity.live" | "activity.completed" | "activity.failed" | "activity.cancelled" | "activity.paused";
  tone: string;
} {
  if (["running", "applying_patch", "testing", "repairing", "cancellation_requested"].includes(status)) {
    return { key: "activity.live", tone: "active" };
  }
  if (status === "completed") return { key: "activity.completed", tone: "completed" };
  if (status === "failed") return { key: "activity.failed", tone: "failed" };
  if (status === "cancelled") return { key: "activity.cancelled", tone: "cancelled" };
  return { key: "activity.paused", tone: "paused" };
}

function eventPresentation(event: string): { kind: WorkItemKind; tone: string } {
  if (event.startsWith("user.guidance.")) return { kind: "user", tone: "action" };
  if (event.startsWith("model.")) return { kind: "model", tone: "model" };
  if (event.startsWith("tool.")) return { kind: "action", tone: "tool" };
  if (event.startsWith("action.")) return { kind: "action", tone: "action" };
  if (event.startsWith("approval.")) return { kind: "approval", tone: "approval" };
  if (event.startsWith("patch.")) return { kind: "fileDiff", tone: "patch" };
  if (event.startsWith("repair.")) return { kind: "runtime", tone: "approval" };
  if (event.startsWith("rollback.")) return { kind: "fileDiff", tone: "patch" };
  if (event.startsWith("memory.")) return { kind: "memory", tone: "model" };
  if (event.startsWith("context.")) return { kind: "context", tone: "tool" };
  if (event.startsWith("policy.") || event.startsWith("governance.")) return { kind: "approval", tone: "approval" };
  if (event.startsWith("sandbox.")) return { kind: "sandbox", tone: "tool" };
  if (event.startsWith("skill.") || event.startsWith("mcp.") || event.startsWith("hook.") || event.startsWith("extension.")) {
    return { kind: "model", tone: "model" };
  }
  if (event === "report.generated") return { kind: "fileRead", tone: "success" };
  if (event === "run.finished") return { kind: "success", tone: "success" };
  if (event === "run.cancelled") return { kind: "cancelled", tone: "muted" };
  if (event.includes("failed") || event.includes("exceeded")) return { kind: "danger", tone: "danger" };
  return { kind: "runtime", tone: "runtime" };
}

function isProcessEvent(event: TraceEvent, completedActionIds: Set<string>): boolean {
  const name = event.event;
  if (name === "model.requested") return true;
  if (name === "action.parsed") {
    const actionId = actionIdFrom(event);
    return actionName(event) === "finish" || !actionId || !completedActionIds.has(actionId);
  }
  if (name === "tool.executed" || name === "tool.failed") return true;
  if (name === "approval.requested" || name === "approval.resolved" || name === "approval.cancelled") return true;
  if (name === "action.rejected") return true;
  if (name === "action.superseded") return false;
  if (name === "completion.passed" || name === "completion.rejected") return true;
  if (name === "model.failed" || name === "run.failed" || name === "run.budget_exceeded" || name === "run.cancelled") return true;
  if (name === "report.generated") return true;
  if (name.startsWith("user.guidance.")) return true;
  if (name === "policy.evaluated") {
    const evaluation = asRecord(event.payload.evaluation);
    const outcome = stringValue(evaluation?.outcome);
    return outcome === "denied" || outcome === "approval_denied";
  }
  return false;
}

function workPresentation(event: TraceEvent): { kind: WorkItemKind; tone: string } {
  const name = actionName(event);
  if (event.event === "approval.requested" || event.event === "approval.resolved" || event.event === "approval.cancelled") return { kind: "approval", tone: "approval" };
  if (event.event === "completion.passed") return { kind: "success", tone: "success" };
  if (event.event === "completion.rejected") return { kind: "danger", tone: "warning" };
  if (event.event === "policy.evaluated" || event.event === "action.rejected") return { kind: "approval", tone: "danger" };
  if (event.event.includes("failed") || event.event.includes("exceeded")) return { kind: "danger", tone: "danger" };
  if (name === "read_file") return { kind: "fileRead", tone: "tool" };
  if (name === "search_code") return { kind: "fileSearch", tone: "tool" };
  if (name === "list_files") return { kind: "fileTree", tone: "tool" };
  if (name === "run_command" || name === "run_test" || name === "run_lint") return { kind: "terminal", tone: "action" };
  if (name === "git_status" || name === "git_diff") return { kind: "fileDiff", tone: "tool" };
  if (name === "use_skill" || name === "mcp_call") return { kind: "model", tone: "model" };
  if (name === "apply_patch") return { kind: "fileEdit", tone: "patch" };
  if (name === "finish" || event.event === "report.generated") return { kind: "success", tone: "success" };
  if (event.event.startsWith("user.guidance.")) return { kind: "user", tone: "action" };
  return eventPresentation(event.event);
}

function processEvent(event: TraceEvent, locale: Locale, t: Translator): ProcessEvent {
  if (event.event === "action.rejected") {
    const resultError = stringValue(resultFrom(event)?.error) ?? stringValue(event.payload.error);
    const detail = resultError && !isInternalFieldError(resultError)
      ? translateKnownText(locale, resultError)
      : t("activity.detail.invalidAction");
    return {
      title: t("activity.title.invalidAction"),
      detail,
      chips: activityChips(locale, event, t),
      output: outputPreview(locale, event),
    };
  }

  const error = event.payload.error;
  if (typeof error === "string" && error.trim()) {
    return {
      title: t("activity.title.failed"),
      detail: translateKnownText(locale, error),
      chips: activityChips(locale, event, t),
    };
  }
  const reason = event.payload.termination_reason;
  if (typeof reason === "string" && reason.trim()) {
    const title = event.event === "run.cancelled"
      ? t("activity.title.cancelled")
      : event.event === "run.budget_exceeded"
        ? t("activity.title.budgetExceeded")
        : event.event === "run.failed"
          ? t("activity.title.failed")
          : t("activity.title.runtime");
    return {
      title,
      detail: translateKnownText(locale, reason),
      chips: activityChips(locale, event, t),
    };
  }

  const action = actionFrom(event);
  const result = resultFrom(event);
  const rationale = stringValue(action?.rationale);
  const chips = activityChips(locale, event, t);
  const params = actionParams(event);
  const step = numberValue(event.payload.step);
  const modelCalls = numberValue(event.payload.model_calls);
  const toolCalls = numberValue(event.payload.tool_calls);
  const resultError = stringValue(result?.error);

  if (event.event === "run.step.started") {
    const detail = [step ? t("activity.stepNumber", { step }) : "", modelCalls ? t("activity.modelCallCount", { count: modelCalls }) : "", toolCalls ? t("activity.toolCallCount", { count: toolCalls }) : ""]
      .filter(Boolean)
      .join(" · ");
    return { title: t("activity.title.step"), detail: detail || t("activity.detail.runtime"), chips };
  }
  if (event.event === "model.requested") return { title: t("activity.title.modelRequested"), detail: t("activity.detail.modelRequested"), chips };
  if (event.event === "model.responded") return { title: t("activity.title.modelResponded"), detail: t("activity.detail.modelResponded"), chips };
  if (event.event === "model.failed") return { title: t("activity.title.failed"), detail: resultError ?? t("activity.detail.failed"), chips };
  if (event.event === "action.parsed") {
    const label = actionLabel(event, t);
    if (actionName(event) !== "finish") {
      return {
        title: t("activity.title.nextAction", { action: label }),
        detail: rationaleDetail(locale, rationale, actionDetail(event, t), t),
        chips,
      };
    }
    return {
      title: label,
      detail: rationaleDetail(locale, rationale, actionDetail(event, t), t),
      chips,
    };
  }
  if (event.event === "tool.executed") {
    const command = firstPresent(params, ["command", "cmd"]);
    return {
      title: executedTitle(event, t),
      detail: rationaleDetail(locale, rationale, command ? t("activity.detail.commandExecuted") : actionDetail(event, t), t),
      chips,
      output: outputPreview(locale, event),
      outputLabel: outputLabel(event, t),
    };
  }
  if (event.event === "tool.failed") {
    return {
      title: t("activity.work.failed", { action: actionLabel(event, t) }),
      detail: resultError ? translateKnownText(locale, resultError) : t("activity.detail.failed"),
      chips,
      output: outputPreview(locale, event),
      outputLabel: t("activity.outputError"),
    };
  }
  if (event.event === "approval.requested") return { title: actionName(event) === "apply_patch" ? t("activity.title.patchApprovalRequested") : t("activity.title.approvalRequested"), detail: t("activity.detail.approvalRequested"), chips };
  if (event.event === "approval.resolved") {
    const decision = stringValue(event.payload.decision);
    const title = decision === "approve_once" ? t("activity.title.approvalApproved") : t("activity.title.approvalDenied");
    const reasonText = stringValue(event.payload.reason);
    return { title, detail: reasonText ? translateKnownText(locale, reasonText) : t(decision === "approve_once" ? "activity.detail.approvalApproved" : "activity.detail.approvalDenied"), chips };
  }
  if (event.event === "approval.cancelled") return { title: t("activity.title.approvalCancelled"), detail: t("activity.detail.approvalCancelled"), chips };
  if (event.event === "completion.passed") return { title: t("activity.title.completionPassed"), detail: assessmentSummary(locale, event, t("activity.detail.completionPassed")), chips };
  if (event.event === "completion.rejected") return { title: t("activity.title.completionRejected"), detail: assessmentSummary(locale, event, t("activity.detail.completionRejected")), chips };
  if (event.event === "policy.evaluated") return { title: t("activity.title.policyBlocked"), detail: policySummary(locale, event, t("activity.detail.policyBlocked")), chips };
  if (event.event.startsWith("user.guidance.")) return { title: t("activity.title.guidance"), detail: t("activity.detail.guidance"), chips };
  if (event.event.startsWith("context.")) return { title: t("activity.title.context"), detail: t("activity.detail.context"), chips };
  if (event.event.startsWith("patch.")) return { title: t("activity.title.patch"), detail: t("activity.detail.patch"), chips };
  if (event.event === "capability.menu.built") return { title: t("activity.title.capabilities"), detail: t("activity.detail.capabilities"), chips };
  if (event.event === "report.generated") return { title: t("activity.title.report"), detail: t("activity.detail.report"), chips };
  if (event.event === "run.finished") return { title: t("activity.title.completed"), detail: t("activity.detail.completed"), chips };
  if (event.event === "run.cancelled") return { title: t("activity.title.cancelled"), detail: t("activity.detail.cancelled"), chips };
  return { title: t("activity.title.runtime"), detail: t("activity.detail.system"), chips };
}

function actionLabel(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  const metadata = metadataFrom(event);
  if (name === "read_file") return t("activity.work.readFile");
  if (name === "search_code") return t("activity.work.searchCode");
  if (name === "list_files") return t("activity.work.listFiles");
  if (name === "run_command") return t("activity.work.runCommand");
  if (name === "run_test") return t("activity.work.runTest");
  if (name === "run_lint") return t("activity.work.runLint");
  if (name === "git_status") return t("activity.work.gitStatus");
  if (name === "git_diff") return t("activity.work.gitDiff");
  if (name === "use_skill") return t("activity.work.useSkill");
  if (name === "mcp_call") return t("activity.work.mcpCall");
  if (name === "apply_patch" && metadata?.preflight === true) return t("activity.work.checkPatch");
  if (name === "apply_patch") return t("activity.work.applyPatch");
  if (name === "finish") return t("activity.work.finish");
  return t("activity.work.generic");
}

function executedTitle(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  const params = actionParams(event);
  const metadata = metadataFrom(event);
  const path = firstPresent(params, ["path", "file", "file_path", "target"]);
  const query = firstPresent(params, ["query", "pattern", "symbol"]);
  const command = firstPresent(params, ["command", "cmd"]) ?? stringValue(metadata?.command);
  const files = Array.isArray(metadata?.files) ? metadata.files.length : undefined;

  if (name === "read_file" && path) return t("activity.title.readFile", { path: compactText(path, 56) });
  if (name === "search_code" && query) return t("activity.title.searchCode", { query: compactText(query, 56) });
  if (name === "list_files") return t("activity.title.listFiles");
  if (name === "run_command" && command) return t("activity.title.runCommand", { command: compactText(command, 64) });
  if (name === "run_test") return command ? t("activity.title.runTests", { command: compactText(command, 64) }) : t("activity.work.runTest");
  if (name === "run_lint") return command ? t("activity.title.runLint", { command: compactText(command, 64) }) : t("activity.work.runLint");
  if (name === "git_status") return t("activity.title.gitStatus");
  if (name === "git_diff") return t("activity.title.gitDiff");
  if (name === "use_skill") return t("activity.title.useSkill");
  if (name === "mcp_call") return t("activity.title.mcpCall");
  if (name === "apply_patch") return t("activity.title.editFiles", { count: files ?? 1 });
  return actionLabel(event, t);
}

function actionDetail(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  const metadata = metadataFrom(event);
  if (name === "read_file") return t("activity.actionDetail.readFile");
  if (name === "search_code") return t("activity.actionDetail.searchCode");
  if (name === "list_files") return t("activity.actionDetail.listFiles");
  if (name === "run_command") return t("activity.actionDetail.runCommand");
  if (name === "run_test") return t("activity.actionDetail.runTest");
  if (name === "run_lint") return t("activity.actionDetail.runLint");
  if (name === "git_status") return t("activity.actionDetail.gitStatus");
  if (name === "git_diff") return t("activity.actionDetail.gitDiff");
  if (name === "use_skill") return t("activity.actionDetail.useSkill");
  if (name === "mcp_call") return t("activity.actionDetail.mcpCall");
  if (name === "apply_patch" && metadata?.preflight === true) return t("activity.actionDetail.checkPatch");
  if (name === "apply_patch") return t("activity.actionDetail.applyPatch");
  if (name === "finish") return t("activity.actionDetail.finish");
  return t("activity.detail.action");
}

function activityChips(locale: Locale, event: TraceEvent, t: Translator): string[] {
  const params = actionParams(event);
  const metadata = metadataFrom(event);
  const approval = approvalFrom(event);
  const target = asRecord(approval?.target);
  const request = requestFrom(event);
  const response = responseFrom(event);
  const usage = asRecord(response?.usage);
  const chips: string[] = [];
  const name = actionName(event);
  const model = stringValue(request?.model) ?? stringValue(response?.model);
  const tokens = numberValue(usage?.total_tokens);
  const command = firstPresent(params, ["command", "cmd"]) ?? stringValue(metadata?.command) ?? stringValue(target?.command);
  const path = firstPresent(params, ["path", "file", "file_path", "target"]);
  const query = firstPresent(params, ["query", "pattern", "symbol"]);
  const files = Array.isArray(metadata?.files) ? metadata.files.length : Array.isArray(target?.files) ? target.files.length : undefined;
  const additions = numberValue(metadata?.additions) ?? numberValue(target?.additions);
  const deletions = numberValue(metadata?.deletions) ?? numberValue(target?.deletions);

  if (model) chips.push(labelValue(t("activity.modelLabel"), translateKnownText(locale, model)));
  if (tokens) chips.push(t("activity.tokenCount", { count: tokens }));
  if (name && !isBuiltInAction(name)) chips.push(labelValue(t("activity.toolLabel"), translateKnownText(locale, name)));
  if (command) chips.push(labelValue(t("activity.commandLabel"), compactText(command, 72)));
  if (path) chips.push(labelValue(t("activity.fileLabel"), compactText(path, 64)));
  if (query) chips.push(labelValue(t("activity.queryLabel"), compactText(query, 64)));
  if (files !== undefined) chips.push(t("activity.fileCount", { count: files }));
  if (additions || deletions) chips.push(t("activity.diffStat", { additions: additions ?? 0, deletions: deletions ?? 0 }));
  return chips;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function compactText(value: string, max = 128): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function isInternalFieldError(value: string | undefined): boolean {
  return Boolean(value && /^'[^']+'$/.test(value.trim()));
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function actionFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.action);
}

function resultFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.result);
}

function approvalFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.approval);
}

function assessmentFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.assessment);
}

function evaluationFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.evaluation);
}

function metadataFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(resultFrom(event)?.metadata) ?? asRecord(approvalFrom(event)?.target);
}

function requestFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.request);
}

function responseFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(event.payload.response);
}

function actionName(event: TraceEvent): string | undefined {
  const action = actionFrom(event);
  const result = resultFrom(event);
  const target = asRecord(approvalFrom(event)?.target);
  const name = stringValue(action?.type) ?? stringValue(result?.tool) ?? stringValue(target?.tool);
  if (!name || name === "action" || name === "unknown") return undefined;
  return name;
}

function actionIdFrom(event: TraceEvent): string | undefined {
  return stringValue(actionFrom(event)?.action_id);
}

function actionParams(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(actionFrom(event)?.params);
}

function firstPresent(params: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!params) return undefined;
  for (const key of keys) {
    const value = stringValue(params[key]) ?? numberValue(params[key]);
    if (value) return value;
  }
  return undefined;
}

function labelValue(label: string, value: string): string {
  return label.endsWith(":") ? `${label} ${value}` : `${label}${value}`;
}

function isBuiltInAction(name: string): boolean {
  return [
    "read_file",
    "search_code",
    "list_files",
    "run_command",
    "run_test",
    "run_lint",
    "git_status",
    "git_diff",
    "use_skill",
    "mcp_call",
    "apply_patch",
    "finish",
  ].includes(name);
}

function outputLabel(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  if (name === "run_command" || name === "run_test" || name === "run_lint") return t("activity.outputCommand");
  if (name === "git_status" || name === "git_diff" || name === "apply_patch") return t("activity.outputChanges");
  if (name === "search_code" || name === "list_files") return t("activity.outputResults");
  return t("activity.outputSummary");
}

function localizedRationale(locale: Locale, rationale: string): string | undefined {
  const translated = translateKnownText(locale, rationale);
  if (locale === "zh" && translated === rationale && !containsCjk(rationale)) return undefined;
  if (locale === "en" && translated === rationale && containsCjk(rationale)) return undefined;
  return translated;
}

function rationaleDetail(locale: Locale, rationale: string | undefined, fallback: string, t: Translator): string {
  if (!rationale) return fallback;
  const localized = localizedRationale(locale, rationale);
  if (!localized) return fallback;
  return t("activity.reasonPrefix", { reason: compactText(localized, 150) });
}

function outputPreview(locale: Locale, event: TraceEvent): string | undefined {
  const result = resultFrom(event);
  const output = stringValue(result?.error) ?? stringValue(result?.output);
  if (!output || isInternalFieldError(output)) return undefined;
  const name = actionName(event);
  if (name === "read_file") return undefined;
  return compactText(translateKnownText(locale, output), 420);
}

function assessmentSummary(locale: Locale, event: TraceEvent, fallback: string): string {
  const assessment = assessmentFrom(event);
  const summary = stringValue(assessment?.summary);
  return summary ? compactText(translateKnownText(locale, summary), 180) : fallback;
}

function policySummary(locale: Locale, event: TraceEvent, fallback: string): string {
  const evaluation = evaluationFrom(event);
  const decisions = Array.isArray(evaluation?.decisions) ? evaluation.decisions : [];
  const records = decisions.map(asRecord).filter(Boolean);
  const lastDecision = records[records.length - 1];
  const reason = stringValue(lastDecision?.reason);
  return reason ? compactText(translateKnownText(locale, reason), 180) : fallback;
}
