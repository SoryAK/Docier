import { describe, expect, it } from "vitest";
import { roleHistory } from "../core/role-history";
import { createApp } from "./app";
import { openDatabase } from "./db";

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
      startDate: "2022-03-01",
      isCurrent: true,
    })
  ).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  return { send, id, role };
}

const SETUP = {
  schedule: { type: "full-time", workMode: "hybrid", daysOnSite: 3, hoursPerWeek: 40, shift: "Every other weekend" },
  shifts: [{ name: "Nights", start: "23:00", end: "07:00" }],
  team: { reportsTo: "Dana Kim", department: "Maintenance", size: 12 },
  skills: ["PLC"],
  skillsGained: ["SAP"],
  promotions: [{ title: "Lead technician", date: "2023-04" }],
  growth: "",
  share: { schedule: false, team: true, growth: true },
};

describe("a role's work setup", () => {
  it("saves, reads back, and changes the whole setup", async () => {
    const { send, id, role } = await setup();
    const saved = await send("PUT", `/api/work-map/roles/${id}/work-setup`, SETUP);
    expect(saved.status).toBe(200);
    const details = (await role()).details;
    expect(details.schedule).toEqual(SETUP.schedule);
    expect(details.shifts).toEqual([{ id: expect.any(String), name: "Nights", start: "23:00", end: "07:00" }]);
    expect(details.team).toEqual(SETUP.team);
    expect(details.share).toMatchObject({ schedule: false, team: true, growth: true });

    // Changing keeps a shift's id; leaving one out removes it.
    const shiftId = details.shifts[0].id;
    await send("PUT", `/api/work-map/roles/${id}/work-setup`, { ...SETUP, shifts: [{ id: shiftId, name: "Overnight", start: "22:00", end: "06:00" }], promotions: [] });
    const after = (await role()).details;
    expect(after.shifts).toEqual([{ id: shiftId, name: "Overnight", start: "22:00", end: "06:00" }]);
    expect(after.promotions).toEqual([]);
  });

  it("refuses a bad setup and a role that isn't there", async () => {
    const { send, id } = await setup();
    const bad = await send("PUT", `/api/work-map/roles/${id}/work-setup`, { ...SETUP, shifts: [{ name: "Nights", start: "late", end: "07:00" }] });
    expect(bad).toEqual({ status: 400, body: { error: "shift-time-invalid" } });
    expect((await send("PUT", "/api/work-map/roles/nope/work-setup", SETUP)).status).toBe(404);
  });

  it("keeps the new fields when the older details form saves", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/work-setup`, SETUP);
    await send("PUT", `/api/work-map/roles/${id}/details`, { schedule: { shift: "Nights", hoursPerWeek: 36, workMode: "hybrid" }, skills: ["PLC"] });
    const details = (await role()).details;
    expect(details.schedule).toEqual({ ...SETUP.schedule, shift: "Nights", hoursPerWeek: 36 });
    expect(details.team).toEqual(SETUP.team);
    expect(details.promotions).toHaveLength(1);
  });

  it("puts promotions in the role's history", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/work-setup`, SETUP);
    const years = roleHistory(await role(), { filter: "all", query: "", order: "oldest", now: new Date("2026-11-23") } as never);
    const texts = years.flatMap((year) => year.items.map((item) => `${item.date} ${item.text}`));
    expect(texts).toContain("2023-04 Promoted to Lead technician");
  });

  it("publishes the team and growth only when shared, and never who you reported to", async () => {
    const { send, id } = await setup();
    await send("PUT", "/api/work-map/settings", { slug: "tech", visibility: "public", sections: ["profile", "history"] });
    await send("PUT", `/api/work-map/roles/${id}/work-setup`, SETUP);
    const shared = (await send("GET", "/api/work-map/preview")).body.snapshot.roles[0];
    expect(shared.team).toEqual({ department: "Maintenance", size: 12 });
    expect(shared.promotions.map((item: { title: string }) => item.title)).toEqual(["Lead technician"]);
    expect(shared.skillsGained).toEqual(["SAP"]);
    expect(shared.schedule).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain("Dana Kim");
    expect(JSON.stringify(shared)).not.toContain("Nights");

    await send("PUT", `/api/work-map/roles/${id}/work-setup`, { ...SETUP, share: { schedule: false, team: false, growth: false } });
    const hidden = (await send("GET", "/api/work-map/preview")).body.snapshot.roles[0];
    expect(hidden.team).toBeUndefined();
    expect(hidden.promotions).toBeUndefined();
  });
});
