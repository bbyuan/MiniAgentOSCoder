import { ArrowUp, GitBranch, MessageSquarePlus, Route, SearchCode, ShieldCheck, Square, TestTube2 } from "lucide-react";
import { useState } from "react";
import type { TranslationKey } from "../i18n";
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

type SteeringIntent = "append" | "redirect" | "inspect" | "verify";

const intentOptions: Array<{ intent: SteeringIntent; icon: typeof MessageSquarePlus }> = [
  { intent: "append", icon: MessageSquarePlus },
  { intent: "redirect", icon: Route },
  { intent: "inspect", icon: SearchCode },
  { intent: "verify", icon: TestTube2 },
];

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
  const [intent, setIntent] = useState<SteeringIntent>("append");
  const suggestions: Array<{ key: TranslationKey; icon: typeof GitBranch; intent: SteeringIntent }> = [
    { key: "steering.suggestion.inspect", icon: SearchCode, intent: "inspect" },
    { key: "steering.suggestion.test", icon: TestTube2, intent: "verify" },
    { key: "steering.suggestion.plan", icon: GitBranch, intent: "redirect" },
  ] as const;
  const statusCopy = stopping
    ? t("steering.stopping")
    : t(status === "waiting_approval" ? "steering.replacesApproval" : "steering.safeBoundary");

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
      <header>
        <div>
          <strong>{t("steering.title")}</strong>
          <span>{statusCopy}</span>
        </div>
        <div className="steeringHeaderStats" aria-label={t("steering.queueStatus")}>
          <span><ShieldCheck size={13} />{t("steering.queuedCount", { count: queuedCount })}</span>
          <span>{t("steering.appliedCount", { count: appliedCount })}</span>
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
      </header>

      <div className="steeringIntentGroup" aria-label={t("steering.intentLabel")}>
        {intentOptions.map(({ intent: option, icon: Icon }) => (
          <button
            type="button"
            className={intent === option ? "selected" : ""}
            aria-pressed={intent === option}
            disabled={busy || stopping}
            onClick={() => setIntent(option)}
            key={option}
          >
            <Icon size={14} />
            {t(`steering.intent.${option}`)}
          </button>
        ))}
      </div>

      <div className="steeringInputFrame">
        <div className="steeringInputLabel">
          <span>{t(`steering.intentHelp.${intent}`)}</span>
          <small>{t("steering.safeBoundaryShort")}</small>
        </div>
        <textarea
          rows={2}
          value={message}
          disabled={stopping}
          placeholder={t(`steering.placeholder.${intent}`)}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <footer>
        <span className={`steeringState state-${status}`}>
          <i aria-hidden="true" />
          {message.trim() ? t("steering.readyToSend") : t("steering.interruptible")}
        </span>
        <div>
          {suggestions.map(({ key, icon: Icon, intent: suggestionIntent }) => (
            <button
              type="button"
              className="steeringSuggestion"
              disabled={busy || stopping}
              onClick={() => {
                setIntent(suggestionIntent);
                setMessage((current) => current ? `${current}\n${t(key)}` : t(key));
              }}
              key={key}
            >
              <Icon size={14} />
              {t(key)}
            </button>
          ))}
          <button
            type="button"
            className="steeringSend"
            disabled={!message.trim() || busy || stopping}
            onClick={() => void submit()}
            title={t("steering.send")}
          >
            <ArrowUp size={17} />
            {t("steering.sendShort")}
          </button>
        </div>
      </footer>
    </section>
  );
}
