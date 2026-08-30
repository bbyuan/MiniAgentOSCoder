import {
  Activity,
  ArrowRight,
  CircleAlert,
  Gauge,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ContextPack, PlanStep, TraceEvent } from "../api/client";
import type { TranslationKey } from "../i18n";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface RunStatusDeckProps {
  status: string;
  phase: string;
  plan: PlanStep[];
  trace: TraceEvent[];
  context?: ContextPack;
  onOpenControlPlane: () => void;
}

const statusLabels: Record<string, TranslationKey> = {
  running: "status.running",
  waiting_approval: "status.waiting_approval",
  applying_patch: "status.applying_patch",
  testing: "status.testing",
  repairing: "status.repairing",
  cancellation_requested: "status.cancellation_requested",
  completed: "status.completed",
  failed: "status.failed",
  cancelled: "status.cancelled",
  planning: "status.planning",
};

export function RunStatusDeck({ status, phase, plan, trace, context, onOpenControlPlane }: RunStatusDeckProps) {
  const { locale, t } = usePreferences();
  const currentStep = plan.find((item) => item.state === "active") ?? plan.find((item) => item.state === "failed");
  const nextStep = plan.find((item) => item.state === "waiting" || item.state === "pending");
  const lastEvent = trace.length ? trace[trace.length - 1] : undefined;
  const contextUsed = context?.budget_report.used_tokens ?? 0;
  const contextMax = context?.budget_report.max_tokens ?? 0;
  const contextPercent = contextMax ? Math.min(100, Math.round((contextUsed / contextMax) * 100)) : 0;
  const modelCalls = trace.filter((event) => event.event.startsWith("model.")).length;
  const toolCalls = trace.filter((event) => event.event.startsWith("tool.")).length;
  const guardedEvents = trace.filter((event) => event.event.startsWith("policy.") || event.event.startsWith("approval.")).length;
  const tone = ["failed", "cancelled"].includes(status)
    ? "danger"
    : status === "waiting_approval"
      ? "warning"
      : status === "completed"
        ? "success"
        : "active";

  return (
    <section className={`runStatusDeck tone-${tone}`} aria-labelledby="run-status-title">
      <header>
        <div className="runStatusIdentity">
          <span>{tone === "danger" ? <CircleAlert size={18} /> : status === "completed" ? <ShieldCheck size={18} /> : <LoaderCircle className={tone === "active" ? "spin" : ""} size={18} />}</span>
          <div>
            <small>{t("runStatus.eyebrow")}</small>
            <h2 id="run-status-title">{t(statusLabels[status] ?? "status.unknown")}</h2>
          </div>
        </div>
        <button type="button" onClick={onOpenControlPlane}>
          <ShieldCheck size={15} />
          {t("runStatus.openControl")}
        </button>
      </header>

      <div className="runStatusFocus">
        <article>
          <small>{t("runStatus.currentStep")}</small>
          <strong>{currentStep ? translateKnownText(locale, currentStep.title) : t("runStatus.noActiveStep")}</strong>
          <span>{currentStep?.detail ? translateKnownText(locale, currentStep.detail) : t("runStatus.safeBoundary")}</span>
        </article>
        <ArrowRight size={16} />
        <article>
          <small>{t("runStatus.nextStep")}</small>
          <strong>{nextStep ? translateKnownText(locale, nextStep.title) : t("runStatus.waitingForRuntime")}</strong>
          <span>{lastEvent ? t("runStatus.lastEvent", { event: translateKnownText(locale, lastEvent.event) }) : t("runStatus.noEvents")}</span>
        </article>
      </div>

      <div className="runStatusMetrics">
        <StatusMetric icon={<GitBranch size={15} />} label={t("metric.phase")} value={translateKnownText(locale, phase || status)} />
        <StatusMetric icon={<MessageSquareText size={15} />} label={t("metric.modelCalls")} value={formatNumber(modelCalls)} />
        <StatusMetric icon={<Activity size={15} />} label={t("metric.toolCalls")} value={formatNumber(toolCalls)} />
        <StatusMetric icon={<ShieldCheck size={15} />} label={t("runStatus.guarded")} value={formatNumber(guardedEvents)} />
        <StatusMetric icon={<Gauge size={15} />} label={t("metric.context")} value={t("control.contextPercent", { percent: contextPercent })} />
      </div>
    </section>
  );
}

function StatusMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="runStatusMetric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
      </div>
    </article>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
