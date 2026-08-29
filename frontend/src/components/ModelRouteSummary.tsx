import { AlertTriangle, CheckCircle2, Database, GitBranch, ShieldAlert } from "lucide-react";
import type { ModelRoutePlan, ModelRouteSelection } from "../api/client";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface ModelRouteSummaryProps {
  plan?: ModelRoutePlan;
}

const phases = ["inspect", "work", "verify", "repair"] as const;

export function ModelRouteSummary({ plan }: ModelRouteSummaryProps) {
  const { t } = usePreferences();
  if (!plan) return null;

  const icon = plan.decision === "blocked"
    ? <ShieldAlert size={17} />
    : plan.decision === "fallback"
      ? <AlertTriangle size={17} />
      : <CheckCircle2 size={17} />;

  return (
    <section className={`modelRouteSummary route-${plan.decision}`} aria-labelledby="model-route-title">
      <header className="modelRouteHeader">
        <div className="modelRouteTitle">
          <span><GitBranch size={17} /></span>
          <div>
            <h2 id="model-route-title">{t("modelRoute.title")}</h2>
            <p>{t(plan.enabled ? "modelRoute.policyDescription" : "modelRoute.singleDescription")}</p>
          </div>
        </div>
        <span className="modelRouteDecision">{icon}{t(`modelRoute.badge.${plan.decision}` as TranslationKey)}</span>
      </header>

      <div className="modelRoutePhases">
        {phases.map((phase, index) => {
          const route = plan.routes[phase];
          return (
            <div key={phase} className={`modelRoutePhase ${route?.configured ? "" : "blocked"} ${route?.fallback ? "fallback" : ""}`}>
              <span className="routeStep">{index + 1}</span>
              <div>
                <small>{t(`modelRoute.phase.${phase}` as TranslationKey)}</small>
                <strong>{route?.model || t("modelRoute.unavailable")}</strong>
                <span>{route ? t("modelRoute.profile", { profile: route.profile_id }) : t("modelRoute.noProfile")}</span>
              </div>
              {route ? <RouteReason route={route} /> : null}
              {!route?.configured ? <em>{t("modelRoute.blocked")}</em> : null}
            </div>
          );
        })}
      </div>

      {plan.profiles.length ? (
        <div className="modelRouteProfiles">
          <div className="modelRouteProfilesHeader">
            <Database size={15} />
            <strong>{t("modelRoute.profileRegistry")}</strong>
            <span>{t("modelRoute.profileRegistryHint", { count: plan.profiles.length })}</span>
          </div>
          <div className="modelRouteProfileList">
            {plan.profiles.map((profile) => (
              <article className={profile.configured ? "ready" : "blocked"} key={profile.profile_id}>
                <span>{profile.configured ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span>
                <div>
                  <strong>{profile.profile_id}</strong>
                  <small title={profile.model}>{profile.provider} · {profile.model}</small>
                </div>
                <em>{profile.context_window
                  ? t("modelRoute.contextWindow", { count: profile.context_window })
                  : t("modelRoute.contextUnknown")}</em>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="modelRouteFootnote">
        {plan.enabled
          ? t("modelRoute.policyHint")
          : t("modelRoute.compatibilityHint")}
      </footer>
    </section>
  );
}

function RouteReason({ route }: { route: ModelRouteSelection }) {
  const { t } = usePreferences();
  return (
    <em className={route.fallback ? "fallback" : ""}>
      {t(`modelRoute.reason.${route.reason}` as TranslationKey)}
    </em>
  );
}
