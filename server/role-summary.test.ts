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
  const id = (await send("POST", "/api/work-map/roles", { kind: "job", title: "Technician", organization: "Giants Direct", startDate: "2024-06-01" })).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  return { send, id, role };
}

describe("a role's summary line", () => {
  it("is added, changed, and cleared from the role's settings, each recorded in Edits and undoable", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/details`, { summary: "  Kept the robots running.  " });
    expect((await role()).details.summary).toBe("Kept the robots running.");
    await send("PUT", `/api/work-map/roles/${id}/details`, { summary: "Maintained pick-and-place robots." });
    await send("PUT", `/api/work-map/roles/${id}/details`, { summary: "" });
    const after = await role();
    expect(after.details.summary).toBe("");
    expect(after.edits[0]).toEqual(expect.objectContaining({ summary: "Changed the summary", canUndo: true }));
    await send("POST", `/api/work-map/roles/${id}/edits/${after.edits[0].id}/undo`);
    expect((await role()).details.summary).toBe("Maintained pick-and-place robots.");
  });

  it("leaves the other details as they were", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/links`, { website: "giantdirect.com" });
    await send("PUT", `/api/work-map/roles/${id}/details`, { summary: "One line." });
    expect((await role()).details.website).toBe("https://giantdirect.com");
  });
});
