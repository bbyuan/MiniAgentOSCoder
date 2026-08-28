import { useEffect, useState } from "react";
import { Check, FileDiff, ShieldAlert, X } from "lucide-react";
import type { ApprovalRequest } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface ApprovalPanelProps {
  approval: ApprovalRequest | null;
  busy: boolean;
  onApprove: () => void;
  onDeny: (reason: string) => void;
}

export function ApprovalPanel({ approval, busy, onApprove, onDeny }: ApprovalPanelProps) {
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

  return (
    <section className="inspectorSection approvalSection" aria-live="polite">
      <div className="sectionHeader approvalHeading">
        <div>
          <h3>{t("approval.title")}</h3>
          <span>{t("approval.pending")}</span>
        </div>
        <ShieldAlert size={16} />
      </div>

      <p className="approvalReason">{approval.reason}</p>

      <dl className="approvalMeta">
        <div>
          <dt>{t("approval.risk")}</dt>
          <dd className={`risk-${approval.risk}`}>{translateKnownText(locale, approval.risk)}</dd>
        </div>
        <div>
          <dt>{t("approval.effect")}</dt>
          <dd><code>{approval.effect}</code></dd>
        </div>
        <div>
          <dt>{t("approval.files")}</dt>
          <dd>{approval.target.files.length} · {t("approval.changes", {
            additions: approval.target.additions,
            deletions: approval.target.deletions,
          })}</dd>
        </div>
      </dl>

      <div className="approvalFiles">
        {approval.target.files.map((file) => <code key={file}>{file}</code>)}
      </div>

      <div className="patchLabel"><FileDiff size={14} /><span>{t("approval.patch")}</span></div>
      <pre className="patchPreview" tabIndex={0}>{approval.target.patch}</pre>

      <label className="denyReason">
        <span>{t("approval.reason")}</span>
        <textarea
          rows={2}
          value={reason}
          disabled={busy}
          placeholder={t("approval.reasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <div className="approvalActions">
        <button
          type="button"
          className="denyAction"
          disabled={busy || !reason.trim()}
          onClick={() => onDeny(reason.trim())}
        >
          <X size={14} />
          <span>{t("approval.deny")}</span>
        </button>
        <button type="button" className="approveAction" disabled={busy} onClick={onApprove}>
          <Check size={14} />
          <span>{t("approval.approve")}</span>
        </button>
      </div>
    </section>
  );
}
