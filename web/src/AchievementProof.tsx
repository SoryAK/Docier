import { useEffect, useRef, useState, type FormEvent } from "react";
import { LINKED_EVIDENCE_KINDS, type LinkedEvidence, type WorkMapRole } from "@core/work-map";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

const KIND_LABEL: Record<LinkedEvidence["kind"], string> = {
  review: "Review",
  article: "Article",
  talk: "Talk",
  "press-release": "Press release",
  "social-post": "Post",
  award: "Award",
};

type Draft = {
  /** The evidence being changed, or null when adding. */
  id: string | null;
  url: string;
  title: string;
  outlet: string;
  publishedOn: string;
  kind: LinkedEvidence["kind"];
  credit: LinkedEvidence["credit"];
  contribution: string;
  isPublic: boolean;
};

const MESSAGE: Record<string, string> = {
  "url-invalid": "Use a full link, starting with https://",
  "title-required": "Add a title.",
  "page-unreachable": "That page couldn't be read. Fill in the title yourself.",
  "date-invalid": "Use a full date.",
  "pin-missing": "That achievement changed. Close this and try again.",
};

/**
 * The evidence behind one achievement: links that prove it, pinned to the
 * achievement's id so rewording it keeps them. Add, change, or remove them here.
 */
export function AchievementProof({
  role,
  achievementId,
  statement,
  onSaved,
}: {
  role: WorkMapRole;
  achievementId: string;
  statement: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wrapRef = useRef<HTMLSpanElement>(null);
  const items = role.linkedEvidence.filter((item) => item.pin?.kind === "achievement" && item.pin.id === achievementId);

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (draft) setDraft(null);
      else setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, draft]);

  const base = `/api/work-map/roles/${encodeURIComponent(role.id)}/linked-evidence`;

  async function call(path: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      setMessage(MESSAGE[String(json.error)] ?? "That could not be saved. Try again.");
      return null;
    }
    return json;
  }

  async function fill() {
    if (!draft?.url.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const body = await call("/api/work-map/linked-evidence/lookup", "POST", { url: draft.url.trim() });
      const fields = body?.fields as Partial<Draft> | undefined;
      if (fields) {
        setDraft((current) =>
          current
            ? {
                ...current,
                title: current.title || fields.title || "",
                outlet: current.outlet || fields.outlet || "",
                publishedOn: current.publishedOn || fields.publishedOn || "",
                kind: (fields.kind as Draft["kind"]) || current.kind,
              }
            : current,
        );
      }
    } catch {
      setMessage(MESSAGE["page-unreachable"]!);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const { id, ...fields } = draft;
      const body = await call(id ? `${base}/${encodeURIComponent(id)}` : base, id ? "PUT" : "POST", {
        ...fields,
        url: fields.url.trim(),
        pin: { kind: "achievement", id: achievementId },
      });
      if (!body) return;
      setDraft(null);
      onSaved();
    } catch {
      setMessage("That could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: LinkedEvidence) {
    if (!window.confirm(`Remove “${item.title}” from this achievement?`)) return;
    setBusy(true);
    setMessage("");
    try {
      if (await call(`${base}/${encodeURIComponent(item.id)}`, "DELETE")) onSaved();
    } finally {
      setBusy(false);
    }
  }

  const blank: Draft = { id: null, url: "", title: "", outlet: "", publishedOn: "", kind: "article", credit: "about-my-work", contribution: "", isPublic: false };

  return (
    <span className="role-proof" ref={wrapRef}>
      <button
        type="button"
        className={items.length > 0 ? "role-proof-tag has" : "role-proof-tag"}
        aria-expanded={open}
        title="Evidence for this achievement"
        onClick={() => setOpen((value) => !value)}
      >
        {items.length > 0 ? `${items.length} proof` : "+ proof"}
      </button>
      {open ? (
        <span className="role-view-pop role-proof-pop" role="dialog" aria-label="Evidence for this achievement">
          {draft ? (
            <form className="role-people-form" onSubmit={save}>
              <h3>{draft.id ? "Change evidence" : "Add evidence"}</h3>
              <fieldset disabled={busy}>
                <label>
                  Link
                  <span className="role-proof-url">
                    <input type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" required autoFocus />
                    <button type="button" className="role-view-ghost" onClick={() => void fill()} disabled={busy || !draft.url.trim()}>
                      Fill from link
                    </button>
                  </span>
                </label>
                <label>
                  Title
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
                </label>
                <span className="role-proof-two">
                  <label>
                    Where it appeared
                    <input value={draft.outlet} onChange={(e) => setDraft({ ...draft, outlet: e.target.value })} />
                  </label>
                  <label>
                    Date
                    <input type="date" value={draft.publishedOn} onChange={(e) => setDraft({ ...draft, publishedOn: e.target.value })} />
                  </label>
                </span>
                <span className="role-proof-two">
                  <label>
                    Kind
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                      {LINKED_EVIDENCE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    It
                    <select value={draft.credit} onChange={(e) => setDraft({ ...draft, credit: e.target.value as Draft["credit"] })}>
                      <option value="names-me">names me</option>
                      <option value="about-my-work">is about my work</option>
                    </select>
                  </label>
                </span>
                <label>
                  Your part <span className="role-people-optional">optional</span>
                  <input value={draft.contribution} onChange={(e) => setDraft({ ...draft, contribution: e.target.value })} placeholder="What you did that it shows" />
                </label>
              </fieldset>
              {message ? <span className="role-view-error" role="alert">{message}</span> : null}
              <span className="role-view-editor-actions">
                <button type="button" className="role-view-ghost" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="role-view-primary" disabled={busy || !draft.url.trim() || !draft.title.trim()}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </span>
            </form>
          ) : (
            <>
              <span className="role-people-head">
                <h3>Evidence</h3>
                <small>Saved with a copy in your vault</small>
              </span>
              <span className="role-proof-for">{statement}</span>
              {items.length > 0 ? (
                <ul className="role-proof-list">
                  {items.map((item) => (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noreferrer">
                        <b>{item.title}</b>
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                      <small>{[item.outlet, KIND_LABEL[item.kind], item.publishedOn].filter(Boolean).join(" · ")}</small>
                      <span className="role-people-actions">
                        <button
                          type="button"
                          aria-label={`Change ${item.title}`}
                          title="Change"
                          onClick={() =>
                            setDraft({
                              id: item.id,
                              url: item.url,
                              title: item.title,
                              outlet: item.outlet,
                              publishedOn: item.publishedOn,
                              kind: item.kind,
                              credit: item.credit,
                              contribution: item.contribution,
                              isPublic: item.isPublic,
                            })
                          }
                          disabled={busy}
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Remove ${item.title}`} title="Remove" onClick={() => void remove(item)} disabled={busy}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="role-view-empty">Link an article, a review, a talk, or an award that shows this happened.</span>
              )}
              {message ? <span className="role-view-error" role="alert">{message}</span> : null}
              <button type="button" className="role-view-text" onClick={() => setDraft(blank)}>
                + Add evidence
              </button>
            </>
          )}
        </span>
      ) : null}
    </span>
  );
}
