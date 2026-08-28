interface MetricStripProps {
  budget: {
    modelCalls: number;
    toolCalls: number;
    tokens: string;
  };
}

export function MetricStrip({ budget }: MetricStripProps) {
  return (
    <section className="metricStrip">
      <div>
        <span>Model Calls</span>
        <strong>{budget.modelCalls}</strong>
      </div>
      <div>
        <span>Tool Calls</span>
        <strong>{budget.toolCalls}</strong>
      </div>
      <div>
        <span>Context</span>
        <strong>{budget.tokens}</strong>
      </div>
    </section>
  );
}

