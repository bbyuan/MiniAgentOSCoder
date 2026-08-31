import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ListChecks,
  Plus,
  PlugZap,
  Server,
  Sparkles,
  Workflow,
} from "lucide-react";
import type {
  CreateHookRequest,
  CreateMCPServerRequest,
  CreateSkillRequest,
  ExtensionResponse,
  ExtensionSettings,
  TraceEvent,
} from "../api/client";
import { localizeErrorMessage, translateExtensionDiagnostic, translateKnownText, translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface ExtensionPanelProps {
  extensions?: ExtensionResponse;
  busy: boolean;
  setupMode?: boolean;
  onSave: (settings: ExtensionSettings) => Promise<void>;
  onCreateSkill?: (request: CreateSkillRequest) => Promise<void>;
  onCreateMCPServer?: (request: CreateMCPServerRequest) => Promise<void>;
  onCreateHook?: (request: CreateHookRequest) => Promise<void>;
}

type Creator = "skill" | "mcp" | "hook";

export function ExtensionPanel({
  extensions,
  busy,
  setupMode = false,
  onSave,
  onCreateSkill,
  onCreateMCPServer,
  onCreateHook,
}: ExtensionPanelProps) {
  const { locale, t } = usePreferences();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [skillDraft, setSkillDraft] = useState({ name: "", description: "", content: "" });
  const [mcpDraft, setMcpDraft] = useState({ name: "", command: "", envAllow: "" });
  const [hookDraft, setHookDraft] = useState({
    name: "",
    command: "",
    event: "run.after" as CreateHookRequest["event"],
    failurePolicy: "warn" as CreateHookRequest["failure_policy"],
  });
  const [settings, setSettings] = useState<ExtensionSettings>({
    active_skill_ids: [],
    enabled_mcp_server_ids: [],
    enabled_hook_ids: [],
  });

  useEffect(() => {
    if (!extensions) return;
    setSettings(copySettings(extensions.settings));
  }, [extensions]);

  const evidenceByTarget = useMemo(() => {
    const lookup = new Map<string, TraceEvent>();
    [...(extensions?.evidence ?? [])].reverse().forEach((event) => {
      const id = eventIdentity(event);
      if (id && !lookup.has(id)) lookup.set(id, event);
    });
    return lookup;
  }, [extensions]);
  const recentEvidence = useMemo(() => [...(extensions?.evidence ?? [])].reverse().slice(0, 8), [extensions]);
  const summary = extensions?.summary;
  const skills = extensions?.catalog.skills ?? [];
  const advancedAvailable = (extensions?.catalog.mcp_servers.length ?? 0) + (extensions?.catalog.hooks.length ?? 0);
  const advancedEnabled = (settings.enabled_mcp_server_ids.length ?? 0) + (settings.enabled_hook_ids.length ?? 0);
  const editable = Boolean(extensions?.editable);
  const creatingAllowed = editable && Boolean(onCreateSkill || onCreateMCPServer || onCreateHook);

  async function toggle(key: keyof ExtensionSettings, id: string) {
    const previous = copySettings(settings);
    const next = {
      ...settings,
      [key]: settings[key].includes(id)
        ? settings[key].filter((value) => value !== id)
        : [...settings[key], id],
    };
    setActionError(undefined);
    setSettings(next);
    try {
      await onSave(next);
    } catch (caught) {
      setSettings(previous);
      setActionError(errorMessage(locale, caught, t("extensions.actionFailed")));
    }
  }

  async function createSkill() {
    if (!onCreateSkill) return;
    setActionError(undefined);
    await onCreateSkill({
      id: extensionId(skillDraft.name, "project-rule"),
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      content: skillDraft.content.trim(),
      default_tools: ["read_file", "search_code", "write_patch", "run_test"],
      risk: "medium",
    });
    setSkillDraft({ name: "", description: "", content: "" });
    setCreator(null);
  }

  async function createMCPServer() {
    if (!onCreateMCPServer) return;
    setActionError(undefined);
    await onCreateMCPServer({
      id: extensionId(mcpDraft.name, "tool-service"),
      name: mcpDraft.name.trim(),
      command: splitCommand(mcpDraft.command),
      env_allow: mcpDraft.envAllow.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
      timeout_seconds: 15,
      risk: "high",
    });
    setMcpDraft({ name: "", command: "", envAllow: "" });
    setCreator(null);
  }

  async function createHook() {
    if (!onCreateHook) return;
    setActionError(undefined);
    await onCreateHook({
      id: extensionId(hookDraft.name, "automatic-check"),
      name: hookDraft.name.trim(),
      event: hookDraft.event,
      command: splitCommand(hookDraft.command),
      timeout_seconds: 30,
      failure_policy: hookDraft.failurePolicy,
    });
    setHookDraft({ name: "", command: "", event: "run.after", failurePolicy: "warn" });
    setCreator(null);
  }

  return (
    <section className="inspectorSection extensionSection">
      <div className="sectionHeader extensionHeading">
        <div>
          <h3>{t(setupMode ? "advanced.extensions" : "extensions.title")}</h3>
          <span>{setupMode ? t("extensions.setupDescription") : editable ? t("extensions.editable") : t("extensions.readOnly")}</span>
        </div>
        <PlugZap size={16} />
      </div>

      <div className={`extensionOverview ${summary?.diagnostic_count ? "warning" : "ready"}`}>
        <span>{summary?.diagnostic_count ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span>
        <div>
          <strong>{t(summary?.diagnostic_count ? "extensions.overviewAttention" : "extensions.overviewReady")}</strong>
          <small>{t("extensions.overviewDescription", {
            enabled: settings.active_skill_ids.length,
            available: skills.length,
          })}</small>
        </div>
        {busy ? <em>{t("extensions.saving")}</em> : null}
      </div>

      {actionError ? <div className="extensionActionError" role="alert"><AlertTriangle size={15} /><span>{actionError}</span></div> : null}

      <div className="extensionCapabilityList primary">
        <ExtensionGroup icon={<Sparkles size={16} />} title={t("extensions.skills")} count={skills.length} empty={t("extensions.skillsEmpty")}>
          {skills.map((skill) => {
            const enabled = settings.active_skill_ids.includes(skill.id);
            const compatible = skill.compatible ?? true;
            const disabled = !editable || busy || !skill.valid || (!compatible && !enabled);
            const modeDetail = skill.modes.length > 0
              ? t("extensions.skillModes", { modes: skill.modes.map((mode) => translateMode(locale, mode)).join(locale === "zh" ? "、" : ", ") })
              : t("extensions.allModes");
            return (
              <CapabilityRow
                key={skill.id}
                name={skill.name}
                description={translateKnownText(locale, skill.description) || t("extensions.skillFallback")}
                detail={compatible ? modeDetail : t("extensions.incompatibleHint", { modes: modeDetail })}
                enabled={enabled}
                disabled={disabled}
                valid={skill.valid}
                compatible={compatible}
                event={evidenceByTarget.get(skill.id)}
                onToggle={() => void toggle("active_skill_ids", skill.id)}
              />
            );
          })}
        </ExtensionGroup>
      </div>

      <details className="extensionTechnical">
        <summary><Braces size={15} /><span>{t("extensions.advancedTitle", { enabled: advancedEnabled, available: advancedAvailable })}</span><ChevronDown size={14} /></summary>
        <div>
          {creatingAllowed ? (
            <div className="extensionCreator">
              <div className="extensionCreatorIntro">
                <strong>{t("extensions.addTitle")}</strong>
                <span>{t("extensions.addDescription")}</span>
              </div>
              <div className="extensionCreatorActions">
                {onCreateSkill ? <CreatorButton active={creator === "skill"} icon={<Sparkles size={15} />} label={t("extensions.addSkill")} onClick={() => setCreator(creator === "skill" ? null : "skill")} /> : null}
                {onCreateMCPServer ? <CreatorButton active={creator === "mcp"} icon={<Server size={15} />} label={t("extensions.addMCP")} onClick={() => setCreator(creator === "mcp" ? null : "mcp")} /> : null}
                {onCreateHook ? <CreatorButton active={creator === "hook"} icon={<ListChecks size={15} />} label={t("extensions.addHook")} onClick={() => setCreator(creator === "hook" ? null : "hook")} /> : null}
              </div>

              {creator === "skill" ? (
                <form className="extensionCreateForm" onSubmit={(event) => { event.preventDefault(); void createSkill().catch((caught) => setActionError(errorMessage(locale, caught, t("extensions.actionFailed")))); }}>
                  <label className="wide">
                    <span>{t("extensions.form.name")}</span>
                    <input autoFocus value={skillDraft.name} placeholder={t("extensions.skillNamePlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label className="wide">
                    <span>{t("extensions.form.skillContent")}</span>
                    <textarea rows={5} value={skillDraft.content} placeholder={t("extensions.skillContentPlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, content: event.target.value }))} />
                  </label>
                  <details className="extensionFormAdvanced wide">
                    <summary>{t("extensions.optionalDetails")}<ChevronDown size={14} /></summary>
                    <label>
                      <span>{t("extensions.form.description")}</span>
                      <input value={skillDraft.description} placeholder={t("extensions.skillDescriptionPlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                  </details>
                  <button type="submit" disabled={busy || !skillDraft.name.trim() || skillDraft.content.trim().length < 10}>{t("extensions.createAndEnable")}</button>
                </form>
              ) : null}

              {creator === "mcp" ? (
                <form className="extensionCreateForm" onSubmit={(event) => { event.preventDefault(); void createMCPServer().catch((caught) => setActionError(errorMessage(locale, caught, t("extensions.actionFailed")))); }}>
                  <label className="wide">
                    <span>{t("extensions.form.name")}</span>
                    <input autoFocus value={mcpDraft.name} placeholder={t("extensions.mcpNamePlaceholder")} onChange={(event) => setMcpDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label className="wide">
                    <span>{t("extensions.form.command")}</span>
                    <input value={mcpDraft.command} placeholder="npx -y @modelcontextprotocol/server-filesystem ." onChange={(event) => setMcpDraft((current) => ({ ...current, command: event.target.value }))} />
                    <small>{t("extensions.commandHint")}</small>
                  </label>
                  <details className="extensionFormAdvanced wide">
                    <summary>{t("extensions.optionalDetails")}<ChevronDown size={14} /></summary>
                    <label>
                      <span>{t("extensions.form.envAllow")}</span>
                      <input value={mcpDraft.envAllow} placeholder="GITHUB_TOKEN, DATABASE_URL" onChange={(event) => setMcpDraft((current) => ({ ...current, envAllow: event.target.value }))} />
                    </label>
                  </details>
                  <button type="submit" disabled={busy || !mcpDraft.name.trim() || !mcpDraft.command.trim()}>{t("extensions.createAndEnable")}</button>
                </form>
              ) : null}

              {creator === "hook" ? (
                <form className="extensionCreateForm" onSubmit={(event) => { event.preventDefault(); void createHook().catch((caught) => setActionError(errorMessage(locale, caught, t("extensions.actionFailed")))); }}>
                  <label>
                    <span>{t("extensions.form.name")}</span>
                    <input autoFocus value={hookDraft.name} placeholder={t("extensions.hookNamePlaceholder")} onChange={(event) => setHookDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>{t("extensions.form.when")}</span>
                    <select value={hookDraft.event} onChange={(event) => setHookDraft((current) => ({ ...current, event: event.target.value as CreateHookRequest["event"] }))}>
                      <option value="run.before">{t("extensions.event.runBefore")}</option>
                      <option value="run.after">{t("extensions.event.runAfter")}</option>
                      <option value="tool.before">{t("extensions.event.toolBefore")}</option>
                      <option value="tool.after">{t("extensions.event.toolAfter")}</option>
                    </select>
                  </label>
                  <label className="wide">
                    <span>{t("extensions.form.command")}</span>
                    <input value={hookDraft.command} placeholder="npm test" onChange={(event) => setHookDraft((current) => ({ ...current, command: event.target.value }))} />
                  </label>
                  <details className="extensionFormAdvanced wide">
                    <summary>{t("extensions.optionalDetails")}<ChevronDown size={14} /></summary>
                    <label>
                      <span>{t("extensions.form.failurePolicy")}</span>
                      <select value={hookDraft.failurePolicy} onChange={(event) => setHookDraft((current) => ({ ...current, failurePolicy: event.target.value as CreateHookRequest["failure_policy"] }))}>
                        <option value="warn">{t("extensions.failure.warn")}</option>
                        <option value="block">{t("extensions.failure.block")}</option>
                      </select>
                    </label>
                  </details>
                  <button type="submit" disabled={busy || !hookDraft.name.trim() || !hookDraft.command.trim()}>{t("extensions.createAndEnable")}</button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="extensionCapabilityList">
            <ExtensionGroup icon={<Server size={16} />} title={t("extensions.mcp")} count={extensions?.catalog.mcp_servers.length ?? 0} empty={t("extensions.mcpEmpty")}>
              {(extensions?.catalog.mcp_servers ?? []).map((server) => {
                const enabled = settings.enabled_mcp_server_ids.includes(server.id);
                const discovery = extensions?.discovered_tools.find((item) => item.server_id === server.id);
                return <CapabilityRow key={server.id} name={server.name} description={discovery ? t("extensions.toolsDiscovered", { count: discovery.tool_count }) : t("extensions.mcpFallback")} enabled={enabled} disabled={!editable || busy || !server.valid} valid={server.valid} compatible event={evidenceByTarget.get(server.id)} onToggle={() => void toggle("enabled_mcp_server_ids", server.id)} />;
              })}
            </ExtensionGroup>

            <ExtensionGroup icon={<Workflow size={16} />} title={t("extensions.hooks")} count={extensions?.catalog.hooks.length ?? 0} empty={t("extensions.hooksEmpty")}>
              {(extensions?.catalog.hooks ?? []).map((hook) => {
                const enabled = settings.enabled_hook_ids.includes(hook.id);
                return <CapabilityRow key={hook.id} name={hook.name} description={eventLabel(hook.event, t)} enabled={enabled} disabled={!editable || busy || !hook.valid} valid={hook.valid} compatible event={evidenceByTarget.get(hook.id)} onToggle={() => void toggle("enabled_hook_ids", hook.id)} />;
              })}
            </ExtensionGroup>
          </div>

          {(extensions?.catalog.diagnostics.length ?? 0) > 0 ? (
            <div className="extensionDiagnostics"><AlertTriangle size={14} /><span>{extensions?.catalog.diagnostics.map((item) => translateExtensionDiagnostic(locale, item)).join(" · ")}</span></div>
          ) : <p className="extensionTechnicalEmpty">{t("extensions.noDiagnostics")}</p>}
          {!setupMode ? (
            <div className="extensionEvidence">
              <div className="extensionGroupTitle"><CircleDashed size={14} /><strong>{t("extensions.evidence")}</strong><span>{extensions?.evidence.length ?? 0}</span></div>
              {recentEvidence.length === 0 ? <p className="emptyText">{t("extensions.evidenceEmpty")}</p> : (
                <div className="extensionEvidenceList">{recentEvidence.map((event, index) => <EvidenceRow event={event} key={`${event.time}-${event.event}-${index}`} />)}</div>
              )}
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function CreatorButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span><Plus size={14} /></button>;
}

function ExtensionGroup({ icon, title, count, empty, children }: { icon: ReactNode; title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section className="extensionGroup">
      <div className="extensionGroupTitle">{icon}<strong>{title}</strong><span>{count}</span></div>
      {count === 0 ? <p className="emptyText">{empty}</p> : <div className="extensionRows">{children}</div>}
    </section>
  );
}

function CapabilityRow({
  name,
  description,
  detail,
  enabled,
  disabled,
  valid,
  compatible,
  event,
  onToggle,
}: {
  name: string;
  description: string;
  detail?: string;
  enabled: boolean;
  disabled: boolean;
  valid: boolean;
  compatible: boolean;
  event?: TraceEvent;
  onToggle: () => void;
}) {
  const { locale, t } = usePreferences();
  const failed = event?.payload.ok === false;
  const status = failed
    ? translateKnownText(locale, event?.event ?? "")
    : !valid
      ? t("extensions.badge.invalid")
      : !compatible
        ? t("extensions.badge.incompatible")
        : enabled
          ? t("extensions.badge.enabled")
          : t("extensions.badge.off");
  const tone = failed ? "failed" : !valid || !compatible ? "warning" : enabled ? "enabled" : "off";
  return (
    <label className={`extensionRow ${enabled ? "enabled" : ""} ${failed ? "failed" : ""} ${!valid || !compatible ? "unavailable" : ""}`}>
      <span className="extensionMain">
        <strong>{name}</strong>
        <small>{description}</small>
        {detail ? <em>{detail}</em> : null}
      </span>
      <span className={`extensionRowStatus ${tone}`}>{failed || !valid || !compatible ? <AlertTriangle size={13} /> : enabled ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}{status}</span>
      <input type="checkbox" checked={enabled} disabled={disabled} onChange={onToggle} />
      <span className="extensionToggle" aria-hidden="true" />
    </label>
  );
}

function EvidenceRow({ event }: { event: TraceEvent }) {
  const { locale } = usePreferences();
  const identity = eventIdentity(event) ?? "runtime";
  const failed = event.payload.ok === false;
  return <div className={failed ? "failed" : ""}>{failed ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}<span><strong>{translateKnownText(locale, event.event)}</strong><code>{identity}</code></span></div>;
}

function eventIdentity(event: TraceEvent): string | undefined {
  const payload = event.payload;
  const skillIds = Array.isArray(payload.skill_ids) ? payload.skill_ids.join(", ") : undefined;
  const value = payload.skill_id ?? skillIds ?? payload.server_id ?? payload.hook_id ?? payload.tool;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function copySettings(settings: ExtensionSettings): ExtensionSettings {
  return {
    active_skill_ids: [...settings.active_skill_ids],
    enabled_mcp_server_ids: [...settings.enabled_mcp_server_ids],
    enabled_hook_ids: [...settings.enabled_hook_ids],
  };
}

function extensionId(name: string, fallback: string): string {
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const base = slug && /^[a-z]/.test(slug) ? slug : fallback;
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

function splitCommand(value: string): string[] {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2")) ?? [];
}

function eventLabel(event: string, t: (key: "extensions.event.runBefore" | "extensions.event.runAfter" | "extensions.event.toolBefore" | "extensions.event.toolAfter") => string): string {
  const labels = {
    "run.before": "extensions.event.runBefore",
    "run.after": "extensions.event.runAfter",
    "tool.before": "extensions.event.toolBefore",
    "tool.after": "extensions.event.toolAfter",
  } as const;
  return t(labels[event as keyof typeof labels] ?? "extensions.event.runAfter");
}

function errorMessage(locale: "zh" | "en", caught: unknown, fallback: string): string {
  return localizeErrorMessage(locale, caught, fallback);
}
