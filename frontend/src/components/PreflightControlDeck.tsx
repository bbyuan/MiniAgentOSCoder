import {
  Boxes,
  CheckCircle2,
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
  AgentPackDrift,
  ContextPack,
  GovernanceResponse,
  ModelProviderStatus,
  RunAdmission,
} from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface PreflightControlDeckProps {
  model?: ModelProviderStatus;
  admission?: RunAdmission;
  contract?: AgentContract;
  context?: ContextPack;
  governance?: GovernanceResponse;
  agentPackDrift?: AgentPackDrift;
  onConfigureModel: () => void;
  onOpenAgentPack: () => void;
}

export function PreflightControlDeck({
  model,
  admission,
  contract,
  context,
  governance,
  agentPackDrift,
  onConfigureModel,
  onOpenAgentPack,
}: PreflightControlDeckProps) {
  const { t } = usePreferences();
  const modelReady = model?.configured === true;
  const admissionReady = admission?.decision === "ready";
  const admissionBlocked = admission?.decision === "blocked";
  const contextBudget = context?.budget_report;
  const contextPercent = contextBudget?.max_tokens
    ? Math.min(100, Math.round((contextBudget.used_tokens / contextBudget.max_tokens) * 100))
    : 0;
  const sandbox = governance?.settings.sandbox_profile ?? "standard";
  const decisionKey = admissionBlocked
    ? "preflightDeck.decision.blocked"
    : modelReady
      ? admissionReady ? "preflightDeck.decision.ready" : "preflightDeck.decision.review"
      : "preflightDeck.decision.model";
  const packState = agentPackDrift
    ? agentPackDrift.has_versions
      ? agentPackDrift.drift ? "changed" : "stable"
      : "empty"
    : "loading";

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

      <div className="preflightQuickChecks">
        <PreflightCheckRow
          icon={modelReady ? <Sparkles size={16} /> : <KeyRound size={16} />}
          tone={modelReady ? "success" : "danger"}
          title={t("preflightDeck.model")}
          value={modelReady ? t("task.checkReady") : t("preflight.needsSetup")}
          detail={modelReady ? model?.model || t("preflight.ready") : t("task.readinessModelMissing")}
          actionLabel={modelReady ? undefined : t("task.configureModel")}
          onAction={modelReady ? undefined : onConfigureModel}
        />
        <PreflightCheckRow
          icon={<CheckCircle2 size={16} />}
          tone={admissionBlocked ? "danger" : admission?.decision === "warning" ? "warning" : "success"}
          title={t("preflightDeck.admission")}
          value={admission ? t(`admission.badge.${admission.decision}` as TranslationKey) : t("status.checking")}
          detail={admission ? t(`admission.basis.${admission.basis}` as TranslationKey, { count: admission.sample_size }) : t("preflightDeck.waiting")}
        />
        <PreflightCheckRow
          icon={<Gauge size={16} />}
          tone="normal"
          title={t("preflightDeck.budget")}
          value={t("preflightDeck.budgetValue", {
            models: contract?.cost_envelope.max_model_calls ?? 0,
            tools: contract?.cost_envelope.max_tool_calls ?? 0,
          })}
          detail={t("preflightDeck.stopLimit")}
        />
        <PreflightCheckRow
          icon={<Layers3 size={16} />}
          tone={contextPercent > 90 ? "danger" : contextPercent > 75 ? "warning" : "normal"}
          title={t("preflightDeck.context")}
          value={t("control.contextPercent", { percent: contextPercent })}
          detail={t("preflightDeck.contextValue", {
            used: contextBudget?.used_tokens ?? 0,
            max: contextBudget?.max_tokens ?? 0,
          })}
          progress={contextPercent}
        />
        <PreflightCheckRow
          icon={<ShieldCheck size={16} />}
          tone="success"
          title={t("preflightDeck.governance")}
          value={t(`control.sandbox.${sandbox}` as TranslationKey)}
          detail={t("preflightDeck.effects", { count: contract?.effects.allow.length ?? 0 })}
        />
      </div>

      <button type="button" className={`preflightAgentPackStrip state-${packState}`} onClick={onOpenAgentPack}>
        <span>{packState === "changed" ? <GitBranch size={16} /> : <Boxes size={16} />}</span>
        <div>
          <strong>{t("preflightDeck.agentPack")}</strong>
          <small>{agentPackDrift ? t(`preflightDeck.agentPack.${packState}` as TranslationKey) : t("preflightDeck.agentPack.loading")}</small>
        </div>
        <em>{agentPackDrift?.changed_sections.length ? t("preflightDeck.agentPackChanges", { count: agentPackDrift.changed_sections.length }) : t("preflightDeck.openAgentPack")}</em>
      </button>
    </section>
  );
}

function PreflightCheckRow({
  icon,
  title,
  value,
  detail,
  tone,
  progress,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "normal" | "muted";
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className={`preflightCheckRow tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{title}</small>
        <strong title={value}>{value}</strong>
        <em>{detail}</em>
      </div>
      {actionLabel && onAction ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}
      {typeof progress === "number" ? (
        <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
      ) : null}
    </article>
  );
}
