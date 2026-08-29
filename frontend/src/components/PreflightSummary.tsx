import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Braces,
  Check,
  KeyRound,
  ListChecks,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  completionExpectations?: string[];
  busy: boolean;
  advancedOpen: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onConfigureModel: () => void;
  onToggleAdvanced: () => void;
}

export function PreflightSummary({
  mode,
  task,
  model,
  context,
  governance,
  extensions,
  completionExpectations,
  busy,
  advancedOpen,
  onBack,
  onLaunch,
  onConfigureModel,
  onToggleAdvanced,
}: PreflightSummaryProps) {
  const { locale, t } = usePreferences();
  const ready = model?.configured === true;
  const skillCount = extensions?.settings.active_skill_ids.length || 0;
  const mcpCount = extensions?.settings.enabled_mcp_server_ids.length || 0;
  const hookCount = extensions?.settings.enabled_hook_ids.length || 0;

  return (
    <section className="preflightSummary" aria-labelledby="preflight-title">
      <header className="preflightHeader">
        <div>
          <span className="stageEyebrow">{t("preflight.eyebrow")}</span>
          <h1 id="preflight-title">{t("preflight.title")}</h1>
          <p>{t("preflight.description")}</p>
        </div>
        <span className="preflightReady"><Check size={16} />{t("preflight.contextReady")}</span>
      </header>

      <div className="preflightTask">
        <span>{translateMode(locale, mode)}</span>
        <p>{task}</p>
      </div>

      <SetupGroup
        title={t("preflight.required")}
        badge={t("preflight.requiredBadge")}
        tone={ready ? "ready" : "required"}
      >
        <SetupRow
          icon={ready ? Bot : KeyRound}
          title={t("preflight.model")}
          value={model?.model || t("top.modelUnchecked")}
          status={t(ready ? "preflight.ready" : "preflight.needsSetup")}
          tone={ready ? "ready" : "required"}
          action={!ready ? { label: t("task.configureModel"), onClick: onConfigureModel } : undefined}
        />
      </SetupGroup>

      <SetupGroup title={t("preflight.automatic")} badge={t("preflight.noSetup")}>
        <div className="setupRowGrid">
          <SetupRow
            icon={ShieldCheck}
            title={t("preflight.sandbox")}
            value={governance?.settings.sandbox_profile || t("governance.profile.standard")}
            status={t("preflight.managed")}
            compact
          />
          <SetupRow
            icon={Braces}
            title={t("preflight.context")}
            value={t("preflight.contextItems", { count: context?.selected_items.length || 0 })}
            status={t("preflight.managed")}
            compact
          />
          <SetupRow
            icon={ListChecks}
            title={t("preflight.completionGuard")}
            value={t("preflight.checkCount", { count: completionExpectations?.length || 0 })}
            status={t("preflight.managed")}
            compact
          />
        </div>
      </SetupGroup>

      <SetupGroup title={t("preflight.optional")} badge={t("preflight.optionalBadge")}>
        <div className="setupRowGrid optionalSetupGrid">
          <SetupRow icon={Sparkles} title={t("preflight.skills")} value={extensionValue(skillCount, t)} status={t("preflight.optionalStatus")} compact />
          <SetupRow icon={Network} title="MCP" value={extensionValue(mcpCount, t)} status={t("preflight.optionalStatus")} compact />
          <SetupRow icon={Workflow} title="Hooks" value={extensionValue(hookCount, t)} status={t("preflight.optionalStatus")} compact />
        </div>
        <button type="button" className="advancedSettingsAction" onClick={onToggleAdvanced}>
          <SlidersHorizontal size={16} />
          {t(advancedOpen ? "preflight.hideAdvanced" : "preflight.showAdvanced")}
        </button>
      </SetupGroup>

      <footer className="preflightActions">
        <button type="button" className="secondaryTextAction" disabled={busy} onClick={onBack}>
          <ArrowLeft size={16} />{t("preflight.back")}
        </button>
        <div>
          <span>{t(ready ? "preflight.launchHint" : "preflight.launchBlocked")}</span>
          <button type="button" className="textPrimaryAction" disabled={busy || !ready} onClick={onLaunch}>
            {busy ? t("preflight.launching") : t("preflight.launch")}
            <ArrowRight size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}

function SetupGroup({
  title,
  badge,
  tone = "neutral",
  children,
}: {
  title: string;
  badge: string;
  tone?: "neutral" | "ready" | "required";
  children: React.ReactNode;
}) {
  return (
    <section className={`setupGroup tone-${tone}`}>
      <header className="setupGroupHeader">
        <h2>{title}</h2>
        <span>{badge}</span>
      </header>
      {children}
    </section>
  );
}

function SetupRow({
  icon: Icon,
  title,
  value,
  status,
  tone = "neutral",
  compact = false,
  action,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  status: string;
  tone?: "neutral" | "ready" | "required";
  compact?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`setupRow tone-${tone} ${compact ? "compact" : ""}`}>
      <span className="setupRowIcon"><Icon size={18} /></span>
      <div className="setupRowCopy"><strong>{title}</strong><span>{value}</span></div>
      <span className="setupRowStatus">{status}</span>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  );
}

function extensionValue(
  count: number,
  t: (key: "preflight.enabledCount" | "preflight.notEnabled", variables?: Record<string, string | number>) => string,
): string {
  return count ? t("preflight.enabledCount", { count }) : t("preflight.notEnabled");
}
