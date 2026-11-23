import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { matchContacts, suggestRolePeople, type RolePerson } from "@core/role-people";
import type { WorkMapRole } from "@core/work-map";
import { Pencil, Plus, UserPlus, X } from "lucide-react";
import "./role-view.css";

type NetworkContact = { id: string; name: string; organization: string; role: string; email: string };

type Draft = {
  /** The link being changed, or null when adding someone new. */
  person: RolePerson | null;
  name: string;
  role: string;
  organization: string;
  email: string;
  note: string;
  since: string;
};

/**
 * The people worked with on a role. Each is a My Network contact linked to the
 * role; the note and the month belong to this job. Unlinking keeps them in My Network.
 */
export function RolePeople({
  role,
  roles,
  onSaved,
}: {
  role: WorkMapRole;
  roles: WorkMapRole[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<NetworkContact[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const people = role.people ?? [];
  const name = role.organization.trim() || role.title.trim() || "this role";

  useEffect(() => {
    setOpen(false);
    setDraft(null);
    setQuery("");
    setMessage("");
  }, [role.id]);

  // My Network is read when the list opens, so a new contact elsewhere shows up.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/career-management")
      .then(async (response) => (response.ok ? ((await response.json()) as { contacts?: NetworkContact[] }) : {}))
      .then((body) => {
        if (!cancelled) setContacts((body.contacts ?? []).map((c) => ({ id: c.id, name: c.name, organization: c.organization ?? "", role: c.role ?? "", email: c.email ?? "" })));
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, role.id]);

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

  const linkedIds = people.map((person) => person.contactId);
  const matches = useMemo(() => matchContacts(contacts ?? [], query, linkedIds), [contacts, query, linkedIds]);
  const suggestions = useMemo(() => suggestRolePeople(role.id, roles), [role.id, roles]);
  const startMonth = role.startDate.slice(0, 7);

  async function send(path: string, method: string, body?: unknown): Promise<boolean> {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.ok) return true;
    const error = ((await response.json().catch(() => ({}))) as { error?: string }).error;
    setMessage(
      error === "already-linked"
        ? "They are already on this role."
        : error === "since-invalid"
          ? "Use a month, such as 2024-06."
          : error === "name-required"
            ? "Add a name."
            : "That could not be saved. Try again.",
    );
    return false;
  }

  async function run(work: () => Promise<boolean>, after?: () => void) {
    setBusy(true);
    setMessage("");
    try {
      if (await work()) {
        after?.();
        onSaved();
      }
    } catch {
      setMessage("That could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/work-map/roles/${encodeURIComponent(role.id)}/people`;
  const link = (contactId: string) => run(() => send(base, "POST", { contactId, since: "" }), () => setQuery(""));
  const unlink = (person: RolePerson) => {
    if (!window.confirm(`Take ${person.name} off ${name}? They stay in My Network.`)) return;
    void run(() => send(`${base}/${encodeURIComponent(person.linkId)}`, "DELETE"));
  };

  function newDraft(typed: string): Draft {
    return { person: null, name: typed.trim(), role: "", organization: role.organization, email: "", note: "", since: "" };
  }

  function editDraft(person: RolePerson): Draft {
    return { person, name: person.name, role: person.role, organization: person.organization, email: person.email, note: person.note, since: person.since };
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const contact = { name: draft.name.trim(), role: draft.role.trim(), organization: draft.organization.trim(), email: draft.email.trim() };
    const linkFields = { note: draft.note, since: draft.since };
    if (!draft.person) {
      void run(() => send(base, "POST", { contact, ...linkFields }), () => {
        setDraft(null);
        setQuery("");
      });
      return;
    }
    const person = draft.person;
    void run(
      async () =>
        (await send(`/api/contacts/${encodeURIComponent(person.contactId)}`, "PUT", contact)) &&
        (await send(`${base}/${encodeURIComponent(person.linkId)}`, "PUT", linkFields)),
      () => setDraft(null),
    );
  }

  return (
    <div className="role-view-people" ref={wrapRef}>
      {people.length > 0 ? (
        <button type="button" className="role-view-faces" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="role-view-stack" aria-hidden="true">
            {people.slice(0, 3).map((person) => (
              <Face key={person.linkId} person={person} />
            ))}
          </span>
          Worked with {people.length}
        </button>
      ) : (
        <button type="button" className="role-view-text" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          + Who you worked with
        </button>
      )}

      {open ? (
        <div className="role-view-pop role-people" role="dialog" aria-label={`People at ${name}`}>
          {draft ? (
            <form className="role-people-form" onSubmit={save}>
              <h3>{draft.person ? `Change ${draft.person.name}` : "Add someone"}</h3>
              <fieldset disabled={busy}>
                <label>
                  Name
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus required />
                </label>
                <label>
                  Their role
                  <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Robotics technician" />
                </label>
                <label>
                  Company
                  <input value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} />
                </label>
                <label>
                  Email <span className="role-people-optional">optional</span>
                  <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </label>
                <label>
                  On this job
                  <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Trained me, my supervisor…" maxLength={200} />
                </label>
                <label>
                  Worked together since
                  <input type="month" value={draft.since || startMonth} onChange={(e) => setDraft({ ...draft, since: e.target.value === startMonth ? "" : e.target.value })} />
                </label>
              </fieldset>
              {message ? <p className="role-view-error" role="alert">{message}</p> : null}
              <div className="role-view-editor-actions">
                <button type="button" className="role-view-ghost" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="role-view-primary" disabled={busy || !draft.name.trim()}>
                  {busy ? "Saving…" : draft.person ? "Save" : "Add"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="role-people-head">
                <h3>Worked with</h3>
                <small>Saved in My Network</small>
              </div>
              {people.length > 0 ? (
                <ul className="role-people-list">
                  {people.map((person) => (
                    <li key={person.linkId}>
                      <Face person={person} />
                      <span className="role-people-who">
                        <b>{person.name}</b>
                        {person.role || person.note ? <small>{[person.role, person.note].filter(Boolean).join(" · ")}</small> : null}
                      </span>
                      <span className="role-people-actions">
                        <button type="button" aria-label={`Change ${person.name}`} title="Change" onClick={() => setDraft(editDraft(person))} disabled={busy}>
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Take ${person.name} off this role`} title="Take off this role" onClick={() => unlink(person)} disabled={busy}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="role-view-empty">Add the people from {name}. They join My Network, linked to this job.</p>
              )}

              {suggestions.length > 0 ? (
                <div className="role-people-suggest">
                  <small>Also at {role.organization}</small>
                  <div>
                    {suggestions.map((person) => (
                      <button key={person.contactId} type="button" onClick={() => void link(person.contactId)} disabled={busy}>
                        <Plus size={12} aria-hidden="true" /> {person.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="role-people-find">
                <UserPlus size={15} aria-hidden="true" />
                <input
                  aria-label="Add someone by name"
                  placeholder="Add someone…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && query.trim()) {
                      event.preventDefault();
                      if (matches[0] && matches[0].name.toLowerCase() === query.trim().toLowerCase()) void link(matches[0].id);
                      else setDraft(newDraft(query));
                    }
                  }}
                  disabled={busy}
                />
              </div>
              {query.trim() ? (
                <ul className="role-people-matches">
                  {matches.map((contact) => (
                    <li key={contact.id}>
                      <button type="button" onClick={() => void link(contact.id)} disabled={busy}>
                        <b>{contact.name}</b>
                        {contact.role || contact.organization ? <small>{[contact.role, contact.organization].filter(Boolean).join(" · ")}</small> : null}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="is-new" onClick={() => setDraft(newDraft(query))} disabled={busy}>
                      <Plus size={13} aria-hidden="true" /> Add “{query.trim()}” as someone new
                    </button>
                  </li>
                </ul>
              ) : null}
              {message ? <p className="role-view-error" role="alert">{message}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Face({ person }: { person: RolePerson }) {
  return person.photoUrl ? (
    <img className="role-view-avatar" src={person.photoUrl} alt="" />
  ) : (
    <span className="role-view-avatar" aria-hidden="true">
      {initials(person.name)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
