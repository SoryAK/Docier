import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

function setup() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "docier-tools-"));
  const app = createApp(db, { uploadsDir });
  cleanups.push(() => {
    db.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  });
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const photos = async (path: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("photos", file);
    const response = await app.request(path, { method: "POST", body: form });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const png = (name: string) => new File([PNG], name, { type: "image/png" });
  const addRole = async (title: string) =>
    (await send("POST", "/api/work-map/roles", { kind: "job", title, organization: "Giants Direct", startDate: "2024-06-01" })).body.role
      .id as string;
  const tools = async () => (await send("GET", "/api/tools")).body.tools as any[];
  const files = () => readdirSync(uploadsDir);
  return { app, db, send, photos, png, addRole, tools, files, uploadsDir };
}

describe("my tools", () => {
  it("adds, reads, changes, and removes a tool", async () => {
    const { send, addRole, tools } = setup();
    const roleId = await addRole("Technician");
    const added = await send("POST", "/api/tools", { name: "Fluke 87V", maker: "Fluke", roleIds: [roleId] });
    expect(added.status).toBe(201);
    expect(added.body.tool).toMatchObject({ name: "Fluke 87V", maker: "Fluke", draft: false, roleIds: [roleId], photos: [] });
    expect((await tools()).map((tool) => tool.id)).toEqual([added.body.tool.id]);

    const changed = await send("PUT", `/api/tools/${added.body.tool.id}`, { name: "Fluke 87V meter", roleIds: [] });
    expect(changed.status).toBe(200);
    expect(changed.body.tool).toMatchObject({ name: "Fluke 87V meter", maker: "", roleIds: [] });

    expect((await send("DELETE", `/api/tools/${added.body.tool.id}`)).status).toBe(200);
    expect(await tools()).toEqual([]);
  });

  it("refuses a bad tool", async () => {
    const { send } = setup();
    expect(await send("POST", "/api/tools", { name: "" })).toEqual({ status: 400, body: { error: "name-required" } });
    expect((await send("PUT", "/api/tools/nope", { name: "A" })).status).toBe(404);
    expect((await send("DELETE", "/api/tools/nope")).status).toBe(404);
  });

  it("adds drafts from photos", async () => {
    const { app, photos, png } = setup();
    const made = await photos("/api/tools/from-photos", [png("IMG_1.png"), png("IMG_2.png")]);
    expect(made.status).toBe(201);
    expect(made.body.skipped).toEqual([]);
    expect(made.body.tools.map((tool: any) => [tool.name, tool.draft, tool.photos.length, tool.photos[0].cover])).toEqual([
      ["IMG_1", true, 1, true],
      ["IMG_2", true, 1, true],
    ]);
    const served = await app.request(made.body.tools[0].photos[0].url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
  });

  it("skips files that aren't photos", async () => {
    const { photos, png, files } = setup();
    const made = await photos("/api/tools/from-photos", [png("drill.png"), new File(["hello"], "notes.txt", { type: "text/plain" })]);
    expect(made.status).toBe(201);
    expect(made.body.tools).toHaveLength(1);
    expect(made.body.skipped).toEqual([{ name: "notes.txt", error: "photo-type" }]);
    expect(files()).toHaveLength(1);
  });

  it("saving a draft clears it", async () => {
    const { send, photos, png } = setup();
    const draft = (await photos("/api/tools/from-photos", [png("IMG_9.png")])).body.tools[0];
    const saved = await send("PUT", `/api/tools/${draft.id}`, { name: "Cordless drill" });
    expect(saved.body.tool).toMatchObject({ draft: false, name: "Cordless drill" });
    expect(saved.body.tool.photos).toHaveLength(1);
  });

  it("the next photo becomes the cover", async () => {
    const { send, photos, png } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id;
    const added = await photos(`/api/tools/${id}/photos`, [png("a.png"), png("b.png"), png("c.png")]);
    expect(added.status).toBe(201);
    const [first, , third] = added.body.tool.photos;
    expect(added.body.tool.photos.map((photo: any) => photo.cover)).toEqual([true, false, false]);

    const covered = await send("PUT", `/api/tools/${id}/photos/${third.id}/cover`);
    expect(covered.body.tool.photos.map((photo: any) => photo.cover)).toEqual([false, false, true]);

    const removed = await send("DELETE", `/api/tools/${id}/photos/${third.id}`);
    expect(removed.body.tool.photos.map((photo: any) => [photo.id === first.id, photo.cover])).toEqual([
      [true, true],
      [false, false],
    ]);
    for (const photo of removed.body.tool.photos) await send("DELETE", `/api/tools/${id}/photos/${photo.id}`);
    expect((await send("GET", "/api/tools")).body.tools[0].photos).toEqual([]);
  });

  it("takes ordinary phone photos, and names a photo that's too large", async () => {
    const { photos, files } = setup();
    const big = (name: string, bytes: number) => {
      const data = new Uint8Array(bytes);
      data.set(PNG);
      return new File([data], name, { type: "image/png" });
    };
    const made = await photos("/api/tools/from-photos", [big("phone.png", 3 * 1024 * 1024), big("huge.png", 6 * 1024 * 1024)]);
    expect(made.status).toBe(201);
    expect(made.body.tools.map((tool: any) => tool.name)).toEqual(["phone"]);
    expect(made.body.skipped).toEqual([{ name: "huge.png", error: "photo-too-large" }]);
    expect(files()).toHaveLength(1);
  });

  it("takes a 3 MB photo on a tool", async () => {
    const { send, photos } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id;
    const data = new Uint8Array(3 * 1024 * 1024);
    data.set(PNG);
    expect((await photos(`/api/tools/${id}/photos`, [new File([data], "a.png", { type: "image/png" })])).status).toBe(201);
  });

  it("serves only photos, and never lets the browser guess the type", async () => {
    const { app, db, photos, png } = setup();
    const tool = (await photos("/api/tools/from-photos", [png("a.png")])).body.tools[0];
    const ok = await app.request(tool.photos[0].url);
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    db.prepare("UPDATE personal_tool_photos SET media_type = 'text/html'").run();
    expect((await app.request(tool.photos[0].url)).status).toBe(404);
  });

  it("refuses a 21st photo", async () => {
    const { send, photos, png } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id;
    const twenty = Array.from({ length: 20 }, (_, index) => png(`p${index}.png`));
    expect((await photos(`/api/tools/${id}/photos`, twenty)).status).toBe(201);
    expect(await photos(`/api/tools/${id}/photos`, [png("one-more.png")])).toEqual({ status: 400, body: { error: "photo-limit" } });
  });

  it("removing a tool removes its photo files", async () => {
    const { send, photos, png, files } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id;
    await photos(`/api/tools/${id}/photos`, [png("a.png"), png("b.png")]);
    expect(files()).toHaveLength(2);
    await send("DELETE", `/api/tools/${id}`);
    expect(files()).toEqual([]);
  });

  it("a deleted role comes off its tools", async () => {
    const { send, addRole, tools } = setup();
    const roleId = await addRole("Technician");
    await send("POST", "/api/tools", { name: "Drill", roleIds: [roleId] });
    expect((await send("DELETE", `/api/work-map/roles/${roleId}`)).status).toBe(200);
    expect((await tools()).map((tool) => [tool.name, tool.roleIds])).toEqual([["Drill", []]]);
  });

  it("backups carry tools and their photos", async () => {
    const first = setup();
    const roleId = await first.addRole("Technician");
    const id = (await first.send("POST", "/api/tools", { name: "Drill", roleIds: [roleId] })).body.tool.id;
    await first.photos(`/api/tools/${id}/photos`, [first.png("a.png")]);
    const backup = new Uint8Array(await (await first.app.request("/api/portability/export")).arrayBuffer());

    const second = setup();
    const form = new FormData();
    form.append("archive", new File([backup], "docier-backup.zip", { type: "application/zip" }));
    expect((await second.app.request("/api/portability/restore", { method: "POST", body: form })).status).toBe(200);
    const restored = await second.tools();
    expect(restored.map((tool) => [tool.name, tool.roleIds])).toEqual([["Drill", [roleId]]]);
    const served = await second.app.request(restored[0].photos[0].url);
    expect(served.status).toBe(200);
  });
});
