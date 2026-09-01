import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Coins,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ResourceForecast, RunAdmission } from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface AdmissionSummaryProps {
  admission?: RunAdmission;
}

export function AdmissionSummary({ admission }: AdmissionSummaryProps) {
  const { t } = usePreferences();
  if (!admission) return null;

  const modelCalls = admission.resources.model_calls;
  const toolCalls = admission.resources.tool_calls;
  const inputTokens = admission.resources.input_tokens;
  const outputTokens = admission.resources.output_tokens;
  const wallTime = admission.resources.wall_time_seconds;
  const actionableChecks = admission.checks.filter((check) =>
    check.status === "warning" || check.status === "blocked",
  );
  const decisionIcon = admission.can_start
    ? admission.decision === "warning" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />
    : <ShieldAlert size={18} />;

  return (
    <section className={`admissionSummary decision-${admission.decision}`} aria-labelledby="admission-title">
      <header className="admissionHeader">
        <div>
          <span className="admissionIcon">{decisionIcon}</span>
          <div>
            <h2 id="admission-title">{t("admission.title")}</h2>
            <p>{t(`admission.${admission.decision}` as TranslationKey)}</p>
          </div>
        </div>
        <span className="admissionDecision">{t(`admission.badge.${admission.decision}` as TranslationKey)}</span>
      </header>

      <div className="admissionMetrics">
        <ForecastMetric icon={<Bot size={16} />} label={t("admission.modelCalls")} value={modelCalls} />
        <ForecastMetric icon={<Wrench size={16} />} label={t("admission.toolCalls")} value={toolCalls} />
        <ForecastMetric
          icon={<span className="admissionTokenIcon">T</span>}
          label={t("admission.tokens")}
          value={combineTokens(inputTokens, outputTokens)}
          formatter={formatCompact}
        />
        <ForecastMetric icon={<Clock3 size={16} />} label={t("admission.time")} value={wallTime} formatter={formatDuration} />
        <div className="admissionMetric">
          <span><Coins size={16} />{t("admission.cost")}</span>
          {admission.cost.configured ? (
            <>
              <strong>{formatCost(admission.cost.expected, admission.cost.currency)}</strong>
              <small>{t("admission.range", {
                low: formatCost(admission.cost.expected, admission.cost.currency),
                high: formatCost(admission.cost.high, admission.cost.currency),
              })}</small>
              <em>{t("admission.ceiling", { value: formatCost(admission.cost.ceiling, admission.cost.currency) })}</em>
            </>
          ) : (
            <>
              <strong>{t("admission.costUnavailable")}</strong>
              <small>{t("admission.costHint")}</small>
            </>
          )}
        </div>
      </div>

      {actionableChecks.length ? (
        <div className="admissionNotices">
          {actionableChecks.map((check) => (
            <div key={check.id} className={check.status}>
              {check.status === "blocked" ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}
              <span>{t((check.id === "model_route"
                ? `admission.check.model_route.${check.status}`
                : `admission.check.${check.id}`) as TranslationKey)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admissionBasis">
        <strong>{t("admission.basisTitle")}</strong>
        <div className="admissionBasisGrid">
          <span>
            <small>{t("admission.basisSource")}</small>
            <em>{t(`admission.basis.${admission.basis}` as TranslationKey, { count: admission.sample_size })}</em>
          </span>
          <span>
            <small>{t("admission.basisSamples")}</small>
            <em>{t("admission.basisSamplesValue", { count: admission.sample_size })}</em>
          </span>
          <span>
            <small>{t("admission.basisConfidence")}</small>
            <em>{t(`admission.confidence.${admission.confidence}` as TranslationKey)}</em>
          </span>
          <span>
            <small>{t("admission.basisLimits")}</small>
            <em>{t("admission.basisLimitsText")}</em>
          </span>
        </div>
        <p>{t("admission.basisMethodText")}</p>
      </div>

      <footer className="admissionFootnote">
        <span>{t("admission.ceilingSource")}</span>
        <span>{t("admission.notGuarantee")}</span>
      </footer>
    </section>
  );
}

function ForecastMetric({
  icon,
  label,
  value,
  formatter = formatNumber,
}: {
  icon: ReactNode;
  label: string;
  value?: ResourceForecast;
  formatter?: (value: number) => string;
}) {
  const { t } = usePreferences();
  if (!value) return null;
  return (
    <div className="admissionMetric">
      <span>{icon}{label}</span>
      <strong>{formatter(value.expected)}</strong>
      <small>{t("admission.range", { low: formatter(value.low), high: formatter(value.high) })}</small>
      <em>{t("admission.ceiling", { value: formatter(value.ceiling) })}</em>
    </div>
  );
}

function combineTokens(input?: ResourceForecast, output?: ResourceForecast): ResourceForecast | undefined {
  if (!input || !output) return undefined;
  return {
    low: input.low + output.low,
    expected: input.expected + output.expected,
    high: input.high + output.high,
    ceiling: input.ceiling + output.ceiling,
    unit: "tokens",
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(value: number): string {
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatCost(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
  }).format(value);
}
