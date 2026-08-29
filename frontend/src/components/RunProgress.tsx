import { Ban, Check, Circle, CircleAlert, LoaderCircle, Minus } from "lucide-react";
import type { PlanStep } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

function StepIcon({ state }: { state: string }) {
  if (state === "done") return <Check size={16} strokeWidth={2.4} />;
  if (state === "active") return <LoaderCircle className="spin" size={16} />;
  if (state === "failed") return <CircleAlert size={16} />;
  if (state === "cancelled") return <Ban size={16} />;
  if (state === "skipped") return <Minus size={16} />;
  return <Circle size={15} />;
}

export function RunProgress({ items }: { items: PlanStep[] }) {
  const { locale, t } = usePreferences();
  const completed = items.filter((item) => item.state === "done").length;

  return (
    <section className="runProgress" aria-labelledby="run-progress-title">
      <header>
        <div>
          <h2 id="run-progress-title">{t("progress.title")}</h2>
          <span>{t("progress.summary", { completed, total: items.length })}</span>
        </div>
      </header>
      <ol className="runProgressList">
        {items.map((item) => (
          <li className={`runProgressItem ${item.state}`} key={item.id ?? item.title}>
            <div className="runProgressMarker"><StepIcon state={item.state} /></div>
            <div>
              <strong>{translateKnownText(locale, item.title)}</strong>
              {item.detail ? <span>{translateKnownText(locale, item.detail)}</span> : null}
            </div>
            <small>{t(
              item.state === "done" ? "progress.done"
                : item.state === "active" ? "progress.active"
                  : item.state === "failed" ? "progress.failed"
                    : item.state === "cancelled" ? "progress.cancelled"
                      : item.state === "skipped" ? "progress.skipped"
                        : "progress.waiting",
            )}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
