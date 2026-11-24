import { describe, expect, it } from "vitest";
import { COMPOSABLE_REQUEST_KINDS, prepareOutgoingRequest } from "../core/requests";
import { roleHistory } from "../core/role-history";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { RequestRelay } from "./requests";

const ORIGIN = "https://relay.test";

/** A Docier server wired to a real Relay app, in memory. */
async function setup() {
  const relayDb = openRelayDatabase(":memory:");
  const relayApp = createRelayApp(relayDb, "owner-secret");
  const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
  const call = (path: string, init: RequestInit) => relayApp.request(path, init);
  const requestRelay: RequestRelay = {
    async putAsk(hash, ask) {
      const response = await call(`/relay/asks/${hash}`, { method: "PUT", headers: owner, body: JSON.stringify(ask) });
      if (!response.ok) throw new Error(`put ${response.status}`);
    },
    async withdrawAsk(hash) {
      await call(`/relay/asks/${hash}`, { method: "DELETE", headers: owner });
    },
    async forgetJoin(hash) {
      await call(`/relay/asks/${hash}/join`, { method: "DELETE", headers: owner });
    },
    async inbound() {
      return [];
    },
    async askStates(hashes) {
      const response = await call("/relay/asks/states", { method: "POST", headers: owner, body: JSON.stringify({ hashes }) });
      return ((await response.json()) as { states: Awaited<ReturnType<RequestRelay["askStates"]>> }).states;
    },
  };
  const db = openDatabase(":memory:");
  const app = createApp(db, { requestRelay, relayPublicOrigin: ORIGIN });
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  await send("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba", headline: "Controls technician" });
  const roleId = (
    await send("POST", "/api/work-map/roles", {
      kind: "job",
      title: "Mechatronics Technician",
      organization: "Giants Direct",
      startDate: "2024-06-01",
      isCurrent: true,
    })
  ).body.role.id as string;
  const person = (
    await send("POST", `/api/work-map/roles/${roleId}/people`, { contact: { name: "Maria Reyes", email: "maria@example.com" }, note: "trained me" })
  ).body.person as { linkId: string; contactId: string };
  const tokenOf = (link: string) => link.slice(`${ORIGIN}/q/`.length);
  const people = async () =>
    ((await send("GET", "/api/work-map")).body.roles as Array<{ id: string; people: Array<Record<string, any>> }>).find((role) => role.id === roleId)!
      .people;
  return { relayApp, send, roleId, person, tokenOf, people };
}

describe("asking someone to confirm you worked together", () => {
  it("keeps the worked-together kind out of the general composer, and needs a role", () => {
    expect(COMPOSABLE_REQUEST_KINDS).not.toContain("worked-with");
    expect(prepareOutgoingRequest({ kind: "worked-with", body: "Did we?", contactId: "c1" })).toEqual({ ok: false, error: "role-required" });
    expect(prepareOutgoingRequest({ kind: "worked-with", body: "Did we?", contactId: "c1", roleLinkId: "l1" })).toMatchObject({
      ok: true,
      value: { kind: "worked-with", roleLinkId: "l1" },
    });
    expect(prepareOutgoingRequest({ kind: "reference", body: "x", contactId: "c1" })).toMatchObject({ ok: true, value: { roleLinkId: null } });
  });

  it("sends the role with the request, and a confirmation comes back onto the person on that role", async () => {
    const { relayApp, send, person, tokenOf, people } = await setup();

    const sent = await send("POST", "/api/requests", {
      kind: "worked-with",
      body: "Could you confirm we worked together at Giants Direct?",
      contactId: person.contactId,
      roleLinkId: person.linkId,
    });
    expect(sent.status).toBe(201);
    const token = tokenOf(sent.body.request.link as string);
    expect((await people())[0]!.confirmation).toMatchObject({ status: "sent", requestId: sent.body.request.id });

    // The page shows the role, and asks to confirm.
    const page = await (await relayApp.request(`/q/${token}`)).text();
    expect(page).toContain("confirm you worked together");
    expect(page).toContain("Giants Direct");
    expect(page).toContain("Mechatronics Technician");
    expect(page).toContain("Jun 2024");
    expect(page).toContain(">Confirm<");

    const answered = await relayApp.request(`/q/${token}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approved",
        note: "Sory kept the robots running.",
        join: { choice: "joined", details: { name: "Maria Reyes", email: "maria@example.com", organization: "Giants Direct", role: "Robotics technician", phone: "" } },
      }),
    });
    expect(answered.status).toBe(200);

    // Docier reads the answer back the next time requests are listed.
    await send("GET", "/api/requests");
    const [maria] = await people();
    expect(maria!.confirmation).toMatchObject({ status: "approved", note: "Sory kept the robots running.", answeredFrom: "browser" });
    expect(typeof maria!.confirmation.answeredAt).toBe("string");
    // Her details fill the blanks on the same contact; nothing typed is replaced.
    expect(maria).toMatchObject({ contactId: person.contactId, role: "Robotics technician", note: "trained me" });
    const contacts = (await send("GET", "/api/career-management")).body.contacts as unknown[];
    expect(contacts).toHaveLength(1);
  });

  it("refuses a role link that isn't this person's, and a request for a role that's gone", async () => {
    const { send, roleId, person } = await setup();
    const other = (await send("POST", "/api/contacts", { name: "Dan Kim", email: "dan@example.com" })).body.contact as { id: string };
    const mismatch = await send("POST", "/api/requests", { kind: "worked-with", body: "x", contactId: other.id, roleLinkId: person.linkId });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe("role-link-mismatch");
    await send("DELETE", `/api/work-map/roles/${roleId}/people/${person.linkId}`);
    const gone = await send("POST", "/api/requests", { kind: "worked-with", body: "x", contactId: person.contactId, roleLinkId: person.linkId });
    expect(gone.status).toBe(404);
    expect(gone.body.error).toBe("role-link-missing");
  });

  it("puts a confirmation in the role's history", () => {
    const years = roleHistory(
      {
        id: "r",
        kind: "job",
        title: "Technician",
        organization: "Giants Direct",
        locationLabel: "",
        startDate: "2024-06-01",
        endDate: "",
        isCurrent: true,
        description: "",
        achievements: [],
        factId: null,
        factVersion: null,
        evidenceIds: [],
        claims: [],
        locations: [],
        media: [],
        linkedEvidence: [],
        details: {} as never,
        people: [
          {
            linkId: "l1",
            contactId: "c1",
            name: "Maria Reyes",
            role: "",
            organization: "",
            email: "",
            photoUrl: null,
            note: "",
            since: "",
            confirmation: { requestId: "q1", status: "approved", note: "", answeredAt: "2026-11-20T10:00:00.000Z", answeredFrom: "browser" },
          },
        ],
      },
      { now: new Date(2026, 10, 23) },
    );
    expect(years[0]).toMatchObject({ year: "2026" });
    expect(years[0]!.items).toMatchObject([{ kind: "person", text: "Maria Reyes confirmed you worked together", month: "Nov" }]);
  });
});
