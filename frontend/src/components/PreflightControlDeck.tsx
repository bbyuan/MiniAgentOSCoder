import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  GitBranch,
  KeyRound,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  AgentContract,
  ContextPack,
  ExtensionResponse,
  GovernanceResponse,
  ModelProviderStatus,
  ModelRoutePlan,
  RunAdmission,
  RunMode,
} from "../api/client";
import type { TranslationKey } from "../i18n";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface PreflightControlDeckProps {
  mode: RunMode;
  task: string;
  model?: ModelProviderStatus;
  admission?: RunAdmission;
  modelRoute?: ModelRoutePlan;
  contract?: AgentContract;
  context?: ContextPack;
  governance?: GovernanceResponse;
  extensions?: ExtensionResponse;
  onConfigureModel: () => void;
}

const routePhases = ["inspect", "work", "verify", "repair"] as const;

export function PreflightControlDeck({
  mode,
  task,
  model,
  admission,
  modelRoute,
  contract,
  context,
  governance,
  extensions,
  onConfigureModel,
}: PreflightControlDeckProps) {
  const { locale, t } = usePreferences();
  const modelReady = model?.configured === true;
  const admissionReady = admission?.decision === "ready";
  const admissionBlocked = admission?.decision === "blocked";
  const contextBudget = context?.budget_report;
  const contextPercent = contextBudget?.max_tokens
    ? Math.min(100, Math.round((contextBudget.used_tokens / contextBudget.max_tokens) * 100))
    : 0;
  const enabledExtensions = extensions
    ? extensions.settings.active_skill_ids.length
      + extensions.settings.enabled_mcp_server_ids.length
      + extensions.settings.enabled_hook_ids.length
    : 0;
  const sandbox = governance?.settings.sandbox_profile ?? "standard";
  const decisionKey = admissionBlocked
    ? "preflightDeck.decision.blocked"
    : modelReady
      ? admissionReady ? "preflightDeck.decision.ready" : "preflightDeck.decision.review"
      : "preflightDeck.decision.model";

  return (
    <section className={`preflightControlDeck tone-${admissionBlocked ? "blocked" : modelReady ? "ready" : "setup"}`} aria-labelledby="preflight-deck-title">
      <header className="preflightDeckHero">
        <div>
          <span className="stageEyebrow">{t("preflightDeck.eyebrow")}</span>
          <h2 id="preflight-deck-title">{t(decisionKey as TranslationKey)}</h2>
          <p>{t("preflightDeck.description")}</p>
        </div>
        <button
          type="button"
          className={`preflightDeckModel ${modelReady ? "ready" : "missing"}`}
          onClick={modelReady ? undefined : onConfigureModel}
        >
          {modelReady ? <Sparkles size={17} /> : <KeyRound size={17} />}
          <span>
            <strong>{model?.routing_enabled
              ? t("modelRoute.profileCount", { count: model.configured_profiles ?? 0 })
              : model?.model || t("top.modelUnchecked")}</strong>
            <small>{t(modelReady ? "preflight.ready" : "preflight.needsSetup")}</small>
          </span>
        </button>
      </header>

      <div className="preflightDeckTask">
        <span>{translateMode(locale, mode)}</span>
        <p>{task}</p>
      </div>

      <div className="preflightDecisionGrid">
        <DecisionTile
          icon={<CheckCircle2 size={17} />}
          title={t("preflightDeck.admission")}
          value={admission ? t(`admission.badge.${admission.decision}` as TranslationKey) : t("status.checking")}
          detail={admission ? t(`admission.basis.${admission.basis}` as TranslationKey, { count: admission.sample_size }) : t("preflightDeck.waiting")}
          tone={admissionBlocked ? "danger" : admission?.decision === "warning" ? "warning" : "success"}
        />
        <DecisionTile
          icon={<Gauge size={17} />}
          title={t("preflightDeck.budget")}
          value={t("preflightDeck.budgetValue", {
            models: contract?.cost_envelope.max_model_calls ?? 0,
            tools: contract?.cost_envelope.max_tool_calls ?? 0,
          })}
          detail={t("preflightDeck.stopLimit")}
          tone="normal"
        />
        <DecisionTile
          icon={<Layers3 size={17} />}
          title={t("preflightDeck.context")}
          value={t("control.contextPercent", { percent: contextPercent })}
          detail={t("preflightDeck.contextValue", {
            used: contextBudget?.used_tokens ?? 0,
            max: contextBudget?.max_tokens ?? 0,
          })}
          tone={contextPercent > 90 ? "danger" : contextPercent > 75 ? "warning" : "normal"}
          progress={contextPercent}
        />
        <DecisionTile
          icon={<ShieldCheck size={17} />}
          title={t("preflightDeck.governance")}
          value={t(`control.sandbox.${sandbox}` as TranslationKey)}
          detail={t("preflightDeck.effects", { count: contract?.effects.allow.length ?? 0 })}
          tone="success"
        />
        <DecisionTile
          icon={<BrainCircuit size={17} />}
          title={t("preflightDeck.extensions")}
          value={t("control.extensionCount", { count: enabledExtensions })}
          detail={t("preflightDeck.optional")}
          tone="normal"
        />
        <DecisionTile
          icon={<CircleDollarSign size={17} />}
          title={t("admission.cost")}
          value={formatCost(admission)}
          detail={admission?.cost.configured ? t("admission.ceiling", { value: formatCost(admission, "ceiling") }) : t("admission.costHint")}
          tone={admission?.cost.configured ? "normal" : "muted"}
        />
      </div>

      <div className="preflightRouteDeck">
        <div className="preflightRouteHeader">
          <GitBranch size={16} />
          <div>
            <strong>{t("preflightDeck.routeTitle")}</strong>
            <span>{t(modelRoute?.enabled ? "modelRoute.policyHint" : "modelRoute.compatibilityHint")}</span>
          </div>
        </div>
        <div className="preflightRouteRail">
          {routePhases.map((phase) => {
            const route = modelRoute?.routes[phase];
            const blocked = route?.configured === false;
            return (
              <div className={`preflightRouteNode ${blocked ? "blocked" : route?.fallback ? "fallback" : ""}`} key={phase}>
                <span>{blocked ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}</span>
                <small>{t(`modelRoute.phase.${phase}` as TranslationKey)}</small>
                <strong title={route?.model || ""}>{route?.model || t("modelRoute.unavailable")}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DecisionTile({
  icon,
  title,
  value,
  detail,
  tone,
  progress,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "normal" | "muted";
  progress?: number;
}) {
  return (
    <article className={`preflightDecisionTile tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{title}</small>
        <strong title={value}>{value}</strong>
        <em>{detail}</em>
      </div>
      {typeof progress === "number" ? (
        <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
      ) : null}
    </article>
  );
}

function formatCost(admission?: RunAdmission, field: "expected" | "ceiling" = "expected"): string {
  if (!admission?.cost.configured) return "-";
  const value = admission.cost[field];
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: admission.cost.currency,
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
  }).format(value);
}
