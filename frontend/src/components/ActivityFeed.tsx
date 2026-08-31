import {
  Activity,
  Ban,
  Box,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CornerDownRight,
  FileDiff,
  FileText,
  History,
  Layers3,
  PlugZap,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { TraceEvent } from "../api/client";
import { type Locale, translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface ActivityFeedProps {
  events: TraceEvent[];
  status: string;
  embedded?: boolean;
}

function eventPresentation(event: string): { icon: LucideIcon; tone: string } {
  if (event.startsWith("user.guidance.")) return { icon: UserRound, tone: "action" };
  if (event.startsWith("model.")) return { icon: Sparkles, tone: "model" };
  if (event.startsWith("tool.")) return { icon: Wrench, tone: "tool" };
  if (event.startsWith("action.")) return { icon: CornerDownRight, tone: "action" };
  if (event.startsWith("approval.")) return { icon: ShieldAlert, tone: "approval" };
  if (event.startsWith("patch.")) return { icon: FileDiff, tone: "patch" };
  if (event.startsWith("repair.")) return { icon: History, tone: "approval" };
  if (event.startsWith("rollback.")) return { icon: RotateCcw, tone: "patch" };
  if (event.startsWith("memory.")) return { icon: BrainCircuit, tone: "model" };
  if (event.startsWith("context.")) return { icon: Layers3, tone: "tool" };
  if (event.startsWith("policy.") || event.startsWith("governance.")) return { icon: ShieldAlert, tone: "approval" };
  if (event.startsWith("sandbox.")) return { icon: Box, tone: "tool" };
  if (event.startsWith("skill.") || event.startsWith("mcp.") || event.startsWith("hook.") || event.startsWith("extension.")) {
    return { icon: PlugZap, tone: "model" };
  }
  if (event === "report.generated") return { icon: FileText, tone: "success" };
  if (event === "run.finished") return { icon: CheckCircle2, tone: "success" };
  if (event === "run.cancelled") return { icon: Ban, tone: "muted" };
  if (event.includes("failed") || event.includes("exceeded")) return { icon: CircleAlert, tone: "danger" };
  return { icon: Activity, tone: "runtime" };
}

function isProcessEvent(event: TraceEvent): boolean {
  if (event.event === "action.parsed" && actionName(event) !== "finish") return false;
  if (event.event === "model.requested" || event.event === "model.responded") return false;
  if (event.event === "run.step.started") return false;
  if (event.event === "run.created" || event.event === "run.transitioned" || event.event === "run.loop.started") return false;
  if (event.event === "capability.menu.built") return false;
  if (event.event === "observation.recorded") return false;
  if (event.event.startsWith("model.cache.")) return false;
  return true;
}

function eventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type Translator = ReturnType<typeof usePreferences>["t"];

interface ProcessEvent {
  title: string;
  detail: string;
  chips: string[];
  output?: string;
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

function metadataFrom(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(resultFrom(event)?.metadata) ?? asRecord(approvalFrom(event)?.target);
}

function actionName(event: TraceEvent): string | undefined {
  const action = actionFrom(event);
  const result = resultFrom(event);
  const target = asRecord(approvalFrom(event)?.target);
  return stringValue(action?.type) ?? stringValue(result?.tool) ?? stringValue(target?.tool);
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

function activityChips(locale: Locale, event: TraceEvent, t: Translator): string[] {
  const params = actionParams(event);
  const metadata = metadataFrom(event);
  const approval = approvalFrom(event);
  const target = asRecord(approval?.target);
  const chips: string[] = [];
  const name = actionName(event);
  const command = firstPresent(params, ["command", "cmd"]) ?? stringValue(metadata?.command) ?? stringValue(target?.command);
  const path = firstPresent(params, ["path", "file", "file_path", "target"]);
  const query = firstPresent(params, ["query", "pattern", "symbol"]);
  const files = Array.isArray(metadata?.files) ? metadata.files.length : Array.isArray(target?.files) ? target.files.length : undefined;
  const additions = numberValue(metadata?.additions) ?? numberValue(target?.additions);
  const deletions = numberValue(metadata?.deletions) ?? numberValue(target?.deletions);

  if (name) chips.push(labelValue(t("activity.toolLabel"), translateKnownText(locale, name)));
  if (command) chips.push(labelValue(t("activity.commandLabel"), compactText(command, 72)));
  if (path) chips.push(labelValue(t("activity.fileLabel"), compactText(path, 64)));
  if (query) chips.push(labelValue(t("activity.queryLabel"), compactText(query, 64)));
  if (files !== undefined) chips.push(t("activity.fileCount", { count: files }));
  if (additions || deletions) chips.push(t("activity.diffStat", { additions: additions ?? 0, deletions: deletions ?? 0 }));
  return chips;
}

function actionLabel(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  const metadata = metadataFrom(event);
  if (name === "read_file") return t("activity.work.readFile");
  if (name === "search_code") return t("activity.work.searchCode");
  if (name === "list_files") return t("activity.work.listFiles");
  if (name === "run_command") return t("activity.work.runCommand");
  if (name === "apply_patch" && metadata?.preflight === true) return t("activity.work.checkPatch");
  if (name === "apply_patch") return t("activity.work.applyPatch");
  if (name === "finish") return t("activity.work.finish");
  return t("activity.work.generic");
}

function actionDetail(event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  const metadata = metadataFrom(event);
  if (name === "read_file") return t("activity.actionDetail.readFile");
  if (name === "search_code") return t("activity.actionDetail.searchCode");
  if (name === "list_files") return t("activity.actionDetail.listFiles");
  if (name === "run_command") return t("activity.actionDetail.runCommand");
  if (name === "apply_patch" && metadata?.preflight === true) return t("activity.actionDetail.checkPatch");
  if (name === "apply_patch") return t("activity.actionDetail.applyPatch");
  if (name === "finish") return t("activity.actionDetail.finish");
  return t("activity.detail.action");
}

function localizedRationale(locale: Locale, rationale: string): string | undefined {
  const translated = translateKnownText(locale, rationale);
  if (locale === "zh" && translated === rationale && !containsCjk(rationale)) return undefined;
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
  if (!output) return undefined;
  const name = actionName(event);
  if (name === "read_file") return undefined;
  return compactText(translateKnownText(locale, output), 420);
}

function activityState(status: string): { key: "activity.live" | "activity.completed" | "activity.failed" | "activity.cancelled" | "activity.paused"; tone: string } {
  if (["running", "applying_patch", "testing", "repairing", "cancellation_requested"].includes(status)) {
    return { key: "activity.live", tone: "active" };
  }
  if (status === "completed") return { key: "activity.completed", tone: "completed" };
  if (status === "failed") return { key: "activity.failed", tone: "failed" };
  if (status === "cancelled") return { key: "activity.cancelled", tone: "cancelled" };
  return { key: "activity.paused", tone: "paused" };
}

function processEvent(
  event: TraceEvent,
  locale: Locale,
  t: Translator,
): ProcessEvent {
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
    return {
      title: t("activity.title.runtime"),
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
    return {
      title: actionLabel(event, t),
      detail: rationaleDetail(locale, rationale, actionDetail(event, t), t),
      chips,
    };
  }
  if (event.event === "action.rejected") {
    return {
      title: t("activity.work.blocked"),
      detail: resultError ? translateKnownText(locale, resultError) : t("activity.detail.actionRejected"),
      chips,
      output: outputPreview(locale, event),
    };
  }
  if (event.event === "tool.executed") {
    const command = firstPresent(params, ["command", "cmd"]);
    return {
      title: actionLabel(event, t),
      detail: rationaleDetail(locale, rationale, command ? t("activity.detail.commandExecuted") : actionDetail(event, t), t),
      chips,
      output: outputPreview(locale, event),
    };
  }
  if (event.event === "tool.failed") {
    return {
      title: t("activity.work.failed", { action: actionLabel(event, t) }),
      detail: resultError ? translateKnownText(locale, resultError) : t("activity.detail.failed"),
      chips,
      output: outputPreview(locale, event),
    };
  }
  if (event.event === "approval.requested") return { title: actionName(event) === "apply_patch" ? t("activity.title.patchApprovalRequested") : t("activity.title.approvalRequested"), detail: t("activity.detail.approvalRequested"), chips };
  if (event.event.startsWith("user.guidance.")) return { title: t("activity.title.guidance"), detail: t("activity.detail.guidance"), chips };
  if (event.event.startsWith("context.")) return { title: t("activity.title.context"), detail: t("activity.detail.context"), chips };
  if (event.event.startsWith("patch.")) return { title: t("activity.title.patch"), detail: t("activity.detail.patch"), chips };
  if (event.event === "capability.menu.built") return { title: t("activity.title.capabilities"), detail: t("activity.detail.capabilities"), chips };
  if (event.event === "report.generated") return { title: t("activity.title.report"), detail: t("activity.detail.report"), chips };
  if (event.event === "run.finished") return { title: t("activity.title.completed"), detail: t("activity.detail.completed"), chips };
  if (event.event === "run.cancelled") return { title: t("activity.title.cancelled"), detail: t("activity.detail.cancelled"), chips };
  return { title: t("activity.title.runtime"), detail: t("activity.detail.system"), chips };
}

export function ActivityFeed({ events, status, embedded = false }: ActivityFeedProps) {
  const { locale, t } = usePreferences();
  const [expanded, setExpanded] = useState(true);
  const processEvents = events.filter(isProcessEvent);
  const visibleEvents = processEvents.slice(expanded ? -10 : -3);
  const state = activityState(status);
  const latestEvent = processEvents[processEvents.length - 1];
  const latestPresentation = latestEvent ? eventPresentation(latestEvent.event) : null;
  const LatestIcon = latestPresentation?.icon ?? Activity;
  const latestProcess = latestEvent ? processEvent(latestEvent, locale, t) : null;

  if (embedded && processEvents.length === 0) return null;

  return (
    <section className={`activityPanel${embedded ? " activityPanelInline" : ""}`} aria-live="polite">
      <div className="activityHeader">
        <button type="button" className="activityToggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronDown className={expanded ? "expanded" : ""} size={15} />
          <span><strong>{embedded ? t("activity.workLogTitle") : t("activity.title")}</strong><small>{t("activity.workLogDescription", { count: processEvents.length })}</small></span>
        </button>
        <div className={`liveIndicator ${state.tone}`}>
          <span aria-hidden="true" />
          {t(state.key)}
        </div>
      </div>

      {!expanded && latestEvent ? (
        <div className="activityPreview">
          <div className={`eventIcon tone-${latestPresentation?.tone ?? "runtime"}`}><LatestIcon size={15} /></div>
          <div><strong>{latestProcess?.title}</strong><span>{latestProcess?.detail}</span></div>
          <time dateTime={latestEvent.time}>{eventTime(latestEvent.time)}</time>
        </div>
      ) : null}

      {expanded && visibleEvents.length === 0 ? (
        <div className="activityEmpty">
          <div className="emptyGlyph"><Activity size={20} /></div>
          <strong>{t("activity.emptyTitle")}</strong>
          <span>{t("activity.emptyDescription")}</span>
        </div>
      ) : expanded ? (
        <div className="activityList">
          {visibleEvents.map((event, index) => {
            const presentation = eventPresentation(event.event);
            const Icon = presentation.icon;
            const item = processEvent(event, locale, t);
            return (
              <article className="activityItem" key={`${event.time}-${event.event}-${index}`}>
                <div className={`eventIcon tone-${presentation.tone}`}>
                  <Icon size={15} aria-hidden="true" />
                </div>
                <div className="eventCopy">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  {item.chips.length ? (
                    <div className="activityChips">
                      {item.chips.slice(0, 3).map((chip) => <em key={chip}>{chip}</em>)}
                    </div>
                  ) : null}
                  {item.output ? (
                    <details className="activityOutput">
                      <summary>{t("activity.outputSummary")}</summary>
                      <pre>{item.output}</pre>
                    </details>
                  ) : null}
                </div>
                <time dateTime={event.time}>{eventTime(event.time)}</time>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
