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
};

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

const sameCompany = (a: string, b: string) => {
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
