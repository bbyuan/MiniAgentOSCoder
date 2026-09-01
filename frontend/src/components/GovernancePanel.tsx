import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleSlash2,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { GovernanceResponse, SandboxProfile, ToolOverride } from "../api/client";
import { translateKnownText, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface GovernancePanelProps {
  governance?: GovernanceResponse;
  busy: boolean;
  setupMode?: boolean;
  onSave: (profile: SandboxProfile, overrides: Record<string, ToolOverride>) => Promise<void>;
}

export function GovernancePanel({ governance, busy, setupMode = false, onSave }: GovernancePanelProps) {
  const { locale, t } = usePreferences();
  const [profile, setProfile] = useState<SandboxProfile>("standard");
  const [overrides, setOverrides] = useState<Record<string, ToolOverride>>({});
  const latestEvaluations = useMemo(() => [...(governance?.evaluations ?? [])].reverse().slice(0, 6), [governance]);
  const approvalTools = (governance?.tools ?? []).filter((tool) => tool.effective_policy === "approval_required").length;
  const deniedTools = (governance?.tools ?? []).filter((tool) => tool.effective_policy === "deny").length;
  const executions = governance?.executions ?? [];
  const failedExecutions = executions.filter((execution) => execution.timed_out || (execution.returncode ?? 0) !== 0).length;
  const hardLimits = governance?.capabilities.hard_limits?.length
    ? governance.capabilities.hard_limits
    : governance?.capabilities.guarantees ?? [];
  const notClaimed = governance?.capabilities.not_claimed?.length
    ? governance.capabilities.not_claimed
    : governance?.capabilities.limitations ?? [];

  useEffect(() => {
    if (!governance) return;
    setProfile(governance.settings.sandbox_profile);
    setOverrides(governance.settings.tool_overrides);
  }, [governance]);

  async function changeProfile(next: SandboxProfile) {
    const previous = profile;
    setProfile(next);
    try {
      await onSave(next, overrides);
    } catch {
      setProfile(previous);
    }
  }

  async function changeOverride(tool: string, next: ToolOverride) {
    const previous = { ...overrides };
    const updated = { ...overrides, [tool]: next };
    setOverrides(updated);
    try {
      await onSave(profile, updated);
    } catch {
      setOverrides(previous);
    }
  }

  return (
    <section className="inspectorSection governanceSection">
      <div className="sectionHeader governanceHeading">
        <div>
          <h3>{t(setupMode ? "advanced.governance" : "governance.title")}</h3>
          <span>{setupMode ? t("governance.setupDescription") : governance?.editable ? t("governance.editable") : t("governance.readOnly")}</span>
        </div>
        <ShieldCheck size={16} />
      </div>

      <div className="governanceOverview">
        <span><ShieldCheck size={18} /></span>
        <div>
          <strong>{t(`governance.overview.${profile}` as TranslationKey)}</strong>
          <small>{t("governance.overviewDescription", { approval: approvalTools, denied: deniedTools })}</small>
        </div>
        {busy ? <em>{t("governance.saving")}</em> : null}
      </div>

      <div className="governanceLevel">
        <header>
          <strong>{t("governance.securityLevel")}</strong>
          <span>{t("governance.securityLevelHint")}</span>
        </header>
        <div className="sandboxProfileControl">
          {(["standard", "strict"] as SandboxProfile[]).map((item) => (
            <button type="button" className={profile === item ? "active" : ""} aria-pressed={profile === item} disabled={!governance?.editable || busy} onClick={() => void changeProfile(item)} key={item}>
              <span>{item === "standard" ? <Check size={16} /> : <LockKeyhole size={16} />}</span>
              <strong>{t(`governance.profile.${item}` as TranslationKey)}</strong>
              <small>{t(`governance.profileHint.${item}` as TranslationKey)}</small>
            </button>
          ))}
        </div>
      </div>

      <details className="governanceAdvanced" open>
        <summary><Wrench size={15} /><span><strong>{t("governance.advancedControls")}</strong><small>{t("governance.advancedControlsHint")}</small></span><ChevronDown size={15} /></summary>
        <div>
          <div className="governanceTools">
            {(governance?.tools ?? []).map((tool) => (
              <article key={tool.name}>
                <div>
                  <strong>{translateKnownText(locale, tool.name)}</strong>
                  <small>{translateKnownText(locale, tool.description || tool.effect)}</small>
                </div>
                <select aria-label={`${tool.name} ${t("governance.override")}`} value={overrides[tool.name] ?? "inherit"} disabled={!governance?.editable || busy} onChange={(event) => void changeOverride(tool.name, event.target.value as ToolOverride)}>
                  <option value="inherit">{t("governance.policy.inherit")}</option>
                  <option value="approval_required">{t("governance.policy.approval")}</option>
                  <option value="deny">{t("governance.policy.deny")}</option>
                </select>
              </article>
            ))}
          </div>

          {!setupMode ? (
            <details className="governanceTechnical" open>
              <summary><Gauge size={14} />{t("governance.technicalDetails")}<ChevronDown size={14} /></summary>
              <div className="governanceTechnicalBody">
                <div className="sandboxBackend"><Gauge size={13} /><span>{t("governance.backend")}</span><code>{governance?.capabilities.backend ?? "-"}</code></div>
                <div className="capabilityColumns">
                  <div><span>{t("governance.enforced")}</span>{hardLimits.map((item) => <p key={item}><Check size={11} />{translateKnownText(locale, item)}</p>)}</div>
                  <div><span>{t("governance.notClaimed")}</span>{notClaimed.map((item) => <p key={item}><CircleSlash2 size={11} />{translateKnownText(locale, item)}</p>)}</div>
                </div>
                <div className="governanceRuntimeSummary">
                  <span>{failedExecutions > 0 ? <CircleAlert size={13} /> : <Check size={13} />}{t("governance.executions")}</span>
                  <strong>{executions.length}</strong>
                </div>
                <div className="decisionList">
                  {latestEvaluations.length === 0 ? <p className="emptyText">{t("governance.empty")}</p> : latestEvaluations.map((evaluation) => (
                    <article key={evaluation.evaluation_id}>
                      <header><strong>{translateKnownText(locale, evaluation.tool)}</strong><span className={`outcome outcome-${evaluation.outcome}`}>{translateKnownText(locale, evaluation.outcome)}</span></header>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </details>
    </section>
  );
}
