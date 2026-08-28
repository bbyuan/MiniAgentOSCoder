import { Check, CircleGauge, History, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecoveryResponse } from "../api/client";
import { translateStatus } from "../i18n";
import { usePreferences } from "../preferences";

interface RecoveryPanelProps {
  recovery?: RecoveryResponse;
  busyCheckpoint?: string;
  onRollback: (checkpointId: string) => void;
}

export function RecoveryPanel({ recovery, busyCheckpoint, onRollback }: RecoveryPanelProps) {
  const { locale, t } = usePreferences();
  const [confirming, setConfirming] = useState<string>();
  const points = recovery?.checkpoints ?? [];

  useEffect(() => {
    setConfirming(undefined);
  }, [recovery?.rolled_back_to]);

  return (
    <section className="inspectorSection recoverySection">
      <div className="sectionHeader">
        <div>
          <h3>{t("recovery.title")}</h3>
          <span>{t("recovery.points", { count: points.length })}</span>
        </div>
        <History size={15} />
      </div>

      <div className="recoveryMetrics">
        <div>
          <CircleGauge size={14} />
          <span>{t("recovery.attempts")}</span>
          <strong>{recovery?.repair_attempts ?? 0}</strong>
        </div>
        <div>
          <ShieldCheck size={14} />
          <span>{t("recovery.repairStatus")}</span>
          <strong>{translateStatus(locale, recovery?.repair_status ?? "not_started")}</strong>
        </div>
      </div>

      {recovery?.rolled_back_to ? (
        <div className="rollbackNotice">
          <Check size={14} />
          <span>{t("recovery.rolledBackTo")}</span>
          <code title={recovery.rolled_back_to}>{shortCheckpoint(recovery.rolled_back_to)}</code>
        </div>
      ) : null}

      {points.length === 0 ? <p className="emptyText">{t("recovery.empty")}</p> : (
        <div className="recoveryList">
          {points.map((point) => {
            const isConfirming = confirming === point.checkpoint_id;
            const isBusy = busyCheckpoint === point.checkpoint_id;
            const isCurrent = recovery?.rolled_back_to === point.checkpoint_id;
            return (
              <article className={point.snapshot_available ? "restorable" : ""} key={point.checkpoint_id}>
                <div className="recoveryPointHeader">
                  <div>
                    <strong>{point.snapshot_available ? t("recovery.preApply") : t("recovery.approvalBoundary")}</strong>
                    <code title={point.checkpoint_id}>{shortCheckpoint(point.checkpoint_id)}</code>
                  </div>
                  <span>{t("recovery.step", { count: point.step })}</span>
                </div>
                <div className="recoveryPointMeta">
                  <span>{translateStatus(locale, point.status)}</span>
                  <span>{t("recovery.traceOffset", { count: point.trace_offset })}</span>
                  <span>{point.snapshot_available ? t("recovery.snapshotReady") : t("recovery.metadataOnly")}</span>
                </div>
                {point.files.length > 0 ? (
                  <div className="recoveryFiles">
                    {point.files.map((file) => <code title={file} key={file}>{file}</code>)}
                  </div>
                ) : null}

                {point.snapshot_available ? (
                  <div className="recoveryActions">
                    {isConfirming ? (
                      <>
                        <span>{t("recovery.confirmPrompt")}</span>
                        <button
                          type="button"
                          className="iconButton"
                          title={t("recovery.cancel")}
                          aria-label={t("recovery.cancel")}
                          disabled={isBusy}
                          onClick={() => setConfirming(undefined)}
                        >
                          <X size={14} />
                        </button>
                        <button
                          type="button"
                          className="iconButton confirmRollback"
                          title={t("recovery.confirm")}
                          aria-label={t("recovery.confirm")}
                          disabled={!point.can_rollback || isBusy || isCurrent}
                          onClick={() => onRollback(point.checkpoint_id)}
                        >
                          <Check size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="iconButton rollbackButton"
                        title={isCurrent ? t("recovery.currentPoint") : point.can_rollback ? t("recovery.rollback") : t("recovery.unavailable")}
                        aria-label={isCurrent ? t("recovery.currentPoint") : point.can_rollback ? t("recovery.rollback") : t("recovery.unavailable")}
                        disabled={!point.can_rollback || Boolean(busyCheckpoint) || isCurrent}
                        onClick={() => setConfirming(point.checkpoint_id)}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function shortCheckpoint(checkpointId: string): string {
  return checkpointId.length > 24 ? `${checkpointId.slice(0, 15)}...${checkpointId.slice(-6)}` : checkpointId;
}
