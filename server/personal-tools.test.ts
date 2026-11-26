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

  it("adds, renames, and deletes kits, and keeps their tools", async () => {
    const { send, tools } = setup();
    const made = await send("POST", "/api/tools/kits", { name: " Electrical kit " });
    expect(made.status).toBe(201);
    expect(made.body.kit).toMatchObject({ name: "Electrical kit" });
    const kitId = made.body.kit.id;
    await send("POST", "/api/tools", { name: "Meter", kitIds: [kitId] });
    expect((await send("GET", "/api/tools/kits")).body.kits.map((kit: any) => kit.name)).toEqual(["Electrical kit"]);

    const renamed = await send("PUT", `/api/tools/kits/${kitId}`, { name: "Electrical" });
    expect(renamed.body.kit.name).toBe("Electrical");

    expect((await send("DELETE", `/api/tools/kits/${kitId}`)).status).toBe(200);
    expect((await send("GET", "/api/tools/kits")).body.kits).toEqual([]);
    expect((await tools()).map((tool) => [tool.name, tool.kitIds])).toEqual([["Meter", []]]);
    expect((await send("DELETE", `/api/tools/kits/${kitId}`)).status).toBe(404);
  });

  it("renames a kit, and refuses another kit's name", async () => {
    const { send } = setup();
    const a = (await send("POST", "/api/tools/kits", { name: "Electrical" })).body.kit.id;
    await send("POST", "/api/tools/kits", { name: "Truck" });
    expect(await send("POST", "/api/tools/kits", { name: "truck" })).toEqual({ status: 400, body: { error: "kit-name-taken" } });
    expect(await send("PUT", `/api/tools/kits/${a}`, { name: "TRUCK" })).toEqual({ status: 400, body: { error: "kit-name-taken" } });
    expect((await send("PUT", `/api/tools/kits/${a}`, { name: "ELECTRICAL" })).body.kit.name).toBe("ELECTRICAL");
    expect(await send("POST", "/api/tools/kits", { name: " " })).toEqual({ status: 400, body: { error: "kit-name-required" } });
  });

  it("puts a tool in kits and takes it out", async () => {
    const { send } = setup();
    const a = (await send("POST", "/api/tools/kits", { name: "A" })).body.kit.id;
    const b = (await send("POST", "/api/tools/kits", { name: "B" })).body.kit.id;
    const tool = (await send("POST", "/api/tools", { name: "Meter", kitIds: [a, b] })).body.tool;
    expect(tool.kitIds).toEqual([a, b]);
    expect((await send("PUT", `/api/tools/${tool.id}`, { name: "Meter", kitIds: [b] })).body.tool.kitIds).toEqual([b]);
    expect(await send("PUT", `/api/tools/${tool.id}`, { name: "Meter", kitIds: ["gone"] })).toEqual({ status: 400, body: { error: "kit-missing" } });
  });

  it("removing a tool takes it out of its kits", async () => {
    const { send, db } = setup();
    const kit = (await send("POST", "/api/tools/kits", { name: "A" })).body.kit.id;
    const tool = (await send("POST", "/api/tools", { name: "Meter", kitIds: [kit] })).body.tool;
    await send("DELETE", `/api/tools/${tool.id}`);
    expect(db.prepare("SELECT COUNT(*) AS n FROM tool_kit_items").get()).toEqual({ n: 0 });
  });

  it("frames a photo", async () => {
    const { send, photos, png } = setup();
    const tool = (await photos("/api/tools/from-photos", [png("a.png")])).body.tools[0];
    expect(tool.photos[0].framing).toEqual({ rotation: 0, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 });
    const framing = { rotation: 90, flipH: true, flipV: false, zoom: 2, focusX: 30, focusY: 70 };
    const framed = await send("PUT", `/api/tools/${tool.id}/photos/${tool.photos[0].id}/framing`, { framing });
    expect(framed.status).toBe(200);
    expect(framed.body.tool.photos[0].framing).toEqual(framing);
  });

  it("refuses a bad framing", async () => {
    const { send, photos, png } = setup();
    const tool = (await photos("/api/tools/from-photos", [png("a.png")])).body.tools[0];
    const path = `/api/tools/${tool.id}/photos/${tool.photos[0].id}/framing`;
    const bad = { rotation: 45, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 };
    expect(await send("PUT", path, { framing: bad })).toEqual({ status: 400, body: { error: "framing-invalid" } });
    expect(await send("PUT", path, { framing: { ...bad, rotation: 0, zoom: 9 } })).toEqual({ status: 400, body: { error: "framing-invalid" } });
    expect((await send("GET", "/api/tools")).body.tools[0].photos[0].framing.rotation).toBe(0);
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
    const kitId = (await first.send("POST", "/api/tools/kits", { name: "Truck" })).body.kit.id;
    const id = (await first.send("POST", "/api/tools", { name: "Drill", roleIds: [roleId], kitIds: [kitId] })).body.tool.id;
    const photo = (await first.photos(`/api/tools/${id}/photos`, [first.png("a.png")])).body.tool.photos[0];
    const framing = { rotation: 180, flipH: false, flipV: true, zoom: 1.5, focusX: 20, focusY: 40 };
    await first.send("PUT", `/api/tools/${id}/photos/${photo.id}/framing`, { framing });
    const backup = new Uint8Array(await (await first.app.request("/api/portability/export")).arrayBuffer());

    const second = setup();
    const form = new FormData();
    form.append("archive", new File([backup], "docier-backup.zip", { type: "application/zip" }));
    expect((await second.app.request("/api/portability/restore", { method: "POST", body: form })).status).toBe(200);
    const restored = await second.tools();
    expect(restored.map((tool) => [tool.name, tool.roleIds, tool.kitIds])).toEqual([["Drill", [roleId], [kitId]]]);
    expect(restored[0].photos[0].framing).toEqual(framing);
    expect((await second.send("GET", "/api/tools/kits")).body.kits.map((kit: any) => kit.name)).toEqual(["Truck"]);
    const served = await second.app.request(restored[0].photos[0].url);
    expect(served.status).toBe(200);
  });
});

describe("changing many tools at once", () => {
  const bulk = (send: ReturnType<typeof setup>["send"], ids: string[], change: unknown) => send("POST", "/api/tools/bulk", { ids, change });

  it("sets ownership on every picked tool and keeps drafts", async () => {
    const { send, photos, png, tools } = setup();
    const a = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    const draft = (await photos("/api/tools/from-photos", [png("saw.png")])).body.tools[0].id as string;
    const other = (await send("POST", "/api/tools", { name: "Ladder" })).body.tool.id as string;

    const done = await bulk(send, [a, draft], { kind: "ownership", ownership: "borrowed" });
    expect(done.status).toBe(200);
    expect(done.body.tools.map((tool: any) => tool.id).sort()).toEqual([a, draft].sort());
    expect(done.body).toMatchObject({ deleted: [], kit: null });

    const byId = Object.fromEntries((await tools()).map((tool) => [tool.id, tool]));
    expect(byId[a]).toMatchObject({ ownership: "borrowed", draft: false });
    expect(byId[draft]).toMatchObject({ ownership: "borrowed", draft: true, name: "saw" });
    expect(byId[other]).toMatchObject({ ownership: "mine" });
  });

  it("unknown id changes nothing", async () => {
    const { send, tools } = setup();
    const a = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    const refused = await bulk(send, [a, "nope"], { kind: "category", category: "safety" });
    expect(refused).toEqual({ status: 404, body: { error: "not-found" } });
    expect((await tools())[0].category).toBe("tool");
  });

  it("a failure part-way leaves every tool as it was", async () => {
    const { app, db, send, tools } = setup();
    const a = (await send("POST", "/api/tools", { name: "Drill", tags: ["old"] })).body.tool.id as string;
    const b = (await send("POST", "/api/tools", { name: "Saw", tags: ["old"] })).body.tool.id as string;
    // The second tool's write fails inside the transaction.
    db.exec(`CREATE TRIGGER fail_second BEFORE UPDATE ON personal_tools WHEN NEW.id = '${b}' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const failed = await app.request("/api/tools/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [a, b], change: { kind: "addTags", tags: ["new"] } }),
    });
    expect(failed.status).toBe(500);
    db.exec("DROP TRIGGER fail_second");
    expect((await tools()).map((tool) => tool.tags)).toEqual([["old"], ["old"]]);
  });

  it("add to a new kit makes it once", async () => {
    const { send, tools } = setup();
    const a = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    const b = (await send("POST", "/api/tools", { name: "Saw" })).body.tool.id as string;
    const done = await bulk(send, [a, b], { kind: "addKit", newKitName: "Truck toolbox" });
    expect(done.status).toBe(200);
    expect(done.body.kit).toMatchObject({ name: "Truck toolbox" });
    for (const tool of await tools()) expect(tool.kitIds).toEqual([done.body.kit.id]);
    const kits = (await send("GET", "/api/tools/kits")).body.kits as any[];
    expect(kits.filter((kit) => kit.name === "Truck toolbox")).toHaveLength(1);

    const out = await bulk(send, [a], { kind: "removeKit", kitId: done.body.kit.id });
    expect(out.body.tools[0].kitIds).toEqual([]);
  });

  it("delete removes rows and files", async () => {
    const { db, send, photos, png, tools, files, addRole } = setup();
    const roleId = await addRole("Technician");
    const kit = (await send("POST", "/api/tools/kits", { name: "Van" })).body.kit.id as string;
    const a = (await send("POST", "/api/tools", { name: "Drill", roleIds: [roleId], kitIds: [kit] })).body.tool.id as string;
    await photos(`/api/tools/${a}/photos`, [png("drill.png")]);
    const keep = (await send("POST", "/api/tools", { name: "Saw" })).body.tool.id as string;
    expect(files()).toHaveLength(1);

    const done = await bulk(send, [a], { kind: "delete" });
    expect(done.body).toEqual({ tools: [], deleted: [a], kit: null });
    expect((await tools()).map((tool) => tool.id)).toEqual([keep]);
    expect(files()).toEqual([]);
    for (const table of ["personal_tool_photos", "personal_tool_roles", "tool_kit_items"]) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tool_id = ?`).get(a)).toEqual({ n: 0 });
    }
  });

  it("refuses an empty pick", async () => {
    const { send } = setup();
    expect(await bulk(send, [], { kind: "delete" })).toEqual({ status: 400, body: { error: "bulk-ids" } });
  });
});

describe("duplicating tools and ordering photos", () => {
  it("copies every field, role, kit, and the draft mark", async () => {
    const { send, photos, png, addRole, tools } = setup();
    const roleId = await addRole("Technician");
    const kit = (await send("POST", "/api/tools/kits", { name: "Van" })).body.kit.id as string;
    const draft = (await photos("/api/tools/from-photos", [png("saw.png")])).body.tools[0].id as string;
    const original = (await send("POST", "/api/tools", { name: "Drill", maker: "Makita", serial: "S1", paid: 120, tags: ["Shop"], roleIds: [roleId], kitIds: [kit] }))
      .body.tool;

    const copy = await send("POST", `/api/tools/${original.id}/duplicate`, { photos: false });
    expect(copy.status).toBe(201);
    expect(copy.body.tool).toMatchObject({ name: "Drill (copy)", maker: "Makita", serial: "S1", paid: 120, tags: ["Shop"], roleIds: [roleId], kitIds: [kit], draft: false, photos: [] });
    expect(copy.body.tool.id).not.toBe(original.id);

    const draftCopy = await send("POST", `/api/tools/${draft}/duplicate`, { photos: false });
    expect(draftCopy.body.tool).toMatchObject({ name: "saw (copy)", draft: true });
    expect(await tools()).toHaveLength(4);
  });

  it("copies photos as new files that outlive the original", async () => {
    const { app, send, photos, png, files } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    let tool = (await photos(`/api/tools/${id}/photos`, [png("a.png"), png("b.png")])).body.tool;
    tool = (await send("PUT", `/api/tools/${id}/photos/${tool.photos[1].id}/cover`)).body.tool;
    await send("PUT", `/api/tools/${id}/photos/${tool.photos[0].id}/framing`, { framing: { rotation: 90, flipH: false, flipV: false, zoom: 2, focusX: 10, focusY: 20 } });

    const copy = (await send("POST", `/api/tools/${id}/duplicate`, { photos: true })).body.tool;
    expect(copy.photos).toHaveLength(2);
    expect(copy.photos.map((photo: any) => photo.cover)).toEqual([false, true]);
    expect(copy.photos[0].framing).toMatchObject({ rotation: 90, zoom: 2, focusX: 10, focusY: 20 });
    expect(files()).toHaveLength(4);

    expect((await send("DELETE", `/api/tools/${id}`)).status).toBe(200);
    expect(files()).toHaveLength(2);
    expect((await app.request(copy.photos[0].url)).status).toBe(200);
  });

  it("refuses to duplicate a tool that isn't there", async () => {
    const { send } = setup();
    expect(await send("POST", "/api/tools/nope/duplicate", { photos: true })).toEqual({ status: 404, body: { error: "not-found" } });
  });

  it("puts photos in a new order and keeps the cover", async () => {
    const { send, photos, png } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    const tool = (await photos(`/api/tools/${id}/photos`, [png("a.png"), png("b.png"), png("c.png")])).body.tool;
    const [a, b, c] = tool.photos.map((photo: any) => photo.id);
    const moved = await send("PUT", `/api/tools/${id}/photos/order`, { photoIds: [c, a, b] });
    expect(moved.status).toBe(200);
    expect(moved.body.tool.photos.map((photo: any) => [photo.id, photo.cover])).toEqual([[c, false], [a, true], [b, false]]);

    const refused = await send("PUT", `/api/tools/${id}/photos/order`, { photoIds: [a, b] });
    expect(refused).toEqual({ status: 400, body: { error: "photo-order" } });
    expect((await send("GET", "/api/tools")).body.tools[0].photos.map((photo: any) => photo.id)).toEqual([c, a, b]);
  });
});

describe("duplicating with a lost photo file", () => {
  it("says the photo is missing and makes no copy", async () => {
    const { send, photos, png, tools, uploadsDir, files } = setup();
    const id = (await send("POST", "/api/tools", { name: "Drill" })).body.tool.id as string;
    await photos(`/api/tools/${id}/photos`, [png("a.png")]);
    rmSync(join(uploadsDir, files()[0]!));
    expect(await send("POST", `/api/tools/${id}/duplicate`, { photos: true })).toEqual({ status: 400, body: { error: "photo-missing" } });
    expect(await tools()).toHaveLength(1);
  });
});
