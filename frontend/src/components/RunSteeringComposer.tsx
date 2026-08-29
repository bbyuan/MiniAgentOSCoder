import { ArrowUp, Square } from "lucide-react";
import { useState } from "react";
import { usePreferences } from "../preferences";

interface RunSteeringComposerProps {
  status: string;
  busy: boolean;
  stopping: boolean;
  onSend: (message: string) => Promise<void>;
  onStop: () => void;
}

export function RunSteeringComposer({ status, busy, stopping, onSend, onStop }: RunSteeringComposerProps) {
  const { t } = usePreferences();
  const [message, setMessage] = useState("");

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
      <footer>
        <span className={`steeringState state-${status}`}>
          <i aria-hidden="true" />
          {t(status === "waiting_approval" ? "steering.replacesApproval" : "steering.safeBoundary")}
        </span>
        <div>
          <button
            type="button"
            className="steeringStop"
            disabled={busy || stopping}
            onClick={onStop}
            title={t("composer.cancel")}
            aria-label={t("composer.cancel")}
          >
            <Square size={13} fill="currentColor" />
          </button>
          <button
            type="button"
            className="steeringSend"
            disabled={!message.trim() || busy || stopping}
            onClick={() => void submit()}
            title={t("steering.send")}
            aria-label={t("steering.send")}
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}
