import { CheckCircle2, ChevronDown, CircleAlert, GitBranch, UserRound } from "lucide-react";
import type { ConversationResponse } from "../api/client";
import { translateKnownText, translateMode, translateStatus } from "../i18n";
import { usePreferences } from "../preferences";

interface ConversationHistoryProps {
  conversation?: ConversationResponse;
  currentRunId?: string;
}

export function ConversationHistory({ conversation, currentRunId }: ConversationHistoryProps) {
  const { locale, t } = usePreferences();
  const previousTurns = (conversation?.turns ?? []).filter((turn) => turn.run_id !== currentRunId);
  if (previousTurns.length === 0) return null;

  return (
    <section className="conversationHistory" aria-label={t("conversation.previousTurns")}>
      <header>
        <GitBranch size={15} />
        <strong>{t("conversation.previousTurns")}</strong>
        <span>{t("conversation.turnCount", { count: previousTurns.length })}</span>
      </header>
      <div className="conversationHistoryList">
        {previousTurns.map((turn, index) => {
          const successful = turn.status === "completed";
          const outcome = turn.final_message || turn.termination_reason || t("conversation.noOutcome");
          return (
            <details className="conversationPriorTurn" key={turn.run_id} open={index === previousTurns.length - 1}>
              <summary>
                <span className={`priorTurnState ${successful ? "successful" : "attention"}`}>
                  {successful ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
                </span>
                <span className="priorTurnTitle">
                  <strong>{translateKnownText(locale, turn.task)}</strong>
                  <small>
                    {t("conversation.turn", { count: turn.turn_index + 1 })} · {translateMode(locale, turn.mode)} · {translateStatus(locale, turn.status)}
                  </small>
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="priorTurnBody">
                <div><UserRound size={13} /><p>{translateKnownText(locale, turn.task)}</p></div>
                <div className="priorTurnOutcome"><span>MiniAgentOS</span><p>{outcome}</p></div>
                <footer>
                  <span>{translateKnownText(locale, turn.test_status)}</span>
                  <span>{t("conversation.changedFiles", { count: turn.changed_files.length })}</span>
                </footer>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
