import { useEffect, useState } from "react";
import { Activity, BrainCircuit, Check, CircleAlert, CircleGauge, FlaskConical, Gauge, GitBranch, GitPullRequest, Layers3, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import type {
  ContextCompactionResponse,
  ContextPack,
  CreateMCPServerRequest,
  CreateHookRequest,
  CreateSkillRequest,
  ExtensionResponse,
  ExtensionSettings,
  GovernanceResponse,
  MemoryInput,
  MemoryResponse,
  RecoveryResponse,
  RunEvidenceLedger,
  RunReportResponse,
  TraceEvent,
  SandboxProfile,
  ToolOverride,
} from "../api/client";
import { translateKnownText, translateStatus, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";
import type { ControlPlaneTarget } from "./AgentOSControlPlane";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";
import { ContextPanel } from "./ContextPanel";
import { MemoryPanel } from "./MemoryPanel";
import { GovernancePanel } from "./GovernancePanel";
import { ExtensionPanel } from "./ExtensionPanel";

type ControlView = ControlPlaneTarget | "trace";
type PrimaryControlView = "overview" | "changes" | "context" | "settings";

interface RuntimePanelsProps {
  initialTarget?: ControlPlaneTarget;
  contract: {
    effects: string[];
    policies: Array<{ name: string; value: string }>;
    budget?: {
      max_steps: number;
      max_model_calls: number;
      max_tool_calls: number;
      max_wall_time_seconds: number;
    };
  };
  context?: ContextPack;
  contextBusy: boolean;
  memory?: MemoryResponse;
  memoryBusy: boolean;
  governance?: GovernanceResponse;
  governanceBusy: boolean;
  extensions?: ExtensionResponse;
  extensionsBusy: boolean;
  diff: {
    files: number;
    insertions: number;
    deletions: number;
    status: string;
  };
  tests: {
    command: string;
    status: string;
    passed: number;
    failed: number;
  };
  trace: TraceEvent[];
  evidence?: RunEvidenceLedger;
  runId?: string;
  runStatus: string;
  recovery?: RecoveryResponse;
  report?: RunReportResponse;
  rollbackBusy?: string;
  onRollback: (checkpointId: string) => void;
  onCompactContext: (targetRatio: number, confirmed: boolean) => Promise<ContextCompactionResponse>;
  onCreateMemory: (input: MemoryInput) => Promise<void>;
  onUpdateMemory: (memoryId: string, input: Omit<MemoryInput, "scope">) => Promise<void>;
  onDeleteMemory: (memoryId: string) => Promise<void>;
  onSaveGovernance: (profile: SandboxProfile, overrides: Record<string, ToolOverride>) => Promise<void>;
  onSaveExtensions: (settings: ExtensionSettings) => Promise<void>;
  onCreateSkill: (request: CreateSkillRequest) => Promise<void>;
  onCreateMCPServer: (request: CreateMCPServerRequest) => Promise<void>;
  onCreateHook: (request: CreateHookRequest) => Promise<void>;
  onClose: () => void;
}

export function RuntimePanels({
  initialTarget = "overview",
  contract,
  context,
  contextBusy,
  memory,
  memoryBusy,
  governance,
  governanceBusy,
  extensions,
  extensionsBusy,
  diff,
  tests,
  trace,
  evidence,
  runId,
  runStatus,
  recovery,
  report,
  rollbackBusy,
  onRollback,
  onCompactContext,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
  onSaveGovernance,
  onSaveExtensions,
  onCreateSkill,
  onCreateMCPServer,
  onCreateHook,
  onClose,
}: RuntimePanelsProps) {
  const [activeView, setActiveView] = useState<ControlView>(initialTarget);
  const { locale, t } = usePreferences();

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const providerRequests = trace.filter((event) => event.event === "model.requested").length;
  const cacheHits = trace.filter((event) => event.event === "model.cache.hit").length;
  const planningTurns = providerRequests + cacheHits;
  const routedUsage = summarizeRoutedUsage(trace);
  const latestMenu = [...trace].reverse().find((event) => event.event === "capability.menu.built");
  const disclosedTools = Array.isArray(latestMenu?.payload.tools)
    ? latestMenu.payload.tools.filter((tool): tool is string => typeof tool === "string")
    : [];
  const capabilityPhase = typeof latestMenu?.payload.phase === "string" ? latestMenu.payload.phase : "inspect";
  const loadedSkillIds = Array.from(new Set(
    trace
      .filter((event) => event.event === "skill.activated")
      .map((event) => event.payload.skill_id)
      .filter((id): id is string => typeof id === "string"),
  ));
  const activePrimary: PrimaryControlView = activeView === "overview" || activeView === "changes" || activeView === "context"
    ? activeView
    : "settings";
  const primaryViews: Array<{ id: PrimaryControlView; icon: typeof Activity; label: TranslationKey }> = [
    { id: "overview", icon: Activity, label: "inspector.overview" },
    { id: "changes", icon: GitPullRequest, label: "inspector.changes" },
    { id: "context", icon: BrainCircuit, label: "inspector.context" },
    { id: "settings", icon: Settings2, label: "inspector.settings" },
  ];

  return (
    <aside className="inspector" aria-label={t("control.runtimeTitle")}>
      <div className="inspectorTop">
        <div className="inspectorTitleRow">
          <div>
            <span className="inspectorEyebrow">{t("control.runtimeTitle")}</span>
            <strong>{runId ? `${t("run.label")} ${runId.slice(-8)}` : "MiniAgentOS"}</strong>
          </div>
          <div className="inspectorTitleActions">
            <span className={`inspectorRunState tone-${runStatus}`}>{translateStatus(locale, runStatus)}</span>
            <button type="button" className="inspectorClose" onClick={onClose} title={t("control.close")} aria-label={t("control.close")}>
              <X size={16} />
            </button>
          </div>
        </div>
        <nav className="controlViewTabs" aria-label={t("inspector.view")}>
          {primaryViews.map(({ id, icon: Icon, label }) => (
            <button
              type="button"
              className={activePrimary === id ? "active" : ""}
              aria-current={activePrimary === id ? "page" : undefined}
              title={t(label)}
              onClick={() => setActiveView(id === "settings" ? (activePrimary === "settings" ? activeView : "governance") : id)}
              key={id}
            >
              <Icon size={15} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="inspectorBody" id={`control-view-${activeView}`}>
        {activePrimary === "settings" ? (
          <nav className="controlSettingsTabs" aria-label={t("inspector.settings")}>
            {(["governance", "extensions", "memory", "trace"] as ControlView[]).map((view) => (
              <button type="button" className={activeView === view ? "active" : ""} onClick={() => setActiveView(view)} key={view}>
                {t(`inspector.${view}` as TranslationKey)}
              </button>
            ))}
          </nav>
        ) : null}
        {activeView === "overview" ? (
          <section className="inspectorSection controlOverviewSection">
            <div className="sectionHeader controlOverviewHeader">
              <div><h3>{t("control.overviewTitle")}</h3><span>{t("control.overviewDescription")}</span></div>
              <ShieldCheck size={17} />
            </div>

            <div className="contractAssurance">
              <span><Check size={16} /></span>
              <div><strong>{t("control.governedTitle")}</strong><p>{t("control.governedDescription")}</p></div>
            </div>

            <div className="runtimeFocusSummary">
              <article>
                <small>{t("control.changedFiles")}</small>
                <strong>{t("diff.files", { count: diff.files })}</strong>
              </article>
              <article>
                <small>{t("control.testStatus")}</small>
                <strong>{translateKnownText(locale, tests.status)}</strong>
              </article>
              <article>
                <small>{t("control.evidenceReady")}</small>
                <strong>{evidence ? t("evidence.score", { ready: evidence.ready, total: evidence.items.length }) : t("evidence.pending")}</strong>
              </article>
            </div>

            <details className="runtimeAdvancedDetails">
              <summary>{t("control.advancedRuntime")}</summary>

            <div className="evidenceLedger">
              <header>
                <div className="modelGateHeading"><ShieldCheck size={15} /><strong>{t("evidence.title")}</strong></div>
                <span>{evidence ? t("evidence.score", { ready: evidence.ready, total: evidence.items.length }) : t("evidence.pending")}</span>
              </header>
              <div className="evidenceLedgerGrid">
                {(evidence?.items ?? []).map((item) => (
                  <article className={`evidenceLedgerItem state-${item.state}`} key={item.id}>
                    <span>
                      {item.state === "ready" ? <Check size={13} /> : <CircleAlert size={13} />}
                      {t(`evidence.state.${item.state}` as TranslationKey)}
                    </span>
                    <strong>{t(`evidence.item.${item.id}` as TranslationKey)}</strong>
                    <small title={item.detail}>{localizeEvidenceDetail(item.detail, locale)}</small>
                    {item.details.length > 0 ? (
                      <div className="evidenceDetailList">
                        {item.details.slice(0, 4).map((detail, index) => (
                          <span className={`state-${detail.state}`} title={detail.value} key={`${detail.label}-${detail.value}-${index}`}>
                            <em>{t(`evidence.detail.${detail.label}` as TranslationKey)}</em>
                            <b>{localizeEvidenceValue(detail.value, locale)}</b>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <code>{translateKnownText(locale, item.source)} · {item.count}</code>
                  </article>
                ))}
                {!evidence ? (
                  <article className="evidenceLedgerItem state-pending">
                    <span><CircleAlert size={13} />{t("evidence.state.pending")}</span>
                    <strong>{t("evidence.emptyTitle")}</strong>
                    <small>{t("evidence.emptyDescription")}</small>
                    <code>runtime · 0</code>
                  </article>
                ) : null}
              </div>
              {evidence ? (
                <footer>
                  <span>{t("evidence.privacy")}</span>
                  <strong>{t("evidence.privacyNoContent")}</strong>
                </footer>
              ) : null}
            </div>

            <div className="modelGateEvidence">
              <div className="modelGateHeading"><Sparkles size={15} /><strong>{t("control.modelGateTitle")}</strong></div>
              <div>
                <span><small>{t("control.planningTurns")}</small><strong>{planningTurns}</strong></span>
                <span><small>{t("control.providerRequests")}</small><strong>{providerRequests}</strong></span>
                <span><small>{t("control.cacheHits")}</small><strong>{cacheHits}</strong></span>
              </div>
            </div>

            {routedUsage.length ? (
              <div className="modelRouteEvidence">
                <div className="modelGateHeading"><GitBranch size={15} /><strong>{t("control.modelRouteTitle")}</strong></div>
                <div className="modelRouteUsageList">
                  {routedUsage.map((usage) => (
                    <div key={usage.profile}>
                      <span><strong>{usage.profile}</strong><small>{usage.model}</small></span>
                      <span>{t("control.modelRouteCalls", { count: usage.calls })}</span>
                      <span>{t("control.modelRouteTokens", { count: usage.tokens })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="capabilityMenuEvidence">
              <div className="modelGateHeading"><Layers3 size={15} /><strong>{t("control.capabilityMenuTitle")}</strong></div>
              <div className="capabilityMenuSummary">
                <span>{t(`control.capabilityPhase.${capabilityPhase}` as TranslationKey)}</span>
                <strong>{t("control.disclosedToolCount", { count: disclosedTools.length })}</strong>
              </div>
              <div className="capabilityToolList">
                {disclosedTools.map((tool) => <code key={tool}>{tool}</code>)}
              </div>
              <div className="capabilityLoadedSkills">
                <span>{t("control.loadedSkills")}</span>
                <div>
                  {loadedSkillIds.length > 0
                    ? loadedSkillIds.map((skill) => <code key={skill}>{skill}</code>)
                    : <small>{t("control.noLoadedSkills")}</small>}
                </div>
              </div>
            </div>

            <div className="subsectionLabel">{t("control.capabilitiesTitle")}</div>
            <ul className="capabilityList">
              {contract.effects.map((effect) => (
                <li key={effect}><Check size={13} /><span>{effectLabel(effect, t)}</span></li>
              ))}
            </ul>

            <div className="subsectionLabel policyLabel">{t("control.budgetTitle")}</div>
            <div className="controlBudgetGrid">
              <div><CircleGauge size={15} /><span>{t("control.maxSteps")}</span><strong>{contract.budget?.max_steps ?? 0}</strong></div>
              <div><Gauge size={15} /><span>{t("control.maxTools")}</span><strong>{contract.budget?.max_tool_calls ?? 0}</strong></div>
              <div><ShieldCheck size={15} /><span>{t("control.maxMinutes")}</span><strong>{Math.ceil((contract.budget?.max_wall_time_seconds ?? 0) / 60)}</strong></div>
            </div>

            <details className="policyDisclosure">
              <summary>{t("control.policyDetails", { count: contract.policies.length })}</summary>
              <ul>
                {contract.policies.map((policy) => (
                  <li key={policy.name}>
                    <span>{translateKnownText(locale, policy.name)}</span>
                    <strong>{translateKnownText(locale, policy.value)}</strong>
                  </li>
                ))}
              </ul>
            </details>
            </details>
          </section>
        ) : null}

        {activeView === "changes" ? (
          <>
            <section className="inspectorSection signalGrid">
              <div className="signalItem">
                <div className="signalTitle"><GitPullRequest size={15} /><span>{t("diff.title")}</span></div>
                <strong>{translateKnownText(locale, diff.status)}</strong>
                <small>{t("diff.files", { count: diff.files })} · <b className="positive">+{diff.insertions}</b> / <b className="negative">-{diff.deletions}</b></small>
              </div>
              <div className="signalItem">
                <div className="signalTitle"><FlaskConical size={15} /><span>{t("tests.title")}</span></div>
                <strong>{translateKnownText(locale, tests.status)}</strong>
                <small>{tests.command} · {t("tests.passed", { count: tests.passed })} · {t("tests.failed", { count: tests.failed })}</small>
              </div>
            </section>
            <RunReportPanel report={report} />
            <RecoveryPanel recovery={recovery} busyCheckpoint={rollbackBusy} onRollback={onRollback} />
          </>
        ) : null}

        {activeView === "context" ? <ContextPanel context={context} busy={contextBusy} onCompact={onCompactContext} /> : null}
        {activeView === "memory" ? <MemoryPanel memory={memory} busy={memoryBusy} onCreate={onCreateMemory} onUpdate={onUpdateMemory} onDelete={onDeleteMemory} /> : null}
        {activeView === "extensions" ? <ExtensionPanel extensions={extensions} busy={extensionsBusy} onSave={onSaveExtensions} onCreateSkill={onCreateSkill} onCreateMCPServer={onCreateMCPServer} onCreateHook={onCreateHook} /> : null}
        {activeView === "governance" ? <GovernancePanel governance={governance} busy={governanceBusy} onSave={onSaveGovernance} /> : null}
        {activeView === "trace" ? <TraceReplayPanel runId={runId} runStatus={runStatus} events={trace} /> : null}
      </div>
    </aside>
  );
}

function effectLabel(effect: string, t: (key: TranslationKey, values?: Record<string, string | number>) => string): string {
  const labels: Record<string, TranslationKey> = {
    "fs.read": "effect.fs.read",
    "fs.write": "effect.fs.write",
    "shell.exec": "effect.shell.exec",
    "test.run": "effect.test.run",
    "state.memory": "effect.state.memory",
    "mcp.call": "effect.mcp.call",
  };
  return labels[effect] ? t(labels[effect]) : effect;
}

function summarizeRoutedUsage(trace: TraceEvent[]): Array<{ profile: string; model: string; calls: number; tokens: number }> {
  const usage = new Map<string, { profile: string; model: string; calls: number; tokens: number }>();
  for (const event of trace) {
    if (event.event !== "model.responded") continue;
    const response = isRecord(event.payload.response) ? event.payload.response : undefined;
    const metadata = response && isRecord(response.metadata) ? response.metadata : undefined;
    const profile = metadata && typeof metadata.route_profile === "string" ? metadata.route_profile : undefined;
    if (!profile) continue;
    const model = response && typeof response.model === "string" ? response.model : "-";
    const tokenUsage = response && isRecord(response.usage) ? response.usage : {};
    const input = numberValue(tokenUsage.input_tokens ?? tokenUsage.prompt_tokens);
    const output = numberValue(tokenUsage.output_tokens ?? tokenUsage.completion_tokens);
    const current = usage.get(profile) ?? { profile, model, calls: 0, tokens: 0 };
    current.calls += 1;
    current.tokens += input + output;
    current.model = model;
    usage.set(profile, current);
  }
  return [...usage.values()].sort((left, right) => right.calls - left.calls || left.profile.localeCompare(right.profile));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function localizeEvidenceDetail(detail: string, locale: "zh" | "en"): string {
  if (locale === "en") return detail;
  return detail
    .replace("Context Pack is not available yet", "上下文包尚未就绪")
    .replace("No test summary is available yet", "尚无测试摘要")
    .replace("No structured completion assessment yet", "尚无结构化完成验收")
    .replace("selected items", "个已选上下文项")
    .replace("tokens", "Token")
    .replace("protocol items", "个协议项")
    .replace("provider requests", "次真实模型请求")
    .replace("cache hits", "次缓存命中")
    .replace("responses", "次响应")
    .replace("tool calls", "次工具调用")
    .replace("rejected", "拒绝")
    .replace("policy evaluations", "次策略评估")
    .replace("approvals", "次审批")
    .replace("pending", "待处理")
    .replace("skill activations", "次 Skill 激活")
    .replace("MCP calls", "次 MCP 调用")
    .replace("hook events", "次 Hook 事件")
    .replace("checks passed", "项检查通过")
    .replace("required checks failed", "项必需检查失败")
    .replace("Passed", "通过")
    .replace("Failed", "失败")
    .replace("Not run", "未运行")
    .replace("Not selected", "未选择")
    .replace("failed", "失败");
}

function localizeEvidenceValue(value: string, locale: "zh" | "en"): string {
  if (locale === "en") return value;
  return value
    .replace("passed", "通过")
    .replace("missing", "缺失")
    .replace("unknown", "未知");
}
