import {
  BrainCircuit,
  Braces,
  Check,
  CircleAlert,
  CircleGauge,
  FileCheck2,
  Gauge,
  Zap,
  Layers3,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import type {
  AgentContract,
  ContextPack,
  ExtensionResponse,
  FormalAgentProgram,
  GovernanceResponse,
  MemoryResponse,
  RunMode,
  TraceEvent,
} from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

export type ControlPlaneTarget = "overview" | "program" | "context" | "memory" | "governance" | "extensions" | "changes";

interface AgentOSControlPlaneProps {
  variant: "manifest" | "runtime";
  mode: RunMode;
  contract?: AgentContract;
  formalProgram?: FormalAgentProgram;
  context?: ContextPack;
  memory?: MemoryResponse;
  governance?: GovernanceResponse;
  extensions?: ExtensionResponse;
  trace?: TraceEvent[];
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
  formalProgram,
  context,
  memory,
  governance,
  extensions,
  trace = [],
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
  const providerRequests = trace.filter((event) => event.event === "model.requested").length;
  const cacheHits = trace.filter((event) => event.event === "model.cache.hit").length;
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
      id: "program",
      label: "control.program",
      value: t("control.programValue", { count: formalProgram?.lints.filter((lint) => lint.status === "passed").length ?? 0 }),
      hint: t("control.hint.program"),
      icon: Braces,
      target: "program",
      tone: formalProgram?.lints.some((lint) => lint.status !== "passed") ? "warning" : "success",
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
      id: "model-gate",
      label: "control.modelGate",
      value: t("control.modelGateValue", { requests: providerRequests, hits: cacheHits }),
      hint: t("control.hint.modelGate"),
      icon: Zap,
      target: "overview",
      tone: cacheHits > 0 ? "success" : "normal",
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

  const signalById = new Map(runtimeSignals.map((signal) => [signal.id, signal]));
  const manifestSignals: ControlSignal[] = [
    signalById.get("contract")!,
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
    signalById.get("program")!,
    signalById.get("context")!,
    signalById.get("sandbox")!,
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
  const primaryIds = variant === "manifest"
    ? new Set(["budget", "sandbox", "verification"])
    : new Set(["program", "context", "sandbox"]);
  const primarySignals = signals.filter((signal) => primaryIds.has(signal.id));
  const secondarySignals = signals.filter((signal) => !primaryIds.has(signal.id));
  const runtimeState = controlPlaneRuntimeState(runStatus);
  const StateIcon = variant === "manifest" ? Check : runtimeState.icon;

  function renderSignal(signal: ControlSignal) {
    const Icon = signal.icon;
    const content = (
      <>
        <span className="controlSignalIcon"><Icon size={16} /></span>
        <span className="controlSignalCopy">
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
  }

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

      {variant === "manifest" ? (
        <div className="controlPlaneSignals manifestGrid">
          {signals.map(renderSignal)}
        </div>
      ) : (
        <>
          <div className="controlPlaneSignals">
            {primarySignals.map(renderSignal)}
          </div>
          {secondarySignals.length ? (
            <div className="controlPlaneMore">
              <div className="controlPlaneMoreLabel">{t("control.showAdvanced")}</div>
              <div className="controlPlaneSignals secondary">{secondarySignals.map(renderSignal)}</div>
            </div>
          ) : null}
        </>
      )}
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
