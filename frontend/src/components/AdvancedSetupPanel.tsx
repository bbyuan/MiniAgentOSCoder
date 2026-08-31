import { useState } from "react";
import { PlugZap, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type {
  ExtensionResponse,
  ExtensionSettings,
  CreateMCPServerRequest,
  CreateSkillRequest,
  GovernanceResponse,
  SandboxProfile,
  ToolOverride,
} from "../api/client";
import { usePreferences } from "../preferences";
import { ExtensionPanel } from "./ExtensionPanel";
import { GovernancePanel } from "./GovernancePanel";

type SetupTab = "governance" | "extensions";

interface AdvancedSetupPanelProps {
  governance?: GovernanceResponse;
  governanceBusy: boolean;
  extensions?: ExtensionResponse;
  extensionsBusy: boolean;
  onSaveGovernance: (profile: SandboxProfile, overrides: Record<string, ToolOverride>) => Promise<void>;
  onSaveExtensions: (settings: ExtensionSettings) => Promise<void>;
  onCreateSkill: (request: CreateSkillRequest) => Promise<void>;
  onCreateMCPServer: (request: CreateMCPServerRequest) => Promise<void>;
}

export function AdvancedSetupPanel({
  governance,
  governanceBusy,
  extensions,
  extensionsBusy,
  onSaveGovernance,
  onSaveExtensions,
  onCreateSkill,
  onCreateMCPServer,
}: AdvancedSetupPanelProps) {
  const { t } = usePreferences();
  const [activeTab, setActiveTab] = useState<SetupTab>("governance");
  const tabs = [
    {
      id: "governance" as const,
      icon: ShieldCheck,
      title: t("advanced.governance"),
      description: t("advanced.governanceDescription"),
    },
    {
      id: "extensions" as const,
      icon: PlugZap,
      title: t("advanced.extensions"),
      description: t("advanced.extensionsDescription"),
    },
  ];

  return (
    <section className="advancedSetup" aria-labelledby="advanced-setup-title">
      <header className="advancedSetupHeader">
        <span className="advancedSetupIcon"><SlidersHorizontal size={19} /></span>
        <div>
          <h2 id="advanced-setup-title">{t("advanced.title")}</h2>
          <p>{t("advanced.description")}</p>
        </div>
        <span className="advancedSetupBadge">{t("advanced.optional")}</span>
      </header>

      <div className="advancedSetupLayout">
        <nav className="advancedSetupNav" aria-label={t("advanced.title")}>
          {tabs.map(({ id, icon: Icon, title, description }) => (
            <button
              type="button"
              className={activeTab === id ? "active" : ""}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
              key={id}
            >
              <Icon size={18} />
              <span><strong>{title}</strong><small>{description}</small></span>
            </button>
          ))}
          <p>{t("advanced.note")}</p>
        </nav>

        <div className="advancedSetupBody">
          {activeTab === "governance" ? (
            <GovernancePanel
              governance={governance}
              busy={governanceBusy}
              setupMode
              onSave={onSaveGovernance}
            />
          ) : (
            <ExtensionPanel
              extensions={extensions}
              busy={extensionsBusy}
              setupMode
              onSave={onSaveExtensions}
              onCreateSkill={onCreateSkill}
              onCreateMCPServer={onCreateMCPServer}
            />
          )}
        </div>
      </div>
    </section>
  );
}
