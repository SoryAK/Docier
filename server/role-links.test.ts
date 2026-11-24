import { describe, expect, it } from "vitest";
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
  const id = (await send("POST", "/api/work-map/roles", { kind: "job", title: "Technician", organization: "Giants Direct", startDate: "2022-03-01" })).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  return { send, id, role };
}

describe("a role's company links", () => {
  it("saves, changes, and clears all six links, and records each save in Edits", async () => {
    const { send, id, role } = await setup();
    const saved = await send("PUT", `/api/work-map/roles/${id}/links`, { website: "giantdirect.com", linkedin: "https://linkedin.com/company/giant", instagram: "https://instagram.com/giant", facebook: "https://facebook.com/giant", x: "https://x.com/giant", youtube: "https://youtube.com/@giant" });
    expect(saved.status).toBe(200);
    const details = (await role()).details;
    expect(details.website).toBe("https://giantdirect.com");
    expect(details.youtube).toBe("https://youtube.com/@giant");
    await send("PUT", `/api/work-map/roles/${id}/links`, { website: "https://giantdirect.com", linkedin: "", instagram: "", facebook: "", x: "", youtube: "" });
    const after = await role();
    expect(after.details.linkedin).toBe("");
    expect(after.details.x).toBe("");
    const [edit] = after.edits;
    expect(edit.canUndo).toBe(true);
    await send("POST", `/api/work-map/roles/${id}/edits/${edit.id}/undo`);
    expect((await role()).details.x).toBe("https://x.com/giant");
  });

  it("refuses a link that isn't a web link and names the field", async () => {
    const { send, id, role } = await setup();
    const refused = await send("PUT", `/api/work-map/roles/${id}/links`, { website: "https://giantdirect.com", instagram: "not a link" });
    expect(refused.status).toBe(400);
    expect(refused.body).toEqual({ error: "url-invalid", field: "instagram" });
    expect((await role()).details.website).toBe("");
  });

  it("keeps the links off your public page", async () => {
    const { send, id } = await setup();
    await send("PUT", "/api/work-map/settings", { slug: "tech", visibility: "public", sections: ["profile", "history"] });
    await send("PUT", `/api/work-map/roles/${id}/links`, { instagram: "https://instagram.com/giant-secret" });
    const page = (await send("GET", "/api/work-map/preview")).body;
    expect(JSON.stringify(page)).not.toContain("giant-secret");
  });
});
