import {
  Check,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { PlanStep, TraceEvent } from "../api/client";
import type { TranslationKey } from "../i18n";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { ActivityFeed } from "./ActivityFeed";

interface RunStatusDeckProps {
  status: string;
  plan: PlanStep[];
  trace: TraceEvent[];
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

export function RunStatusDeck({ status, plan, trace, onOpenControlPlane }: RunStatusDeckProps) {
  const { locale, t } = usePreferences();
  const currentStep = plan.find((item) => item.state === "active") ?? plan.find((item) => item.state === "failed");
  const completedSteps = plan.filter((item) => item.state === "done").length;
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

      <div className="runStatusCurrent">
        <div className="runStatusCurrentFocus">
          <small>{t("runStatus.currentStep")}</small>
          <strong>{currentStep ? translateKnownText(locale, currentStep.title) : t("runStatus.noActiveStep")}</strong>
          <span>{currentStep ? stepHint(currentStep, locale, t) : t("runStatus.safeBoundary")}</span>
        </div>
        <span className="runStatusLatestEvent">
          {trace.length ? t("runStatus.processHint") : t("runStatus.noEvents")}
        </span>
      </div>

      {plan.length ? (
        <div className="runStatusTimeline" aria-label={t("progress.title")}>
          <div className="runStatusStepSummary">
            <span>{t("progress.summary", { completed: completedSteps, total: plan.length })}</span>
            <i aria-hidden="true"><b style={{ width: `${Math.round((completedSteps / plan.length) * 100)}%` }} /></i>
          </div>
          <details className="runStepDetails">
            <summary>{t("runStatus.viewSteps")}</summary>
            <ol>
              {plan.map((item) => (
                <li className={`state-${item.state}`} key={item.id ?? item.title}>
                  <span><StepIcon state={item.state} /></span>
                  <div>
                    <strong>{translateKnownText(locale, item.title)}</strong>
                    <small>{t(stepStateLabel(item.state))}</small>
                    <em>{stepHint(item, locale, t)}</em>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        </div>
      ) : null}

      <ActivityFeed events={trace} status={status} embedded />
    </section>
  );
}

function stepHint(step: PlanStep, locale: "zh" | "en", t: (key: TranslationKey, values?: Record<string, string | number>) => string): string {
  const key = stepHintKey(step.title);
  if (key) return t(key);
  if (step.detail) return translateKnownText(locale, step.detail);
  return t("runStatus.stepHint.generic");
}

function stepHintKey(title: string): TranslationKey | undefined {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes("scan workspace")) return "runStatus.stepHint.scan";
  if (normalized.includes("compile agentcontract")) return "runStatus.stepHint.contract";
  if (normalized.includes("build context")) return "runStatus.stepHint.context";
  if (normalized.includes("inspect relevant code")) return "runStatus.stepHint.inspect";
  if (normalized.includes("propose patch") || normalized.includes("generate patch")) return "runStatus.stepHint.patch";
  if (normalized.includes("run validation")) return "runStatus.stepHint.validation";
  if (normalized.includes("write report")) return "runStatus.stepHint.report";
  return undefined;
}

function StepIcon({ state }: { state: string }) {
  if (state === "done") return <Check size={13} strokeWidth={2.5} />;
  if (state === "active") return <LoaderCircle className="spin" size={13} />;
  if (state === "failed") return <CircleAlert size={13} />;
  return <span aria-hidden="true" />;
}

function stepStateLabel(state: string): TranslationKey {
  if (state === "done") return "progress.done";
  if (state === "active") return "progress.active";
  if (state === "failed") return "progress.failed";
  if (state === "cancelled") return "progress.cancelled";
  if (state === "skipped") return "progress.skipped";
  return "progress.waiting";
}
