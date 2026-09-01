import {
  Activity,
  Ban,
  Box,
  BrainCircuit,
  CheckCircle2,
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
import type { TraceEvent } from "../api/client";
import {
  activityState,
  buildWorkItems,
  eventTime,
  type WorkItem,
  type WorkItemCategory,
  type WorkItemChangeSet,
  type WorkItemKind,
} from "../activity/workItems";
import { buildPhaseGroups } from "../activity/phases";
import type { TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface ActivityFeedProps {
  events: TraceEvent[];
  status: string;
  embedded?: boolean;
  onInspectChangeSet?: (changeSet: WorkItemChangeSet) => void;
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

function ActivityItem({ item, onInspectChangeSet }: { item: WorkItem; onInspectChangeSet?: (changeSet: WorkItemChangeSet) => void }) {
  const { t } = usePreferences();
  const Icon = ITEM_ICONS[item.kind] ?? Activity;

  return (
    <li className={`agentProcessItem category-${item.category}`}>
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
            {item.chips.slice(0, 3).map((chip) => <MetadataChip chip={chip} key={chip} />)}
          </div>
        ) : null}
        {item.changeSet && onInspectChangeSet ? (
          <button type="button" className="agentProcessLink" onClick={() => onInspectChangeSet(item.changeSet!)}>
            <FileDiff size={14} />
            {t("activity.inspectChanges")}
          </button>
        ) : null}
        {item.output ? (
          <div className="activityOutput">
            <strong>{item.outputLabel ?? t("activity.outputSummary")}</strong>
            <pre>{item.output}</pre>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function MetadataChip({ chip }: { chip: string }) {
  const match = chip.match(/^([^:：]+[:：])\s*(.+)$/);
  if (!match) return <em>{chip}</em>;

  return (
    <em>
      <span>{match[1]}</span>
      <code>{match[2]}</code>
    </em>
  );
}

export function ActivityFeed({ events, status, embedded = false, onInspectChangeSet }: ActivityFeedProps) {
  const { locale, t } = usePreferences();
  const workItems = buildWorkItems(events, locale, t);
  const state = activityState(status);
  const duration = workDuration(workItems, t);
  const summary = workBreakdown(workItems, t);
  const phaseGroups = buildPhaseGroups(workItems);
  const latestItem = workItems[workItems.length - 1];
  const recentItems = workItems.slice(-4);

  if (embedded && workItems.length === 0) return null;

  return (
    <section className={`agentProcess${embedded ? " agentProcessInline agentProcessCompact" : ""}`} aria-live="polite">
      <div className="agentProcessHeader">
        <div className="agentProcessTitle">
          <span>
            <strong>{embedded ? t("activity.workLogTitle") : t("activity.title")}</strong>
            <small>{duration ? t("activity.workLogBreakdownTimed", { duration, summary }) : summary}</small>
          </span>
        </div>
        {!embedded ? (
          <div className={`liveIndicator ${state.tone}`}>
            <span aria-hidden="true" />
            {t(state.key)}
          </div>
        ) : null}
      </div>

      {workItems.length === 0 ? (
        <div className="activityEmpty">
          <div className="emptyGlyph"><Activity size={20} /></div>
          <strong>{t("activity.emptyTitle")}</strong>
          <span>{t("activity.emptyDescription")}</span>
        </div>
      ) : embedded ? (
        <div className="agentLiveSnapshot">
          {latestItem ? <CurrentActivity item={latestItem} onInspectChangeSet={onInspectChangeSet} /> : null}
          <div className="agentLiveDigest">
            <ol className="agentStageRail" aria-label={t("activity.stageSummary")}>
              {phaseGroups.map((group) => {
                const item = group.items[group.items.length - 1];
                const Icon = item ? ITEM_ICONS[item.kind] ?? Activity : Activity;
                return (
                  <li className={`phase-${group.phase}`} key={group.key}>
                    <span><Icon size={13} aria-hidden="true" /></span>
                    <div>
                      <strong>{t(`activity.phase.${group.phase}` as TranslationKey)}</strong>
                      <small>{t("activity.phaseCount", { count: group.items.length })}</small>
                    </div>
                    {item ? <time dateTime={item.time}>{eventTime(item.time)}</time> : null}
                  </li>
                );
              })}
            </ol>
            <div className="agentRecentActions">
              <div className="agentRecentActionsHeader">
                <strong>{t("activity.recentTitle")}</strong>
                <small>{summary}</small>
              </div>
              <ol>
                {recentItems.map((item, index) => (
                  <CompactActivityRow item={item} onInspectChangeSet={onInspectChangeSet} key={`${item.time}-${item.title}-${index}`} />
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="agentPhaseList">
          {phaseGroups.map((group) => (
            <section className={`agentPhaseGroup phase-${group.phase}`} key={group.key}>
              <header className="agentPhaseHeader">
                <span>{t(`activity.phase.${group.phase}` as TranslationKey)}</span>
                <small>{t("activity.phaseCount", { count: group.items.length })} · {phaseTimeRange(group.items)}</small>
              </header>
              <ol className="agentProcessList">
                {group.items.map((item, index) => (
                  <ActivityItem item={item} onInspectChangeSet={onInspectChangeSet} key={`${item.time}-${item.title}-${index}`} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function CurrentActivity({ item, onInspectChangeSet }: { item: WorkItem; onInspectChangeSet?: (changeSet: WorkItemChangeSet) => void }) {
  const { t } = usePreferences();
  const Icon = ITEM_ICONS[item.kind] ?? Activity;

  return (
    <article className={`agentLiveNow category-${item.category}`}>
      <div className={`eventIcon tone-${item.tone}`}>
        <Icon size={16} aria-hidden="true" />
      </div>
      <div>
        <div className="agentLiveNowMeta">
          <small>{t("activity.currentAction")}</small>
          <time dateTime={item.time}>{eventTime(item.time)}</time>
        </div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
        {item.chips.length ? (
          <div className="activityChips">
            {item.chips.slice(0, 2).map((chip) => <MetadataChip chip={chip} key={chip} />)}
          </div>
        ) : null}
        {item.changeSet && onInspectChangeSet ? (
          <button type="button" className="agentProcessLink" onClick={() => onInspectChangeSet(item.changeSet!)}>
            <FileDiff size={14} />
            {t("activity.inspectChanges")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CompactActivityRow({ item, onInspectChangeSet }: { item: WorkItem; onInspectChangeSet?: (changeSet: WorkItemChangeSet) => void }) {
  const { t } = usePreferences();
  const Icon = ITEM_ICONS[item.kind] ?? Activity;

  return (
    <li className={`agentCompactAction category-${item.category}`}>
      <span className={`eventIcon tone-${item.tone}`}><Icon size={13} aria-hidden="true" /></span>
      <div>
        <strong>{item.title}</strong>
        <small>{item.detail}</small>
      </div>
      {item.changeSet && onInspectChangeSet ? (
        <button type="button" onClick={() => onInspectChangeSet(item.changeSet!)}>{t("activity.inspectChanges")}</button>
      ) : null}
      <time dateTime={item.time}>{eventTime(item.time)}</time>
    </li>
  );
}

function phaseTimeRange(items: WorkItem[]): string {
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return "";
  const start = eventTime(first.time);
  const end = eventTime(last.time);
  return start === end ? start : `${start} - ${end}`;
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

function workBreakdown(
  items: WorkItem[],
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
): string {
  if (!items.length) return t("activity.workLogDescription", { count: 0 });
  const priority: WorkItemCategory[] = ["thinking", "file", "command", "change", "approval", "result", "guidance", "system"];
  const counts = new Map<WorkItemCategory, number>();
  items.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
  const parts = priority
    .filter((category) => counts.has(category))
    .slice(0, 3)
    .map((category) => t("activity.categoryCount", {
      label: t(`activity.category.${category}` as TranslationKey),
      count: counts.get(category) ?? 0,
    }));
  return parts.join(" · ");
}
