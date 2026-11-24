import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Role = { id: string; achievements: string[]; achievementIds: string[]; achievementDates: string[] };

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
});
