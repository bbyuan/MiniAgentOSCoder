import {
  BrainCircuit,
  Check,
  CircleAlert,
  CircleGauge,
  FileCheck2,
  Gauge,
  History,
  Layers3,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import type {
  AgentContract,
  ContextPack,
  ExtensionResponse,
  GovernanceResponse,
  MemoryResponse,
  RecoveryResponse,
  RunMode,
} from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

export type ControlPlaneTarget = "overview" | "context" | "memory" | "governance" | "extensions" | "changes";

interface AgentOSControlPlaneProps {
  variant: "manifest" | "runtime";
  mode: RunMode;
  contract?: AgentContract;
  context?: ContextPack;
  memory?: MemoryResponse;
  governance?: GovernanceResponse;
  extensions?: ExtensionResponse;
  recovery?: RecoveryResponse;
  runStatus?: string;
  activeTarget?: ControlPlaneTarget;
  onOpen?: (target: ControlPlaneTarget) => void;
}

interface ControlSignal {
  id: string;
  label: TranslationKey;
  value: string;
  hint: string;
  icon: typeof ShieldCheck;
  target: ControlPlaneTarget;
  tone?: string;
  progress?: number;
}

export function AgentOSControlPlane({
  variant,
  mode,
  contract,
  context,
  memory,
  governance,
  extensions,
  recovery,
  runStatus,
  activeTarget,
  onOpen,
}: AgentOSControlPlaneProps) {
  const { t } = usePreferences();
  const contextBudget = context?.budget_report;
  const contextPercent = contextBudget?.max_tokens
    ? Math.min(100, Math.round((contextBudget.used_tokens / contextBudget.max_tokens) * 100))
    : 0;
  const memoryCount = Object.values(memory?.counts ?? {}).reduce((total, count) => total + count, 0);
  const extensionCount = extensions
    ? extensions.settings.active_skill_ids.length
      + extensions.settings.enabled_mcp_server_ids.length
      + extensions.settings.enabled_hook_ids.length
    : 0;
  const checkCount = mode === "Review" ? 3 : mode === "Chat" ? 2 : 4;
  const sandbox = governance?.settings.sandbox_profile ?? "standard";
  const contextTone = context?.threshold_state === "critical"
    ? "danger"
    : context?.threshold_state === "high" || context?.threshold_state === "warning"
      ? "warning"
      : "normal";

  const runtimeSignals: ControlSignal[] = [
    {
      id: "contract",
      label: "control.contract",
      value: t("control.effectCount", { count: contract?.effects.allow.length ?? 0 }),
      hint: t("control.hint.contract"),
      icon: FileCheck2,
      target: "overview",
    },
    {
      id: "context",
      label: "control.context",
      value: t("control.contextPercent", { percent: contextPercent }),
      hint: t("control.hint.context", { remaining: contextBudget?.remaining_tokens ?? 0 }),
      icon: Layers3,
      target: "context",
      tone: contextTone,
      progress: contextPercent,
    },
    {
      id: "memory",
      label: "control.memory",
      value: t("control.memoryCount", { count: memoryCount }),
      hint: t("control.hint.memory"),
      icon: BrainCircuit,
      target: "memory",
    },
    {
      id: "sandbox",
      label: "control.sandbox",
      value: t(`control.sandbox.${sandbox}` as TranslationKey),
      hint: t("control.hint.sandbox"),
      icon: ShieldCheck,
      target: "governance",
      tone: "success",
    },
    {
      id: "recovery",
      label: "control.recovery",
      value: t("control.recoveryCount", { count: recovery?.checkpoints.length ?? 0 }),
      hint: t("control.hint.recovery"),
      icon: History,
      target: "changes",
    },
    {
      id: "extensions",
      label: "control.extensions",
      value: t("control.extensionCount", { count: extensionCount }),
      hint: t("control.hint.extensions"),
      icon: PlugZap,
      target: "extensions",
    },
  ];

  const manifestSignals: ControlSignal[] = [
    runtimeSignals[0],
    {
      id: "budget",
      label: "control.budget",
      value: t("control.stepBudget", {
        steps: contract?.cost_envelope.max_steps ?? 0,
        tools: contract?.cost_envelope.max_tool_calls ?? 0,
      }),
      hint: t("control.hint.budget", { tools: contract?.cost_envelope.max_tool_calls ?? 0 }),
      icon: Gauge,
      target: "overview",
    },
    runtimeSignals[1],
    runtimeSignals[3],
    runtimeSignals[5],
    {
      id: "verification",
      label: "control.verification",
      value: t("control.checkCount", { count: checkCount }),
      hint: t("control.hint.verification"),
      icon: CircleGauge,
      target: "overview",
      tone: "success",
    },
  ];
  const signals = variant === "manifest" ? manifestSignals : runtimeSignals;
  const runtimeState = controlPlaneRuntimeState(runStatus);
  const StateIcon = variant === "manifest" ? Check : runtimeState.icon;

  return (
    <section className={`agentControlPlane variant-${variant}`} aria-label={t(variant === "manifest" ? "control.manifestTitle" : "control.runtimeTitle")}>
      <header className="controlPlaneHeader">
        <div className="controlPlaneIdentity">
          <span className="controlPlaneMark"><ShieldCheck size={17} /></span>
          <div>
            <strong>{t(variant === "manifest" ? "control.manifestTitle" : "control.runtimeTitle")}</strong>
            <span>{t(variant === "manifest" ? "control.manifestDescription" : "control.runtimeDescription")}</span>
          </div>
        </div>
        <span className={`controlPlaneState ${variant === "runtime" ? `tone-${runtimeState.tone}` : ""}`}>
          <StateIcon size={13} />
          {t(variant === "manifest" ? "control.compiled" : runtimeState.label)}
        </span>
      </header>

      <div className="controlPlaneSignals">
        {signals.map((signal) => {
          const Icon = signal.icon;
          const content = (
            <>
              <Icon size={16} />
              <span>
                <small>{t(signal.label)}</small>
                <strong title={signal.value}>{signal.value}</strong>
                <em>{signal.hint}</em>
              </span>
              {typeof signal.progress === "number" ? (
                <i className="controlSignalProgress" aria-hidden="true"><b style={{ width: `${signal.progress}%` }} /></i>
              ) : null}
            </>
          );
          return onOpen ? (
            <button
              type="button"
              className={`controlSignal tone-${signal.tone ?? "normal"} ${activeTarget === signal.target ? "active" : ""}`}
              onClick={() => onOpen(signal.target)}
              aria-label={t("control.open", { label: t(signal.label) })}
              key={signal.id}
            >
              {content}
            </button>
          ) : (
            <div className={`controlSignal tone-${signal.tone ?? "normal"}`} key={signal.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}

function controlPlaneRuntimeState(status?: string): { label: TranslationKey; tone: string; icon: typeof Check } {
  if (status === "waiting_approval") return { label: "control.state.waiting", tone: "warning", icon: CircleGauge };
  if (status === "completed") return { label: "control.state.completed", tone: "success", icon: Check };
  if (status === "failed") return { label: "control.state.failed", tone: "danger", icon: CircleAlert };
  if (status === "cancelled" || status === "cancellation_requested") {
    return { label: "control.state.stopped", tone: "muted", icon: CircleAlert };
  }
  return { label: "control.state.active", tone: "active", icon: ShieldCheck };
}
