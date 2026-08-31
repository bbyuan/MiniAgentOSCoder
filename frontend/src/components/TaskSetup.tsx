import { AlertTriangle, ArrowUp, CheckCircle2, ChevronDown, FileText, GitBranch, KeyRound, MessageSquareText, SlidersHorizontal, Sparkles, TerminalSquare, Wrench } from "lucide-react";
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
  const packState = agentPackDrift
    ? agentPackDrift.has_versions
      ? agentPackDrift.drift ? "changed" : "stable"
      : "empty"
    : "loading";
  const protocolCount = protocols?.summary.total ?? 0;
  const modelState = modelReady ? "ready" : model ? "blocked" : "checking";
  const readinessTone = !modelReady ? "blocked" : packState === "changed" ? "review" : "ready";
  const readinessTitle = !modelReady
    ? t("task.setupSummaryBlocked")
    : packState === "changed"
      ? t("task.setupSummaryReview")
      : t("task.setupSummaryReady");
  const readinessHint = !modelReady
    ? t("task.setupSummaryBlockedHint")
    : packState === "changed"
      ? t("task.setupSummaryReviewHint")
      : t("task.setupSummaryReadyHint");

  return (
    <section className="taskSetup productTaskSetup" aria-labelledby="task-setup-title">
      <header className="taskIntro productTaskIntro">
        <h1 id="task-setup-title">{t("task.title")}</h1>
        <p>{t("task.description")}</p>
      </header>

      {!task.trim() ? (
        <div className="taskQuickStarts" aria-label={t("task.quickStart")}>
          <button type="button" onClick={() => { onModeChange("Bugfix"); onTaskChange(t(examples.Bugfix)); }}>
            <Wrench size={15} /><span>{t("task.quickFix")}</span>
          </button>
          <button type="button" onClick={() => { onModeChange("Review"); onTaskChange(t(examples.Review)); }}>
            <CheckCircle2 size={15} /><span>{t("task.quickReview")}</span>
          </button>
          <button type="button" onClick={() => { onModeChange("Chat"); onTaskChange(t(examples.Chat)); }}>
            <MessageSquareText size={15} /><span>{t("task.quickExplore")}</span>
          </button>
        </div>
      ) : null}

      {!modelReady ? (
        <div className={`taskModelGate state-${modelState}`}>
          <span>{modelState === "checking" ? <Sparkles size={16} /> : <AlertTriangle size={16} />}</span>
          <div><strong>{t(modelState === "checking" ? "task.startChecking" : "task.startBlocked")}</strong><small>{t(modelState === "checking" ? "task.startCheckingHint" : "task.startBlockedHint")}</small></div>
          {modelState === "blocked" ? <button type="button" onClick={onConfigureModel}>{t("task.configureModel")}</button> : null}
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
            {task.trim() ? (
              <button
                type="button"
                className="runSettingsAction"
                disabled={busy || !modelReady}
                onClick={onReviewSettings}
              >
                <SlidersHorizontal size={16} />{t("task.reviewSettings")}
              </button>
            ) : null}
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

      <details className={`setupDetails compactSetupDetails taskReadinessDisclosure tone-${readinessTone}`} open={modelState === "blocked" ? true : undefined}>
        <summary>
          <span className="taskReadinessSummaryIcon">
            {readinessTone === "blocked" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          </span>
          <span className="taskReadinessSummaryCopy">
            <strong>{readinessTitle}</strong>
            <small>{readinessHint}</small>
          </span>
          <span className="taskReadinessPills" aria-label={t("task.setupDetails")}>
            <em className={modelReady ? "ready" : "blocked"}>{modelReady ? model?.model || t("task.setupChipModelReady") : t("task.setupChipModelMissing")}</em>
            <b>{t("task.setupExpand")}</b>
          </span>
          <ChevronDown size={15} />
        </summary>
        <section className="compactProjectChecks" aria-label={t("task.readinessTitle")}>
          <ProjectCheckRow
            icon={modelReady ? <CheckCircle2 size={16} /> : <KeyRound size={16} />}
            tone={modelReady ? "ready" : "blocked"}
            title={t("task.readinessModel")}
            value={modelReady ? t("task.checkReady") : t("preflight.needsSetup")}
            detail={modelReady ? model?.model || t("preflight.ready") : t("task.readinessModelMissing")}
            actionLabel={modelReady ? undefined : t("task.configureModel")}
            onAction={modelReady ? undefined : onConfigureModel}
          />
          {tests.length ? (
            <ProjectCheckRow
              icon={<TerminalSquare size={16} />}
              tone="ready"
              title={t("task.readinessTests")}
              value={t("task.testCommands", { count: tests.length })}
              detail={tests[0]}
            />
          ) : null}
          {protocolCount ? (
            <ProjectCheckRow
              icon={<FileText size={16} />}
              tone="ready"
              title={t("task.readinessProtocols")}
              value={t("task.protocolCount", { count: protocolCount })}
              detail={t("task.protocolDetectedHint")}
            />
          ) : null}
          {packState === "changed" ? (
            <ProjectCheckRow
              icon={<GitBranch size={16} />}
              tone="warn"
              title={t("task.readinessWorkspace")}
              value={t("task.workspaceChanged")}
              detail={agentPackDrift?.changed_sections.length ? t("task.workspaceChangedDetail", { count: agentPackDrift.changed_sections.length }) : t("task.workspaceChangedHint")}
              actionLabel={t("task.workspaceReview")}
              onAction={onOpenAgentPack}
            />
          ) : null}
        </section>
      </details>
    </section>
  );
}

function ProjectCheckRow({
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
    <article className={`projectCheckRow tone-${tone}`}>
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
