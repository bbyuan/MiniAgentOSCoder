import { useMemo, useState } from "react";
import { FileStack, Minimize2, ShieldAlert } from "lucide-react";
import type { ContextCompactionResponse, ContextPack } from "../api/client";
import { translateKnownText, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface ContextPanelProps {
  context?: ContextPack;
  busy: boolean;
  onCompact: (targetRatio: number, confirmed: boolean) => Promise<ContextCompactionResponse>;
}

export function ContextPanel({ context, busy, onCompact }: ContextPanelProps) {
  const { locale, t } = usePreferences();
  const [targetPercent, setTargetPercent] = useState(55);
  const [result, setResult] = useState<ContextCompactionResponse>();
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const budget = context?.budget_report;
  const usagePercent = budget?.max_tokens
    ? Math.min(100, Math.round((budget.used_tokens / budget.max_tokens) * 100))
    : 0;
  const composition = useMemo(
    () => Object.entries(context?.composition ?? {}).sort((left, right) => right[1] - left[1]),
    [context],
  );

  async function compact() {
    try {
      const response = await onCompact(targetPercent / 100, needsConfirmation);
      setResult(response);
      setNeedsConfirmation(response.confirmation_required);
    } catch {
      // The workbench error banner owns request failure feedback.
    }
  }

  return (
    <section className="inspectorSection contextSection">
      <div className="sectionHeader contextHeading">
        <div>
          <h3>{t("context.title")}</h3>
          <span>{t("context.compactions", { count: context?.compaction_count ?? 0 })}</span>
        </div>
        <FileStack size={15} />
      </div>

      <div className="contextBudget">
        <div>
          <span>{t("context.budget")}</span>
          <strong>{usagePercent}%</strong>
        </div>
        <div className={`budgetTrack state-${context?.threshold_state ?? "normal"}`}>
          <span style={{ width: `${usagePercent}%` }} />
        </div>
        <small>
          {t("context.usage", {
            used: budget?.used_tokens ?? 0,
            max: budget?.max_tokens ?? 0,
          })}
          <b className={`thresholdState state-${context?.threshold_state ?? "normal"}`}>
            {t(`context.state.${context?.threshold_state ?? "normal"}` as TranslationKey)}
          </b>
        </small>
      </div>

      <div className="contextComposition">
        <div className="subsectionLabel">{t("context.composition")}</div>
        {composition.length === 0 ? <p className="emptyText">{t("context.empty")}</p> : composition.map(([type, tokens], index) => (
          <div className={`compositionRow tone-${index % 5}`} key={type}>
            <span><i />{translateKnownText(locale, type)}</span>
            <strong>{t("context.tokens", { count: tokens })}</strong>
          </div>
        ))}
      </div>

      <div className="compactionControl">
        <div className="compactionTarget">
          <label htmlFor="context-target">{t("context.target")}</label>
          <strong>{targetPercent}%</strong>
        </div>
        <input
          id="context-target"
          type="range"
          min="35"
          max="75"
          step="5"
          value={targetPercent}
          onChange={(event) => setTargetPercent(Number(event.target.value))}
        />
        {needsConfirmation ? (
          <div className="criticalNotice"><ShieldAlert size={14} /><span>{t("context.confirmCritical")}</span></div>
        ) : null}
        <button type="button" onClick={compact} disabled={!context || busy}>
          <Minimize2 size={14} />
          <span>{busy ? t("context.compacting") : needsConfirmation ? t("context.confirm") : t("context.compact")}</span>
        </button>
        {result ? (
          <small className={`compactionResult result-${result.status}`}>
            {translateKnownText(locale, result.reason)}
            {result.status === "compacted" ? ` · ${result.before_tokens} -> ${result.after_tokens}` : ""}
          </small>
        ) : null}
      </div>

      <div className="contextItems">
        <div className="subsectionLabel">{t("context.items")}</div>
        {(context?.explanation ?? []).map((item) => (
          <article key={item.id}>
            <div>
              <span className={`contextState state-${item.state}`}>{t(`context.itemState.${item.state}` as TranslationKey)}</span>
              <strong title={item.id}>{item.id}</strong>
              <small>{translateKnownText(locale, item.type)} · {item.tokens}</small>
            </div>
            <p>{translateKnownText(locale, item.summary || item.reason)}</p>
            {item.metadata?.score !== undefined || item.metadata?.start_line !== undefined ? (
              <div className="contextItemMetadata">
                {item.metadata?.score !== undefined ? (
                  <span>{t("context.relevance", { score: item.metadata.score.toFixed(2) })}</span>
                ) : null}
                {item.metadata?.start_line !== undefined ? (
                  <span>{t("context.lines", {
                    start: item.metadata.start_line,
                    end: item.metadata.end_line ?? item.metadata.start_line,
                  })}</span>
                ) : null}
                {item.metadata?.matched_terms?.length ? (
                  <span title={item.metadata.matched_terms.join(", ")}>{t("context.matches", { count: item.metadata.matched_terms.length })}</span>
                ) : null}
              </div>
            ) : null}
            <code title={item.source}>{item.source}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
