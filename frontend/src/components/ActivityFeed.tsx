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
import { translateKnownText } from "../i18n";
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

function activityState(status: string): { key: "activity.live" | "activity.completed" | "activity.failed" | "activity.cancelled" | "activity.paused"; tone: string } {
  if (["running", "applying_patch", "testing", "repairing", "cancellation_requested"].includes(status)) {
    return { key: "activity.live", tone: "active" };
  }
  if (status === "completed") return { key: "activity.completed", tone: "completed" };
  if (status === "failed") return { key: "activity.failed", tone: "failed" };
  if (status === "cancelled") return { key: "activity.cancelled", tone: "cancelled" };
  return { key: "activity.paused", tone: "paused" };
}

function eventDetail(
  event: TraceEvent,
  locale: ReturnType<typeof usePreferences>["locale"],
  t: ReturnType<typeof usePreferences>["t"],
): string {
  const error = event.payload.error;
  if (typeof error === "string" && error.trim()) return translateKnownText(locale, error);
  const reason = event.payload.termination_reason;
  if (typeof reason === "string" && reason.trim()) return translateKnownText(locale, reason);
  if (event.event.startsWith("user.guidance.")) return t("activity.detail.guidance");
  if (event.event.startsWith("model.")) return t("activity.detail.model");
  if (event.event.startsWith("tool.")) return t("activity.detail.tool");
  if (event.event.startsWith("approval.")) return t("activity.detail.approval");
  if (event.event.startsWith("context.")) return t("activity.detail.context");
  if (event.event.startsWith("patch.")) return t("activity.detail.patch");
  if (event.event.startsWith("run.")) return t("activity.detail.runtime");
  return t("activity.detail.system");
}

export function ActivityFeed({ events, status }: ActivityFeedProps) {
  const { locale, t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = events.slice(-10);
  const state = activityState(status);
  const latestEvent = events[events.length - 1];
  const latestPresentation = latestEvent ? eventPresentation(latestEvent.event) : null;
  const LatestIcon = latestPresentation?.icon ?? Activity;

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
          <div><strong>{translateKnownText(locale, latestEvent.event)}</strong><span>{eventDetail(latestEvent, locale, t)}</span></div>
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
            return (
              <article className="activityItem" key={`${event.time}-${event.event}-${index}`}>
                <div className={`eventIcon tone-${presentation.tone}`}>
                  <Icon size={15} aria-hidden="true" />
                </div>
                <div className="eventCopy">
                  <strong>{translateKnownText(locale, event.event)}</strong>
                  <span>{eventDetail(event, locale, t)}</span>
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
