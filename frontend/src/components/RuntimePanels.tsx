import { useEffect, useState } from "react";
import { Activity, Braces, BrainCircuit, Check, CircleAlert, CircleGauge, Copy, Database, FlaskConical, FileText, Gauge, GitBranch, GitPullRequest, Layers3, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import type {
  ContextCompactionResponse,
  ContextPack,
  CreateMCPServerRequest,
  CreateHookRequest,
  CreateSkillRequest,
  ExtensionResponse,
  ExtensionSettings,
  FormalAgentProgram,
  FormalProgramNode,
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
import { localizeEvidenceDetail, localizeEvidenceValue } from "../run/localizedText";
import type { ControlPlaneTarget } from "./AgentOSControlPlane";
import { RecoveryPanel } from "./RecoveryPanel";
import { RunReportPanel } from "./RunReportPanel";
import { TraceReplayPanel } from "./TraceReplayPanel";
import { ContextPanel } from "./ContextPanel";
import { MemoryPanel } from "./MemoryPanel";
import { GovernancePanel } from "./GovernancePanel";
import { ExtensionPanel } from "./ExtensionPanel";

type ControlView = ControlPlaneTarget | "trace";
type PrimaryControlView = "overview" | "program" | "changes" | "context" | "settings";

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
  formalProgram?: FormalAgentProgram;
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
  formalProgram,
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
  const promptLayerCount = latestPromptLayerCount(trace);
  const roleChecks = trace.filter((event) => event.event === "agent.review.completed" || event.event === "agent.verification.completed").length;
  const memorySuggestions = memory?.recommendations?.length ?? latestMemorySuggestionCount(trace);
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
  const activePrimary: PrimaryControlView = activeView === "overview" || activeView === "program" || activeView === "changes" || activeView === "context"
    ? activeView
    : "settings";
  const primaryViews: Array<{ id: PrimaryControlView; icon: typeof Activity; label: TranslationKey }> = [
    { id: "overview", icon: Activity, label: "inspector.overview" },
    { id: "program", icon: Braces, label: "inspector.program" },
    { id: "changes", icon: GitPullRequest, label: "inspector.changes" },
    { id: "context", icon: BrainCircuit, label: "inspector.context" },
    { id: "settings", icon: Settings2, label: "inspector.settings" },
  ];

  return (
    <div className="agentPackBackdrop runtimeConfigBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
    <section className="inspector runtimeConfigBoard" role="dialog" aria-modal="true" aria-label={t("control.runtimeTitle")}>
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
            <div className="runtimeOverviewIntro">
              <div className="sectionHeader controlOverviewHeader">
                <div><h3>{t("control.overviewTitle")}</h3><span>{t("control.overviewDescription")}</span></div>
                <ShieldCheck size={17} />
              </div>

              <div className="contractAssurance">
                <span><Check size={16} /></span>
                <div><strong>{t("control.governedTitle")}</strong><p>{t("control.governedDescription")}</p></div>
              </div>
            </div>

            <div className="runtimeFocusSummary">
              <article>
                <GitPullRequest size={14} />
                <small>{t("control.changedFiles")}</small>
                <strong>{t("diff.files", { count: diff.files })}</strong>
              </article>
              <article>
                <FlaskConical size={14} />
                <small>{t("control.testStatus")}</small>
                <strong>{translateKnownText(locale, tests.status)}</strong>
              </article>
              <article>
                <ShieldCheck size={14} />
                <small>{t("control.evidenceReady")}</small>
                <strong>{evidence ? t("evidence.score", { ready: evidence.ready, total: evidence.items.length }) : t("evidence.pending")}</strong>
              </article>
              <article>
                <FileText size={14} />
                <small>{t("runtimeConfig.prompt")}</small>
                <strong>{t("runtimeConfig.promptValue", { count: promptLayerCount })}</strong>
              </article>
              <article>
                <GitBranch size={14} />
                <small>{t("runtimeConfig.agents")}</small>
                <strong>{t("runtimeConfig.agentValue", { count: roleChecks })}</strong>
              </article>
              <article>
                <Database size={14} />
                <small>{t("runtimeConfig.memory")}</small>
                <strong>{t("runtimeConfig.memoryValue", { count: memorySuggestions })}</strong>
              </article>
            </div>

            <div className="runtimeOverviewShowcase">
              <div className="runtimeOverviewMain">
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

                <div className="capabilityMenuEvidence">
                  <div className="modelGateHeading"><Layers3 size={15} /><strong>{t("control.capabilityMenuTitle")}</strong></div>
                  <div className="capabilityMenuSummary">
                    <span>{t(`control.capabilityPhase.${capabilityPhase}` as TranslationKey)}</span>
                    <strong>{t("control.disclosedToolCount", { count: disclosedTools.length })}</strong>
                  </div>
                  <div className="capabilityToolList capabilityToolCards">
                    {disclosedTools.map((tool) => {
                      const toolInfo = describeCapabilityTool(tool, t);
                      return (
                        <article className="capabilityToolCard" key={tool}>
                          <strong>{toolInfo.name}</strong>
                          <small>{toolInfo.description}</small>
                          <code>{tool}</code>
                        </article>
                      );
                    })}
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
              </div>

              <aside className="runtimeOverviewSide">
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

                <div className="runtimeContractPanel">
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

                  <details className="policyDisclosure" open>
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
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        {activeView === "program" ? <FormalProgramPanel program={formalProgram} /> : null}
        {activeView === "changes" ? (
          <section className="runtimeChangesBoard">
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
          </section>
        ) : null}

        {activeView === "context" ? <ContextPanel context={context} busy={contextBusy} onCompact={onCompactContext} /> : null}
        {activeView === "memory" ? <MemoryPanel memory={memory} busy={memoryBusy} onCreate={onCreateMemory} onUpdate={onUpdateMemory} onDelete={onDeleteMemory} /> : null}
        {activeView === "extensions" ? <ExtensionPanel extensions={extensions} busy={extensionsBusy} onSave={onSaveExtensions} onCreateSkill={onCreateSkill} onCreateMCPServer={onCreateMCPServer} onCreateHook={onCreateHook} /> : null}
        {activeView === "governance" ? <GovernancePanel governance={governance} busy={governanceBusy} onSave={onSaveGovernance} /> : null}
        {activeView === "trace" ? <TraceReplayPanel runId={runId} runStatus={runStatus} events={trace} /> : null}
      </div>
    </section>
    </div>
  );
}

function FormalProgramPanel({ program }: { program?: FormalAgentProgram }) {
  const { t } = usePreferences();
  const [copied, setCopied] = useState(false);
  const passed = program?.lints.filter((lint) => lint.status === "passed").length ?? 0;
  if (!program) {
    return (
      <section className="inspectorSection formalProgramPanel">
        <div className="agentPackLoading">{t("program.pending")}</div>
      </section>
    );
  }
  const semanticRules = program.semantic_trace_rules?.length
    ? program.semantic_trace_rules
    : program.trace_rules.map((rule) => ({ event: "", rule: rule.split(":")[0] ?? rule, label: rule, description: "" }));
  const boundary = program.capability_boundary ?? [];
  const hasExportableDsl = Boolean(program.dsl_text);

  async function copyDsl() {
    if (!program?.dsl_text) return;
    try {
      await navigator.clipboard.writeText(program.dsl_text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="inspectorSection formalProgramPanel">
      <div className="formalProgramHeader">
        <div>
          <span className="stageEyebrow">{program.calculus}</span>
          <h3>{t("program.title")}</h3>
          <p>{t("program.description")}</p>
        </div>
        <div className="formalProgramHeaderActions">
          <strong>{t("program.lintScore", { passed, total: program.lints.length })}</strong>
          <button type="button" onClick={() => void copyDsl()} disabled={!program.dsl_text}>
            <Copy size={14} />
            {copied ? t("program.copied") : t("program.copyDsl")}
          </button>
        </div>
      </div>

      <div className="formalProgramCanvas">
        <section className="programContractBlock">
          <div className="programTypeRow">
            <span><small>{t("program.input")}</small><strong>{program.input_type}</strong></span>
            <span><small>{t("program.output")}</small><strong>{program.output_type}</strong></span>
            <span><small>{t("program.effect")}</small><strong>{program.effect}</strong></span>
          </div>
          <article className="programGradeCard">
            <header><Gauge size={15} /><strong>{t("program.grade")}</strong></header>
            <p>{program.grade.expression}</p>
            <div>
              <code>steps &lt;= {program.grade.steps}</code>
              <code>tools &lt;= {program.grade.tool_calls}</code>
              <code>models &lt;= {program.grade.model_calls}</code>
              <code>wall &lt;= {Math.ceil(program.grade.wall_time_seconds / 60)}m</code>
            </div>
          </article>
        </section>

        <div className="programWorkbenchGrid">
          <details className="programDslBlock" open>
            <summary>
              <div><Braces size={15} /><strong>{hasExportableDsl ? t("program.dsl") : t("program.term")}</strong></div>
              <span>{hasExportableDsl ? t("program.dslBadge") : program.calculus}</span>
            </summary>
            <pre>{program.dsl_text || program.term}</pre>
          </details>

          <div className="programTree">
            <header><GitBranch size={15} /><strong>{t("program.structure")}</strong></header>
            <ol>
              {program.nodes.map((node) => <ProgramNodeItem node={node} key={node.id} />)}
            </ol>
          </div>
        </div>

        <div className="programEvidenceColumns">
          <section className="programBoundaryBlock">
            <header>
              <div><ShieldCheck size={15} /><strong>{t("program.boundary")}</strong></div>
              <span>{t("program.boundaryHint")}</span>
            </header>
            <div>
              {boundary.map((item) => (
                <article key={item.id}>
                  <strong>{item.title}</strong>
                  <code>{item.expression}</code>
                  <p>{item.description}</p>
                  <small>{item.evidence}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="programSemanticBlock">
            <header>
              <div><Activity size={15} /><strong>{t("program.traceRules")}</strong></div>
              <span>{t("program.traceHint")}</span>
            </header>
            <div>
              {semanticRules.map((rule) => (
                <article key={`${rule.rule}-${rule.event}`}>
                  <code>{rule.rule}</code>
                  <strong>{rule.event || rule.label}</strong>
                  <p>{rule.description || rule.label}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="programLintPanel">
            <div className="programLintHeader">
              <strong>{t("program.semanticLint")}</strong>
              <span>{t("program.lintScore", { passed, total: program.lints.length })}</span>
            </div>
            <div className="programLintGrid">
              {program.lints.map((lint) => (
                <article className={`state-${lint.status}`} key={lint.id}>
                  <span>{lint.status === "passed" ? <Check size={13} /> : <CircleAlert size={13} />}</span>
                  <div>
                    <strong>{lint.summary}</strong>
                    <small>{lint.evidence}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function ProgramNodeItem({ node }: { node: FormalProgramNode }) {
  return (
    <li>
      <div>
        <code>{node.op}</code>
        <strong>{node.label}</strong>
        {node.detail ? <small>{node.detail}</small> : null}
      </div>
      {node.children.length ? (
        <ol>
          {node.children.map((child) => <ProgramNodeItem node={child} key={child.id} />)}
        </ol>
      ) : null}
    </li>
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

function describeCapabilityTool(tool: string, t: (key: TranslationKey, values?: Record<string, string | number>) => string): { name: string; description: string } {
  const knownTools = new Set(["read_file", "search_code", "apply_patch", "run_test", "list_files", "run_lint", "git_status", "git_diff", "run_command"]);
  if (!knownTools.has(tool)) {
    return {
      name: tool.replace(/_/g, " "),
      description: t("control.tool.unknown.description"),
    };
  }
  return {
    name: t(`control.tool.${tool}.name` as TranslationKey),
    description: t(`control.tool.${tool}.description` as TranslationKey),
  };
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

function latestPromptLayerCount(trace: TraceEvent[]): number {
  for (const event of [...trace].reverse()) {
    if (event.event !== "model.requested") continue;
    const request = isRecord(event.payload.request) ? event.payload.request : undefined;
    const metadata = request && isRecord(request.metadata) ? request.metadata : undefined;
    const layers = metadata?.prompt_layers;
    if (Array.isArray(layers)) return layers.length;
  }
  return 0;
}

function latestMemorySuggestionCount(trace: TraceEvent[]): number {
  for (const event of [...trace].reverse()) {
    if (event.event !== "memory.written") continue;
    const recommendations = event.payload.recommendations;
    return Array.isArray(recommendations) ? recommendations.length : 0;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
