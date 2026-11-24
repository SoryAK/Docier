import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Edit = { id: string; area: string; summary: string; canUndo: boolean; blocked: string | null };

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
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  const edits = async () => (await role()).edits as Edit[];
  const undo = (editId: string) => send("POST", `/api/work-map/roles/${id}/edits/${editId}/undo`);
  const base = { title: "Technician", organization: "Giants Direct", startDate: "2024-06-01", isCurrent: true };
  return { send, id, role, edits, undo, base };
}

describe("a role's edits", () => {
  it("records each change, newest first, and nothing for a save that changed nothing", async () => {
    const { send, id, edits, base } = await setup();
    expect(await edits()).toEqual([]);
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", achievements: ["Cut robot downtime", "Trained two technicians"] });
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", achievements: ["Cut robot downtime", "Trained two technicians"] });
    await send("PUT", `/api/work-map/roles/${id}/details`, { notes: [{ id: "n1", date: "2025-01-01", title: "Moved to nights", detail: "", isPublic: false }] });
    const list = await edits();
    expect(list.map((edit) => edit.summary)).toEqual(["Added a note: Moved to nights", "Changed the title to Lead technician"]);
    expect(list.every((edit) => edit.canUndo)).toBe(true);
  });

  it("undoes a change to the role, and the undo can be undone", async () => {
    const { send, id, role, edits, undo, base } = await setup();
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", achievements: ["Cut robot downtime by a third", "Trained two technicians"] });
    const [edit] = await edits();
    expect((await undo(edit!.id)).status).toBe(200);
    const after = await role();
    expect(after.title).toBe("Technician");
    expect(after.achievements).toEqual(["Cut robot downtime", "Trained two technicians"]);

    const list = await edits();
    expect(list[0]!.summary).toBe(`Undid: ${edit!.summary}`);
    expect(list[1]).toMatchObject({ id: edit!.id, canUndo: false, blocked: "undone" });
    // Undoing the undo puts the change back, and the first edit can be undone again.
    await undo(list[0]!.id);
    expect((await role()).title).toBe("Lead technician");
    expect((await edits()).find((item) => item.id === edit!.id)?.canUndo).toBe(true);
  });

  it("keeps an achievement's id, date, and links when its edit is undone", async () => {
    const { send, id, role, edits, undo } = await setup();
    const [first] = (await role()).achievementIds;
    await send("PUT", `/api/work-map/roles/${id}/achievements/${first}`, { date: "2025-04", title: "Less downtime" });
    const [edit] = await edits();
    expect(edit!.summary).toBe("Titled an achievement: Less downtime; Dated an achievement: Less downtime");
    await undo(edit!.id);
    const after = await role();
    expect(after.achievementIds[0]).toBe(first);
    expect(after.achievementDates[0]).toBe("");
    expect(after.achievementTitles[0]).toBe("");
  });

  it("won't undo what has changed since, but other changes don't block it", async () => {
    const { send, id, role, edits, undo, base } = await setup();
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", achievements: ["Cut robot downtime", "Trained two technicians"] });
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", description: "Days.", achievements: ["Cut robot downtime", "Trained two technicians"] });
    const titleEdit = (await edits())[1]!;
    expect(titleEdit.canUndo).toBe(true);
    expect((await undo(titleEdit.id)).status).toBe(200);
    expect((await role()).description).toBe("Days.");

    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Supervisor", achievements: ["Cut robot downtime", "Trained two technicians"] });
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Manager", achievements: ["Cut robot downtime", "Trained two technicians"] });
    const older = (await edits())[1]!;
    expect(older).toMatchObject({ canUndo: false, blocked: "changed-since" });
    expect(await undo(older.id)).toEqual({ status: 409, body: { error: "changed-since" } });
  });

  it("undoes a change to the details, like work setup or a removed note", async () => {
    const { send, id, role, edits, undo } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/details`, { notes: [{ id: "n1", date: "2025-01-01", title: "Moved to nights", detail: "", isPublic: false }] });
    await send("PUT", `/api/work-map/roles/${id}/details`, { notes: [] });
    const [removed] = await edits();
    expect(removed!.summary).toBe("Removed a note: Moved to nights");
    await undo(removed!.id);
    expect((await role()).details.notes.map((note: { title: string }) => note.title)).toEqual(["Moved to nights"]);

    await send("PUT", `/api/work-map/roles/${id}/work-setup`, { schedule: { type: "full-time" }, team: { department: "Maintenance" } });
    const [setupEdit] = await edits();
    expect(setupEdit!.summary).toBe("Changed the schedule; Changed the team");
    await undo(setupEdit!.id);
    const details = (await role()).details;
    expect(details.schedule.type).toBe("");
    expect(details.team.department).toBe("");
  });

  it("logs people, places, photos, and evidence without undo", async () => {
    const { send, id, edits, undo } = await setup();
    const person = (await send("POST", `/api/work-map/roles/${id}/people`, { contact: { name: "Maria Reyes" } })).body.person;
    await send("DELETE", `/api/work-map/roles/${id}/people/${person.linkId}`);
    await send("POST", `/api/work-map/roles/${id}/locations`, { label: "Lancaster DC", kind: "site", latitude: 40.03, longitude: -76.3 });
    const list = await edits();
    expect(list.map((edit) => edit.summary)).toEqual(["Added a place: Lancaster DC", "Removed Maria Reyes", "Added Maria Reyes"]);
    expect(list.every((edit) => edit.blocked === "log-only")).toBe(true);
    expect(await undo(list[0]!.id)).toEqual({ status: 409, body: { error: "log-only" } });
    expect((await undo("nope")).status).toBe(404);
  });

  it("never publishes the record of changes", async () => {
    const { send, id, base } = await setup();
    await send("PUT", "/api/work-map/settings", { slug: "tech", visibility: "public", sections: ["profile", "history"] });
    await send("PUT", `/api/work-map/roles/${id}`, { ...base, title: "Lead technician", achievements: ["Cut robot downtime", "Trained two technicians"] });
    const shared = (await send("GET", "/api/work-map/preview")).body.snapshot.roles[0];
    expect(shared.edits).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain("Changed the title");
  });
});
