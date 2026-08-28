import { ArrowLeft, ArrowRight, Bot, Boxes, Braces, CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AgentContract, ContextPack, ExtensionResponse, GovernanceResponse, ModelProviderStatus, RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface PreflightSummaryProps {
  mode: RunMode;
  task: string;
  model?: ModelProviderStatus;
  contract?: AgentContract;
  context?: ContextPack;
  governance?: GovernanceResponse;
  extensions?: ExtensionResponse;
  busy: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onConfigureModel: () => void;
}

export function PreflightSummary({
  mode,
  task,
  model,
  contract,
  context,
  governance,
  extensions,
  busy,
  onBack,
  onLaunch,
  onConfigureModel,
}: PreflightSummaryProps) {
  const { locale, t } = usePreferences();
  const extensionCount = extensions
    ? extensions.settings.active_skill_ids.length
      + extensions.settings.enabled_mcp_server_ids.length
      + extensions.settings.enabled_hook_ids.length
    : 0;
  const ready = model?.configured === true;

  return (
    <section className="preflightSummary" aria-labelledby="preflight-title">
      <header className="preflightHeader">
        <div>
          <span className="stageEyebrow">{t("preflight.eyebrow")}</span>
          <h1 id="preflight-title">{t("preflight.title")}</h1>
          <p>{t("preflight.description")}</p>
        </div>
        <span className="preflightReady"><CheckCircle2 size={15} />{t("preflight.contextReady")}</span>
      </header>

      <div className="preflightTask">
        <span>{translateMode(locale, mode)}</span>
        <p>{task}</p>
      </div>

      <div className="preflightGrid">
        <PreflightItem
          icon={Bot}
          label={t("preflight.model")}
          value={model?.model || t("top.modelUnchecked")}
          detail={ready ? t("preflight.modelReady") : model?.issues.join(", ") || t("preflight.modelMissing")}
          warning={!ready}
        />
        <PreflightItem
          icon={ShieldCheck}
          label={t("preflight.sandbox")}
          value={governance?.settings.sandbox_profile || t("governance.profile.standard")}
          detail={t("preflight.effects", { count: contract?.effects.allow.length || 0 })}
        />
        <PreflightItem
          icon={Braces}
          label={t("preflight.context")}
          value={context ? `${context.budget_report.used_tokens} / ${context.budget_report.max_tokens}` : "0 / 0"}
          detail={t("preflight.contextItems", { count: context?.selected_items.length || 0 })}
        />
        <PreflightItem
          icon={Boxes}
          label={t("preflight.extensions")}
          value={t("preflight.extensionCount", { count: extensionCount })}
          detail={t("preflight.extensionDetail", {
            skills: extensions?.settings.active_skill_ids.length || 0,
            mcp: extensions?.settings.enabled_mcp_server_ids.length || 0,
            hooks: extensions?.settings.enabled_hook_ids.length || 0,
          })}
        />
      </div>

      {!ready ? (
        <div className="preflightWarning" role="alert">
          <TriangleAlert size={17} />
          <span>{t("preflight.blocked")}</span>
          <button type="button" onClick={onConfigureModel}>{t("task.configureModel")}</button>
        </div>
      ) : null}

      <footer className="preflightActions">
        <button type="button" className="secondaryTextAction" disabled={busy} onClick={onBack}>
          <ArrowLeft size={15} />{t("preflight.back")}
        </button>
        <div>
          <span>{t("preflight.launchHint")}</span>
          <button type="button" className="textPrimaryAction" disabled={busy || !ready} onClick={onLaunch}>
            {busy ? t("preflight.launching") : t("preflight.launch")}
            <ArrowRight size={16} />
          </button>
        </div>
      </footer>
    </section>
  );
}

function PreflightItem({
  icon: Icon,
  label,
  value,
  detail,
  warning,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className={`preflightItem ${warning ? "warning" : ""}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
