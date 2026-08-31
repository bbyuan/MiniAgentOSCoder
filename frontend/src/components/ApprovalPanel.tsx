import { useEffect, useState } from "react";
import { Check, ShieldAlert, Terminal, X } from "lucide-react";
import type { ApprovalRequest } from "../api/client";
import { translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";
import { DiffReview } from "./DiffReview";

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
  const isPatch = approval.target.tool === "apply_patch";
  const files = approval.target.files ?? [];
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
          <dt>{isPatch ? t("approval.files") : t("approval.tool")}</dt>
          <dd>{isPatch ? `${files.length} · ${t("approval.changes", {
            additions: approval.target.additions,
            deletions: approval.target.deletions,
          })}` : approval.target.tool}</dd>
        </div>
      </dl>

      {isPatch ? (
        <>
          <DiffReview
            title={t("approval.patchTitle")}
            subtitle={t("approval.patchHint")}
            patch={approval.target.patch}
            changedFiles={files}
            insertions={approval.target.additions}
            deletions={approval.target.deletions}
            statusLabel={translateKnownText(locale, approval.risk)}
            tone="pending"
            compact
          />
          <label className="denyReason">
            <span>{t("approval.reasonOptional")}</span>
            <textarea
              rows={2}
              value={reason}
              disabled={busy}
              placeholder={t("approval.reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="approvalActions">{approvalActions}</div>
        </>
      ) : (
        <>
          <div className="patchLabel"><Terminal size={14} /><span>{t("approval.command")}</span></div>
          <pre className="patchPreview commandPreview" tabIndex={0}>{approval.target.command || approval.target.tool}</pre>
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
          <div className="approvalActions">{approvalActions}</div>
        </>
      )}
    </section>
  );
}
