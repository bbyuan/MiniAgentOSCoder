import { daemonApi, type ContextPack, type ConversationResponse, type ExtensionResponse, type FormalAgentProgram, type GovernanceResponse, type MemoryResponse, type RecoveryResponse, type RunArtifacts, type RunEvidenceLedger, type RunReportResponse, type TraceResponse } from "../api/client";

export interface RunResources {
  context: ContextPack;
  trace: TraceResponse;
  artifacts: RunArtifacts;
  recovery: RecoveryResponse;
  report: RunReportResponse;
  evidence: RunEvidenceLedger;
  memory: MemoryResponse;
  governance: GovernanceResponse;
  extensions: ExtensionResponse;
  formalProgram: FormalAgentProgram;
  conversation: ConversationResponse;
}

export async function loadRunResources(runId: string): Promise<RunResources> {
  const [
    context,
    trace,
    artifacts,
    recovery,
    report,
    evidence,
    memory,
    governance,
    extensions,
    formalProgram,
    conversation,
  ] = await Promise.all([
    daemonApi.getContext(runId),
    daemonApi.getTrace(runId),
    daemonApi.getArtifacts(runId),
    daemonApi.getCheckpoints(runId),
    daemonApi.getReport(runId),
    daemonApi.getEvidence(runId),
    daemonApi.getMemory(runId),
    daemonApi.getGovernance(runId),
    daemonApi.getExtensions(runId),
    daemonApi.getFormalProgram(runId),
    daemonApi.getConversation(runId),
  ]);

  return {
    context,
    trace,
    artifacts,
    recovery,
    report,
    evidence,
    memory,
    governance,
    extensions,
    formalProgram,
    conversation,
  };
}
