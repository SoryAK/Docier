import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { prepareRequestAnswer, type RequestRoleContext } from "../core/requests";
import { readRequestLink, rolesAtCompany } from "../core/role-people";
import { createContact } from "./career-management";
import { readProfile } from "./occupant";

/**
 * A request someone else sent you, answered from your own Docier by pasting its
 * link. The answer goes back on their Relay, marked as from a Docier; confirming
 * a "worked together" request also records them on your role, so it counts on
 * both sides. Nothing is shared between the two vaults but the answer itself.
 */

export class ReceivedAskError extends Error {
  constructor(
    readonly code:
      | "link-invalid"
      | "link-unreachable"
      | "request-closed"
      | "role-required"
      | "role-missing"
      | "decision-invalid"
      | "note-too-long",
  ) {
    super(code);
  }
}

export type ReceivedAsk = {
  kind: string;
  body: string;
  fromName: string;
  fromHeadline: string;
  recipientName: string;
  role: RequestRoleContext | null;
  expiresAt: string;
  status: "open" | "answered" | "withdrawn" | "expired";
};

const LIMIT_BYTES = 64_000;

async function fetchAsk(fetcher: typeof fetch, link: unknown): Promise<{ url: string; ask: ReceivedAsk }> {
  const read = readRequestLink(link);
  if (!read) throw new ReceivedAskError("link-invalid");
  let response: Response;
  try {
    response = await fetcher(`${read.url}/data`, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ReceivedAskError("link-unreachable");
  }
  if (response.status === 404) throw new ReceivedAskError("link-invalid");
  if (!response.ok) throw new ReceivedAskError("link-unreachable");
  const text = await response.text();
  if (text.length > LIMIT_BYTES) throw new ReceivedAskError("link-unreachable");
  let body: { ask?: Partial<ReceivedAsk> };
  try {
    body = JSON.parse(text) as { ask?: Partial<ReceivedAsk> };
  } catch {
    throw new ReceivedAskError("link-unreachable");
  }
  const ask = body.ask;
  if (!ask || typeof ask.fromName !== "string" || typeof ask.kind !== "string") throw new ReceivedAskError("link-unreachable");
  const str = (value: unknown, max = 4000) => (typeof value === "string" ? value.slice(0, max) : "");
  const role =
    ask.role && typeof ask.role === "object"
      ? { organization: str(ask.role.organization, 200), title: str(ask.role.title, 200), period: str(ask.role.period, 200) }
      : null;
  const status = ask.status === "answered" || ask.status === "withdrawn" || ask.status === "expired" ? ask.status : "open";
  return {
    url: read.url,
    ask: {
      kind: str(ask.kind, 40),
      body: str(ask.body),
      fromName: str(ask.fromName, 200),
      fromHeadline: str(ask.fromHeadline, 200),
      recipientName: str(ask.recipientName, 200),
      role,
      expiresAt: str(ask.expiresAt, 40),
      status,
    },
  };
}

function myRoles(db: DatabaseSync, occupantId: string) {
  return db
    .prepare("SELECT id, company AS organization, title FROM work_history WHERE occupant_id = ?")
    .all(occupantId) as Array<{ id: string; organization: string; title: string }>;
}

/** Reads the request behind a pasted link, with your roles at the same company first. */
export async function readReceivedAsk(
  db: DatabaseSync,
  occupantId: string,
  fetcher: typeof fetch,
  link: unknown,
): Promise<{ ask: ReceivedAsk; suggestedRoleIds: string[] }> {
  const { ask } = await fetchAsk(fetcher, link);
  return { ask, suggestedRoleIds: ask.role ? rolesAtCompany(myRoles(db, occupantId), ask.role.organization) : [] };
}

/**
 * Answers a request from this Docier. The answer is sent first; only once their
 * Relay has it is anything recorded here, so a failed send leaves nothing behind.
 */
export async function answerReceivedAsk(
  db: DatabaseSync,
  occupantId: string,
  fetcher: typeof fetch,
  input: Record<string, unknown>,
): Promise<{ status: "approved" | "declined"; linkId: string | null }> {
  const answer = prepareRequestAnswer({ decision: input.decision, note: input.note });
  if (!answer.ok) throw new ReceivedAskError(answer.error);
  const { url, ask } = await fetchAsk(fetcher, input.link);
  if (ask.status !== "open") throw new ReceivedAskError("request-closed");

  const confirming = ask.kind === "worked-with" && answer.value.decision === "approved";
  let role: { id: string; organization: string; title: string } | undefined;
  if (confirming) {
    const roleId = typeof input.roleId === "string" ? input.roleId : "";
    if (!roleId) throw new ReceivedAskError("role-required");
    role = myRoles(db, occupantId).find((item) => item.id === roleId);
    if (!role) throw new ReceivedAskError("role-missing");
  }

  // Your details go only if you give an email, as on their page.
  const share = input.share && typeof input.share === "object" ? (input.share as Record<string, unknown>) : null;
  const email = typeof share?.email === "string" ? share.email.trim() : "";
  const profile = readProfile(db, occupantId);
  const myName = profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim();
  const join =
    email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && myName
      ? {
          choice: "joined",
          details: {
            name: myName,
            email,
            organization: role?.organization ?? "",
            role: role?.title ?? profile.headline,
            phone: typeof share?.phone === "string" ? share.phone.trim().slice(0, 60) : "",
          },
        }
      : undefined;

  let sent: Response;
  try {
    sent = await fetcher(`${url}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: answer.value.decision, note: answer.value.note, join, from: "docier" }),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ReceivedAskError("link-unreachable");
  }
  if (sent.status === 409) throw new ReceivedAskError("request-closed");
  if (!sent.ok) throw new ReceivedAskError("link-unreachable");

  if (!confirming || !role) return { status: answer.value.decision, linkId: null };
  return { status: "approved", linkId: recordConfirmation(db, occupantId, role, ask, answer.value.note) };
}

/** The person who asked, in your network and on your role, confirmed. */
function recordConfirmation(
  db: DatabaseSync,
  occupantId: string,
  role: { id: string; organization: string },
  ask: ReceivedAsk,
  note: string,
): string {
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    const existing = db
      .prepare("SELECT id FROM contacts WHERE occupant_id = ? AND lower(trim(name)) = lower(trim(?)) ORDER BY created_at LIMIT 1")
      .get(occupantId, ask.fromName) as { id: string } | undefined;
    const contactId =
      existing?.id ?? createContact(db, occupantId, { name: ask.fromName, role: ask.fromHeadline, organization: role.organization }).id;
    const link = db
      .prepare("SELECT id FROM role_contacts WHERE occupant_id = ? AND role_id = ? AND contact_id = ?")
      .get(occupantId, role.id, contactId) as { id: string } | undefined;
    let linkId: string;
    if (link) {
      db.prepare("UPDATE role_contacts SET confirmed_at = ?, confirmed_note = ? WHERE id = ?").run(now, note.slice(0, 200), link.id);
      linkId = link.id;
    } else {
      linkId = randomUUID();
      db.prepare(
        `INSERT INTO role_contacts (id, occupant_id, role_id, contact_id, note, since, created_at, confirmed_at, confirmed_note)
         VALUES (?, ?, ?, ?, '', '', ?, ?, ?)`,
      ).run(linkId, occupantId, role.id, contactId, now, now, note.slice(0, 200));
    }
    db.exec("COMMIT");
    return linkId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
