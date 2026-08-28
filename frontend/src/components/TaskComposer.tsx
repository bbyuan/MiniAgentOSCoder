import { ArrowUp, SlidersHorizontal } from "lucide-react";

export function TaskComposer() {
  return (
    <section className="composer">
      <textarea
        aria-label="Task"
        placeholder="Ask the agent to fix a bug, implement a spec, or review a change..."
        rows={4}
      />
      <div className="composerFooter">
        <button className="softButton">
          <SlidersHorizontal size={16} />
          <span>Bugfix</span>
        </button>
        <button className="sendButton" aria-label="Start run">
          <ArrowUp size={18} />
        </button>
      </div>
    </section>
  );
}

