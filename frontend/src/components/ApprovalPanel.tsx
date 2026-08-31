import { useEffect, useState } from "react";
import { Check, ChevronDown, FileDiff, ShieldAlert, Terminal, X } from "lucide-react";
import type { ApprovalRequest } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface ApprovalPanelProps {
  approval: ApprovalRequest | null;
  busy: boolean;
  onInspectChanges?: () => void;
  onApprove: () => void;
  onDeny: (reason: string) => void;
}

export function ApprovalPanel({ approval, busy, onInspectChanges, onApprove, onDeny }: ApprovalPanelProps) {
  const [reason, setReason] = useState("");
  const { locale, t } = usePreferences();

  useEffect(() => setReason(""), [approval?.approval_id]);

  if (approval === null) {
    return (
      <section className="inspectorSection approvalEmpty">
        <div className="signalTitle"><Check size={15} /><span>{t("approval.title")}</span></div>
        <span>{t("approval.empty")}</span>
      </section>
    );
  }
  const isPatch = approval.target.tool === "apply_patch";
  const files = approval.target.files ?? [];
  const localizedReason = approvalReasonSummary(approval, locale);
  const effectLabel = approvalEffectLabel(approval.effect, locale);
  const fileSummary = t("approval.fileSummary", {
    count: files.length,
    additions: approval.target.additions,
    deletions: approval.target.deletions,
  });
  const approvalActions = (
    <>
      <button
        type="button"
        className="denyAction"
        disabled={busy}
        onClick={() => onDeny(reason.trim() || t("approval.defaultDenyReason"))}
      >
        <X size={14} />
        <span>{t(isPatch ? "approval.rejectPatch" : "approval.deny")}</span>
      </button>
      <button type="button" className="approveAction" disabled={busy} onClick={onApprove}>
        <Check size={14} />
        <span>{t(isPatch ? "approval.acceptPatch" : "approval.approve")}</span>
      </button>
    </>
  );

  return (
    <section className="inspectorSection approvalSection" aria-live="polite">
      <div className="approvalReviewHeader">
        <span className="approvalReviewIcon"><ShieldAlert size={19} /></span>
        <div>
          <span>{t("approval.pending")}</span>
          <h3>{isPatch ? t("approval.patchReviewTitle") : t("approval.commandReviewTitle")}</h3>
          <p>{localizedReason}</p>
        </div>
        <strong className={`approvalRiskPill risk-${approval.risk}`}>{translateKnownText(locale, approval.risk)}</strong>
      </div>

      <div className="approvalDecisionStrip">
        <span><FileDiff size={15} />{isPatch ? fileSummary : approval.target.tool}</span>
        <span>{effectLabel}</span>
        {isPatch && onInspectChanges ? (
          <button type="button" onClick={onInspectChanges}>
            <FileDiff size={15} />
            {t("approval.inspectChanges")}
          </button>
        ) : null}
      </div>

      {isPatch ? (
        <>
          <ReasonInput reason={reason} busy={busy} onChange={setReason} />
          <div className="approvalActions">{approvalActions}</div>
        </>
      ) : (
        <>
          <div className="patchLabel"><Terminal size={14} /><span>{t("approval.command")}</span></div>
          <pre className="patchPreview commandPreview" tabIndex={0}>{approval.target.command || approval.target.tool}</pre>
          <ReasonInput reason={reason} busy={busy} onChange={setReason} />
          <div className="approvalActions">{approvalActions}</div>
        </>
      )}
    </section>
  );
}

function ReasonInput({ reason, busy, onChange }: { reason: string; busy: boolean; onChange: (value: string) => void }) {
  const { t } = usePreferences();
  return (
    <details className="denyReasonDetails">
      <summary><span>{t("approval.reasonOptional")}</span><ChevronDown size={15} /></summary>
      <textarea
        rows={2}
        value={reason}
        disabled={busy}
        placeholder={t("approval.reasonPlaceholder")}
        onChange={(event) => onChange(event.target.value)}
      />
    </details>
  );
}

function approvalReasonSummary(approval: ApprovalRequest, locale: "zh" | "en"): string {
  const files = approval.target.files ?? [];
  if (locale !== "zh") return approval.reason || "Review this guarded action before continuing.";
  if (approval.target.tool !== "apply_patch") {
    return "这一步会执行本地命令。请确认命令和目标符合预期后再继续。";
  }
  if (/Tests reveal four root causes/i.test(approval.reason)) {
    return "测试定位到 4 个问题：金额取整、优惠码大小写、折扣后计税、均分余数分配。本次将只修改相关代码。";
  }
  const fileText = files.length > 0 ? `本次准备修改 ${files.length} 个文件` : "本次准备应用一组代码修改";
  return `${fileText}，新增 ${approval.target.additions} 行、删除 ${approval.target.deletions} 行。请查看差异后决定是否应用。`;
}

function approvalEffectLabel(effect: string, locale: "zh" | "en"): string {
  if (locale !== "zh") return effect;
  const labels: Record<string, string> = {
    "fs.write": "会写入项目文件",
    "shell.exec": "会执行本地命令",
  };
  return labels[effect] ?? translateKnownText(locale, effect);
}
