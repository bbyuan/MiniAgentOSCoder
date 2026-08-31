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

function actionName(event: TraceEvent): string | undefined {
  const action = actionFrom(event);
  const result = resultFrom(event);
  return stringValue(action?.type) ?? stringValue(result?.tool);
}

function actionParams(event: TraceEvent): Record<string, unknown> | undefined {
  return asRecord(actionFrom(event)?.params);
}

function translatedAction(locale: Locale, event: TraceEvent): string {
  return translateKnownText(locale, actionName(event) ?? "");
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
  const chips: string[] = [];
  const name = actionName(event);
  const command = firstPresent(params, ["command", "cmd"]);
  const path = firstPresent(params, ["path", "file", "file_path", "target"]);
  const query = firstPresent(params, ["query", "pattern", "symbol"]);

  if (name) chips.push(labelValue(t("activity.toolLabel"), translateKnownText(locale, name)));
  if (command) chips.push(labelValue(t("activity.commandLabel"), compactText(command, 72)));
  if (path) chips.push(labelValue(t("activity.fileLabel"), compactText(path, 64)));
  if (query) chips.push(labelValue(t("activity.queryLabel"), compactText(query, 64)));
  return chips;
}

function actionDetail(locale: Locale, event: TraceEvent, t: Translator): string {
  const name = actionName(event);
  if (name === "read_file") return t("activity.actionDetail.readFile");
  if (name === "search_code") return t("activity.actionDetail.searchCode");
  if (name === "list_files") return t("activity.actionDetail.listFiles");
  if (name === "run_command") return t("activity.actionDetail.runCommand");
  if (name === "apply_patch") return t("activity.actionDetail.applyPatch");
  if (name === "finish") return t("activity.actionDetail.finish");
  return locale === "zh" ? t("activity.detail.action") : t("activity.detail.action");
}

function localizedRationale(locale: Locale, rationale: string): string | undefined {
  const translated = translateKnownText(locale, rationale);
  if (locale === "zh" && translated === rationale && !containsCjk(rationale)) return undefined;
  return translated;
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
  const tool = translatedAction(locale, event);
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
      title: tool ? t("activity.title.action", { action: tool }) : t("activity.title.actionGeneric"),
      detail: rationale ? compactText(localizedRationale(locale, rationale) ?? actionDetail(locale, event, t), 150) : actionDetail(locale, event, t),
      chips,
    };
  }
  if (event.event === "action.rejected") {
    return {
      title: tool ? t("activity.title.actionRejected", { action: tool }) : t("activity.title.failed"),
      detail: resultError ? translateKnownText(locale, resultError) : t("activity.detail.actionRejected"),
      chips,
    };
  }
  if (event.event === "tool.executed") {
    const command = firstPresent(params, ["command", "cmd"]);
    return {
      title: tool ? t("activity.title.toolExecuted", { tool }) : t("activity.title.toolGeneric"),
      detail: command ? t("activity.detail.commandExecuted") : t("activity.detail.tool"),
      chips,
    };
  }
  if (event.event === "tool.failed") {
    return {
      title: tool ? t("activity.title.toolFailed", { tool }) : t("activity.title.failed"),
      detail: resultError ? translateKnownText(locale, resultError) : t("activity.detail.failed"),
      chips,
    };
  }
  if (event.event === "approval.requested") return { title: t("activity.title.approvalRequested"), detail: t("activity.detail.approvalRequested"), chips };
  if (event.event.startsWith("user.guidance.")) return { title: t("activity.title.guidance"), detail: t("activity.detail.guidance"), chips };
  if (event.event.startsWith("context.")) return { title: t("activity.title.context"), detail: t("activity.detail.context"), chips };
  if (event.event.startsWith("patch.")) return { title: t("activity.title.patch"), detail: t("activity.detail.patch"), chips };
  if (event.event === "capability.menu.built") return { title: t("activity.title.capabilities"), detail: t("activity.detail.capabilities"), chips };
  if (event.event === "report.generated") return { title: t("activity.title.report"), detail: t("activity.detail.report"), chips };
  if (event.event === "run.finished") return { title: t("activity.title.completed"), detail: t("activity.detail.completed"), chips };
  if (event.event === "run.cancelled") return { title: t("activity.title.cancelled"), detail: t("activity.detail.cancelled"), chips };
  return { title: t("activity.title.runtime"), detail: t("activity.detail.system"), chips };
}

export function ActivityFeed({ events, status }: ActivityFeedProps) {
  const { locale, t } = usePreferences();
  const [expanded, setExpanded] = useState(true);
  const visibleEvents = events.slice(expanded ? -12 : -4);
  const state = activityState(status);
  const latestEvent = events[events.length - 1];
  const latestPresentation = latestEvent ? eventPresentation(latestEvent.event) : null;
  const LatestIcon = latestPresentation?.icon ?? Activity;
  const latestProcess = latestEvent ? processEvent(latestEvent, locale, t) : null;

  return (
    <section className="activityPanel" aria-live="polite">
      <div className="activityHeader">
        <button type="button" className="activityToggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronDown className={expanded ? "expanded" : ""} size={15} />
          <span><strong>{t("activity.title")}</strong><small>{t("activity.eventCount", { count: events.length })}</small></span>
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
