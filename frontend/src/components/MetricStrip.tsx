import { Braces, Gauge, Sparkles, Wrench } from "lucide-react";
import { translateStatus } from "../i18n";
import { usePreferences } from "../preferences";

interface MetricStripProps {
  budget: {
    modelCalls: number;
    toolCalls: number;
    tokens: string;
  };
  phase: string;
}

export function MetricStrip({ budget, phase }: MetricStripProps) {
  const { locale, t } = usePreferences();
  const metrics = [
    { label: t("metric.modelCalls"), value: budget.modelCalls, icon: Sparkles },
    { label: t("metric.toolCalls"), value: budget.toolCalls, icon: Wrench },
    { label: t("metric.context"), value: budget.tokens, icon: Braces },
    { label: t("metric.phase"), value: translateStatus(locale, phase), icon: Gauge },
  ];

  return (
    <section className="metricStrip" aria-label={t("metric.label")}>
      {metrics.map(({ label, value, icon: Icon }) => (
        <div className="metricItem" key={label}>
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
