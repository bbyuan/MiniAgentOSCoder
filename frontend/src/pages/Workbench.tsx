import { MetricStrip } from "../components/MetricStrip";
import { PlanPanel } from "../components/PlanPanel";
import { RuntimePanels } from "../components/RuntimePanels";
import { TaskComposer } from "../components/TaskComposer";
import { TopBar } from "../components/TopBar";
import { mockRun } from "../stores/mockRun";

export function Workbench() {
  return (
    <main className="appShell">
      <TopBar project={mockRun.project} mode={mockRun.mode} status={mockRun.status} />
      <div className="workspace">
        <section className="leftRail">
          <button className="railItem active">Chat</button>
          <button className="railItem">Plan</button>
          <button className="railItem">Diff</button>
          <button className="railItem">Tests</button>
          <button className="railItem">Trace</button>
        </section>

        <section className="mainColumn">
          <MetricStrip budget={mockRun.budget} />
          <section className="conversation">
            <div className="emptyState">
              <span className="eyebrow">Contract-first runtime</span>
              <h1>Start a managed coding-agent run.</h1>
              <p>
                The runtime will compile a contract, build context, request approval for patches,
                run tests, and preserve trace.
              </p>
            </div>
            <TaskComposer />
          </section>
        </section>

        <section className="sideColumn">
          <PlanPanel items={mockRun.plan} />
          <RuntimePanels
            contract={mockRun.contract}
            context={mockRun.context}
            diff={mockRun.diff}
            tests={mockRun.tests}
            trace={mockRun.trace}
          />
        </section>
      </div>
    </main>
  );
}
