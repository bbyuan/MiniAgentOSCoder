import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, GitBranch, KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { ModelConfigurationSnapshot, ModelProviderStatus } from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface ModelSetupDialogProps {
  open: boolean;
  desktop: boolean;
  busy: boolean;
  error?: string;
  status?: ModelProviderStatus;
  config?: ModelConfigurationSnapshot;
  onClose: () => void;
  onSave: (apiKey: string) => void;
}

export function ModelSetupDialog({ open, desktop, busy, error, status, config, onClose, onSave }: ModelSetupDialogProps) {
  const { t } = usePreferences();
  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setRevealed(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modelSetupBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="modelSetupDialog" role="dialog" aria-modal="true" aria-labelledby="model-setup-title">
        <header>
          <div className="modelSetupMark"><KeyRound size={18} /></div>
          <div>
            <span className="stageEyebrow">{t("modelSetup.eyebrow")}</span>
            <h2 id="model-setup-title">{t("modelSetup.title")}</h2>
          </div>
          <button type="button" className="iconButton" disabled={busy} aria-label={t("modelSetup.close")} title={t("modelSetup.close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <p className="modelSetupDescription">{desktop ? t("modelSetup.description") : t("modelSetup.browserDescription")}</p>

        <ModelConfigSnapshot status={status} config={config} />

        {desktop ? (
          <>
            <label className="secretField">
              <span>{t("modelSetup.apiKey")}</span>
              <div>
                <input
                  autoFocus
                  type={revealed ? "text" : "password"}
                  value={apiKey}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("modelSetup.placeholder")}
                  onChange={(event) => setApiKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && apiKey.trim() && !busy) onSave(apiKey);
                  }}
                />
                <button type="button" disabled={busy} aria-label={t(revealed ? "modelSetup.hide" : "modelSetup.show")} title={t(revealed ? "modelSetup.hide" : "modelSetup.show")} onClick={() => setRevealed((value) => !value)}>
                  {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <div className="credentialNote"><ShieldCheck size={15} /><span>{t("modelSetup.secureNote")}</span></div>
          </>
        ) : (
          <div className="browserCredentialHelp">
            <code>DEEPSEEK_API_KEY=your-key</code>
            <p>{t("modelSetup.browserHint")}</p>
          </div>
        )}

        {error ? <div className="modelSetupError" role="alert">{error}</div> : null}

        <footer>
          <button type="button" className="secondaryTextAction" disabled={busy} onClick={onClose}>{t("modelSetup.cancel")}</button>
          {desktop ? (
            <button type="button" className="textPrimaryAction" disabled={busy || !apiKey.trim()} onClick={() => onSave(apiKey)}>
              {busy ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}
              {busy ? t("modelSetup.saving") : t("modelSetup.save")}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function ModelConfigSnapshot({
  status,
  config,
}: {
  status?: ModelProviderStatus;
  config?: ModelConfigurationSnapshot;
}) {
  const { t } = usePreferences();
  const activeRoutes = config ? Object.entries(config.routing.phase_routes) : [];
  const fallbackCount = config?.routing.fallback_profile_ids.length ?? 0;

  return (
    <section className="modelConfigSnapshot" aria-labelledby="model-config-title">
      <header>
        <div>
          <GitBranch size={16} />
          <strong id="model-config-title">{t("modelSetup.configTitle")}</strong>
        </div>
        <span className={status?.configured ? "ready" : "missing"}>
          {status?.configured ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {t(status?.configured ? "preflight.ready" : "preflight.needsSetup")}
        </span>
      </header>

      {config ? (
        <>
          <div className="modelConfigFacts">
            <div>
              <small>{t("modelSetup.configSource")}</small>
              <strong>{t(`modelSetup.source.${config.source}` as TranslationKey)}</strong>
            </div>
            <div>
              <small>{t("modelSetup.routing")}</small>
              <strong>{t(config.routing.enabled ? "modelSetup.routingPolicy" : "modelSetup.routingSingle")}</strong>
            </div>
            <div>
              <small>{t("modelSetup.defaultProfile")}</small>
              <strong>{config.routing.default_profile_id}</strong>
            </div>
            <div>
              <small>{t("modelSetup.fallbackProfiles")}</small>
              <strong>{fallbackCount ? fallbackCount : t("modelSetup.none")}</strong>
            </div>
          </div>

          <div className="modelConfigProfiles">
            {config.profiles.map((profile) => (
              <article className={profile.configured ? "ready" : "missing"} key={profile.profile_id}>
                <span>{profile.configured ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span>
                <div>
                  <strong>{profile.profile_id}</strong>
                  <small title={profile.model}>{profile.provider} · {profile.model}</small>
                </div>
                <em>{profile.context_window
                  ? t("modelRoute.contextWindow", { count: profile.context_window })
                  : t("modelRoute.contextUnknown")}</em>
              </article>
            ))}
          </div>

          {activeRoutes.length ? (
            <div className="modelConfigRoutes">
              {activeRoutes.map(([phase, profile]) => (
                <span key={phase}>
                  {t(`modelRoute.phase.${phase}` as TranslationKey)} <b>{profile}</b>
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="modelConfigEmpty">{t("modelSetup.configUnavailable")}</p>
      )}
    </section>
  );
}
