import {
  Boxes,
  BrainCircuit,
  CheckCircle2,
  FileCode2,
  GitBranch,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AgentPackDrift, AgentPackManifest, AgentPackVersion } from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

const sectionLabels: Record<string, TranslationKey> = {
  agent: "agentPack.section.agent",
  contract: "agentPack.section.contract",
  governance: "agentPack.section.governance",
  models: "agentPack.section.models",
  extensions: "agentPack.section.extensions",
  workspace: "agentPack.section.workspace",
};

const recommendationLabels: Record<string, TranslationKey> = {
  create_first_version: "agentPack.drift.create_first_version",
  up_to_date: "agentPack.drift.up_to_date",
  save_version: "agentPack.drift.save_version",
};

interface AgentPackDialogProps {
  open: boolean;
  loading: boolean;
  versionBusy: boolean;
  error?: string;
  manifest?: AgentPackManifest;
  versions: AgentPackVersion[];
  drift?: AgentPackDrift;
  onClose: () => void;
  onRefresh: () => void;
  onSaveVersion: () => void;
}

export function AgentPackDialog({
  open,
  loading,
  versionBusy,
  error,
  manifest,
  versions,
  drift,
  onClose,
  onRefresh,
  onSaveVersion,
}: AgentPackDialogProps) {
  const { t } = usePreferences();
  if (!open) return null;

  const profile = manifest?.workspace.profile;
  const activeExtensions = manifest
    ? manifest.extensions.skills.active_by_default.length
      + manifest.extensions.mcp_servers.valid
      + manifest.extensions.hooks.valid
    : 0;
  const driftState = drift ? getDriftState(drift) : undefined;
  const baselineState = driftState
    ? driftState === "changed"
      ? "agentPack.explain.changed"
      : driftState === "empty"
        ? "agentPack.explain.empty"
        : "agentPack.explain.stable"
    : "agentPack.explain.loading";

  return (
    <div className="agentPackBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section className="agentPackDialog" role="dialog" aria-modal="true" aria-labelledby="agent-pack-title">
        <header>
          <div className="agentPackMark"><Boxes size={19} /></div>
          <div>
            <span className="stageEyebrow">{t("agentPack.eyebrow")}</span>
            <h2 id="agent-pack-title">{t("agentPack.title")}</h2>
            <p>{t("agentPack.description")}</p>
          </div>
          <button type="button" className="iconButton" disabled={loading} aria-label={t("agentPack.close")} title={t("agentPack.close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error ? <div className="agentPackError" role="alert">{error}</div> : null}

        {loading ? (
          <div className="agentPackLoading"><LoaderCircle className="spin" size={18} />{t("agentPack.loading")}</div>
        ) : manifest ? (
          <>
            <section className="agentPackExplainer" aria-label={t("agentPack.explainTitle")}>
              <div>
                <strong>{t("agentPack.explainTitle")}</strong>
                <p>{t("agentPack.explainBody")}</p>
              </div>
              <span>{t(baselineState as TranslationKey)}</span>
            </section>

            <div className="agentPackPurposeGrid">
              <Purpose icon={<ShieldCheck size={15} />} title={t("agentPack.purpose.control")} detail={t("agentPack.purpose.controlHint")} />
              <Purpose icon={<GitBranch size={15} />} title={t("agentPack.purpose.compare")} detail={t("agentPack.purpose.compareHint")} />
              <Purpose icon={<FileCode2 size={15} />} title={t("agentPack.purpose.share")} detail={t("agentPack.purpose.shareHint")} />
            </div>

            <div className="agentPackHero">
              <div>
                <strong>{manifest.agent.name}</strong>
                <span>{manifest.agent.id} · {manifest.agent.mode}</span>
              </div>
              <div className="agentPackHeroActions">
                <code title={manifest.digest}>{manifest.digest.slice(0, 12)}</code>
                <button type="button" className="textPrimaryAction" disabled={versionBusy} onClick={onSaveVersion}>
                  {versionBusy ? <LoaderCircle className="spin" size={15} /> : <Boxes size={15} />}
                  {t("agentPack.saveVersion")}
                </button>
              </div>
            </div>

            {drift && driftState ? (
              <section className={`agentPackDrift ${driftState}`} aria-label={t("agentPack.driftTitle")}>
                <header>
                  <span>{driftState === "changed" ? <GitBranch size={16} /> : <CheckCircle2 size={16} />}</span>
                  <div>
                    <h3>{t("agentPack.driftTitle")}</h3>
                    <p>{t(recommendationLabels[drift.recommendation] ?? "agentPack.drift.unknown")}</p>
                  </div>
                  <strong>{driftState === "changed" ? t("agentPack.driftChanged") : driftState === "empty" ? t("agentPack.driftNoBaseline") : t("agentPack.driftStable")}</strong>
                </header>
                <div className="agentPackDriftSections">
                  {drift.sections.map((section) => (
                    <span className={section.changed ? "changed" : "stable"} key={section.id}>
                      {section.changed ? <GitBranch size={12} /> : <CheckCircle2 size={12} />}
                      {t(sectionLabels[section.id] ?? "agentPack.section.unknown")}
                    </span>
                  ))}
                </div>
                <div className="agentPackDigestGrid">
                  <Digest label={t("agentPack.currentDigest")} value={drift.current_digest} />
                  <Digest label={t("agentPack.latestDigest")} value={drift.latest_version?.digest || ""} empty={t("agentPack.noBaseline")} />
                </div>
              </section>
            ) : null}

            <div className="agentPackMetrics">
              <Metric icon={<ShieldCheck size={17} />} label={t("agentPack.contract")} value={t("agentPack.effects", { count: manifest.contract.effects.allow.length })} detail={t("agentPack.budget", { steps: manifest.contract.cost_envelope.max_steps })} />
              <Metric icon={<GitBranch size={17} />} label={t("agentPack.models")} value={manifest.models.strategy === "policy" ? t("modelSetup.routingPolicy") : t("modelSetup.routingSingle")} detail={t("modelRoute.profileCount", { count: manifest.models.profiles.length })} />
              <Metric icon={<BrainCircuit size={17} />} label={t("agentPack.extensions")} value={t("control.extensionCount", { count: activeExtensions })} detail={t("agentPack.skills", { count: manifest.extensions.skills.available })} />
              <Metric icon={<FileCode2 size={17} />} label={t("agentPack.project")} value={profile?.languages?.join(", ") || t("agentPack.unknown")} detail={t("task.testCommands", { count: profile?.test_commands?.length ?? 0 })} />
            </div>

            <div className="agentPackSections">
              <section>
                <h3>{t("agentPack.roles")}</h3>
                <div className="agentPackChips">
                  {manifest.agent.roles.length
                    ? manifest.agent.roles.map((role) => <span key={role}>{role}</span>)
                    : <span>{t("agentPack.none")}</span>}
                </div>
              </section>
              <section>
                <h3>{t("agentPack.modelProfiles")}</h3>
                <div className="agentPackProfileList">
                  {manifest.models.profiles.map((profile) => (
                    <article className={profile.configured ? "ready" : "missing"} key={profile.profile_id}>
                      <span>{profile.configured ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}</span>
                      <div>
                        <strong>{profile.profile_id}</strong>
                        <small title={profile.model}>{profile.provider} · {profile.model}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="agentPackVersions">
              <header>
                <h3>{t("agentPack.versions")}</h3>
                <span>{t("agentPack.versionCount", { count: versions.length })}</span>
              </header>
              {versions.length ? (
                <div>
                  {versions.slice(0, 5).map((version) => (
                    <article key={version.version_id}>
                      <span><CheckCircle2 size={14} /></span>
                      <div>
                        <strong>{version.agent_name || version.agent_id}</strong>
                        <small>{formatDate(version.generated_at)} · {version.mode} · {version.model_strategy}</small>
                      </div>
                      <code title={version.digest}>{version.digest.slice(0, 10)}</code>
                    </article>
                  ))}
                </div>
              ) : (
                <p>{t("agentPack.noVersions")}</p>
              )}
            </section>

            <details className="agentPackJson">
              <summary>{t("agentPack.viewManifest")}</summary>
              <pre>{JSON.stringify(manifest, null, 2)}</pre>
            </details>
          </>
        ) : (
          <div className="agentPackLoading">{t("agentPack.empty")}</div>
        )}

        <footer>
          <span>{manifest ? t("agentPack.generated", { date: formatDate(manifest.provenance.generated_at) }) : t("agentPack.localOnly")}</span>
          <button type="button" className="secondaryTextAction" disabled={loading || versionBusy} onClick={onRefresh}>
            {loading ? <LoaderCircle className="spin" size={15} /> : <Boxes size={15} />}
            {t("agentPack.refresh")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Purpose({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <article className="agentPackPurpose">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function Digest({ label, value, empty }: { label: string; value: string; empty?: string }) {
  return (
    <div className="agentPackDigest">
      <small>{label}</small>
      {value ? <code title={value}>{value.slice(0, 14)}</code> : <em>{empty}</em>}
    </div>
  );
}

function getDriftState(drift: AgentPackDrift): "stable" | "changed" | "empty" {
  if (!drift.has_versions) return "empty";
  return drift.drift ? "changed" : "stable";
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="agentPackMetric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
        <em>{detail}</em>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
