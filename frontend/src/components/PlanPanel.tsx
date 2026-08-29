import { Ban, Check, Circle, CircleAlert, LoaderCircle, Minus } from "lucide-react";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

export interface PlanItem {
  id?: string;
  title: string;
  state: string;
  detail?: string;
}

const icons = {
  done: <Check size={14} />,
  active: <LoaderCircle size={14} />,
  waiting: <Circle size={14} />,
  failed: <CircleAlert size={14} />,
  cancelled: <Ban size={14} />,
  skipped: <Minus size={14} />,
};

export function PlanPanel({ items }: { items: PlanItem[] }) {
  const { locale, t } = usePreferences();

  return (
    <section className="inspectorSection planSection">
      <div className="sectionHeader">
        <h3>{t("plan.title")}</h3>
        <span>{t("plan.steps", { count: items.length })}</span>
      </div>
      <div className="planList">
        {items.map((item) => (
          <div className={`planItem ${item.state}`} key={item.id ?? item.title}>
            <div className="planMarker">{icons[item.state as keyof typeof icons] ?? <Circle size={14} />}</div>
            <div className="planCopy">
              <strong>{translateKnownText(locale, item.title)}</strong>
              {item.detail ? <span>{translateKnownText(locale, item.detail)}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
