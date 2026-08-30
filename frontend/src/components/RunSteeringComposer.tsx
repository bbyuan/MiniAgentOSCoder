import { ArrowUp, ShieldCheck, Square } from "lucide-react";
import { useState } from "react";
import { usePreferences } from "../preferences";

interface RunSteeringComposerProps {
  status: string;
  busy: boolean;
  stopping: boolean;
  queuedCount?: number;
  appliedCount?: number;
  onSend: (message: string) => Promise<void>;
  onStop: () => void;
}

export function RunSteeringComposer({
  status,
  busy,
  stopping,
  queuedCount = 0,
  appliedCount = 0,
  onSend,
  onStop,
}: RunSteeringComposerProps) {
  const { t } = usePreferences();
  const [message, setMessage] = useState("");
  const statusCopy = stopping
    ? t("steering.stopping")
    : t(status === "waiting_approval" ? "steering.replacesApproval" : "steering.safeBoundary");
  const canSend = Boolean(message.trim()) && !busy && !stopping;

  async function submit() {
    const guidance = message.trim();
    if (!guidance || busy || stopping) return;
    try {
      await onSend(guidance);
      setMessage("");
    } catch {
      // The workbench error banner owns request failure feedback.
    }
  }

  return (
    <section className="runSteeringComposer" aria-label={t("steering.title")}>
      <div className="steeringInputFrame">
        <div className="steeringComposerHead">
          <div>
            <span className="steeringEyebrow"><ShieldCheck size={12} />{t("steering.liveControl")}</span>
            <strong>{t("steering.chatLabel")}</strong>
          </div>
          <button
            type="button"
            className="steeringStop"
            disabled={busy || stopping}
            onClick={onStop}
            title={t("composer.cancel")}
          >
            <Square size={12} fill="currentColor" />
            {t("steering.stop")}
          </button>
        </div>
        <textarea
          rows={2}
          value={message}
          disabled={stopping}
          placeholder={t("steering.placeholder")}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="steeringInlineActions">
          <span className={`steeringState state-${status}`}>
            <i aria-hidden="true" />
            {stopping ? t("steering.stopping") : message.trim() ? t("steering.readyToSend") : statusCopy}
          </span>
          <button
            type="button"
            className="steeringSend"
            disabled={!canSend}
            onClick={() => void submit()}
            title={t("steering.send")}
          >
            <ArrowUp size={17} />
            {t("steering.sendShort")}
          </button>
        </div>
      </div>

      {queuedCount || appliedCount ? (
        <small className="steeringQueueState" aria-label={t("steering.queueStatus")}>
          {t("steering.queuedCount", { count: queuedCount })} · {t("steering.appliedCount", { count: appliedCount })}
        </small>
      ) : null}
    </section>
  );
}
