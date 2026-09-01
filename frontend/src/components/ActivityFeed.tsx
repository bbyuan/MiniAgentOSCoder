import {
  Activity,
  Ban,
  Box,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CornerDownRight,
  FileDiff,
  FilePenLine,
  FileText,
  FolderTree,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { TraceEvent } from "../api/client";
import {
  activityState,
  buildWorkItems,
  eventTime,
  type WorkItem,
  type WorkItemKind,
} from "../activity/workItems";
import { usePreferences } from "../preferences";

interface ActivityFeedProps {
  events: TraceEvent[];
  status: string;
  embedded?: boolean;
}

const ITEM_ICONS: Record<WorkItemKind, LucideIcon> = {
  action: CornerDownRight,
  approval: ShieldAlert,
  cancelled: Ban,
  context: BrainCircuit,
  danger: CircleAlert,
  fileDiff: FileDiff,
  fileEdit: FilePenLine,
  fileRead: FileText,
  fileSearch: Search,
  fileTree: FolderTree,
  memory: BrainCircuit,
  model: Sparkles,
  runtime: Activity,
  sandbox: Box,
  success: CheckCircle2,
  terminal: Terminal,
  user: UserRound,
};

function ActivityItem({ item }: { item: WorkItem }) {
  const { t } = usePreferences();
  const Icon = ITEM_ICONS[item.kind] ?? Activity;

  return (
    <li className="agentProcessItem">
      <div className={`eventIcon tone-${item.tone}`}>
        <Icon size={15} aria-hidden="true" />
      </div>
      <div className="agentProcessBody">
        <div className="agentProcessLead">
          <strong>{item.title}</strong>
          <time dateTime={item.time}>{eventTime(item.time)}</time>
        </div>
        <p>{item.detail}</p>
        {item.chips.length ? (
          <div className="activityChips">
            {item.chips.slice(0, 3).map((chip) => <em key={chip}>{chip}</em>)}
          </div>
        ) : null}
        {item.output ? (
          <details className="activityOutput">
            <summary>{item.outputLabel ?? t("activity.outputSummary")}</summary>
            <pre>{item.output}</pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityFeed({ events, status, embedded = false }: ActivityFeedProps) {
  const { locale, t } = usePreferences();
  const [expanded, setExpanded] = useState(true);
  const workItems = buildWorkItems(events, locale, t);
  const visibleItems = expanded ? workItems : workItems.slice(-3);
  const state = activityState(status);
  const latestItem = workItems[workItems.length - 1];
  const LatestIcon = latestItem ? ITEM_ICONS[latestItem.kind] ?? Activity : Activity;
  const duration = workDuration(workItems, t);

  if (embedded && workItems.length === 0) return null;

  return (
    <section className={`agentProcess${embedded ? " agentProcessInline" : ""}`} aria-live="polite">
      <div className="agentProcessHeader">
        <button type="button" className="agentProcessToggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronDown className={expanded ? "expanded" : ""} size={15} />
          <span>
            <strong>{embedded ? t("activity.workLogTitle") : t("activity.title")}</strong>
            <small>{duration ? t("activity.workLogDescriptionTimed", { duration, count: workItems.length }) : t("activity.workLogDescription", { count: workItems.length })}</small>
          </span>
        </button>
        {!embedded ? (
          <div className={`liveIndicator ${state.tone}`}>
            <span aria-hidden="true" />
            {t(state.key)}
          </div>
        ) : null}
      </div>

      {!expanded && latestItem ? (
        <div className="agentProcessPreview">
          <div className={`eventIcon tone-${latestItem.tone}`}><LatestIcon size={15} /></div>
          <div><strong>{latestItem.title}</strong><span>{latestItem.detail}</span></div>
          <time dateTime={latestItem.time}>{eventTime(latestItem.time)}</time>
        </div>
      ) : null}

      {expanded && visibleItems.length === 0 ? (
        <div className="activityEmpty">
          <div className="emptyGlyph"><Activity size={20} /></div>
          <strong>{t("activity.emptyTitle")}</strong>
          <span>{t("activity.emptyDescription")}</span>
        </div>
      ) : expanded ? (
        <ol className="agentProcessList">
          {visibleItems.map((item, index) => (
            <ActivityItem item={item} key={`${item.time}-${item.title}-${index}`} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function workDuration(
  items: WorkItem[],
  t: (key: "activity.durationSeconds" | "activity.durationMinutes", variables?: Record<string, string | number>) => string,
): string {
  if (items.length < 2) return "";
  const start = new Date(items[0].time).getTime();
  const end = new Date(items[items.length - 1].time).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0) return t("activity.durationMinutes", { minutes, seconds: rest });
  return t("activity.durationSeconds", { seconds });
}
