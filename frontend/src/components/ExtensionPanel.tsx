import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleDashed,
  Plus,
  PlugZap,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { CreateMCPServerRequest, CreateSkillRequest, ExtensionResponse, ExtensionSettings, TraceEvent } from "../api/client";
import { translateExtensionDiagnostic, translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface ExtensionPanelProps {
  extensions?: ExtensionResponse;
  busy: boolean;
  setupMode?: boolean;
  onSave: (settings: ExtensionSettings) => Promise<void>;
  onCreateSkill?: (request: CreateSkillRequest) => Promise<void>;
  onCreateMCPServer?: (request: CreateMCPServerRequest) => Promise<void>;
}

export function ExtensionPanel({ extensions, busy, setupMode = false, onSave, onCreateSkill, onCreateMCPServer }: ExtensionPanelProps) {
  const { locale, t } = usePreferences();
  const [creator, setCreator] = useState<"skill" | "mcp" | null>(null);
  const [skillDraft, setSkillDraft] = useState({
    id: "",
    name: "",
    description: "",
    content: "",
  });
  const [mcpDraft, setMcpDraft] = useState({
    id: "",
    name: "",
    command: "",
    envAllow: "",
  });
  const [settings, setSettings] = useState<ExtensionSettings>({
    active_skill_ids: [],
    enabled_mcp_server_ids: [],
    enabled_hook_ids: [],
  });
  const evidence = useMemo(
    () => [...(extensions?.evidence ?? [])].reverse().slice(0, 12),
    [extensions],
  );
  const loadedSkillIds = useMemo(
    () => new Set(
      (extensions?.evidence ?? [])
        .filter((event) => event.event === "skill.activated")
        .map((event) => event.payload.skill_id)
        .filter((id): id is string => typeof id === "string"),
    ),
    [extensions],
  );
  const evidenceByTarget = useMemo(() => {
    const lookup = new Map<string, TraceEvent>();
    [...(extensions?.evidence ?? [])].reverse().forEach((event) => {
      const id = eventIdentity(event);
      if (id && !lookup.has(id)) lookup.set(id, event);
    });
    return lookup;
  }, [extensions]);
  const extensionSummary = extensions?.summary;

  useEffect(() => {
    if (!extensions) return;
    setSettings({
      active_skill_ids: [...extensions.settings.active_skill_ids],
      enabled_mcp_server_ids: [...extensions.settings.enabled_mcp_server_ids],
      enabled_hook_ids: [...extensions.settings.enabled_hook_ids],
    });
  }, [extensions]);

  function toggle(key: keyof ExtensionSettings, id: string) {
    setSettings((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id],
    }));
  }

  async function save() {
    try {
      await onSave(settings);
    } catch {
      // The workbench error banner owns request failure feedback.
    }
  }

  async function createSkill() {
    if (!onCreateSkill) return;
    await onCreateSkill({
      id: skillDraft.id.trim(),
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      content: skillDraft.content.trim(),
      default_tools: ["read_file", "search_code", "write_patch", "run_test"],
      risk: "medium",
    });
    setSkillDraft({ id: "", name: "", description: "", content: "" });
    setCreator(null);
  }

  async function createMCPServer() {
    if (!onCreateMCPServer) return;
    await onCreateMCPServer({
      id: mcpDraft.id.trim(),
      name: mcpDraft.name.trim(),
      command: mcpDraft.command.trim().split(/\s+/).filter(Boolean),
      env_allow: mcpDraft.envAllow.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
      timeout_seconds: 15,
      risk: "high",
    });
    setMcpDraft({ id: "", name: "", command: "", envAllow: "" });
    setCreator(null);
  }

  const canCreateSkill = Boolean(skillDraft.id.trim() && skillDraft.name.trim() && skillDraft.content.trim().length >= 10);
  const canCreateMCP = Boolean(mcpDraft.id.trim() && mcpDraft.name.trim() && mcpDraft.command.trim());
  const canCreateProjectExtensions = Boolean(extensions?.editable && (onCreateSkill || onCreateMCPServer));

  return (
    <section className="inspectorSection extensionSection">
      <div className="sectionHeader extensionHeading">
        <div>
          <h3>{t(setupMode ? "advanced.extensions" : "extensions.title")}</h3>
          <span>{setupMode ? t("extensions.setupDescription") : extensions?.editable ? t("extensions.editable") : t("extensions.readOnly")}</span>
        </div>
        <PlugZap size={15} />
      </div>

      {canCreateProjectExtensions ? (
        <div className="extensionCreator">
          <div className="extensionCreatorIntro">
            <strong>{t("extensions.addTitle")}</strong>
            <span>{t("extensions.addDescription")}</span>
          </div>
          <div className="extensionCreatorActions">
            {onCreateSkill ? (
              <button type="button" className={creator === "skill" ? "active" : ""} onClick={() => setCreator(creator === "skill" ? null : "skill")}>
                <Plus size={14} />
                {t("extensions.addSkill")}
              </button>
            ) : null}
            {onCreateMCPServer ? (
              <button type="button" className={creator === "mcp" ? "active" : ""} onClick={() => setCreator(creator === "mcp" ? null : "mcp")}>
                <Plus size={14} />
                {t("extensions.addMCP")}
              </button>
            ) : null}
          </div>
          {creator === "skill" ? (
            <form className="extensionCreateForm" onSubmit={(event) => { event.preventDefault(); void createSkill().catch(() => undefined); }}>
              <label>
                <span>{t("extensions.form.id")}</span>
                <input value={skillDraft.id} placeholder="project-rule" onChange={(event) => setSkillDraft((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label>
                <span>{t("extensions.form.name")}</span>
                <input value={skillDraft.name} placeholder={t("extensions.skillNamePlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="wide">
                <span>{t("extensions.form.description")}</span>
                <input value={skillDraft.description} placeholder={t("extensions.skillDescriptionPlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="wide">
                <span>{t("extensions.form.skillContent")}</span>
                <textarea rows={5} value={skillDraft.content} placeholder={t("extensions.skillContentPlaceholder")} onChange={(event) => setSkillDraft((current) => ({ ...current, content: event.target.value }))} />
              </label>
              <button type="submit" disabled={busy || !canCreateSkill}>{t("extensions.createAndEnable")}</button>
            </form>
          ) : null}
          {creator === "mcp" ? (
            <form className="extensionCreateForm" onSubmit={(event) => { event.preventDefault(); void createMCPServer().catch(() => undefined); }}>
              <label>
                <span>{t("extensions.form.id")}</span>
                <input value={mcpDraft.id} placeholder="filesystem" onChange={(event) => setMcpDraft((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label>
                <span>{t("extensions.form.name")}</span>
                <input value={mcpDraft.name} placeholder={t("extensions.mcpNamePlaceholder")} onChange={(event) => setMcpDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="wide">
                <span>{t("extensions.form.command")}</span>
                <input value={mcpDraft.command} placeholder="npx -y @modelcontextprotocol/server-filesystem ." onChange={(event) => setMcpDraft((current) => ({ ...current, command: event.target.value }))} />
              </label>
              <label className="wide">
                <span>{t("extensions.form.envAllow")}</span>
                <input value={mcpDraft.envAllow} placeholder="GITHUB_TOKEN, DATABASE_URL" onChange={(event) => setMcpDraft((current) => ({ ...current, envAllow: event.target.value }))} />
              </label>
              <button type="submit" disabled={busy || !canCreateMCP}>{t("extensions.createAndEnable")}</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {extensionSummary ? (
        <div className="extensionSummaryGrid">
          <SummaryTile
            icon={<ShieldCheck size={15} />}
            label={t("extensions.summary.enabled")}
            value={`${extensionSummary.enabled_total}/${extensionSummary.available_total}`}
            detail={extensionSummary.diagnostic_count > 0
              ? t("extensions.summary.diagnostics", { count: extensionSummary.diagnostic_count })
              : t("extensions.summary.clean")}
            tone={extensionSummary.diagnostic_count > 0 ? "warning" : "ready"}
          />
          <SummaryTile
            icon={<Server size={15} />}
            label={t("extensions.summary.mcpTools")}
            value={String(extensionSummary.mcp_tools_discovered)}
            detail={t("extensions.summary.mcpEnabled", {
              enabled: extensionSummary.mcp_enabled,
              available: extensionSummary.mcp_available,
            })}
            tone={extensionSummary.mcp_enabled > 0 && extensionSummary.mcp_tools_discovered === 0 ? "pending" : "ready"}
          />
          <SummaryTile
            icon={<Activity size={15} />}
            label={t("extensions.summary.runtime")}
            value={String(extensionSummary.runtime_events)}
            detail={extensionSummary.runtime_failures > 0
              ? t("extensions.summary.failures", { count: extensionSummary.runtime_failures })
              : extensionSummary.has_runtime_activation
                ? t("extensions.summary.activated")
                : t("extensions.summary.waiting")}
            tone={extensionSummary.runtime_failures > 0 ? "failed" : extensionSummary.has_runtime_activation ? "ready" : "pending"}
          />
        </div>
      ) : null}

      {(extensions?.catalog.diagnostics.length ?? 0) > 0 ? (
        <div className="extensionDiagnostics">
          <AlertTriangle size={13} />
          <span>{extensions?.catalog.diagnostics.map((item) => translateExtensionDiagnostic(locale, item)).join(" · ")}</span>
        </div>
      ) : null}

      <ExtensionGroup
        icon={<Sparkles size={14} />}
        title={t("extensions.skills")}
        count={extensions?.catalog.skills.length ?? 0}
        empty={t("extensions.skillsEmpty")}
      >
        {(extensions?.catalog.skills ?? []).map((skill) => (
          <label className={`extensionRow ${skill.valid ? "" : "invalid"} ${settings.active_skill_ids.includes(skill.id) ? "enabled" : ""}`} key={skill.id}>
            <input
              type="checkbox"
              checked={settings.active_skill_ids.includes(skill.id)}
              disabled={!extensions?.editable || busy || !skill.valid}
              onChange={() => toggle("active_skill_ids", skill.id)}
            />
            <span className="extensionToggle" aria-hidden="true" />
            <span className="extensionMain">
              <strong>{skill.name}</strong>
              <small>{translateKnownText(locale, skill.description)}</small>
              <span className="extensionMeta">
                <code>{skill.id}</code>
                <em>{translateKnownText(locale, skill.risk)}</em>
                {skill.recommended ? <b>{t("extensions.recommended")}</b> : null}
                {settings.active_skill_ids.includes(skill.id) ? (
                  <b className={loadedSkillIds.has(skill.id) ? "loaded" : "available"}>
                    {t(loadedSkillIds.has(skill.id) ? "extensions.loaded" : "extensions.available")}
                  </b>
                ) : null}
              </span>
              <RuntimeBadge event={evidenceByTarget.get(skill.id)} fallback={settings.active_skill_ids.includes(skill.id) ? t("extensions.badge.enabled") : t("extensions.badge.off")} />
            </span>
          </label>
        ))}
      </ExtensionGroup>

      <ExtensionGroup
        icon={<Server size={14} />}
        title={t("extensions.mcp")}
        count={extensions?.catalog.mcp_servers.length ?? 0}
        empty={t("extensions.mcpEmpty")}
      >
        {(extensions?.catalog.mcp_servers ?? []).map((server) => {
          const discovery = extensions?.discovered_tools.find((item) => item.server_id === server.id);
          const enabled = settings.enabled_mcp_server_ids.includes(server.id);
          return (
            <label className={`extensionRow ${server.valid ? "" : "invalid"} ${enabled ? "enabled" : ""}`} key={server.id}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={!extensions?.editable || busy || !server.valid}
                onChange={() => toggle("enabled_mcp_server_ids", server.id)}
              />
              <span className="extensionToggle" aria-hidden="true" />
              <span className="extensionMain">
                <strong>{server.name}</strong>
                <small>{server.transport} · {server.executable} · {translateKnownText(locale, server.effect)}</small>
                <span className="extensionMeta">
                  <code>{server.id}</code>
                  <em>{translateKnownText(locale, server.risk)}</em>
                  {discovery ? <b>{t("extensions.toolsDiscovered", { count: discovery.tool_count })}</b> : null}
                </span>
                <RuntimeBadge event={evidenceByTarget.get(server.id)} fallback={enabled ? t("extensions.badge.enabled") : t("extensions.badge.off")} />
              </span>
            </label>
          );
        })}
      </ExtensionGroup>

      <ExtensionGroup
        icon={<Workflow size={14} />}
        title={t("extensions.hooks")}
        count={extensions?.catalog.hooks.length ?? 0}
        empty={t("extensions.hooksEmpty")}
      >
        {(extensions?.catalog.hooks ?? []).map((hook) => (
          <label className={`extensionRow ${hook.valid ? "" : "invalid"} ${settings.enabled_hook_ids.includes(hook.id) ? "enabled" : ""}`} key={hook.id}>
            <input
              type="checkbox"
              checked={settings.enabled_hook_ids.includes(hook.id)}
              disabled={!extensions?.editable || busy || !hook.valid}
              onChange={() => toggle("enabled_hook_ids", hook.id)}
            />
            <span className="extensionToggle" aria-hidden="true" />
            <span className="extensionMain">
              <strong>{hook.name}</strong>
              <small>{translateKnownText(locale, hook.event)} · {hook.executable}</small>
              <span className="extensionMeta">
                <code>{hook.id}</code>
                <em>{translateKnownText(locale, hook.failure_policy)}</em>
              </span>
              <RuntimeBadge event={evidenceByTarget.get(hook.id)} fallback={settings.enabled_hook_ids.includes(hook.id) ? t("extensions.badge.enabled") : t("extensions.badge.off")} />
            </span>
          </label>
        ))}
      </ExtensionGroup>

      {!setupMode ? <div className="extensionEvidence">
        <div className="extensionGroupTitle">
          <Braces size={14} />
          <strong>{t("extensions.evidence")}</strong>
          <span>{extensions?.evidence.length ?? 0}</span>
        </div>
        {evidence.length === 0 ? <p className="emptyText">{t("extensions.evidenceEmpty")}</p> : (
          <div className="extensionEvidenceList">
            {evidence.map((event, index) => (
              <EvidenceRow event={event} key={`${event.time}-${event.event}-${index}`} />
            ))}
          </div>
        )}
      </div> : null}

      {extensions?.editable ? (
        <button type="button" className="extensionSave" disabled={busy} onClick={save}>
          <Save size={14} />
          <span>{busy ? t("extensions.saving") : t("extensions.save")}</span>
        </button>
      ) : null}
    </section>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "ready" | "pending" | "warning" | "failed";
}) {
  return (
    <div className={`extensionSummaryTile tone-${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      <em>{detail}</em>
    </div>
  );
}

function ExtensionGroup({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="extensionGroup">
      <div className="extensionGroupTitle">
        {icon}
        <strong>{title}</strong>
        <span>{count}</span>
      </div>
      {count === 0 ? <p className="emptyText">{empty}</p> : <div className="extensionRows">{children}</div>}
    </div>
  );
}

function EvidenceRow({ event }: { event: TraceEvent }) {
  const { locale } = usePreferences();
  const identity = eventIdentity(event) ?? "runtime";
  const payload = event.payload;
  const ok = payload.ok;
  return (
    <div>
      {ok === false ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
      <span>
        <strong>{translateKnownText(locale, event.event)}</strong>
        <code>{identity}</code>
      </span>
    </div>
  );
}

function RuntimeBadge({ event, fallback }: { event?: TraceEvent; fallback: string }) {
  const { locale } = usePreferences();
  if (!event) {
    return (
      <span className="extensionRuntimeBadge muted">
        <CircleDashed size={11} />
        {fallback}
      </span>
    );
  }
  const failed = event.payload.ok === false;
  return (
    <span className={`extensionRuntimeBadge ${failed ? "failed" : "ready"}`}>
      {failed ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
      {translateKnownText(locale, event.event)}
    </span>
  );
}

function eventIdentity(event: TraceEvent): string | undefined {
  const payload = event.payload;
  const skillIds = Array.isArray(payload.skill_ids) ? payload.skill_ids.join(", ") : undefined;
  const value = payload.skill_id ?? skillIds ?? payload.server_id ?? payload.hook_id ?? payload.tool;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
