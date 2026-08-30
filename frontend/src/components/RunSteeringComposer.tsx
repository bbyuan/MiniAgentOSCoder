import { ArrowUp, ChevronDown, GitBranch, MessageSquarePlus, Route, SearchCode, ShieldCheck, Square, TestTube2 } from "lucide-react";
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
          placeholder={t(`steering.placeholder.${intent}`)}
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

      <details className="steeringQuickStrip">
        <summary>
          <span>{t("steering.quickActions")}</span>
          <ChevronDown size={14} />
        </summary>
        <div className="steeringIntentGroup" aria-label={t("steering.intentLabel")}>
          {intentOptions.map(({ intent: option, icon: Icon }) => (
            <button
              type="button"
              className={intent === option ? "selected" : ""}
              aria-pressed={intent === option}
              disabled={busy || stopping}
              onClick={() => setIntent(option)}
              title={t(`steering.intentHelp.${option}`)}
              key={option}
            >
              <Icon size={14} />
              <span>{t(`steering.intent.${option}`)}</span>
            </button>
          ))}
        </div>
        <div className="steeringSuggestionGroup">
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
        </div>
      </details>
      {queuedCount || appliedCount ? (
        <small className="steeringQueueState" aria-label={t("steering.queueStatus")}>
          {t("steering.queuedCount", { count: queuedCount })} · {t("steering.appliedCount", { count: appliedCount })}
        </small>
      ) : null}
    </section>
  );
}
