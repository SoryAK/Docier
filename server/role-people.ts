import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { effectiveRequestStatus, type SentRequestStatus } from "../core/requests";
import { colleagueToContact, prepareRolePersonLink, type RolePerson } from "../core/role-people";
import { CareerManagementStoreError, createContact } from "./career-management";
import { contactPhotoUrl } from "./contact-photos";

/** People worked with on a role: My Network contacts linked to the role (`role_contacts`). */

export class RolePeopleError extends Error {
  constructor(
    readonly code:
      | "role-missing"
      | "contact-missing"
      | "link-missing"
      | "already-linked"
      | "name-required"
      | "since-invalid"
      | "note-too-long",
  ) {
    super(code);
  }
}

type JsonObject = Record<string, unknown>;

type LinkRow = {
  link_id: string;
  contact_id: string;
  name: string;
  role: string;
  organization: string;
  email: string;
  photo_stored_name: string | null;
  note: string;
  since: string;
};

function toPerson(row: LinkRow & ConfirmRow): RolePerson {
  const status = row.request_status
    ? effectiveRequestStatus(row.request_status, row.request_expires_at ?? "", new Date().toISOString())
    : null;
  return {
    linkId: row.link_id,
    contactId: row.contact_id,
    name: row.name,
    role: row.role,
    organization: row.organization,
    email: row.email,
    photoUrl: contactPhotoUrl(row.contact_id, row.photo_stored_name ?? null),
    note: row.note,
    since: row.since,
    // Your own request to them comes first; otherwise a request of theirs you confirmed here.
    confirmation:
      row.request_id && status
        ? {
            requestId: row.request_id,
            status,
            note: row.request_note ?? "",
            answeredAt: row.request_answered_at ?? null,
            answeredFrom: row.request_answered_from ?? null,
            direction: "sent",
          }
        : row.confirmed_at
          ? {
              requestId: "",
              status: "approved",
              note: row.confirmed_note ?? "",
              answeredAt: row.confirmed_at,
              answeredFrom: "docier",
              direction: "received",
            }
          : null,
  };
}

type ConfirmRow = {
  confirmed_at: string | null;
  confirmed_note: string | null;
  request_id: string | null;
  request_status: SentRequestStatus | null;
  request_note: string | null;
  request_answered_at: string | null;
  request_answered_from: "browser" | "docier" | null;
  request_expires_at: string | null;
};

// The latest "worked together" request for each link says whether they confirmed.
const SELECT_PEOPLE = `
  SELECT rc.id AS link_id, c.id AS contact_id, c.name, c.role, c.organization, c.email,
         c.photo_stored_name, rc.note, rc.since, rc.confirmed_at, rc.confirmed_note,
         q.id AS request_id, q.status AS request_status, q.recipient_note AS request_note,
         q.answered_at AS request_answered_at, q.answered_from AS request_answered_from,
         q.expires_at AS request_expires_at
  FROM role_contacts rc
  JOIN contacts c ON c.id = rc.contact_id AND c.occupant_id = rc.occupant_id
  LEFT JOIN outgoing_requests q ON q.id = (
    SELECT id FROM outgoing_requests
    WHERE occupant_id = rc.occupant_id AND role_link_id = rc.id
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  )`;

export function readRolePeople(db: DatabaseSync, occupantId: string, roleId: string): RolePerson[] {
  return (
    db
      .prepare(`${SELECT_PEOPLE} WHERE rc.occupant_id = ? AND rc.role_id = ? ORDER BY rc.created_at, rc.rowid`)
      .all(occupantId, roleId) as Array<LinkRow & ConfirmRow>
  ).map(toPerson);
}

function readLink(db: DatabaseSync, occupantId: string, roleId: string, linkId: string): RolePerson {
  const row = db
    .prepare(`${SELECT_PEOPLE} WHERE rc.occupant_id = ? AND rc.role_id = ? AND rc.id = ?`)
    .get(occupantId, roleId, linkId) as (LinkRow & ConfirmRow) | undefined;
  if (!row) throw new RolePeopleError("link-missing");
  return toPerson(row);
}

function requireRole(db: DatabaseSync, occupantId: string, roleId: string) {
  const found = db.prepare("SELECT id FROM work_history WHERE id = ? AND occupant_id = ?").get(roleId, occupantId);
  if (!found) throw new RolePeopleError("role-missing");
}

function prepareLink(input: JsonObject) {
  const prepared = prepareRolePersonLink({ note: input.note, since: input.since });
  if (!prepared.ok) throw new RolePeopleError(prepared.error);
  return prepared.value;
}

/** Links someone already in My Network (`contactId`), or adds a new person (`contact`) and links them. */
export function linkRolePerson(db: DatabaseSync, occupantId: string, roleId: string, input: JsonObject): RolePerson {
  requireRole(db, occupantId, roleId);
  const link = prepareLink(input);
  db.exec("BEGIN");
  try {
    let contactId: string;
    if (typeof input.contactId === "string" && input.contactId) {
      const found = db.prepare("SELECT id FROM contacts WHERE id = ? AND occupant_id = ?").get(input.contactId, occupantId);
      if (!found) throw new RolePeopleError("contact-missing");
      contactId = input.contactId;
    } else {
      const contact = input.contact && typeof input.contact === "object" ? (input.contact as JsonObject) : {};
      try {
        contactId = createContact(db, occupantId, contact).id;
      } catch (error) {
        if (error instanceof CareerManagementStoreError && error.code === "name-required") {
          throw new RolePeopleError("name-required");
        }
        throw error;
      }
    }
    const existing = db
      .prepare("SELECT id FROM role_contacts WHERE occupant_id = ? AND role_id = ? AND contact_id = ?")
      .get(occupantId, roleId, contactId);
    if (existing) throw new RolePeopleError("already-linked");
    const linkId = randomUUID();
    db.prepare(
      `INSERT INTO role_contacts (id, occupant_id, role_id, contact_id, note, since, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(linkId, occupantId, roleId, contactId, link.note, link.since, new Date().toISOString());
    db.exec("COMMIT");
    return readLink(db, occupantId, roleId, linkId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateRolePersonLink(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  linkId: string,
  input: JsonObject,
): RolePerson {
  readLink(db, occupantId, roleId, linkId);
  const link = prepareLink(input);
  db.prepare("UPDATE role_contacts SET note = ?, since = ? WHERE id = ? AND occupant_id = ? AND role_id = ?").run(
    link.note,
    link.since,
    linkId,
    occupantId,
    roleId,
  );
  return readLink(db, occupantId, roleId, linkId);
}

/** Takes the person off this role; they stay in My Network. */
export function unlinkRolePerson(db: DatabaseSync, occupantId: string, roleId: string, linkId: string): void {
  const removed = db
    .prepare("DELETE FROM role_contacts WHERE id = ? AND occupant_id = ? AND role_id = ?")
    .run(linkId, occupantId, roleId);
  if (removed.changes !== 1) throw new RolePeopleError("link-missing");
}

export type ContactRole = {
  roleId: string;
  organization: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

/** The roles each contact is linked to, for My Network. */
export function rolesByContact(db: DatabaseSync, occupantId: string): Map<string, ContactRole[]> {
  const rows = db
    .prepare(
      `SELECT rc.contact_id, w.id, w.company, w.title, w.start_date, w.end_date, w.is_current
       FROM role_contacts rc
       JOIN work_history w ON w.id = rc.role_id AND w.occupant_id = rc.occupant_id
       WHERE rc.occupant_id = ?
       ORDER BY w.start_date DESC`,
    )
    .all(occupantId) as Array<Record<string, unknown>>;
  const out = new Map<string, ContactRole[]>();
  for (const row of rows) {
    const list = out.get(String(row.contact_id)) ?? [];
    list.push({
      roleId: String(row.id),
      organization: String(row.company ?? ""),
      title: String(row.title ?? ""),
      startDate: String(row.start_date ?? ""),
      endDate: String(row.end_date ?? ""),
      isCurrent: Number(row.is_current) === 1,
    });
    out.set(String(row.contact_id), list);
  }
  return out;
}

/**
 * Roles used to keep their own "worked with" list. Each entry becomes a My Network
 * contact linked to its role, once; the old list is then emptied.
 */
export function moveColleaguesToNetwork(db: DatabaseSync, occupantId: string): void {
  const rows = db
    .prepare(
      `SELECT d.work_history_id AS role_id, d.details_json, w.company
       FROM work_history_details d
       JOIN work_history w ON w.id = d.work_history_id AND w.occupant_id = d.occupant_id
       WHERE d.occupant_id = ? AND json_array_length(json_extract(d.details_json, '$.colleagues')) > 0`,
    )
    .all(occupantId) as Array<{ role_id: string; details_json: string; company: string }>;
  if (rows.length === 0) return;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const details = JSON.parse(row.details_json) as JsonObject;
      const colleagues = Array.isArray(details.colleagues) ? (details.colleagues as JsonObject[]) : [];
      for (const colleague of colleagues) {
        const moved = colleagueToContact(
          {
            name: String(colleague.name ?? ""),
            title: String(colleague.title ?? ""),
            note: String(colleague.note ?? ""),
            url: String(colleague.url ?? ""),
          },
          row.company,
        );
        if (!moved) continue;
        const contact = createContact(db, occupantId, moved.contact);
        db.prepare(
          `INSERT INTO role_contacts (id, occupant_id, role_id, contact_id, note, since, created_at)
           VALUES (?, ?, ?, ?, ?, '', ?)`,
        ).run(randomUUID(), occupantId, row.role_id, contact.id, moved.note, new Date().toISOString());
      }
      details.colleagues = [];
      db.prepare(
        "UPDATE work_history_details SET details_json = ? WHERE work_history_id = ? AND occupant_id = ?",
      ).run(JSON.stringify(details), row.role_id, occupantId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
