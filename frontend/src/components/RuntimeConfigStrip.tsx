import { BrainCircuit, Braces, ChevronRight, Database, FileText, Gauge, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import type {
  AgentContract,
  ContextPack,
  ExtensionResponse,
  FormalAgentProgram,
  GovernanceResponse,
  MemoryResponse,
  ModelProviderStatus,
  RunEvidenceLedger,
  TraceEvent,
} from "../api/client";
import type { TranslationKey } from "../i18n";
import { translateStatus } from "../i18n";
import { usePreferences } from "../preferences";
import type { ControlPlaneTarget } from "./AgentOSControlPlane";

interface RuntimeConfigStripProps {
  contract?: AgentContract;
  context?: ContextPack;
  evidence?: RunEvidenceLedger;
  extensions?: ExtensionResponse;
  formalProgram?: FormalAgentProgram;
  governance?: GovernanceResponse;
  memory?: MemoryResponse;
  model?: ModelProviderStatus;
  status: string;
  trace: TraceEvent[];
  onOpen: (target: ControlPlaneTarget) => void;
}

interface ConfigSignal {
  id: string;
  label: TranslationKey;
  value: string;
  icon: typeof ShieldCheck;
  target: ControlPlaneTarget;
}

export function RuntimeConfigStrip({
  contract,
  context,
  evidence,
  formalProgram,
  governance,
  memory,
  model,
  status,
  trace,
  onOpen,
}: RuntimeConfigStripProps) {
  const { locale, t } = usePreferences();
  const contextBudget = context?.budget_report;
  const contextPercent = contextBudget?.max_tokens
    ? Math.min(100, Math.round((contextBudget.used_tokens / contextBudget.max_tokens) * 100))
    : 0;
  const selectedContext = context?.selected_items.length ?? 0;
  const totalContext = context
    ? context.selected_items.length + context.compressed_items.length + context.omitted_items.length
    : selectedContext;
  const sandbox = governance?.settings.sandbox_profile ?? "standard";
  const policyCount = Object.keys(governance?.contract.policies ?? contract?.policies ?? {}).length;
  const providerRequests = trace.filter((event) => event.event === "model.requested").length;
  const cacheHits = trace.filter((event) => event.event === "model.cache.hit").length;
  const promptLayerCount = latestPromptLayerCount(trace);
  const roleChecks = trace.filter((event) => event.event === "agent.review.completed" || event.event === "agent.verification.completed").length;
  const memorySuggestions = memory?.recommendations?.length ?? latestMemorySuggestionCount(trace);
  const modelValue = model?.routing_enabled
    ? t("runtimeConfig.modelRouting", {
        configured: model.configured_profiles ?? 0,
        total: model.total_profiles ?? 0,
      })
    : t("runtimeConfig.modelSingle", { model: model?.model || "-" });
  const evidenceValue = evidence
    ? t("runtimeConfig.evidenceValue", { ready: evidence.ready, total: evidence.items.length })
    : t("runtimeConfig.evidencePending");
  const signals: ConfigSignal[] = [
    {
      id: "model",
      label: "runtimeConfig.model",
      value: providerRequests || cacheHits
        ? `${modelValue} · ${t("control.modelGateValue", { requests: providerRequests, hits: cacheHits })}`
        : modelValue,
      icon: Sparkles,
      target: "overview",
    },
    {
      id: "program",
      label: "runtimeConfig.program",
      value: formalProgram
        ? t("runtimeConfig.programValue", {
            nodes: countProgramNodes(formalProgram.nodes),
            checks: formalProgram.lints.filter((lint) => lint.status === "passed").length,
          })
        : t("runtimeConfig.programPending"),
      icon: Braces,
      target: "program",
    },
    {
      id: "prompt",
      label: "runtimeConfig.prompt",
      value: t("runtimeConfig.promptValue", { count: promptLayerCount }),
      icon: FileText,
      target: "overview",
    },
    {
      id: "agents",
      label: "runtimeConfig.agents",
      value: t("runtimeConfig.agentValue", { count: roleChecks }),
      icon: GitBranch,
      target: "overview",
    },
    {
      id: "safety",
      label: "runtimeConfig.safety",
      value: t("runtimeConfig.safetyValue", {
        sandbox: t(`control.sandbox.${sandbox}` as TranslationKey),
        count: policyCount,
      }),
      icon: ShieldCheck,
      target: "governance",
    },
    {
      id: "context",
      label: "runtimeConfig.context",
      value: t("runtimeConfig.contextValue", {
        selected: selectedContext,
        total: totalContext,
        percent: contextPercent,
      }),
      icon: BrainCircuit,
      target: "context",
    },
    {
      id: "memory",
      label: "runtimeConfig.memory",
      value: t("runtimeConfig.memoryValue", { count: memorySuggestions }),
      icon: Database,
      target: "memory",
    },
    {
      id: "evidence",
      label: "runtimeConfig.evidence",
      value: evidenceValue,
      icon: Gauge,
      target: "overview",
    },
  ];

  return (
    <section className="runtimeConfigStrip runtimeConfigStripReadable" aria-label={t("runtimeConfig.title")}>
      <header>
        <div>
          <span>{t("runtimeConfig.eyebrow")}</span>
          <strong>{t("runtimeConfig.title")}</strong>
          <small>{t("runtimeConfig.subtitle", { status: translateStatus(locale, status) })}</small>
        </div>
        <button type="button" onClick={() => onOpen("overview")}>
          {t("runtimeConfig.openDetails")}
          <ChevronRight size={15} />
        </button>
      </header>
      <div className="runtimeConfigSignals runtimeConfigSignalList">
        {signals.map(({ id, label, value, icon: Icon, target }) => (
          <button type="button" className={`runtimeConfigSignal signal-${id}`} onClick={() => onOpen(target)} key={id}>
            <Icon size={15} />
            <span>
              <small>{t(label)}</small>
              <strong className="runtimeConfigValue" title={value}>
                {value.split(" · ").map((part, index) => (
                  <span key={`${id}-${index}-${part}`}>
                    {index > 0 ? <em aria-hidden="true">·</em> : null}
                    {part}
                  </span>
                ))}
              </strong>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
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

function countProgramNodes(nodes: Array<{ children?: unknown[] }>): number {
  return nodes.reduce((total, node) => {
    const children = Array.isArray(node.children) ? node.children as Array<{ children?: unknown[] }> : [];
    return total + 1 + countProgramNodes(children);
  }, 0);
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
