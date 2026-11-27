import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { ProjectionRelay, RelayProjection } from "./projections";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function setup() {
  const uploadsDir = mkdtempSync(join(tmpdir(), "career-page-"));
  folders.push(uploadsDir);
  const publish = vi.fn(async (_projection: RelayProjection) => undefined);
  const relay: ProjectionRelay = { publish, revoke: vi.fn(async () => undefined) };
  const db = openDatabase(":memory:");
  const app = createApp(db, { relay, uploadsDir });
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as any };
  };
  await send("PUT", "/api/profile", { fullName: "Sory Kaba" });
  await send("POST", "/api/history", { experience: [{ company: "Giants Direct", title: "Electrician" }] });
  const roleId = (await send("GET", "/api/work-map")).body.roles[0].id as string;
  const form = new FormData();
  form.append("photo", new File([PNG], "panel.png", { type: "image/png" }));
  const uploaded = await app.request(`/api/work-map/roles/${roleId}/photos`, { method: "POST", body: form });
  const mediaId = ((await uploaded.json()) as { media: { id: string } }).media.id;
  await send("PUT", `/api/work-map/roles/${roleId}/media/${mediaId}`, { isPublic: true });
  const toolId = (await send("POST", "/api/tools", { name: "Drill", skill: 4, serial: "SN-SECRET", roleIds: [roleId], onCareerPage: true })).body.tool
    .id as string;
  const photo = new FormData();
  photo.append("photos", new File([PNG], "drill.png", { type: "image/png" }));
  await app.request(`/api/tools/${toolId}/photos`, { method: "POST", body: photo });
  await send("PUT", "/api/work-map/settings", { slug: "sory", visibility: "unlisted", sections: ["profile", "history", "media", "tools"] });
  return { app, db, send, publish, roleId, mediaId, toolId };
}

describe("tools and photos on the career page", () => {
  it("a new page has Tools among its sections", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {});
    const settings = (await (await app.request("/api/work-map/settings")).json()) as { settings: { sections: string[] } };
    expect(settings.settings.sections).toContain("tools");
  });

  it("previews the chosen tools with local photos for the browser to prepare", async () => {
    const { send, toolId, mediaId } = await setup();
    const preview = (await send("GET", "/api/work-map/preview")).body;
    expect(preview.snapshot.tools).toEqual([
      expect.objectContaining({ id: toolId, name: "Drill", facts: expect.arrayContaining([{ label: "Used at", value: "Giants Direct" }]) }),
    ]);
    expect(preview.snapshot.tools[0].photoUrl).toMatch(/^\/api\/tools\//);
    expect(preview.snapshot.roles[0].media.map((item: { id: string }) => item.id)).toEqual([mediaId]);
    expect(JSON.stringify(preview)).not.toContain("SN-SECRET");
  });

  it("publishes prepared photos and never a local address", async () => {
    const { db, send, publish, toolId, mediaId } = await setup();
    const done = await send("POST", "/api/work-map/publish", { photos: { [`media:${mediaId}`]: JPEG, [`tool:${toolId}`]: JPEG } });
    expect(done.status).toBe(201);
    const sent = publish.mock.calls[0]![0];
    expect(sent.roles[0]!.media.map((item) => item.url)).toEqual([JPEG]);
    expect(sent.tools?.[0]?.photoUrl).toBe(JPEG);
    expect(JSON.stringify(sent)).not.toContain("/api/");
    // The saved snapshot keeps addresses only; the image data lives in the page's one copy.
    const saved = db.prepare("SELECT snapshot_json FROM work_map_snapshots").all() as Array<{ snapshot_json: string }>;
    expect(saved.every((row) => !row.snapshot_json.includes("data:image"))).toBe(true);
    expect((await send("GET", "/api/work-map/relay")).body.relay.state).toBe("current");
  });

  it("without prepared photos, the local ones are left off", async () => {
    const { send, publish } = await setup();
    expect((await send("POST", "/api/work-map/publish")).status).toBe(201);
    const sent = publish.mock.calls[0]![0];
    expect(sent.roles[0]!.media).toEqual([]);
    expect(sent.tools?.[0]?.photoUrl).toBe("");
    expect(JSON.stringify(sent)).not.toContain("/api/");
  });

  it("refuses photos that aren't image data, and sends nothing", async () => {
    const { send, publish, toolId } = await setup();
    const done = await send("POST", "/api/work-map/publish", { photos: { [`tool:${toolId}`]: 7 } });
    expect(done).toEqual({ status: 400, body: { error: "photos-invalid" } });
    expect(publish).not.toHaveBeenCalled();
  });

  it("takes a publish body bigger than ordinary requests", async () => {
    const { app } = await setup();
    const big = `data:image/jpeg;base64,${"A".repeat(3_000_000)}`;
    const response = await app.request("/api/work-map/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photos: { "media:none": big } }),
    });
    expect(response.status).toBe(201);
  });

  it("marks the page changed when a tool comes off it", async () => {
    const { send, toolId } = await setup();
    await send("POST", "/api/work-map/publish", {});
    await send("POST", "/api/tools/bulk", { ids: [toolId], change: { kind: "careerPage", on: false } });
    const relay = (await send("GET", "/api/work-map/relay")).body.relay;
    expect(relay).toMatchObject({ state: "changed", changes: ["Tools updated"] });
  });
});
