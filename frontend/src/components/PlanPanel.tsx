import { Check, Circle, LoaderCircle } from "lucide-react";

interface PlanItem {
  title: string;
  state: string;
}

const icons = {
  done: <Check size={15} />,
  active: <LoaderCircle size={15} />,
  waiting: <Circle size={15} />,
};

export function PlanPanel({ items }: { items: PlanItem[] }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Plan</h2>
        <span>{items.length} steps</span>
      </div>
      <div className="planList">
        {items.map((item) => (
          <div className={`planItem ${item.state}`} key={item.title}>
            <div className="planIcon">{icons[item.state as keyof typeof icons]}</div>
            <span>{item.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

