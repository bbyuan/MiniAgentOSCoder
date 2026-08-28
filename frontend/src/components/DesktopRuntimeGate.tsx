import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CodeXml, RefreshCw } from "lucide-react";
import {
  initializeDesktopRuntime,
  restartDesktopRuntime,
  type DesktopRuntimeStatus,
} from "../desktop/runtime";
import { usePreferences } from "../preferences";


export function DesktopRuntimeGate({ children }: { children: ReactNode }) {
  const { t } = usePreferences();
  const [status, setStatus] = useState<DesktopRuntimeStatus>();
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    initializeDesktopRuntime()
      .then(setStatus)
      .catch((caught) => setError(messageFrom(caught)));
  }, []);

  async function retry() {
    setRetrying(true);
    setError(undefined);
    try {
      setStatus(await restartDesktopRuntime());
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setRetrying(false);
    }
  }

  const ready = status?.state === "ready" || status?.state === "browser";
  if (ready) return children;

  const failure = error || status?.message;
  return (
    <main className="desktopBootstrap">
      <div className="desktopBootstrapBrand">
        <div className="brandMark" aria-hidden="true"><CodeXml size={22} /></div>
        <strong>MiniAgentOS Coder</strong>
      </div>
      {failure ? (
        <section className="desktopBootstrapFailure" role="alert">
          <AlertTriangle size={20} />
          <div>
            <h1>{t("desktop.failedTitle")}</h1>
            <p>{t("desktop.failedDescription")}</p>
            <code>{failure}</code>
          </div>
          <button type="button" onClick={() => void retry()} disabled={retrying}>
            <RefreshCw size={15} className={retrying ? "spin" : ""} />
            {retrying ? t("desktop.retrying") : t("desktop.retry")}
          </button>
        </section>
      ) : (
        <section className="desktopBootstrapLoading" aria-live="polite">
          <span className="desktopLoadingMark" aria-hidden="true" />
          <h1>{t("desktop.startingTitle")}</h1>
          <p>{t("desktop.startingDescription")}</p>
        </section>
      )}
    </main>
  );
}

function messageFrom(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
