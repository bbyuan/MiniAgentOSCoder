import { useEffect, useState } from "react";
import { BrainCircuit, Check, Clock3, Database, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { MemoryEntry, MemoryInput, MemoryResponse, MemoryScope } from "../api/client";
import { translateKnownText, type TranslationKey } from "../i18n";
import { usePreferences } from "../preferences";

interface MemoryPanelProps {
  memory?: MemoryResponse;
  busy: boolean;
  onCreate: (input: MemoryInput) => Promise<void>;
  onUpdate: (memoryId: string, input: Omit<MemoryInput, "scope">) => Promise<void>;
  onDelete: (memoryId: string) => Promise<void>;
}

const scopes: MemoryScope[] = ["short_term", "project", "long_term"];

export function MemoryPanel({ memory, busy, onCreate, onUpdate, onDelete }: MemoryPanelProps) {
  const { locale, t } = usePreferences();
  const [scope, setScope] = useState<MemoryScope>("short_term");
  const [kind, setKind] = useState("note");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const entries = memory?.entries[scope] ?? [];
  const totalEntries = memory ? Object.values(memory.counts).reduce((sum, value) => sum + value, 0) : 0;
  const durableEntries = (memory?.counts.project ?? 0) + (memory?.counts.long_term ?? 0);
  const latestEntry = Object.values(memory?.entries ?? {})
    .flat()
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

  useEffect(() => {
    setEditingId(undefined);
    setKind("note");
    setContent("");
    setTags("");
    setConfirmed(false);
  }, [scope]);

  function edit(entry: MemoryEntry) {
    setEditingId(entry.memory_id);
    setKind(entry.kind);
    setContent(entry.content);
    setTags(entry.tags.join(", "));
    setConfirmed(false);
  }

  function resetForm() {
    setEditingId(undefined);
    setKind("note");
    setContent("");
    setTags("");
    setConfirmed(false);
  }

  async function save() {
    if (scope === "short_term" || !content.trim()) return;
    const input = {
      kind,
      content: content.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      confirmed: scope === "long_term" ? confirmed : false,
    };
    try {
      if (editingId) {
        await onUpdate(editingId, input);
      } else {
        await onCreate({ ...input, scope });
      }
      resetForm();
    } catch {
      // The workbench error banner owns request failure feedback.
    }
  }

  function remove(memoryId: string) {
    if (window.confirm(t("memory.deleteConfirm"))) {
      void onDelete(memoryId).catch(() => undefined);
    }
  }

  return (
    <section className="inspectorSection memorySection">
      <div className="sectionHeader memoryHeading">
        <div>
          <h3>{t("memory.title")}</h3>
          <span>{t("memory.total", { count: totalEntries })}</span>
        </div>
        <BrainCircuit size={15} />
      </div>

      <div className="memoryInsightGrid">
        <div className="memoryInsight">
          <span><Clock3 size={15} /></span>
          <small>{t("memory.insight.short")}</small>
          <strong>{memory?.counts.short_term ?? 0}</strong>
          <em>{t("memory.insight.shortHint")}</em>
        </div>
        <div className="memoryInsight">
          <span><Database size={15} /></span>
          <small>{t("memory.insight.durable")}</small>
          <strong>{durableEntries}</strong>
          <em>{t("memory.insight.durableHint")}</em>
        </div>
        <div className="memoryInsight">
          <span><BrainCircuit size={15} /></span>
          <small>{t("memory.insight.latest")}</small>
          <strong title={latestEntry?.kind}>{latestEntry ? translateKnownText(locale, latestEntry.kind) : t("memory.insight.none")}</strong>
          <em title={latestEntry?.source}>{latestEntry?.source ?? t("memory.insight.noneHint")}</em>
        </div>
      </div>

      <div className="memoryScopes" role="tablist" aria-label={t("memory.title")}>
        {scopes.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={scope === item}
            className={scope === item ? "active" : ""}
            onClick={() => setScope(item)}
            key={item}
          >
            <span>{t(`memory.scope.${item}` as TranslationKey)}</span>
            <strong>{memory?.counts[item] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="memoryList">
        {entries.length === 0 ? <p className="emptyText">{t("memory.empty")}</p> : entries.map((entry) => (
          <article key={entry.memory_id}>
            <div className="memoryEntryHeader">
              <span>{translateKnownText(locale, entry.kind)}</span>
              <div>
                {scope !== "short_term" ? (
                  <button type="button" title={t("memory.edit")} onClick={() => edit(entry)} disabled={busy}>
                    <Pencil size={12} />
                  </button>
                ) : null}
                {scope !== "short_term" ? (
                  <button type="button" title={t("memory.delete")} onClick={() => remove(entry.memory_id)} disabled={busy}>
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            </div>
            <p>{entry.content}</p>
            <footer>
              <code>{entry.source}</code>
              {entry.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </footer>
          </article>
        ))}
      </div>

      {scope !== "short_term" ? (
        <div className="memoryEditor">
          <div className="memoryEditorHeader">
            <strong>{editingId ? t("memory.editTitle") : t("memory.addTitle")}</strong>
            {editingId ? <button type="button" title={t("memory.cancel")} onClick={resetForm}><X size={13} /></button> : null}
          </div>
          <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label={t("memory.kind")}>
            <option value="note">{t("memory.kind.note")}</option>
            <option value="preference">{t("memory.kind.preference")}</option>
            <option value="command">{t("memory.kind.command")}</option>
            <option value="convention">{t("memory.kind.convention")}</option>
            <option value="protected_path">{t("memory.kind.protectedPath")}</option>
            <option value="business_rule">{t("memory.kind.businessRule")}</option>
          </select>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={t("memory.placeholder")} />
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("memory.tagsPlaceholder")} />
          {scope === "long_term" ? (
            <label className="memoryConfirmation">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span><Check size={12} />{t("memory.confirmLongTerm")}</span>
            </label>
          ) : null}
          <button
            type="button"
            className="memorySave"
            onClick={save}
            disabled={busy || !content.trim() || (scope === "long_term" && !confirmed)}
          >
            {editingId ? <Save size={14} /> : <Plus size={14} />}
            <span>{busy ? t("memory.saving") : editingId ? t("memory.save") : t("memory.add")}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
