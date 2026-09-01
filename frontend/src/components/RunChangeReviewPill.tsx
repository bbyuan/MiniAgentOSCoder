import { Check, FileDiff, X } from "lucide-react";
import { usePreferences } from "../preferences";

interface RunChangeReviewPillProps {
  title: string;
  meta: string;
  inspectLabel?: string;
  decisionRequired?: boolean;
  busy?: boolean;
  onInspect: () => void;
  onAccept?: () => void;
  onReject?: () => void;
}

export function RunChangeReviewPill({
  title,
  meta,
  inspectLabel,
  decisionRequired = false,
  busy = false,
  onInspect,
  onAccept,
  onReject,
}: RunChangeReviewPillProps) {
  const { t } = usePreferences();

  return (
    <div className={`composerChangePill ${decisionRequired ? "needsDecision" : ""}`}>
      <div>
        <FileDiff size={15} />
        <span>
          <strong>{title}</strong>
          <small>{meta}</small>
        </span>
      </div>
      <div>
        <button type="button" className="inspect" onClick={onInspect}>
          {inspectLabel ?? t("approval.inspectChanges")}
        </button>
        {decisionRequired && onReject ? (
          <button type="button" className="reject" disabled={busy} onClick={onReject} aria-label={t("approval.rejectPatch")}>
            <X size={14} />
          </button>
        ) : null}
        {decisionRequired && onAccept ? (
          <button type="button" className="accept" disabled={busy} onClick={onAccept} aria-label={t("approval.acceptPatch")}>
            <Check size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
