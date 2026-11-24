import { useState, type FormEvent } from "react";
import type { WorkMapMoment, WorkMapRole } from "@core/work-map";
import { Pencil, Plus, Trash2 } from "lucide-react";

type Draft = { id: string | null; date: string; title: string; detail: string; isPublic: boolean };

function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/**
 * A role's events, under Photos & events: each can be added, changed, or
 * removed in place. Saved with the role's details, so each change can be undone.
 */
export function RoleEvents({ role, onSaved }: { role: WorkMapRole; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const saved = role.details.events ?? [];
  const events = [...saved].sort((a, b) => b.date.localeCompare(a.date));

  async function put(next: WorkMapMoment[], failure: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/details`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: next }),
      });
      if (!response.ok) {
        setMessage(failure);
        return false;
      }
      onSaved();
      return true;
    } catch {
      setMessage(`${failure} Check your connection.`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.date) return;
    const entry: WorkMapMoment = {
      id: draft.id ?? crypto.randomUUID(),
      date: draft.date,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      isPublic: draft.isPublic,
    };
    const next = draft.id ? saved.map((item) => (item.id === draft.id ? entry : item)) : [...saved, entry];
    if (await put(next, "The event could not be saved.")) setDraft(null);
  }

  async function remove(item: WorkMapMoment) {
    if (!window.confirm(`Remove “${item.title}”?`)) return;
    await put(
      saved.filter((entry) => entry.id !== item.id),
      "The event could not be removed.",
    );
  }

  return (
    <div className="role-events">
      {events.length > 0 ? (
        <ul className="role-view-events role-events-list">
          {events.map((item) => (
            <li key={item.id}>
              <span>
                <b>{monthYear(item.date)}</b> {item.title || item.detail}
                {item.detail && item.title ? <small>{item.detail}</small> : null}
              </span>
              <span className="role-row-actions">
                <button
                  type="button"
                  aria-label={`Change ${item.title}`}
                  title="Change"
                  disabled={busy}
                  onClick={() => setDraft({ id: item.id, date: item.date.slice(0, 7), title: item.title, detail: item.detail, isPublic: item.isPublic })}
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Remove ${item.title}`} title="Remove" disabled={busy} onClick={() => void remove(item)}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {draft ? (
        <form className="role-inline-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <div className="role-inline-row">
              <label>
                Month
                <input type="month" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
              </label>
              <label className="is-wide">
                What happened
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Peak season, plant shutdown, a big launch…" required autoFocus />
              </label>
            </div>
            <label>
              <span>
                Details <span className="role-people-optional">optional</span>
              </span>
              <input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} />
            </label>
            <label className="role-view-check">
              <input type="checkbox" checked={draft.isPublic} onChange={(e) => setDraft({ ...draft, isPublic: e.target.checked })} />
              Show on my page
            </label>
          </fieldset>
          {message ? <p className="role-view-error" role="alert">{message}</p> : null}
          <div className="role-view-editor-actions">
            <button type="button" className="role-view-ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="role-view-primary" disabled={busy || !draft.title.trim() || !draft.date}>
              {busy ? "Saving…" : draft.id ? "Save" : "Add"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {message ? <p className="role-view-error" role="alert">{message}</p> : null}
          {events.length ? (
            <button type="button" className="role-view-text role-inline-add" onClick={() => setDraft({ id: null, date: "", title: "", detail: "", isPublic: false })}>
              <Plus size={14} aria-hidden="true" /> Add an event
            </button>
          ) : (
            <button type="button" className="role-group-add role-events-empty" onClick={() => setDraft({ id: null, date: "", title: "", detail: "", isPublic: false })}>
              + Add an event, like a peak season or a shutdown
            </button>
          )}
        </>
      )}
    </div>
  );
}
