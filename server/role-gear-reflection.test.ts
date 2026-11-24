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
  const id = (
    await send("POST", "/api/work-map/roles", { kind: "job", title: "Technician", organization: "Giants Direct", startDate: "2022-03-01", endDate: "2024-01-01" })
  ).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  const shared = async () => (await send("GET", "/api/work-map/preview")).body.snapshot.roles[0];
  await send("PUT", "/api/work-map/settings", { slug: "tech", visibility: "public", sections: ["profile", "history"] });
  return { send, id, role, shared };
}

const GEAR = {
  equipmentItems: [
    { name: "Fluke 87", category: "tool", serial: "SN-SECRET-1", notes: "Calibrated yearly" },
    { name: "Compressor C-204", usage: "worked-on", category: "machine", assetTag: "TAG-9" },
  ],
  uniformItems: [{ item: "Coveralls", color: "Navy", providedBy: "employer" }],
  uniform: "Steel toes.",
  share: { equipment: true, uniform: true },
};

const REFLECTION = {
  workplaceRating: 4,
  ratings: { culture: 5, pay: 2 },
  leaving: { reason: "better-offer", wouldReturn: "maybe" },
  departure: "Took a controls role.",
  commute: { minutes: 25, miles: 12, mode: "driving" },
  environment: "Loud floor, good crew.",
  share: { workplaceRating: true, departure: false, environment: true },
};

describe("a role's gear", () => {
  it("saves equipment and uniform, and publishes only names and the uniform when shared", async () => {
    const { send, id, role, shared } = await setup();
    expect((await send("PUT", `/api/work-map/roles/${id}/gear`, GEAR)).status).toBe(200);
    const details = (await role()).details;
    expect(details.equipmentItems).toHaveLength(2);
    expect(details.equipment).toEqual(["Fluke 87", "Compressor C-204"]);
    const page = await shared();
    expect(page.equipment).toEqual(["Fluke 87", "Compressor C-204"]);
    expect(page.uniform).toBe("Navy Coveralls (provided). Steel toes.");
    for (const secret of ["SN-SECRET-1", "TAG-9", "Calibrated"]) expect(JSON.stringify(page)).not.toContain(secret);
    expect((await send("PUT", `/api/work-map/roles/${id}/gear`, { equipmentItems: [{ name: "" }] })).body.error).toBe("equipment-name-required");
  });

  it("keeps item details when the older form saves names", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/gear`, GEAR);
    await send("PUT", `/api/work-map/roles/${id}/details`, { equipment: ["Fluke 87", "Forklift"] });
    const items = (await role()).details.equipmentItems;
    expect(items.map((item: { name: string }) => item.name)).toEqual(["Fluke 87", "Forklift"]);
    expect(items[0].serial).toBe("SN-SECRET-1");
  });

  it("records gear changes in Edits, and they can be undone", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/gear`, GEAR);
    const [edit] = (await role()).edits;
    expect(edit.summary).toBe("Changed uniform notes; Added a uniform item: Coveralls; and 3 more");
    await send("POST", `/api/work-map/roles/${id}/edits/${edit.id}/undo`);
    expect((await role()).details.equipmentItems).toEqual([]);
  });
});

describe("a role in hindsight", () => {
  it("saves ratings, leaving, commute, and environment, and publishes only what's shared", async () => {
    const { send, id, role, shared } = await setup();
    expect((await send("PUT", `/api/work-map/roles/${id}/reflection`, REFLECTION)).status).toBe(200);
    const details = (await role()).details;
    expect(details.ratings).toEqual({ culture: 5, growth: null, pay: 2, balance: null, management: null });
    expect(details.leaving).toEqual({ reason: "better-offer", wouldReturn: "maybe" });
    expect(details.commute).toEqual({ minutes: 25, miles: 12, mode: "driving" });
    const page = await shared();
    expect(page.workplaceRating).toBe(4);
    expect(page.environment).toBe("Loud floor, good crew.");
    expect(page.departure).toBeUndefined();
    for (const secret of ["better-offer", "maybe", "driving", "Took a controls"]) expect(JSON.stringify(page)).not.toContain(secret);
    expect((await send("PUT", `/api/work-map/roles/${id}/reflection`, { workplaceRating: 9 })).body.error).toBe("rating-invalid");
  });
});
