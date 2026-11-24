import { describe, expect, it } from "vitest";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { RequestRelay } from "./requests";

const ORIGIN = "https://relay.sory.test";

type Person = { name: string; role: string; organization: string; confirmation: Record<string, unknown> | null };

/** Sory's Docier and Relay, and Maria's own Docier, which can reach Sory's Relay only through the link. */
async function setup() {
  const relayApp = createRelayApp(openRelayDatabase(":memory:"), "owner-secret");
  const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
  const requestRelay: RequestRelay = {
    async putAsk(hash, ask) {
      const response = await relayApp.request(`/relay/asks/${hash}`, { method: "PUT", headers: owner, body: JSON.stringify(ask) });
      if (!response.ok) throw new Error(`put ${response.status}`);
    },
    async withdrawAsk(hash) {
      await relayApp.request(`/relay/asks/${hash}`, { method: "DELETE", headers: owner });
    },
    async forgetJoin(hash) {
      await relayApp.request(`/relay/asks/${hash}/join`, { method: "DELETE", headers: owner });
    },
    async inbound() {
      return [];
    },
    async askStates(hashes) {
      const response = await relayApp.request("/relay/asks/states", { method: "POST", headers: owner, body: JSON.stringify({ hashes }) });
      return ((await response.json()) as { states: Awaited<ReturnType<RequestRelay["askStates"]>> }).states;
    },
  };
  // Maria's Docier reaches the link over the web; here the web is Sory's Relay.
  const askFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== ORIGIN) throw new Error("unreachable");
    return relayApp.request(url.pathname, init);
  }) as typeof fetch;

  const sory = createApp(openDatabase(":memory:"), { requestRelay, relayPublicOrigin: ORIGIN });
  const maria = createApp(openDatabase(":memory:"), { askFetch });
  const call = (app: ReturnType<typeof createApp>) => async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const asSory = call(sory);
  const asMaria = call(maria);

  await asSory("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba", headline: "Controls technician" });
  const soryRole = (
    await asSory("POST", "/api/work-map/roles", { kind: "job", title: "Mechatronics Technician", organization: "Giants Direct", startDate: "2024-06-01", isCurrent: true })
  ).body.role.id as string;
  const mariaOnSory = (
    await asSory("POST", `/api/work-map/roles/${soryRole}/people`, { contact: { name: "Maria Reyes", email: "maria@example.com" } })
  ).body.person as { linkId: string; contactId: string };

  await asMaria("PUT", "/api/profile", { firstName: "Maria", lastName: "Reyes", fullName: "Maria Reyes", headline: "Robotics technician" });
  const mariaRole = (
    await asMaria("POST", "/api/work-map/roles", { kind: "job", title: "Swisslog Robotics Technician", organization: "giants direct", startDate: "2022-03-01", isCurrent: true })
  ).body.role.id as string;
  const mariaOther = (
    await asMaria("POST", "/api/work-map/roles", { kind: "job", title: "Line lead", organization: "Sharp Packaging", startDate: "2019-01-01", endDate: "2022-02-01" })
  ).body.role.id as string;

  const ask = async () =>
    (
      await asSory("POST", "/api/requests", {
        kind: "worked-with",
        body: "Could you confirm we worked together at Giants Direct?",
        contactId: mariaOnSory.contactId,
        roleLinkId: mariaOnSory.linkId,
      })
    ).body.request as { id: string; link: string };
  const peopleOn = async (as: typeof asSory, roleId: string) =>
    ((await as("GET", "/api/work-map")).body.roles as Array<{ id: string; people: Person[] }>).find((role) => role.id === roleId)!.people;
  return { asSory, asMaria, soryRole, mariaRole, mariaOther, ask, peopleOn };
}

describe("confirming you worked together, both ways", () => {
  it("reads a request from its link, suggesting the role at the same company", async () => {
    const { asMaria, ask, mariaRole } = await setup();
    const { link } = await ask();
    const read = await asMaria("POST", "/api/received-asks/read", { link });
    expect(read.status).toBe(200);
    expect(read.body.ask).toMatchObject({
      kind: "worked-with",
      fromName: "Sory Kaba",
      fromHeadline: "Controls technician",
      role: { organization: "Giants Direct", title: "Mechatronics Technician", period: "Jun 2024 – Present" },
      status: "open",
    });
    expect(read.body.suggestedRoleIds).toEqual([mariaRole]);
  });

  it("records the confirmation on both sides", async () => {
    const { asSory, asMaria, ask, soryRole, mariaRole, peopleOn } = await setup();
    const { link } = await ask();
    const answered = await asMaria("POST", "/api/received-asks/answer", {
      link,
      decision: "approved",
      note: "Glad to. Sory ran the night shift robots.",
      roleId: mariaRole,
      share: { email: "maria@example.com" },
    });
    expect(answered.status).toBe(200);

    // Maria's side: Sory is in her network, on her Giants Direct role, confirmed.
    const onMaria = await peopleOn(asMaria, mariaRole);
    expect(onMaria).toHaveLength(1);
    expect(onMaria[0]).toMatchObject({
      name: "Sory Kaba",
      role: "Controls technician",
      organization: "giants direct",
      confirmation: { status: "approved", answeredFrom: "docier", direction: "received" },
    });

    // Sory's side: Maria confirmed from her Docier, so both ways.
    await asSory("GET", "/api/requests");
    const onSory = await peopleOn(asSory, soryRole);
    expect(onSory[0]).toMatchObject({
      name: "Maria Reyes",
      role: "Swisslog Robotics Technician",
      confirmation: { status: "approved", answeredFrom: "docier", direction: "sent", note: "Glad to. Sory ran the night shift robots." },
    });

    // It can't be answered twice, from Docier or the page.
    expect((await asMaria("POST", "/api/received-asks/answer", { link, decision: "approved", roleId: mariaRole })).status).toBe(409);
  });

  it("records nothing on Maria's side when she declines", async () => {
    const { asSory, asMaria, ask, soryRole, mariaRole, peopleOn } = await setup();
    const { link } = await ask();
    expect((await asMaria("POST", "/api/received-asks/answer", { link, decision: "declined", note: "Different team." })).status).toBe(200);
    expect(await peopleOn(asMaria, mariaRole)).toEqual([]);
    expect(((await asMaria("GET", "/api/career-management")).body.contacts as unknown[]).length).toBe(0);
    await asSory("GET", "/api/requests");
    expect((await peopleOn(asSory, soryRole))[0]!.confirmation).toMatchObject({ status: "declined", answeredFrom: "docier" });
  });

  it("refuses links that aren't request links, roles that aren't yours, and confirming without a role", async () => {
    const { asMaria, ask } = await setup();
    const { link } = await ask();
    expect((await asMaria("POST", "/api/received-asks/read", { link: "https://example.com/somewhere" })).body.error).toBe("link-invalid");
    expect((await asMaria("POST", "/api/received-asks/read", { link: "http://relay.sory.test/q/abc" })).body.error).toBe("link-invalid");
    expect((await asMaria("POST", "/api/received-asks/answer", { link, decision: "approved" })).body.error).toBe("role-required");
    expect((await asMaria("POST", "/api/received-asks/answer", { link, decision: "approved", roleId: "nope" })).status).toBe(404);
  });

  it("links to the same contact again rather than adding Sory twice", async () => {
    const { asMaria, ask, mariaRole, mariaOther, peopleOn } = await setup();
    await asMaria("POST", "/api/contacts", { name: "Sory Kaba", organization: "Giants Direct" });
    const first = await ask();
    await asMaria("POST", "/api/received-asks/answer", { link: first.link, decision: "approved", roleId: mariaRole });
    expect(((await asMaria("GET", "/api/career-management")).body.contacts as unknown[]).length).toBe(1);
    expect((await peopleOn(asMaria, mariaRole))[0]!.name).toBe("Sory Kaba");
    expect(await peopleOn(asMaria, mariaOther)).toEqual([]);
  });
});
