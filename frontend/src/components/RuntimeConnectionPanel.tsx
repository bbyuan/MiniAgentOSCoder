import { CheckCircle2, FolderOpen, RefreshCw, Server, WifiOff } from "lucide-react";
import { usePreferences } from "../preferences";

interface RuntimeConnectionPanelProps {
  status: "checking" | "connected" | "offline";
  onRetry: () => void;
}

export function RuntimeConnectionPanel({ status, onRetry }: RuntimeConnectionPanelProps) {
  const { t } = usePreferences();
  const checking = status === "checking";

  return (
    <section className={`runtimeConnectionPanel tone-${status}`} aria-live="polite">
      <div className="runtimeConnectionMark">
        {checking ? <RefreshCw className="spin" size={24} /> : <WifiOff size={24} />}
      </div>
      <span className="stageEyebrow">{t("runtimeGate.eyebrow")}</span>
      <h1>{t(checking ? "runtimeGate.checkingTitle" : "runtimeGate.offlineTitle")}</h1>
      <p>{t(checking ? "runtimeGate.checkingDescription" : "runtimeGate.offlineDescription")}</p>

      <div className="runtimeConnectionChecks">
        <article className="ready">
          <CheckCircle2 size={16} />
          <div><strong>{t("runtimeGate.frontendReady")}</strong><span>{t("runtimeGate.frontendReadyHint")}</span></div>
        </article>
        <article className={checking ? "checking" : "blocked"}>
          {checking ? <RefreshCw className="spin" size={16} /> : <Server size={16} />}
          <div><strong>{t(checking ? "runtimeGate.daemonChecking" : "runtimeGate.daemonOffline")}</strong><span>{t("runtimeGate.daemonEndpoint")}</span></div>
        </article>
        <article className="pending">
          <FolderOpen size={16} />
          <div><strong>{t("runtimeGate.projectPending")}</strong><span>{t("runtimeGate.projectPendingHint")}</span></div>
        </article>
      </div>

      <div className="runtimeConnectionActions">
        <button type="button" onClick={onRetry} disabled={checking}>
          <RefreshCw className={checking ? "spin" : ""} size={16} />
          {t(checking ? "runtimeGate.retrying" : "runtimeGate.retry")}
        </button>
        <code>http://127.0.0.1:8000/health</code>
      </div>
      <small>{t("runtimeGate.devHint")}</small>
    </section>
  );
}
