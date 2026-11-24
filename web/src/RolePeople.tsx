import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { confirmedBothWays, matchContacts, suggestRolePeople, type RolePerson } from "@core/role-people";
import type { WorkMapRole } from "@core/work-map";
import { BadgeCheck, Copy, Mail, Pencil, Plus, Send, UserPlus, X } from "lucide-react";
import "./role-view.css";

type NetworkContact = { id: string; name: string; organization: string; role: string; email: string };

/** Asking a person to confirm you worked together. */
type Ask = { person: RolePerson; email: string; body: string; link: string | null };

type Draft = {
  /** The link being changed, or null when adding someone new. */
  person: RolePerson | null;
  name: string;
  role: string;
  organization: string;
  email: string;
  note: string;
  since: string;
  /** Adding someone new: ask them to confirm once they're added. */
  ask?: boolean;
};

/**
 * The people worked with on a role. Each is a My Network contact linked to the
 * role; the note and the month belong to this job. Unlinking keeps them in My Network.
 */
export function RolePeople({
  role,
  roles,
  onSaved,
  openRequest = null,
}: {
  role: WorkMapRole;
  roles: WorkMapRole[];
  onSaved: () => void;
  /** Opens the list with this person marked, as when they're picked in History. */
  openRequest?: { linkId: string; nonce: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<NetworkContact[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    if (!openRequest) return;
    setDraft(null);
    setAsk(null);
    setOpen(true);
    setMarked(openRequest.linkId);
    const timer = window.setTimeout(() => setMarked(null), 1800);
    return () => window.clearTimeout(timer);
  }, [openRequest]);
  const people = role.people ?? [];
  const name = role.organization.trim() || role.title.trim() || "this role";

  useEffect(() => {
    setOpen(false);
    setDraft(null);
    setAsk(null);
    setQuery("");
    setMessage("");
  }, [role.id]);

  // Opening the list reads fresh answers to requests, so a confirmation shows up here.
  const waiting = people.some((person) => person.confirmation?.status === "sent" || person.confirmation?.status === "opened");
  useEffect(() => {
    if (!open || !waiting) return;
    let cancelled = false;
    void fetch("/api/requests")
      .then(() => {
        if (!cancelled) onSaved();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      else if (ask) setAsk(null);
      else setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, draft, ask]);

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
    setMessage(messageFor(error));
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

  function askDraft(person: RolePerson, email = person.email): Ask {
    const first = person.name.trim().split(/\s+/)[0] || person.name;
    const org = role.organization.trim();
    const title = role.title.trim();
    const where = org ? ` at ${org}${title ? `, where I was ${title}` : ""}` : title ? ` when I was ${title}` : "";
    return {
      person,
      email,
      body: `Hi ${first}, could you confirm we worked together${where}? It shows my work is real. You can also share your details so I can keep in touch.`,
      link: null,
    };
  }

  async function sendAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ask) return;
    const { person } = ask;
    const email = ask.email.trim();
    setBusy(true);
    setMessage("");
    try {
      // A new or changed email is kept on the contact, where the request reads it.
      if (email !== person.email) {
        const ok = await send(`/api/contacts/${encodeURIComponent(person.contactId)}`, "PUT", {
          name: person.name,
          organization: person.organization,
          role: person.role,
          email,
        });
        if (!ok) return;
      }
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "worked-with", body: ask.body, contactId: person.contactId, roleLinkId: person.linkId }),
      });
      if (!response.ok) {
        const error = ((await response.json().catch(() => ({}))) as { error?: string }).error;
        setMessage(
          error === "relay-not-configured"
            ? "Requests go through your Relay, which isn't set up yet."
            : error === "relay-unavailable"
              ? "Your Relay can't be reached right now. Try again soon."
              : error === "email-invalid" || error === "recipient-required"
                ? "Add a valid email."
                : "The request could not be sent. Try again.",
        );
        return;
      }
      const body = (await response.json()) as { request?: { link?: string | null } };
      setAsk({ ...ask, email, link: body.request?.link ?? null });
      onSaved();
    } catch {
      setMessage("The request could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function withdraw(person: RolePerson) {
    const id = person.confirmation?.requestId;
    if (!id || !window.confirm(`Withdraw the request to ${person.name}?`)) return;
    void run(() => send(`/api/requests/${encodeURIComponent(id)}/withdraw`, "POST"));
  }

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
      const askAfter = Boolean(draft.ask);
      void run(async () => {
        const response = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contact, ...linkFields }),
        });
        if (!response.ok) {
          setMessage(messageFor(((await response.json().catch(() => ({}))) as { error?: string }).error));
          return false;
        }
        const added = ((await response.json()) as { person: RolePerson }).person;
        setDraft(null);
        setQuery("");
        if (askAfter) setAsk(askDraft(added));
        return true;
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
              <Face key={person.linkId} person={person} confirmed={person.confirmation?.status === "approved"} />
            ))}
          </span>
          Worked with {people.length}
        </button>
      ) : (
        <button type="button" className="role-view-text" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          + Colleagues
        </button>
      )}

      {open ? (
        <div className="role-view-pop role-people" role="dialog" aria-label={`People at ${name}`}>
          {ask ? (
            ask.link ? (
              <div className="role-people-form">
                <h3>Request ready</h3>
                <p className="role-view-empty">Send {ask.person.name.split(/\s+/)[0]} this private link. When they confirm, they show as Confirmed here.</p>
                <div className="role-people-link">
                  <input readOnly value={ask.link} aria-label="Request link" onFocus={(event) => event.currentTarget.select()} />
                  <button type="button" className="role-view-ghost" onClick={() => void navigator.clipboard?.writeText(ask.link ?? "")}>
                    <Copy size={13} aria-hidden="true" /> Copy
                  </button>
                </div>
                <a
                  className="role-view-text"
                  href={`mailto:${encodeURIComponent(ask.email)}?subject=${encodeURIComponent("Could you confirm we worked together?")}&body=${encodeURIComponent(`${ask.body}\n\n${ask.link}`)}`}
                >
                  <Mail size={13} aria-hidden="true" /> Email it
                </a>
                <div className="role-view-editor-actions">
                  <button type="button" className="role-view-primary" onClick={() => setAsk(null)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form className="role-people-form" onSubmit={sendAsk}>
                <h3>Ask {ask.person.name} to confirm</h3>
                <p className="role-view-empty">They'll see this job and can confirm you worked together, and share their details.</p>
                <fieldset disabled={busy}>
                  <label>
                    Their email
                    <input type="email" value={ask.email} onChange={(e) => setAsk({ ...ask, email: e.target.value })} required autoFocus />
                  </label>
                  <label>
                    Message
                    <textarea rows={4} value={ask.body} onChange={(e) => setAsk({ ...ask, body: e.target.value })} maxLength={4000} required />
                  </label>
                </fieldset>
                {message ? <p className="role-view-error" role="alert">{message}</p> : null}
                <div className="role-view-editor-actions">
                  <button type="button" className="role-view-ghost" onClick={() => setAsk(null)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="role-view-primary" disabled={busy || !ask.email.trim() || !ask.body.trim()}>
                    {busy ? "Sending…" : "Create request"}
                  </button>
                </div>
              </form>
            )
          ) : draft ? (
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
                {!draft.person ? (
                  <label className="role-people-check">
                    <input type="checkbox" checked={Boolean(draft.ask)} onChange={(e) => setDraft({ ...draft, ask: e.target.checked })} />
                    Ask them to confirm and fill in their own details
                  </label>
                ) : null}
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
                    <li key={person.linkId} className={person.linkId === marked ? "is-flash" : undefined}>
                      <Face person={person} />
                      <span className="role-people-who">
                        <b>
                          {person.name}
                          <ConfirmTag person={person} />
                        </b>
                        {person.role || person.note ? <small>{[person.role, person.note].filter(Boolean).join(" · ")}</small> : null}
                        {person.confirmation?.direction === "sent" &&
                        person.confirmation.note &&
                        (person.confirmation.status === "approved" || person.confirmation.status === "declined") ? (
                          <q className="role-people-quote">{person.confirmation.note}</q>
                        ) : null}
                      </span>
                      <span className="role-people-actions">
                        {person.confirmation?.status === "sent" || person.confirmation?.status === "opened" ? (
                          <button type="button" aria-label={`Withdraw the request to ${person.name}`} title="Withdraw request" onClick={() => withdraw(person)} disabled={busy}>
                            <X size={13} aria-hidden="true" />
                          </button>
                        ) : person.confirmation?.status !== "approved" ? (
                          <button type="button" aria-label={`Ask ${person.name} to confirm`} title="Ask to confirm you worked together" onClick={() => setAsk(askDraft(person))} disabled={busy}>
                            <Send size={13} aria-hidden="true" />
                          </button>
                        ) : null}
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

/** What to say when saving goes wrong, from the server's error code. */
function messageFor(error: string | undefined): string {
  return (
      error === "already-linked"
        ? "They are already on this role."
        : error === "since-invalid"
          ? "Use a month, such as 2024-06."
          : error === "name-required"
            ? "Add a name."
            : error === "relay-not-configured"
              ? "Requests go through your Relay, which isn't set up yet."
              : error === "relay-unavailable"
                ? "Your Relay can't be reached right now. Try again soon."
                : error === "email-invalid"
                  ? "Add a valid email."
                  : error === "request-open"
                    ? "A request to them is already waiting."
                    : "That could not be saved. Try again."
  );
}

function Face({ person, confirmed = false }: { person: RolePerson; confirmed?: boolean }) {
  const className = confirmed ? "role-view-avatar is-confirmed" : "role-view-avatar";
  return person.photoUrl ? (
    <img className={className} src={person.photoUrl} alt="" />
  ) : (
    <span className={className} aria-hidden="true">
      {initials(person.name)}
    </span>
  );
}

/** Where a request to confirm you worked together stands. */
function ConfirmTag({ person }: { person: RolePerson }) {
  const status = person.confirmation?.status;
  if (status === "approved") {
    const both = confirmedBothWays(person.confirmation);
    return (
      <span
        className="role-people-tag is-confirmed"
        title={
          person.confirmation?.direction === "received"
            ? "You confirmed their request from your Docier"
            : both
              ? "They confirmed from their own Docier"
              : "They confirmed on the request page"
        }
      >
        <BadgeCheck size={12} aria-hidden="true" /> {both ? "Confirmed both ways" : "Confirmed"}
      </span>
    );
  }
  if (status === "sent") return <span className="role-people-tag">Request sent</span>;
  if (status === "opened") return <span className="role-people-tag">Opened</span>;
  if (status === "declined") return <span className="role-people-tag is-declined">Declined</span>;
  return null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
