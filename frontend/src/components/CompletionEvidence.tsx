import { Check, CircleAlert, ListChecks, X } from "lucide-react";
import type { CompletionAssessment } from "../api/client";
import { type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import { localizeCompletionEvidence } from "../run/localizedText";

interface CompletionEvidenceProps {
  assessment?: CompletionAssessment | null;
  expectations?: string[];
  preflight?: boolean;
  embedded?: boolean;
}

export function CompletionEvidence({ assessment, expectations = [], preflight = false, embedded = false }: CompletionEvidenceProps) {
  const { locale, t } = usePreferences();
  const checks = assessment?.checks ?? expectations.map((id) => ({
    id,
    passed: false,
    evidence: "",
    required: true,
  }));
  const verdict = assessment?.verdict;

  return (
    <section className={`completionEvidence ${preflight ? "preflightEvidence" : ""} ${embedded ? "embeddedEvidence" : ""} ${verdict ? `tone-${verdict}` : ""}`}>
      {!embedded ? (
        <header>
          <div>
            <ListChecks size={17} />
            <div>
              <strong>{t(preflight ? "completion.expectedTitle" : "completion.evidenceTitle")}</strong>
              <span>{assessment
                ? t(assessment.verdict === "passed" ? "completion.verified" : "completion.blocked", { attempt: assessment.attempt })
                : t("completion.expectedDescription")}</span>
            </div>
          </div>
          {assessment ? (
            <span className="completionVerdict">
              {assessment.verdict === "passed" ? <Check size={13} /> : <CircleAlert size={13} />}
              {t(assessment.verdict === "passed" ? "completion.passed" : "completion.notPassed")}
            </span>
          ) : null}
        </header>
      ) : null}

      {checks.length ? (
        <ul>
          {checks.map((check) => (
            <li key={check.id} className={assessment ? (check.passed ? "passed" : "failed") : "pending"}>
              <span className="completionCheckIcon">
                {assessment ? (check.passed ? <Check size={13} /> : <X size={13} />) : <span />}
              </span>
              <div>
                <strong>{completionCheckLabel(check.id, t)}</strong>
                {check.evidence ? <span>{localizeCompletionEvidence(check.evidence, check.passed, locale, t)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="completionUnavailable">{t("completion.unavailable")}</p>}
    </section>
  );
}

function completionCheckLabel(
  id: string,
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
): string {
  const key = `completion.check.${id}` as TranslationKey;
  const known = new Set([
    "final_message",
    "applied_change",
    "changed_files",
    "tests_after_change",
    "change_or_verified_existing",
    "validation",
    "no_workspace_changes",
    "workspace_inspected",
  ]);
  return known.has(id) ? t(key) : id.split("_").join(" ");
}
