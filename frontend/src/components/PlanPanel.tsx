import { Check, Circle, LoaderCircle } from "lucide-react";

interface PlanItem {
  id?: string;
  title: string;
  state: string;
  detail?: string;
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
            <span>
              {item.title}
              {item.detail ? <small>{item.detail}</small> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
