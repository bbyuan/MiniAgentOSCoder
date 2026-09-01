import { useEffect, useState } from "react";
import { daemonApi, type AgentPackDrift, type AgentPackManifest, type AgentPackVersion, type OpenProjectResponse, type ProjectProtocols, type RunMode } from "../api/client";
import { type Locale, type TranslationKey, localizeErrorMessage } from "../i18n";

type Translator = (key: TranslationKey, variables?: Record<string, string | number>) => string;

interface AgentPackStateOptions {
  project?: OpenProjectResponse;
  mode: RunMode;
  locale: Locale;
  t: Translator;
}

export function useAgentPackState({ project, mode, locale, t }: AgentPackStateOptions) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [manifest, setManifest] = useState<AgentPackManifest>();
  const [versions, setVersions] = useState<AgentPackVersion[]>([]);
  const [drift, setDrift] = useState<AgentPackDrift>();
  const [protocols, setProtocols] = useState<ProjectProtocols>();

  useEffect(() => {
    setManifest(undefined);
    setVersions([]);
    setError(undefined);
    if (!project) {
      setDrift(undefined);
      setProtocols(undefined);
      return;
    }

    let cancelled = false;
    Promise.all([
      daemonApi.getAgentPackDrift(project.project_id, mode).catch(() => undefined),
      daemonApi.getProjectProtocols(project.project_id).catch(() => undefined),
    ])
      .then(([nextDrift, nextProtocols]) => {
        if (cancelled) return;
        setDrift(nextDrift);
        setProtocols(nextProtocols);
      })
      .catch(() => {
        if (!cancelled) {
          setDrift(undefined);
          setProtocols(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project?.project_id, mode]);

  async function openDialog() {
    if (!project) return;
    setOpen(true);
    setBusy(true);
    setError(undefined);
    try {
      const [nextManifest, versionResponse, nextDrift] = await Promise.all([
        daemonApi.getAgentPack(project.project_id, mode),
        daemonApi.getAgentPackVersions(project.project_id),
        daemonApi.getAgentPackDrift(project.project_id, mode),
      ]);
      setManifest(nextManifest);
      setVersions(versionResponse.versions);
      setDrift(nextDrift);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("agentPack.loadError")));
    } finally {
      setBusy(false);
    }
  }

  async function saveVersion() {
    if (!project) return;
    setVersionBusy(true);
    setError(undefined);
    try {
      await daemonApi.saveAgentPackVersion(project.project_id, mode);
      const [nextManifest, versionResponse, nextDrift] = await Promise.all([
        daemonApi.getAgentPack(project.project_id, mode),
        daemonApi.getAgentPackVersions(project.project_id),
        daemonApi.getAgentPackDrift(project.project_id, mode),
      ]);
      setManifest(nextManifest);
      setVersions(versionResponse.versions);
      setDrift(nextDrift);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("agentPack.saveError")));
    } finally {
      setVersionBusy(false);
    }
  }

  return {
    open,
    busy,
    versionBusy,
    error,
    manifest,
    versions,
    drift,
    protocols,
    openDialog,
    closeDialog: () => setOpen(false),
    refresh: openDialog,
    saveVersion,
  };
}
