import { describe, expect, it } from "vitest";
import { groupLinkedEvidence, resolveAchievementPin } from "../core/work-map";
import { createApp } from "./app";
import { openDatabase } from "./db";

type Linked = { id: string; title: string; pin: { kind: string; id?: string; statement?: string } | null };
type Role = { id: string; achievements: string[]; achievementIds: string[]; linkedEvidence: Linked[] };

async function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db, {
    pages: {
      fetch: async (url: string) => ({ url, contentType: "text/html", html: "<title>Plant news</title>" }),
    },
  } as never);
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
  const evidence = { url: "https://news.example.com/robots", title: "Robots back on line", kind: "article", credit: "names-me" };
  return { db, send, id, role, evidence };
}

describe("evidence on an achievement", () => {
  it("pins by id and stays attached when the achievement is reworded", async () => {
    const { send, id, role, evidence } = await setup();
    const [first] = (await role()).achievementIds;
    const added = await send("POST", `/api/work-map/roles/${id}/linked-evidence`, { ...evidence, pin: { kind: "achievement", id: first } });
    expect(added.status).toBe(201);
    expect(added.body.linkedEvidence.pin).toEqual({ kind: "achievement", id: first, statement: "Cut robot downtime" });

    await send("PUT", `/api/work-map/roles/${id}`, { achievements: ["Cut robot downtime by a third", "Trained two technicians"] });
    const after = await role();
    expect(after.linkedEvidence[0]!.pin).toEqual({ kind: "achievement", id: first, statement: "Cut robot downtime by a third" });
    const grouped = groupLinkedEvidence(after.achievements, after.linkedEvidence as unknown as Array<{ title: string; pin: null }>, after.achievementIds);
    expect(grouped.achievements[0]!.evidence.map((item) => item.title)).toEqual(["Robots back on line"]);
    expect(grouped.other).toEqual([]);

    // An id that isn't on this role is refused.
    expect((await send("POST", `/api/work-map/roles/${id}/linked-evidence`, { ...evidence, pin: { kind: "achievement", id: "nope" } })).status).toBe(400);
  });

  it("gives an older text-only pin its achievement's id, once", async () => {
    const { db, send, id, role, evidence } = await setup();
    const added = await send("POST", `/api/work-map/roles/${id}/linked-evidence`, { ...evidence, pin: { kind: "achievement", statement: "trained two technicians" } });
    // Pinned by text, as older clients do: it is stored with the id.
    const [, second] = (await role()).achievementIds;
    expect(added.body.linkedEvidence.pin).toEqual({ kind: "achievement", id: second, statement: "Trained two technicians" });

    // A row saved before ids existed is upgraded when read.
    db.prepare("UPDATE work_history_linked_evidence SET pin_json = ? WHERE id = ?").run(
      JSON.stringify({ kind: "achievement", statement: "Trained two technicians" }),
      added.body.linkedEvidence.id,
    );
    expect((await role()).linkedEvidence[0]!.pin).toEqual({ kind: "achievement", id: second, statement: "Trained two technicians" });
    const stored = db.prepare("SELECT pin_json FROM work_history_linked_evidence WHERE id = ?").get(added.body.linkedEvidence.id) as { pin_json: string };
    expect(JSON.parse(stored.pin_json)).toEqual({ kind: "achievement", id: second, statement: "Trained two technicians" });
  });

  it("moves evidence to the role's general evidence when its achievement is removed", async () => {
    const { send, id, role, evidence } = await setup();
    const [first] = (await role()).achievementIds;
    await send("POST", `/api/work-map/roles/${id}/linked-evidence`, { ...evidence, pin: { kind: "achievement", id: first } });
    await send("PUT", `/api/work-map/roles/${id}`, { achievements: ["Trained two technicians"] });
    // The removed line's id is reused by the line that is left, so only a true removal orphans it.
    const after = await role();
    expect(after.achievementIds).toHaveLength(1);
    const pin = after.linkedEvidence[0]!.pin;
    expect(pin === null || pin.id === after.achievementIds[0]).toBe(true);
  });

  it("resolves pins against the role's achievements", () => {
    const achievements = ["Cut downtime", "Trained two"];
    const ids = ["a1", "a2"];
    expect(resolveAchievementPin({ kind: "achievement", id: "a2", statement: "old" }, achievements, ids)).toEqual({ kind: "achievement", id: "a2", statement: "Trained two" });
    expect(resolveAchievementPin({ kind: "achievement", statement: "CUT DOWNTIME" }, achievements, ids)).toEqual({ kind: "achievement", id: "a1", statement: "Cut downtime" });
    expect(resolveAchievementPin({ kind: "achievement", id: "gone", statement: "Cut downtime" }, achievements, ids)).toBeNull();
    // A text pin with nothing matching stays as it was, among the role's general evidence.
    expect(resolveAchievementPin({ kind: "achievement", statement: "Something else" }, achievements, ids)).toEqual({ kind: "achievement", statement: "Something else" });
    expect(resolveAchievementPin({ kind: "event", id: "e1" }, achievements, ids)).toEqual({ kind: "event", id: "e1" });
    expect(resolveAchievementPin(null, achievements, ids)).toBeNull();
  });
});
