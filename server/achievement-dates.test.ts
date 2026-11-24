import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Links = { people: string[]; moments: string[]; places: string[]; skills: string[] };
type Role = {
  id: string;
  achievements: string[];
  achievementIds: string[];
  achievementDates: string[];
  achievementLinks: Links[];
  people: Array<{ linkId: string }>;
  locations: Array<{ id: string }>;
  details: { milestones: Array<{ id: string }>; events: Array<{ id: string }> };
};

async function setup() {
  const app = createApp(openDatabase(":memory:"));
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const id = (
    await send("POST", "/api/work-map/roles", {
      kind: "job",
      title: "Technician",
      organization: "Giants Direct",
      startDate: "2024-06-01",
      isCurrent: true,
      achievements: ["Cut robot downtime", "Trained two technicians"],
    })
  ).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as Role[]).find((item) => item.id === id)!;
  return { send, id, role };
}

describe("dates on achievements", () => {
  it("starts undated, and takes a month for one achievement", async () => {
    const { send, id, role } = await setup();
    const before = await role();
    expect(before.achievementDates).toEqual(["", ""]);

    const [first] = before.achievementIds;
    const set = await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "2025-04" });
    expect(set.status).toBe(200);
    expect((await role()).achievementDates).toEqual(["2025-04", ""]);

    // Clearing it, and refusing what isn't a month or an achievement on this role.
    expect((await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "soon" })).status).toBe(400);
    expect((await send("PUT", `/api/work-map/roles/${id}/achievements/nope`, { date: "2025-04" })).status).toBe(404);
    await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "" });
    expect((await role()).achievementDates).toEqual(["", ""]);
  });

  it("keeps the month when the role is edited and the achievement reworded", async () => {
    const { send, id, role } = await setup();
    const [first] = (await role()).achievementIds;
    await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "2025-04" });
    await send("PUT", `/api/work-map/roles/${id}`, {
      title: "Technician",
      organization: "Giants Direct",
      startDate: "2024-06-01",
      isCurrent: true,
      achievements: ["Trained two technicians", "Cut robot downtime by a third"],
    });
    const after = await role();
    expect(after.achievements).toEqual(["Trained two technicians", "Cut robot downtime by a third"]);
    expect(after.achievementDates).toEqual(["", "2025-04"]);
    expect(after.achievementIds[1]).toBe(first);
  });

  it("links an achievement to people, events, places, and skills on its role", async () => {
    const { send, id, role } = await setup();
    const person = (await send("POST", `/api/work-map/roles/${id}/people`, { contact: { name: "Maria Reyes" } })).body.person as { linkId: string };
    await send("PUT", `/api/work-map/roles/${id}/details`, {
      events: [{ id: "e1", date: "2025-11", title: "Peak season", detail: "", isPublic: true }],
      milestones: [{ id: "m1", date: "2025-02", title: "Certified", detail: "", isPublic: true }],
    });
    const site = (
      await send("POST", `/api/work-map/roles/${id}/locations`, { label: "Lancaster DC", kind: "site", latitude: 40.03, longitude: -76.3 })
    ).body;
    const siteId = (site.location ?? site).id as string;
    const before = await role();
    expect(before.achievementLinks).toEqual([
      { people: [], moments: [], places: [], skills: [] },
      { people: [], moments: [], places: [], skills: [] },
    ]);
    const [first] = before.achievementIds;

    const linked = await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, {
      links: { people: [person.linkId], moments: ["e1", "m1"], places: [siteId], skills: ["PLC troubleshooting"] },
    });
    expect(linked.status).toBe(200);
    const after = await role();
    expect(after.achievementLinks[0]).toEqual({ people: [person.linkId], moments: ["e1", "m1"], places: [siteId], skills: ["PLC troubleshooting"] });
    // Changing links leaves the date alone, and the other way round.
    await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "2025-04" });
    expect((await role()).achievementLinks[0]!.skills).toEqual(["PLC troubleshooting"]);

    // Only things on this role can be linked.
    for (const links of [{ people: ["nope"] }, { moments: ["nope"] }, { places: ["nope"] }]) {
      const refused = await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { links });
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe("link-missing");
    }
    // Something removed from the role drops out of the achievement's links.
    await send("DELETE", `/api/work-map/roles/${id}/people/${person.linkId}`);
    expect((await role()).achievementLinks[0]!.people).toEqual([]);
  });
});
