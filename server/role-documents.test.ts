import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

async function setup() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "docier-role-documents-"));
  const app = createApp(db, { uploadsDir });
  cleanup = () => {
    db.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  };
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const upload = async (path: string, name: string, kind: string, field = "kind") => {
    const form = new FormData();
    form.append("file", new File([`%PDF-1.4 ${name}`], name, { type: "application/pdf" }));
    form.append(field, kind);
    const response = await app.request(path, { method: "POST", body: form });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const addRole = async (title: string) =>
    (await send("POST", "/api/work-map/roles", { kind: "job", title, organization: "Giants Direct", startDate: "2024-06-01" })).body.role.id as string;
  const role = async (id: string) => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  return { send, upload, addRole, role };
}

describe("documents kept with a role", () => {
  it("adds a new file to Documents and to the role, and records it in Edits", async () => {
    const { send, upload, addRole, role } = await setup();
    const id = await addRole("Technician");
    const added = await upload(`/api/work-map/roles/${id}/documents`, "Benefits 2026.pdf", "benefits");
    expect(added.status).toBe(201);
    const after = await role(id);
    expect(after.documents).toEqual([expect.objectContaining({ name: "Benefits 2026.pdf", kind: "benefits", mediaType: "application/pdf" })]);
    expect(after.edits[0]).toEqual(expect.objectContaining({ area: "documents", summary: "Added a document: Benefits 2026.pdf", canUndo: false }));
    const vault = (await send("GET", "/api/documents")).body.documents as any[];
    expect(vault.map((item) => item.originalName)).toContain("Benefits 2026.pdf");
  });

  it("links one file to two roles, and taking it off one keeps it in Documents and on the other", async () => {
    const { send, upload, addRole, role } = await setup();
    const first = await addRole("Technician");
    const second = await addRole("Technician II");
    const stored = await upload("/api/documents", "Handbook.pdf", "handbook", "category");
    const documentId = stored.body.document.id as string;
    expect((await send("POST", `/api/work-map/roles/${first}/documents`, { documentId })).status).toBe(201);
    expect((await send("POST", `/api/work-map/roles/${second}/documents`, { documentId })).status).toBe(201);
    expect((await send("POST", `/api/work-map/roles/${first}/documents`, { documentId })).status).toBe(409);
    const linkId = (await role(first)).documents[0].linkId;
    expect((await send("DELETE", `/api/work-map/roles/${first}/documents/${linkId}`)).status).toBe(200);
    expect((await role(first)).documents).toEqual([]);
    expect((await role(first)).edits[0].summary).toBe("Took a document off: Handbook.pdf");
    expect((await role(second)).documents).toHaveLength(1);
    expect(((await send("GET", "/api/documents")).body.documents as any[]).some((item) => item.id === documentId)).toBe(true);
  });

  it("shows a rename or a new kind made in Documents, and drops the file from every role when it is deleted there", async () => {
    const { send, upload, addRole, role } = await setup();
    const id = await addRole("Technician");
    const documentId = (await upload(`/api/work-map/roles/${id}/documents`, "scan.pdf", "other")).body.document.documentId as string;
    await send("PATCH", `/api/documents/${documentId}`, { name: "Employee handbook", kind: "handbook" });
    expect((await role(id)).documents[0]).toEqual(expect.objectContaining({ name: "Employee handbook", kind: "handbook" }));
    await send("DELETE", `/api/documents/${documentId}`);
    expect((await role(id)).documents).toEqual([]);
  });

  it("refuses a file that isn't in Documents and an unknown kind", async () => {
    const { send, upload, addRole } = await setup();
    const id = await addRole("Technician");
    expect((await send("POST", `/api/work-map/roles/${id}/documents`, { documentId: "nope" })).status).toBe(404);
    expect((await upload(`/api/work-map/roles/${id}/documents`, "x.pdf", "secret-plans")).status).toBe(400);
  });

  it("keeps documents off the public page", async () => {
    const { send, upload, addRole } = await setup();
    const id = await addRole("Technician");
    await upload(`/api/work-map/roles/${id}/documents`, "Pay stub March.pdf", "pay-stub");
    const preview = await send("GET", "/api/work-map/preview");
    expect(JSON.stringify(preview.body)).not.toContain("Pay stub March");
  });
});
