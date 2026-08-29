import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  PlugZap,
  Save,
  Server,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { ExtensionResponse, ExtensionSettings, TraceEvent } from "../api/client";
import { translateExtensionDiagnostic, translateKnownText } from "../i18n";
import { usePreferences } from "../preferences";

interface ExtensionPanelProps {
  extensions?: ExtensionResponse;
  busy: boolean;
  setupMode?: boolean;
  onSave: (settings: ExtensionSettings) => Promise<void>;
}

export function ExtensionPanel({ extensions, busy, setupMode = false, onSave }: ExtensionPanelProps) {
  const { locale, t } = usePreferences();
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

  return (
    <section className="inspectorSection extensionSection">
      <div className="sectionHeader extensionHeading">
        <div>
          <h3>{t(setupMode ? "advanced.extensions" : "extensions.title")}</h3>
          <span>{setupMode ? t("extensions.setupDescription") : extensions?.editable ? t("extensions.editable") : t("extensions.readOnly")}</span>
        </div>
        <PlugZap size={15} />
      </div>

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
          <label className={`extensionRow ${skill.valid ? "" : "invalid"}`} key={skill.id}>
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
          return (
            <label className={`extensionRow ${server.valid ? "" : "invalid"}`} key={server.id}>
              <input
                type="checkbox"
                checked={settings.enabled_mcp_server_ids.includes(server.id)}
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
          <label className={`extensionRow ${hook.valid ? "" : "invalid"}`} key={hook.id}>
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
  const payload = event.payload;
  const identity = String(
    payload.skill_id
      ?? (Array.isArray(payload.skill_ids) ? payload.skill_ids.join(", ") : undefined)
      ?? payload.server_id
      ?? payload.hook_id
      ?? payload.tool
      ?? "runtime",
  );
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
