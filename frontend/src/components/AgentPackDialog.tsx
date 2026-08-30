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
import type { AgentPackManifest } from "../api/client";
import { usePreferences } from "../preferences";

interface AgentPackDialogProps {
  open: boolean;
  loading: boolean;
  error?: string;
  manifest?: AgentPackManifest;
  onClose: () => void;
  onRefresh: () => void;
}

export function AgentPackDialog({ open, loading, error, manifest, onClose, onRefresh }: AgentPackDialogProps) {
  const { t } = usePreferences();
  if (!open) return null;

  const profile = manifest?.workspace.profile;
  const activeExtensions = manifest
    ? manifest.extensions.skills.active_by_default.length
      + manifest.extensions.mcp_servers.valid
      + manifest.extensions.hooks.valid
    : 0;

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
            <div className="agentPackHero">
              <div>
                <strong>{manifest.agent.name}</strong>
                <span>{manifest.agent.id} · {manifest.agent.mode}</span>
              </div>
              <code title={manifest.digest}>{manifest.digest.slice(0, 12)}</code>
            </div>

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
          <button type="button" className="secondaryTextAction" disabled={loading} onClick={onRefresh}>
            {loading ? <LoaderCircle className="spin" size={15} /> : <Boxes size={15} />}
            {t("agentPack.refresh")}
          </button>
        </footer>
      </section>
    </div>
  );
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
