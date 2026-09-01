import { usePreferences } from "../preferences";

export function SplashScreen({ onEnter }: { onEnter: () => void }) {
  const { t } = usePreferences();
  return (
    <div className="splashScreen" role="dialog" aria-label={t("splash.title")}>
      <div className="splashHello">
        <svg viewBox="0 0 1060 210" aria-hidden="true">
          <text x="50%" y="128" textAnchor="middle">{t("splash.title")}</text>
        </svg>
        <span>{t("splash.subtitle")}</span>
        <button type="button" onClick={onEnter}>{t("splash.enter")}</button>
      </div>
    </div>
  );
}
