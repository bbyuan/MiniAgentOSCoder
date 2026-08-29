import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, KeyRound } from "lucide-react";
import type { ModelProviderStatus, RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface PreflightSummaryProps {
  mode: RunMode;
  task: string;
  model?: ModelProviderStatus;
  busy: boolean;
  children: ReactNode;
  onBack: () => void;
  onLaunch: () => void;
  onConfigureModel: () => void;
}

export function PreflightSummary({
  mode,
  task,
  model,
  busy,
  children,
  onBack,
  onLaunch,
  onConfigureModel,
}: PreflightSummaryProps) {
  const { locale, t } = usePreferences();
  const ready = model?.configured === true;

  return (
    <section className="runSettingsPage" aria-labelledby="run-settings-title">
      <header className="runSettingsHeader">
        <div>
          <span className="stageEyebrow">{t("runSettings.eyebrow")}</span>
          <h1 id="run-settings-title">{t("runSettings.title")}</h1>
          <p>{t("runSettings.description")}</p>
        </div>
        <button
          type="button"
          className={`runSettingsModel ${ready ? "ready" : "missing"}`}
          onClick={ready ? undefined : onConfigureModel}
        >
          {ready ? <Bot size={17} /> : <KeyRound size={17} />}
          <span><strong>{model?.model || t("top.modelUnchecked")}</strong><small>{t(ready ? "preflight.ready" : "preflight.needsSetup")}</small></span>
        </button>
      </header>

      <div className="runSettingsTask">
        <span>{translateMode(locale, mode)}</span>
        <p>{task}</p>
      </div>

      {children}

      <footer className="runSettingsFooter">
        <button type="button" className="secondaryTextAction" disabled={busy} onClick={onBack}>
          <ArrowLeft size={16} />{t("runSettings.back")}
        </button>
        <div>
          <span>{t("runSettings.defaultHint")}</span>
          <button type="button" className="textPrimaryAction" disabled={busy || !ready} onClick={onLaunch}>
            {busy ? t("preflight.launching") : t("task.start")}
            <ArrowRight size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}
