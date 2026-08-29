import { Check, CircleAlert, ListChecks, X } from "lucide-react";
import type { CompletionAssessment } from "../api/client";
import { type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface CompletionEvidenceProps {
  assessment?: CompletionAssessment | null;
  expectations?: string[];
  preflight?: boolean;
}

export function CompletionEvidence({ assessment, expectations = [], preflight = false }: CompletionEvidenceProps) {
  const { locale, t } = usePreferences();
  const checks = assessment?.checks ?? expectations.map((id) => ({
    id,
    passed: false,
    evidence: "",
    required: true,
  }));
  const verdict = assessment?.verdict;

  return (
    <section className={`completionEvidence ${preflight ? "preflightEvidence" : ""} ${verdict ? `tone-${verdict}` : ""}`}>
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

      {checks.length ? (
        <ul>
          {checks.map((check) => (
            <li key={check.id} className={assessment ? (check.passed ? "passed" : "failed") : "pending"}>
              <span className="completionCheckIcon">
                {assessment ? (check.passed ? <Check size={13} /> : <X size={13} />) : <span />}
              </span>
              <div>
                <strong>{completionCheckLabel(check.id, t)}</strong>
                {check.evidence ? <span>{localizedEvidence(check.evidence, check.passed, locale, t)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="completionUnavailable">{t("completion.unavailable")}</p>}
    </section>
  );
}

function localizedEvidence(
  evidence: string,
  passed: boolean,
  locale: "zh" | "en",
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
): string {
  if (locale === "en") return evidence;
  const changedFiles = evidence.match(/^Changed files: (.+)$/);
  if (changedFiles) return `变更文件：${changedFiles[1]}`;
  const verifiedExisting = evidence.match(/^Existing behavior verified after (\d+) successful inspection\(s\)$/);
  if (verifiedExisting) return `现有实现已通过 ${verifiedExisting[1]} 次源码检查`;
  const count = evidence.match(/^(\d+) (patch\(es\) applied|successful test run\(s\) after the latest patch|successful read-only inspection\(s\))$/);
  if (count) {
    if (count[2].startsWith("patch")) return `已应用 ${count[1]} 个补丁`;
    if (count[2].startsWith("successful test")) return `最新补丁后有 ${count[1]} 次测试成功`;
    return `已完成 ${count[1]} 次只读检查`;
  }
  const verifiedTests = evidence.match(/^(\d+) successful test run\(s\) verified the existing behavior$/);
  if (verifiedTests) return `现有实现已通过 ${verifiedTests[1]} 次测试验证`;
  return t(passed ? "completion.evidence.met" : "completion.evidence.missing");
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
