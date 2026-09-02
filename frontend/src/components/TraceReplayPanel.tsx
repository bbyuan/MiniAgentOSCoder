import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { daemonApi, type ReplayResponse, type TraceEvent } from "../api/client";
import { localizeErrorMessage, translateKnownText, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface TraceReplayPanelProps {
  runId?: string;
  runStatus: string;
  events: TraceEvent[];
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function TraceReplayPanel({ runId, runStatus, events }: TraceReplayPanelProps) {
  const { locale, t } = usePreferences();
  const [snapshot, setSnapshot] = useState<ReplayResponse>();
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const canReplay = Boolean(runId) && TERMINAL_STATUSES.has(runStatus);
  const replayEvents = snapshot?.events ?? [];
  const current = replayEvents[cursor];
  const currentRule = current ? semanticRuleForEvent(current.event) : undefined;
  const eventGroups = useMemo(() => [
    { label: "replay.group.prompt" as TranslationKey, count: events.filter((event) => event.event === "model.requested").length },
    { label: "replay.group.agents" as TranslationKey, count: events.filter((event) => event.event.startsWith("agent.")).length },
    { label: "replay.group.model" as TranslationKey, count: events.filter((event) => event.event.startsWith("model.")).length },
    { label: "replay.group.tools" as TranslationKey, count: events.filter((event) => event.event.startsWith("tool.") || event.event.startsWith("action.")).length },
    { label: "replay.group.governance" as TranslationKey, count: events.filter((event) => event.event.startsWith("policy.") || event.event.startsWith("approval.") || event.event.startsWith("sandbox.")).length },
    { label: "replay.group.extensions" as TranslationKey, count: events.filter((event) => event.event.startsWith("skill.") || event.event.startsWith("mcp.") || event.event.startsWith("hook.")).length },
    { label: "replay.group.memory" as TranslationKey, count: events.filter((event) => event.event.startsWith("memory.")).length },
  ], [events]);

  useEffect(() => {
    setSnapshot(undefined);
    setCursor(0);
    setPlaying(false);
    setError(undefined);
  }, [runId, events.length]);

  useEffect(() => {
    if (!playing || replayEvents.length === 0) return;
    const timer = window.setInterval(() => {
      setCursor((value) => {
        if (value >= replayEvents.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, Math.round(850 / speed));
    return () => window.clearInterval(timer);
  }, [playing, replayEvents.length, speed]);

  const visibleEvents = useMemo(
    () => replayEvents
      .slice(0, cursor + 1)
      .map((event, index) => ({ event, index }))
      .reverse(),
    [cursor, replayEvents],
  );

  async function loadReplay() {
    if (!runId || !canReplay) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await daemonApi.replayRun(runId);
      setSnapshot(response);
      setCursor(0);
      setPlaying(response.events.length > 1);
    } catch (caught) {
      setError(localizeErrorMessage(locale, caught, t("replay.loadFailed")));
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setCursor(0);
    setPlaying(false);
  }

  return (
    <section className="inspectorSection traceSection">
      <div className="sectionHeader">
        <div>
          <h3>{t("trace.title")}</h3>
          <span>{t("trace.events", { count: events.length })}</span>
        </div>
        <Terminal size={15} />
      </div>

      <div className="traceOverviewGrid">
        {eventGroups.map((group) => (
          <div key={group.label}>
            <span>{t(group.label)}</span>
            <strong>{group.count}</strong>
          </div>
        ))}
      </div>

      {!snapshot ? (
        <div className="traceReplayShell traceReplayShell-idle">
          <div className="replayLaunch">
            <ShieldCheck size={18} />
            <strong>{t("replay.title")}</strong>
            <span>{canReplay ? t("replay.description") : t("replay.terminalOnly")}</span>
            <button type="button" disabled={!canReplay || loading} onClick={loadReplay}>
              <Play size={14} />
              {loading ? t("replay.loading") : t("replay.load")}
            </button>
            {error ? <small role="alert">{error}</small> : null}
          </div>
          {events.length > 0 ? (
            <div className="traceList liveTraceList">
              {events.map((event, index) => (
                <div key={`${event.time}-${event.event}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code>{translateKnownText(locale, event.event)}</code>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="replayControlDeck">
            <div className="replayStatus">
              <ShieldCheck size={13} />
              <span>{t("replay.readOnly")}</span>
              <strong>{t("replay.position", { current: replayEvents.length ? cursor + 1 : 0, count: snapshot.event_count })}</strong>
            </div>
            <div className="replayControls" aria-label={t("replay.controls")}>
              <button type="button" title={t("replay.restart")} aria-label={t("replay.restart")} onClick={restart}>
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                title={t("replay.previous")}
                aria-label={t("replay.previous")}
                disabled={cursor <= 0}
                onClick={() => { setPlaying(false); setCursor((value) => Math.max(0, value - 1)); }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="replayPrimary"
                title={playing ? t("replay.pause") : t("replay.play")}
                aria-label={playing ? t("replay.pause") : t("replay.play")}
                disabled={replayEvents.length < 2}
                onClick={() => {
                  if (!playing && cursor >= replayEvents.length - 1) setCursor(0);
                  setPlaying((value) => !value);
                }}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                type="button"
                title={t("replay.next")}
                aria-label={t("replay.next")}
                disabled={cursor >= replayEvents.length - 1}
                onClick={() => { setPlaying(false); setCursor((value) => Math.min(replayEvents.length - 1, value + 1)); }}
              >
                <ChevronRight size={15} />
              </button>
              <label>
                <span className="srOnly">{t("replay.speed")}</span>
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </label>
            </div>
            <input
              className="replaySlider"
              type="range"
              min={0}
              max={Math.max(0, replayEvents.length - 1)}
              value={cursor}
              disabled={replayEvents.length < 2}
              aria-label={t("replay.progress")}
              onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }}
            />
          </div>

          <div className="traceReplayShell">
            {current ? (
              <article className="replayCurrent">
                <div className="replayCurrentHeader">
                  <span>{String(cursor + 1).padStart(2, "0")}</span>
                  <strong>{translateKnownText(locale, current.event)}</strong>
                  <time dateTime={current.time}>{formatEventTime(current.time)}</time>
                </div>
                <div className="replaySemanticRule">
                  <code>{currentRule?.rule ?? "C-Step"}</code>
                  <span>{currentRule?.description ?? t("replay.semanticGeneric")}</span>
                </div>
                <small>{current.role}</small>
                <pre>{JSON.stringify(current.payload, null, 2)}</pre>
              </article>
            ) : <p className="emptyText">{t("replay.empty")}</p>}

            <div className="replayTimeline" aria-live="polite">
              {visibleEvents.map(({ event, index }) => (
                <div className={index === cursor ? "active" : ""} key={`${event.time}-${event.event}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code>{translateKnownText(locale, event.event)}</code>
                  <em>{semanticRuleForEvent(event.event)?.rule ?? "C-Step"}</em>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function semanticRuleForEvent(event: string): { rule: string; description: string } | undefined {
  if (event === "model.requested") return { rule: "C-LLM", description: "Planner yields to the model oracle." };
  if (event === "model.responded") return { rule: "C-LLMRet", description: "The model response resumes ActionIR reduction." };
  if (event === "action.parsed") return { rule: "C-Route", description: "ActionIR selects one route branch." };
  if (event === "policy.evaluated" || event === "action.rejected") return { rule: "C-Guard", description: "Policy and sandbox predicates guard the effect." };
  if (event === "tool.executed") return { rule: "C-Tool", description: "A registered external tool is invoked." };
  if (event === "tool.failed") return { rule: "C-ToolFail", description: "The failed tool returns a bounded observation." };
  if (event.startsWith("memory.")) return { rule: "C-Mem", description: "Runtime store is read or extended." };
  if (event === "completion.assessed") return { rule: "C-GuardOK", description: "Completion evidence satisfies the finish predicate." };
  if (event === "run.completed") return { rule: "C-Halt", description: "The bounded agent program terminates." };
  if (event.startsWith("skill.")) return { rule: "C-Skill", description: "A project skill transforms the base agent term." };
  if (event.startsWith("mcp.") || event.startsWith("hook.")) return { rule: "C-Handler", description: "An extension handler observes or handles an effect." };
  return undefined;
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}
