import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Person = { linkId: string; contactId: string; name: string; role: string; organization: string; note: string; since: string };
type Role = { id: string; organization: string; people?: Person[]; details: { colleagues: unknown[] } };

async function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const json = async (path: string, method = "GET", body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const role = async (organization: string) =>
    ((await json("/api/work-map/roles", "POST", { kind: "job", title: "Technician", organization, startDate: "2024-06-01", isCurrent: true })).body.role as Role).id;
  const roles = async () => ((await json("/api/work-map")).body.roles as Role[]);
  return { db, json, role, roles };
}

describe("people on a role", () => {
  it("adds a new person to My Network and links them to the role, then changes and unlinks them", async () => {
    const { json, role, roles } = await setup();
    const id = await role("Giants Direct");

    const added = await json(`/api/work-map/roles/${id}/people`, "POST", {
      contact: { name: "Maria Reyes", role: "Robotics technician", organization: "Giants Direct", email: "maria@example.com" },
      note: "trained me",
      since: "2024-06",
    });
    expect(added.status).toBe(201);
    const person = added.body.person as Person;
    expect(person).toMatchObject({ name: "Maria Reyes", role: "Robotics technician", note: "trained me", since: "2024-06" });

    // She is in My Network, with the role she is linked to.
    const network = (await json("/api/career-management")).body.contacts as Array<{ id: string; name: string; roles: Array<{ roleId: string }> }>;
    expect(network).toHaveLength(1);
    expect(network[0]).toMatchObject({ id: person.contactId, name: "Maria Reyes" });
    expect(network[0]!.roles.map((item) => item.roleId)).toEqual([id]);

    // The role lists her.
    expect((await roles()).find((item) => item.id === id)?.people?.map((item) => item.name)).toEqual(["Maria Reyes"]);

    // The link's note and month change; a bad month is refused.
    const changed = await json(`/api/work-map/roles/${id}/people/${person.linkId}`, "PUT", { note: "my supervisor", since: "2025-01" });
    expect(changed.body.person).toMatchObject({ note: "my supervisor", since: "2025-01" });
    expect((await json(`/api/work-map/roles/${id}/people/${person.linkId}`, "PUT", { since: "soon" })).status).toBe(400);

    // Unlinking keeps her in My Network.
    expect((await json(`/api/work-map/roles/${id}/people/${person.linkId}`, "DELETE")).status).toBe(200);
    expect((await roles()).find((item) => item.id === id)?.people).toEqual([]);
    expect(((await json("/api/career-management")).body.contacts as unknown[]).length).toBe(1);
  });

  it("links someone already in My Network, once per role", async () => {
    const { json, role } = await setup();
    const first = await role("Giants Direct");
    const second = await role("Giants Direct");
    const contact = (await json("/api/contacts", "POST", { name: "Dan Kim" })).body.contact as { id: string };

    expect((await json(`/api/work-map/roles/${first}/people`, "POST", { contactId: contact.id })).status).toBe(201);
    expect((await json(`/api/work-map/roles/${second}/people`, "POST", { contactId: contact.id })).status).toBe(201);
    const again = await json(`/api/work-map/roles/${first}/people`, "POST", { contactId: contact.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already-linked");
    expect((await json(`/api/work-map/roles/${first}/people`, "POST", { contactId: "nobody" })).status).toBe(404);
    expect((await json(`/api/work-map/roles/${first}/people`, "POST", { contact: { name: " " } })).status).toBe(400);
  });

  it("drops the links when the role or the person is removed", async () => {
    const { db, json, role, roles } = await setup();
    const kept = await role("Giants Direct");
    const gone = await role("Sharp Packaging");
    const maria = ((await json(`/api/work-map/roles/${kept}/people`, "POST", { contact: { name: "Maria" } })).body.person as Person).contactId;
    await json(`/api/work-map/roles/${gone}/people`, "POST", { contactId: maria });

    await json(`/api/work-map/roles/${gone}`, "DELETE");
    expect((db.prepare("SELECT COUNT(*) AS n FROM role_contacts").get() as { n: number }).n).toBe(1);

    await json(`/api/contacts/${maria}`, "DELETE");
    expect((await roles()).find((item) => item.id === kept)?.people).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) AS n FROM role_contacts").get() as { n: number }).n).toBe(0);
  });

  it("moves old 'worked with' entries into My Network once, linked to their role", async () => {
    const { json, role, roles } = await setup();
    const id = await role("Giants Direct");
    await json(`/api/work-map/roles/${id}/details`, "PUT", {
      colleagues: [
        { id: "x", name: "Maria Reyes", title: "Technician", note: "trained me", url: "" },
        { id: "y", name: "", title: "", note: "", url: "" },
      ],
    });

    const first = (await roles()).find((item) => item.id === id)!;
    expect(first.people?.map((item) => [item.name, item.role, item.organization, item.note])).toEqual([
      ["Maria Reyes", "Technician", "Giants Direct", "trained me"],
    ]);
    expect(first.details.colleagues).toEqual([]);
    // Reading again does not add her twice.
    await roles();
    expect(((await json("/api/career-management")).body.contacts as unknown[]).length).toBe(1);
  });
});
