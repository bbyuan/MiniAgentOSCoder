import { AlertTriangle, ArrowUp, Boxes, CheckCircle2, ChevronDown, ClipboardCheck, FileCheck2, GitBranch, KeyRound, Layers3, ScrollText, ShieldCheck, SlidersHorizontal, Sparkles, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentPackDrift, ModelProviderStatus, OpenProjectResponse, ProjectProtocols, RunMode } from "../api/client";
import { translateMode } from "../i18n";
import { usePreferences } from "../preferences";

interface TaskSetupProps {
  project: OpenProjectResponse;
  task: string;
  mode: RunMode;
  busy: boolean;
  model?: ModelProviderStatus;
  agentPackDrift?: AgentPackDrift;
  protocols?: ProjectProtocols;
  onTaskChange: (task: string) => void;
  onModeChange: (mode: RunMode) => void;
  onStart: () => void;
  onReviewSettings: () => void;
  onConfigureModel: () => void;
  onOpenAgentPack: () => void;
}

const taskModes: RunMode[] = ["Bugfix", "Feature", "Review", "Spec", "Chat"];

const examples: Record<RunMode, "task.example.bugfix" | "task.example.feature" | "task.example.review" | "task.example.spec" | "task.example.chat"> = {
  Bugfix: "task.example.bugfix",
  Feature: "task.example.feature",
  Review: "task.example.review",
  Spec: "task.example.spec",
  Chat: "task.example.chat",
};

export function TaskSetup({
  project,
  task,
  mode,
  busy,
  model,
  agentPackDrift,
  protocols,
  onTaskChange,
  onModeChange,
  onStart,
  onReviewSettings,
  onConfigureModel,
  onOpenAgentPack,
}: TaskSetupProps) {
  const { locale, t } = usePreferences();
  const modelReady = model?.configured === true;
  const tests = project.profile.test_commands ?? [];
  const languages = project.profile.languages ?? [];
  const packState = agentPackDrift
    ? agentPackDrift.has_versions
      ? agentPackDrift.drift ? "changed" : "stable"
      : "empty"
    : "loading";
  const suggestedTasks = [
    { mode: "Bugfix" as RunMode, label: t("task.quickFix"), prompt: t("task.example.bugfix") },
    { mode: "Review" as RunMode, label: t("task.quickReview"), prompt: t("task.example.review") },
    { mode: "Chat" as RunMode, label: t("task.quickExplore"), prompt: t("task.example.chat") },
  ];
  const protocolCount = protocols?.summary.total ?? 0;
  const modelState = modelReady ? "ready" : model ? "blocked" : "checking";
  const protocolDetail = protocols
    ? protocolCount
      ? t("task.protocolDetail", {
        agents: protocols.summary.agent_docs,
        specs: protocols.summary.openspec_specs + protocols.summary.openspec_changes,
        skills: protocols.summary.skills,
      })
      : t("task.protocolMissingHint")
    : t("task.protocolChecking");
  return (
    <section className="taskSetup productTaskSetup" aria-labelledby="task-setup-title">
      <header className="taskIntro productTaskIntro">
        <h1 id="task-setup-title">{t("task.title")}</h1>
        <p>{t("task.description")}</p>
      </header>

      <StartReadinessBrief
        modelState={modelState}
        tests={tests.length}
        protocols={protocolCount}
        baseline={packState}
        onConfigureModel={onConfigureModel}
      />

      {model && !model.configured ? (
        <div className="taskModelNotice">
          <KeyRound size={17} />
          <div><strong>{t("task.modelNeeded")}</strong><span>{t("task.modelNeededHint")}</span></div>
          <button type="button" onClick={onConfigureModel}>{t("task.configureModel")}</button>
        </div>
      ) : null}

      <div className="taskComposerProduct">
        <label className="srOnly" htmlFor="task-description">{t("task.instruction")}</label>
        <textarea
          id="task-description"
          value={task}
          disabled={busy}
          rows={8}
          placeholder={t("task.placeholder")}
          onChange={(event) => onTaskChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && task.trim() && modelReady && !busy) {
              event.preventDefault();
              onStart();
            }
          }}
        />

        <div className="taskComposerToolbar">
          <div className="taskComposerOptions">
            <label className="taskTypeSelect">
              <span>{t("task.type")}</span>
              <select
                value={mode}
                disabled={busy}
                aria-label={t("task.type")}
                onChange={(event) => onModeChange(event.target.value as RunMode)}
              >
                {taskModes.map((item) => <option value={item} key={item}>{translateMode(locale, item)}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="exampleFillAction"
              disabled={busy}
              onClick={() => onTaskChange(t(examples[mode]))}
              title={t("task.tryExample")}
            >
              <Sparkles size={15} />
              <span>{t("task.tryExample")}</span>
            </button>
          </div>

          <div className="taskPrimaryActions">
            <button
              type="button"
              className="runSettingsAction"
              disabled={busy || !task.trim() || !modelReady}
              onClick={onReviewSettings}
            >
              <SlidersHorizontal size={16} />{t("task.reviewSettings")}
            </button>
            <button
              type="button"
              className="startTaskAction"
              disabled={busy || !task.trim() || !modelReady}
              onClick={onStart}
            >
              {busy ? t("task.starting") : t("task.start")}
              <ArrowUp size={17} />
            </button>
          </div>
        </div>
      </div>

      <details className="guidedTaskStarts">
        <summary>
          <span><ClipboardCheck size={14} />{t("task.quickStart")}</span>
          <ChevronDown size={15} />
        </summary>
        <div>
          {suggestedTasks.map((item) => (
            <button
              type="button"
              key={item.mode}
              disabled={busy}
              onClick={() => {
                onModeChange(item.mode);
                onTaskChange(item.prompt);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </details>

      <details className="setupDetails compactSetupDetails">
        <summary>
          <span>{t("task.setupDetails")}</span>
          <ChevronDown size={15} />
        </summary>
        <section className="projectReadiness" aria-label={t("task.readinessTitle")}>
          <header>
            <div>
              <span className="stageEyebrow">{t("task.readinessEyebrow")}</span>
              <h2>{t("task.readinessTitle")}</h2>
            </div>
            <div className="projectStackPills">
              {(languages.length ? languages : [t("agentPack.unknown")]).slice(0, 4).map((language) => <span key={language}>{language}</span>)}
            </div>
          </header>
          <div className="readinessGrid">
            <ReadinessTile
              icon={modelReady ? <CheckCircle2 size={16} /> : <KeyRound size={16} />}
              tone={modelReady ? "ready" : "blocked"}
              title={t("task.readinessModel")}
              value={modelReady ? model?.model || t("preflight.ready") : t("preflight.needsSetup")}
              detail={modelReady ? t("task.readinessModelReady") : t("task.readinessModelMissing")}
              actionLabel={modelReady ? undefined : t("task.configureModel")}
              onAction={modelReady ? undefined : onConfigureModel}
            />
            <ReadinessTile
              icon={<TerminalSquare size={16} />}
              tone={tests.length ? "ready" : "warn"}
              title={t("task.readinessTests")}
              value={tests.length ? t("task.testCommands", { count: tests.length }) : t("task.noTests")}
              detail={tests[0] || t("task.noTestsHint")}
            />
            <ReadinessTile
              icon={packState === "changed" ? <GitBranch size={16} /> : <Boxes size={16} />}
              tone={packState === "changed" ? "warn" : packState === "empty" ? "info" : "ready"}
              title={t("task.readinessAgentPack")}
              value={t(packState === "changed" ? "task.agentPackChanged" : packState === "empty" ? "task.agentPackEmpty" : packState === "stable" ? "task.agentPackStable" : "task.agentPackChecking")}
              detail={agentPackDrift?.changed_sections.length ? t("preflightDeck.agentPackChanges", { count: agentPackDrift.changed_sections.length }) : t("task.agentPackHint")}
              actionLabel={t("preflightDeck.openAgentPack")}
              onAction={onOpenAgentPack}
            />
            <ReadinessTile
              icon={<ScrollText size={16} />}
              tone={protocolCount ? "ready" : "info"}
              title={t("task.readinessProtocols")}
              value={protocolCount ? t("task.protocolCount", { count: protocolCount }) : t("task.protocolMissing")}
              detail={protocolDetail}
              actionLabel={t("task.useSpecMode")}
              onAction={() => {
                onModeChange("Spec");
                onTaskChange(t("task.protocolPrompt"));
              }}
            />
          </div>
          {protocols?.items.length ? (
            <div className="protocolPreview">
              <span>{t("task.protocolPreview")}</span>
              <div>
                {protocols.items.slice(0, 4).map((item) => (
                  <code title={item.path} key={item.id}>{item.path}</code>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <div className="taskRunPreview" aria-label={t("task.flowTitle")}>
          <div>
            <Layers3 size={15} />
            <strong>{t("task.flow.context")}</strong>
            <span>{t("task.flow.contextHint")}</span>
          </div>
          <div>
            <ShieldCheck size={15} />
            <strong>{t("task.flow.govern")}</strong>
            <span>{t("task.flow.governHint")}</span>
          </div>
          <div>
            <GitBranch size={15} />
            <strong>{t("task.flow.execute")}</strong>
            <span>{t("task.flow.executeHint")}</span>
          </div>
          <div>
            <FileCheck2 size={15} />
            <strong>{t("task.flow.verify")}</strong>
            <span>{t("task.flow.verifyHint")}</span>
          </div>
        </div>
      </details>
    </section>
  );
}

function StartReadinessBrief({
  modelState,
  tests,
  protocols,
  baseline,
  onConfigureModel,
}: {
  modelState: "ready" | "blocked" | "checking";
  tests: number;
  protocols: number;
  baseline: "stable" | "changed" | "empty" | "loading";
  onConfigureModel: () => void;
}) {
  const { t } = usePreferences();
  const ready = modelState === "ready";
  const checking = modelState === "checking";
  const Icon = ready ? CheckCircle2 : checking ? Sparkles : AlertTriangle;
  const baselineKey = baseline === "stable"
    ? "task.baseline.ready"
    : baseline === "changed"
      ? "task.baseline.changed"
      : baseline === "empty"
        ? "task.baseline.empty"
        : "task.baseline.checking";

  return (
    <aside className={`taskStartBrief state-${modelState}`} aria-label={t("task.startBrief")}>
      <div className="taskStartBriefLead">
        <span><Icon size={17} /></span>
        <div>
          <strong>{t(ready ? "task.startReady" : checking ? "task.startChecking" : "task.startBlocked")}</strong>
          <p>{t(ready ? "task.startReadyHint" : checking ? "task.startCheckingHint" : "task.startBlockedHint")}</p>
        </div>
      </div>
      <div className="taskStartBriefChecks">
        <span className={`state-${modelState}`}>
          {ready ? <CheckCircle2 size={13} /> : <KeyRound size={13} />}
          {t(ready ? "task.check.modelReady" : checking ? "task.check.modelChecking" : "task.check.modelRequired")}
        </span>
        <span className={tests ? "state-ready" : "state-optional"}>
          <TerminalSquare size={13} />
          {tests ? t("task.check.testsReady", { count: tests }) : t("task.check.testsOptional")}
        </span>
        <span className={protocols ? "state-ready" : "state-optional"}>
          <ScrollText size={13} />
          {protocols ? t("task.check.protocolsReady", { count: protocols }) : t("task.check.protocolsOptional")}
        </span>
        <span className={`state-${baseline === "stable" ? "ready" : baseline === "loading" ? "checking" : "optional"}`}>
          <Boxes size={13} />
          {t(baselineKey)}
        </span>
      </div>
      {!ready && !checking ? (
        <button type="button" onClick={onConfigureModel}>
          <KeyRound size={15} />
          {t("task.configureModel")}
        </button>
      ) : null}
    </aside>
  );
}

function ReadinessTile({
  icon,
  tone,
  title,
  value,
  detail,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  tone: "ready" | "warn" | "blocked" | "info";
  title: string;
  value: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className={`readinessTile tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{title}</small>
        <strong title={value}>{value}</strong>
        <em title={detail}>{detail}</em>
      </div>
      {actionLabel && onAction ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}
    </article>
  );
}
