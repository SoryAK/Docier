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

describe("pay under a role's name", () => {
  it("is off until it is turned on, records each change in Edits, and can be undone", async () => {
    const { send, id, role } = await setup();
    expect((await role()).details.glance).toEqual({ pay: false });
    const saved = await send("PUT", `/api/work-map/roles/${id}/glance`, { pay: true });
    expect(saved.status).toBe(200);
    const after = await role();
    expect(after.details.glance).toEqual({ pay: true });
    const [edit] = after.edits;
    expect(edit.summary).toBe("Showed pay under the name");
    await send("PUT", `/api/work-map/roles/${id}/glance`, { pay: false });
    expect((await role()).edits[0].summary).toBe("Hid pay under the name");
    await send("POST", `/api/work-map/roles/${id}/edits/${(await role()).edits[0].id}/undo`);
    expect((await role()).details.glance).toEqual({ pay: true });
  });

  it("stays on when the pay itself is saved again", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/glance`, { pay: true });
    await send("PUT", `/api/work-map/roles/${id}/pay`, { compensation: { amount: 31.5, payType: "hourly" } });
    expect((await role()).details.glance).toEqual({ pay: true });
  });

  it("refuses anything but on or off", async () => {
    const { send, id } = await setup();
    expect((await send("PUT", `/api/work-map/roles/${id}/glance`, { pay: "yes" })).status).toBe(400);
  });
});
