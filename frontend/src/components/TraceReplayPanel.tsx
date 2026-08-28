import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { daemonApi, type ReplayResponse, type TraceEvent } from "../api/client";
import { translateKnownText } from "../i18n";
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

  const visibleEvents = useMemo(() => replayEvents.slice(0, cursor + 1), [cursor, replayEvents]);

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
      setError(caught instanceof Error ? caught.message : t("replay.loadFailed"));
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

      {!snapshot ? (
        <>
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
        </>
      ) : (
        <>
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

          {current ? (
            <article className="replayCurrent">
              <div>
                <span>{String(cursor + 1).padStart(2, "0")}</span>
                <strong>{translateKnownText(locale, current.event)}</strong>
                <time dateTime={current.time}>{formatEventTime(current.time)}</time>
              </div>
              <small>{current.role}</small>
              <pre>{JSON.stringify(current.payload, null, 2)}</pre>
            </article>
          ) : <p className="emptyText">{t("replay.empty")}</p>}

          <div className="replayTimeline" aria-live="polite">
            {visibleEvents.map((event, index) => (
              <div className={index === cursor ? "active" : ""} key={`${event.time}-${event.event}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <code>{translateKnownText(locale, event.event)}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}
