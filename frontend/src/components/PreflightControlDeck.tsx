import {
  Boxes,
  CheckCircle2,
  GitBranch,
  Layers3,
  ShieldCheck,
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
  onOpenAgentPack: () => void;
}

export function PreflightControlDeck({
  model,
  admission,
  contract,
  context,
  governance,
  agentPackDrift,
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
  const admissionDetailKey = admissionBlocked
    ? "preflightDeck.admissionBlockedDetail"
    : admission?.decision === "warning"
      ? "preflightDeck.admissionWarningDetail"
      : "preflightDeck.admissionReadyDetail";
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
      </header>

      <div className="preflightQuickChecks">
        <PreflightCheckRow
          icon={<CheckCircle2 size={16} />}
          tone={admissionBlocked ? "danger" : admission?.decision === "warning" ? "warning" : "success"}
          title={t("preflightDeck.admission")}
          value={admission ? t(`admission.badge.${admission.decision}` as TranslationKey) : t("status.checking")}
          detail={admission ? t(admissionDetailKey as TranslationKey) : t("preflightDeck.waiting")}
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
        <button type="button" className={`preflightAgentPackStrip state-${packState}`} onClick={onOpenAgentPack}>
          <span>{packState === "changed" ? <GitBranch size={16} /> : <Boxes size={16} />}</span>
          <div>
            <strong>{t("preflightDeck.agentPack")}</strong>
            <small>{agentPackDrift ? t(`preflightDeck.agentPack.${packState}` as TranslationKey) : t("preflightDeck.agentPack.loading")}</small>
          </div>
          <em>{agentPackDrift?.changed_sections.length ? t("preflightDeck.agentPackChanges", { count: agentPackDrift.changed_sections.length }) : t("preflightDeck.openAgentPack")}</em>
        </button>
      </div>
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
