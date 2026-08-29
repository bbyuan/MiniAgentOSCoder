import { useEffect, useMemo, useState } from "react";
import { Box, Check, CircleSlash2, Gauge, Save, ShieldCheck, Wrench } from "lucide-react";
import type {
  GovernanceResponse,
  SandboxProfile,
  ToolOverride,
} from "../api/client";
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
  const latestEvaluations = useMemo(
    () => [...(governance?.evaluations ?? [])].reverse().slice(0, 8),
    [governance],
  );
  const executions = governance?.executions ?? [];
  const lastExecution = executions.length > 0 ? executions[executions.length - 1] : undefined;

  useEffect(() => {
    if (!governance) return;
    setProfile(governance.settings.sandbox_profile);
    setOverrides(governance.settings.tool_overrides);
  }, [governance]);

  async function save() {
    try {
      await onSave(profile, overrides);
    } catch {
      // The workbench error banner owns request failure feedback.
    }
  }

  return (
    <section className="inspectorSection governanceSection">
      <div className="sectionHeader governanceHeading">
        <div>
          <h3>{t(setupMode ? "advanced.governance" : "governance.title")}</h3>
          <span>{setupMode ? t("governance.setupDescription") : governance?.editable ? t("governance.editable") : t("governance.readOnly")}</span>
        </div>
        <ShieldCheck size={15} />
      </div>

      <div className="governanceBlock sandboxBlock">
        <div className="governanceBlockTitle"><Box size={14} /><strong>{t("governance.sandbox")}</strong></div>
        <div className="sandboxProfileControl">
          {(["standard", "strict"] as SandboxProfile[]).map((item) => (
            <button
              type="button"
              className={profile === item ? "active" : ""}
              aria-pressed={profile === item}
              disabled={!governance?.editable || busy}
              onClick={() => setProfile(item)}
              key={item}
            >
              {t(`governance.profile.${item}` as TranslationKey)}
            </button>
          ))}
        </div>
        {setupMode ? <p className="sandboxProfileHint">{t(`governance.profileHint.${profile}` as TranslationKey)}</p> : null}
        {!setupMode ? (
          <>
            <div className="sandboxBackend">
              <Gauge size={13} />
              <span>{t("governance.backend")}</span>
              <code>{governance?.capabilities.backend ?? "-"}</code>
            </div>
            <div className="capabilityColumns">
              <div>
                <span>{t("governance.guarantees")}</span>
                {(governance?.capabilities.guarantees ?? []).map((item) => (
                  <p key={item}><Check size={11} />{translateKnownText(locale, item)}</p>
                ))}
              </div>
              <div>
                <span>{t("governance.limitations")}</span>
                {(governance?.capabilities.limitations ?? []).map((item) => (
                  <p key={item}><CircleSlash2 size={11} />{translateKnownText(locale, item)}</p>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="governanceBlock toolsBlock">
        <div className="governanceBlockTitle"><Wrench size={14} /><strong>{t("governance.tools")}</strong></div>
        <div className="governanceTools">
          {(governance?.tools ?? []).map((tool) => (
            <article key={tool.name}>
              <div>
                <strong>{tool.name}</strong>
                <span className={`riskLabel risk-${tool.risk}`}>{translateKnownText(locale, tool.risk)}</span>
              </div>
              <p>{translateKnownText(locale, tool.effect)} · {t("governance.effective", { policy: translateKnownText(locale, tool.effective_policy) })}</p>
              <select
                aria-label={`${tool.name} ${t("governance.override")}`}
                value={overrides[tool.name] ?? "inherit"}
                disabled={!governance?.editable || busy}
                onChange={(event) => setOverrides((current) => ({
                  ...current,
                  [tool.name]: event.target.value as ToolOverride,
                }))}
              >
                <option value="inherit">{t("governance.policy.inherit")}</option>
                <option value="approval_required">{t("governance.policy.approval")}</option>
                <option value="deny">{t("governance.policy.deny")}</option>
              </select>
            </article>
          ))}
        </div>
        {governance?.editable ? (
          <button type="button" className="governanceSave" disabled={busy} onClick={save}>
            <Save size={14} />
            <span>{busy ? t("governance.saving") : t("governance.save")}</span>
          </button>
        ) : null}
      </div>

      {!setupMode ? <div className="governanceBlock decisionsBlock">
        <div className="governanceBlockTitle">
          <ShieldCheck size={14} />
          <strong>{t("governance.decisions")}</strong>
          <span>{governance?.evaluations.length ?? 0}</span>
        </div>
        {latestEvaluations.length === 0 ? <p className="emptyText">{t("governance.empty")}</p> : (
          <div className="decisionList">
            {latestEvaluations.map((evaluation) => (
              <article key={evaluation.evaluation_id}>
                <header>
                  <strong>{evaluation.tool}</strong>
                  <code>{evaluation.action_id.slice(-8)}</code>
                  <span className={`outcome outcome-${evaluation.outcome}`}>{evaluation.outcome}</span>
                </header>
                {evaluation.decisions.map((decision) => (
                  <div className="guardDecision" key={`${evaluation.evaluation_id}-${decision.guard}`}>
                    <i className={`decisionDot status-${decision.status}`} />
                    <strong>{decision.guard}</strong>
                    <span>{translateKnownText(locale, decision.reason)}</span>
                    <small>{decision.duration_ms.toFixed(2)} ms</small>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
        {(governance?.executions.length ?? 0) > 0 ? (
          <div className="executionSummary">
            <span>{t("governance.executions")}</span>
            <strong>{executions.length}</strong>
            <code>{lastExecution?.backend}</code>
          </div>
        ) : null}
      </div> : null}
    </section>
  );
}
