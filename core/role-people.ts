/**
 * People worked with on a role. A person is a My Network contact; the link to a
 * role carries what belongs to that job: a short note and when you started
 * working together.
 */

export type RolePerson = {
  linkId: string;
  contactId: string;
  name: string;
  /** Their role, from the contact. */
  role: string;
  organization: string;
  email: string;
  photoUrl: string | null;
  /** About this job, such as "trained me". */
  note: string;
  /** YYYY-MM, or "" for the role's start. */
  since: string;
  /** The latest request asking them to confirm you worked together, or null if none was sent. */
  confirmation?: RolePersonConfirmation | null;
};

export type RolePersonConfirmation = {
  requestId: string;
  status: "sent" | "opened" | "approved" | "declined" | "expired" | "withdrawn";
  /** Their note back. */
  note: string;
  answeredAt: string | null;
  answeredFrom: "browser" | "docier" | null;
  /**
   * "sent": you asked them. "received": they asked you and you confirmed from
   * this Docier, so it is confirmed on both sides.
   */
  direction: "sent" | "received";
};

/** Confirmed on both sides: they answered from their own Docier, or you confirmed theirs from here. */
export function confirmedBothWays(confirmation: RolePersonConfirmation | null | undefined): boolean {
  return (
    confirmation?.status === "approved" &&
    (confirmation.direction === "received" || confirmation.answeredFrom === "docier")
  );
}

export type RolePersonLinkInput = { note?: unknown; since?: unknown };

export type RolePersonLinkResult =
  | { ok: true; value: { note: string; since: string } }
  | { ok: false; error: "since-invalid" | "note-too-long" };

const NOTE_MAX = 200;

export function prepareRolePersonLink(input: RolePersonLinkInput): RolePersonLinkResult {
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX) return { ok: false, error: "note-too-long" };
  const raw = typeof input.since === "string" ? input.since.trim() : "";
  if (!raw) return { ok: true, value: { note, since: "" } };
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) return { ok: false, error: "since-invalid" };
  return { ok: true, value: { note, since: `${match[1]}-${match[2]}` } };
}

export const sameCompany = (a: string, b: string) => {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return clean(a) !== "" && clean(a) === clean(b);
};

/**
 * People linked to other roles at the same company, offered when adding people
 * to this one. Nothing is linked for you.
 */
export function suggestRolePeople(
  roleId: string,
  roles: Array<{ id: string; organization: string; people?: RolePerson[] }>,
): RolePerson[] {
  const role = roles.find((item) => item.id === roleId);
  if (!role) return [];
  const linked = new Set((role.people ?? []).map((item) => item.contactId));
  const out = new Map<string, RolePerson>();
  for (const other of roles) {
    if (other.id === roleId || !sameCompany(other.organization, role.organization)) continue;
    for (const item of other.people ?? []) {
      if (!linked.has(item.contactId) && !out.has(item.contactId)) out.set(item.contactId, item);
    }
  }
  return [...out.values()];
}

/** Your roles at the company a request is about, to answer it on. */
export function rolesAtCompany(roles: Array<{ id: string; organization: string }>, organization: string): string[] {
  return roles.filter((role) => sameCompany(role.organization, organization)).map((role) => role.id);
}

/**
 * A request link pasted into Docier: https, or http on this machine, with a
 * /q/<token> path. Anything else is refused before it is fetched.
 */
export function readRequestLink(link: unknown): { url: string; token: string } | null {
  if (typeof link !== "string") return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password) return null;
  const match = url.pathname.match(/^\/q\/([A-Za-z0-9_-]{16,128})\/?$/);
  if (!match) return null;
  return { url: `${url.origin}/q/${match[1]}`, token: match[1]! };
}

/** My Network contacts whose name matches what was typed: names starting with it first. */
export function matchContacts<T extends { id: string; name: string }>(
  contacts: T[],
  query: string,
  excludeIds: readonly string[],
  limit = 6,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const excluded = new Set(excludeIds);
  const rank = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith(needle)) return 0;
    if (lower.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
    return lower.includes(needle) ? 2 : -1;
  };
  return contacts
    .filter((contact) => !excluded.has(contact.id))
    .map((contact) => ({ contact, rank: rank(contact.name) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.contact.name.localeCompare(b.contact.name))
    .slice(0, limit)
    .map((item) => item.contact);
}

/** An old "worked with" entry on a role, as a My Network contact and its note for the role. */
export function colleagueToContact(
  colleague: { name: string; title: string; note: string; url: string },
  organization: string,
): { contact: { name: string; organization: string; role: string; email: string; notes: string }; note: string } | null {
  const name = colleague.name.trim();
  if (!name) return null;
  return {
    contact: { name, organization: organization.trim(), role: colleague.title.trim(), email: "", notes: colleague.url.trim() },
    note: colleague.note.trim().slice(0, NOTE_MAX),
  };
}
