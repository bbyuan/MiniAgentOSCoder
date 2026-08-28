import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { usePreferences } from "../preferences";

interface ModelSetupDialogProps {
  open: boolean;
  desktop: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (apiKey: string) => void;
}

export function ModelSetupDialog({ open, desktop, busy, error, onClose, onSave }: ModelSetupDialogProps) {
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
