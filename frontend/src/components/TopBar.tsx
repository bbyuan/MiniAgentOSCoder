import { Bot, CodeXml, History, Moon, Sun } from "lucide-react";
import { translateStatus } from "../i18n";
import { usePreferences } from "../preferences";

interface TopBarProps {
  project: string;
  status: string;
  model: string;
  modelConfigured: boolean | undefined;
  onOpenHistory: () => void;
}

export function TopBar({ project, status, model, modelConfigured, onOpenHistory }: TopBarProps) {
  const { locale, setLocale, theme, toggleTheme, t } = usePreferences();
  const themeLabel = theme === "light" ? t("top.themeDark") : t("top.themeLight");

  return (
    <header className="topbar">
      <div className="topbarInner">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            <CodeXml size={19} strokeWidth={2.2} />
          </div>
          <div className="brandCopy">
            <div className="brandName">MiniAgentOS Coder</div>
            <div className="brandMeta">{project} · {t("app.subtitle")}</div>
          </div>
        </div>

        <div className="topbarControls">
          <button
            type="button"
            className="iconButton"
            aria-label={t("history.open")}
            title={t("history.open")}
            onClick={onOpenHistory}
          >
            <History size={17} />
          </button>
          <div
            className={`statusChip modelChip ${modelConfigured === false ? "warning" : ""}`}
            title={t("top.modelStatus")}
          >
            <Bot size={15} />
            <span>{model}</span>
          </div>
          <div className={`statusChip runtimeChip tone-${status}`} title={t("top.runtimeStatus")}>
            <span className="statusDot" aria-hidden="true" />
            <span>{translateStatus(locale, status)}</span>
          </div>
          <div className="segmentedControl" role="group" aria-label={t("top.locale")}>
            <button
              type="button"
              className={locale === "zh" ? "active" : ""}
              aria-pressed={locale === "zh"}
              onClick={() => setLocale("zh")}
            >
              中
            </button>
            <button
              type="button"
              className={locale === "en" ? "active" : ""}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            className="iconButton"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </div>
      </div>
    </header>
  );
}
