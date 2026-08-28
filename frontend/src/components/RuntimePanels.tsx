import { FileCode, FlaskConical, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";

interface RuntimePanelsProps {
  contract: {
    effects: string[];
    policies: string[];
  };
  context: Array<{ path: string; reason: string; tokens: number }>;
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
  trace: string[];
  runId?: string;
}

export function RuntimePanels({ contract, context, diff, tests, trace, runId }: RuntimePanelsProps) {
  return (
    <aside className="runtimePanels">
      <section className="panel">
        <div className="panelHeader">
          <h2>Contract</h2>
          <ShieldCheck size={16} />
        </div>
        {runId ? <p className="mutedLine">{runId}</p> : null}
        <div className="tagGrid">
          {contract.effects.map((effect) => (
            <span key={effect}>{effect}</span>
          ))}
        </div>
        <div className="policyList">
          {contract.policies.map((policy) => (
            <p key={policy}>{policy}</p>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Context</h2>
          <FileCode size={16} />
        </div>
        <div className="contextList">
          {context.map((item) => (
            <div key={item.path}>
              <strong>{item.path}</strong>
              <span>{item.reason} · {item.tokens} tokens</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel splitPanel">
        <div>
          <div className="panelHeader compact">
            <h2>Diff</h2>
            <GitPullRequest size={16} />
          </div>
          <strong>{diff.status}</strong>
          <span>{diff.files} files · +{diff.insertions} / -{diff.deletions}</span>
        </div>
        <div>
          <div className="panelHeader compact">
            <h2>Tests</h2>
            <FlaskConical size={16} />
          </div>
          <strong>{tests.status}</strong>
          <span>{tests.command} · {tests.passed} passed · {tests.failed} failed</span>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Trace</h2>
          <Terminal size={16} />
        </div>
        <div className="traceList">
          {trace.map((event) => (
            <code key={event}>{event}</code>
          ))}
        </div>
      </section>

      <section className="panel approvalPanel">
        <div className="panelHeader">
          <h2>Approval</h2>
          <ShieldCheck size={16} />
        </div>
        <p>No pending approval.</p>
      </section>
    </aside>
  );
}
