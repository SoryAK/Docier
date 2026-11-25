import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { avatarExtension, isAvatarType } from "../core/profile";
import {
  TOOL_PHOTO_LIMIT,
  applyBulkChange,
  draftToolName,
  readBulkRequest,
  readKitName,
  readPhotoFraming,
  readToolInput,
  toolPhotoProblem,
  type PersonalTool,
  type PhotoFraming,
  type ToolInput,
  type ToolKit,
  type ToolInputError,
} from "../core/personal-tools";
import { uploadPath } from "./upload-path";

/**
 * My Tools storage: `personal_tools`, their photos (`personal_tool_photos`,
 * files in uploads named here as tool-<uuid>.<ext>, never from input), and the
 * roles each was used on (`personal_tool_roles`).
 */

export type ToolErrorCode =
  | ToolInputError
  | "not-found"
  | "photo-type"
  | "photo-too-large"
  | "photo-empty"
  | "photo-limit"
  | "kit-name-required"
  | "kit-name-taken"
  | "framing-invalid"
  | "bulk-ids"
  | "bulk-too-many"
  | "bulk-change";

export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode) {
    super(code);
  }
}

export type ToolPhotoFile = { name: string; type: string; bytes: Uint8Array };

type ToolRow = {
  id: string;
  name: string;
  category: string;
  ownership: string;
  maker: string;
  model: string;
  serial: string;
  condition: string;
  skill: number | null;
  acquired: string;
  paid: number | null;
  worth: number | null;
  kept_at: string;
  tags: string;
  notes: string;
  draft: number;
  created_at: string;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  tool_id: string;
  stored_name: string;
  media_type: string;
  is_cover: number;
  rotation: number;
  flip_h: number;
  flip_v: number;
  zoom: number;
  focus_x: number;
  focus_y: number;
};

const PHOTO_COLUMNS = "id, tool_id, stored_name, media_type, is_cover, rotation, flip_h, flip_v, zoom, focus_x, focus_y";

function framingOf(photo: PhotoRow): PhotoFraming {
  return {
    rotation: ([0, 90, 180, 270].includes(photo.rotation) ? photo.rotation : 0) as PhotoFraming["rotation"],
    flipH: photo.flip_h === 1,
    flipV: photo.flip_v === 1,
    zoom: photo.zoom,
    focusX: photo.focus_x,
    focusY: photo.focus_y,
  };
}

export function toolPhotoUrl(toolId: string, photoId: string): string {
  return `/api/tools/${encodeURIComponent(toolId)}/photos/${encodeURIComponent(photoId)}`;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function present(row: ToolRow, photos: PhotoRow[], roleIds: string[], kitIds: string[]): PersonalTool {
  return {
    id: row.id,
    name: row.name,
    category: row.category as PersonalTool["category"],
    ownership: row.ownership as PersonalTool["ownership"],
    maker: row.maker,
    model: row.model,
    serial: row.serial,
    condition: row.condition as PersonalTool["condition"],
    skill: row.skill,
    acquired: row.acquired,
    paid: row.paid,
    worth: row.worth,
    keptAt: row.kept_at,
    tags: parseTags(row.tags),
    notes: row.notes,
    draft: row.draft === 1,
    roleIds,
    kitIds,
    photos: photos.map((photo) => ({
      id: photo.id,
      url: toolPhotoUrl(row.id, photo.id),
      cover: photo.is_cover === 1,
      framing: framingOf(photo),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function photoRows(db: DatabaseSync, occupantId: string, toolId?: string): PhotoRow[] {
  const sql = `SELECT ${PHOTO_COLUMNS} FROM personal_tool_photos
    WHERE occupant_id = ?${toolId ? " AND tool_id = ?" : ""} ORDER BY sort_order, rowid`;
  return (toolId ? db.prepare(sql).all(occupantId, toolId) : db.prepare(sql).all(occupantId)) as unknown as PhotoRow[];
}

function roleLinks(db: DatabaseSync, occupantId: string, toolId?: string): Array<{ tool_id: string; role_id: string }> {
  const sql = `SELECT tool_id, role_id FROM personal_tool_roles WHERE occupant_id = ?${toolId ? " AND tool_id = ?" : ""} ORDER BY rowid`;
  return (toolId ? db.prepare(sql).all(occupantId, toolId) : db.prepare(sql).all(occupantId)) as Array<{ tool_id: string; role_id: string }>;
}

function kitLinks(db: DatabaseSync, occupantId: string, toolId?: string): Array<{ tool_id: string; kit_id: string }> {
  const sql = `SELECT tool_id, kit_id FROM tool_kit_items WHERE occupant_id = ?${toolId ? " AND tool_id = ?" : ""} ORDER BY rowid`;
  return (toolId ? db.prepare(sql).all(occupantId, toolId) : db.prepare(sql).all(occupantId)) as Array<{ tool_id: string; kit_id: string }>;
}

export function listTools(db: DatabaseSync, occupantId: string): PersonalTool[] {
  const rows = db
    .prepare("SELECT * FROM personal_tools WHERE occupant_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(occupantId) as unknown as ToolRow[];
  const photos = photoRows(db, occupantId);
  const links = roleLinks(db, occupantId);
  const kits = kitLinks(db, occupantId);
  return rows.map((row) =>
    present(
      row,
      photos.filter((photo) => photo.tool_id === row.id),
      links.filter((link) => link.tool_id === row.id).map((link) => link.role_id),
      kits.filter((link) => link.tool_id === row.id).map((link) => link.kit_id),
    ),
  );
}

export function readTool(db: DatabaseSync, occupantId: string, toolId: string): PersonalTool {
  const row = db.prepare("SELECT * FROM personal_tools WHERE id = ? AND occupant_id = ?").get(toolId, occupantId) as ToolRow | undefined;
  if (!row) throw new ToolError("not-found");
  return present(
    row,
    photoRows(db, occupantId, toolId),
    roleLinks(db, occupantId, toolId).map((link) => link.role_id),
    kitLinks(db, occupantId, toolId).map((link) => link.kit_id),
  );
}

function checkInput(db: DatabaseSync, occupantId: string, raw: unknown): ToolInput {
  const roles = db.prepare("SELECT id FROM work_history WHERE occupant_id = ?").all(occupantId) as Array<{ id: string }>;
  const kits = listKits(db, occupantId);
  const read = readToolInput(raw, new Set(roles.map((role) => role.id)), new Set(kits.map((kit) => kit.id)));
  if (!read.ok) throw new ToolError(read.error);
  return read.value;
}

function writeFields(db: DatabaseSync, occupantId: string, toolId: string, input: ToolInput, now: string) {
  db.prepare(
    `UPDATE personal_tools SET name = ?, category = ?, ownership = ?, maker = ?, model = ?, serial = ?, condition = ?,
       skill = ?, acquired = ?, paid = ?, worth = ?, kept_at = ?, tags = ?, notes = ?, draft = 0, updated_at = ?
     WHERE id = ? AND occupant_id = ?`,
  ).run(
    input.name,
    input.category,
    input.ownership,
    input.maker,
    input.model,
    input.serial,
    input.condition,
    input.skill,
    input.acquired,
    input.paid,
    input.worth,
    input.keptAt,
    JSON.stringify(input.tags),
    input.notes,
    now,
    toolId,
    occupantId,
  );
  db.prepare("DELETE FROM personal_tool_roles WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  const link = db.prepare(
    "INSERT INTO personal_tool_roles (id, occupant_id, tool_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const roleId of input.roleIds) link.run(randomUUID(), occupantId, toolId, roleId, now);
  db.prepare("DELETE FROM tool_kit_items WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  const kit = db.prepare("INSERT INTO tool_kit_items (id, occupant_id, kit_id, tool_id, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const kitId of input.kitIds) kit.run(randomUUID(), occupantId, kitId, toolId, now);
}

function insertTool(db: DatabaseSync, occupantId: string, name: string, draft: boolean, now: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO personal_tools (id, occupant_id, name, category, ownership, draft, created_at, updated_at)
     VALUES (?, ?, ?, 'tool', 'mine', ?, ?, ?)`,
  ).run(id, occupantId, name, draft ? 1 : 0, now, now);
  return id;
}

export function createTool(db: DatabaseSync, occupantId: string, raw: unknown): PersonalTool {
  const input = checkInput(db, occupantId, raw);
  const now = new Date().toISOString();
  const id = insertTool(db, occupantId, input.name, false, now);
  writeFields(db, occupantId, id, input, now);
  return readTool(db, occupantId, id);
}

/** Saves a tool's fields; a draft stops being one. */
export function updateTool(db: DatabaseSync, occupantId: string, toolId: string, raw: unknown): PersonalTool {
  readTool(db, occupantId, toolId);
  const input = checkInput(db, occupantId, raw);
  writeFields(db, occupantId, toolId, input, new Date().toISOString());
  return readTool(db, occupantId, toolId);
}

/** Deletes a photo file; one already gone is fine. A leftover file is harmless once its row is gone. */
function deleteFile(uploadsDir: string, storedName: string) {
  try {
    unlinkSync(uploadPath(uploadsDir, storedName));
  } catch {
    /* already gone, or never ours to delete */
  }
}

/** Deletes a tool's rows and returns its photo files' names, for deleting once the rows are gone for good. */
function deleteToolRows(db: DatabaseSync, occupantId: string, toolId: string): string[] {
  const photos = photoRows(db, occupantId, toolId);
  db.prepare("DELETE FROM personal_tool_photos WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  db.prepare("DELETE FROM personal_tool_roles WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  db.prepare("DELETE FROM tool_kit_items WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  db.prepare("DELETE FROM personal_tools WHERE occupant_id = ? AND id = ?").run(occupantId, toolId);
  return photos.map((photo) => photo.stored_name);
}

export function removeTool(db: DatabaseSync, occupantId: string, uploadsDir: string, toolId: string): void {
  readTool(db, occupantId, toolId);
  for (const storedName of deleteToolRows(db, occupantId, toolId)) deleteFile(uploadsDir, storedName);
}

function photoProblem(file: ToolPhotoFile): ToolErrorCode | null {
  return toolPhotoProblem({ type: file.type, size: file.bytes.byteLength });
}

function storePhoto(db: DatabaseSync, occupantId: string, uploadsDir: string, toolId: string, file: ToolPhotoFile, now: string) {
  mkdirSync(uploadsDir, { recursive: true });
  const storedName = `tool-${randomUUID()}.${avatarExtension(file.type)}`;
  writeFileSync(uploadPath(uploadsDir, storedName), file.bytes);
  const order = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM personal_tool_photos WHERE occupant_id = ? AND tool_id = ?")
    .get(occupantId, toolId) as { next: number };
  db.prepare(
    `INSERT INTO personal_tool_photos (id, occupant_id, tool_id, stored_name, media_type, is_cover, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(randomUUID(), occupantId, toolId, storedName, file.type, order.next, now);
  ensureCover(db, occupantId, toolId);
}

/** A tool with photos always has one cover: the first, unless another was chosen. */
function ensureCover(db: DatabaseSync, occupantId: string, toolId: string) {
  const photos = photoRows(db, occupantId, toolId);
  if (photos.length === 0 || photos.some((photo) => photo.is_cover === 1)) return;
  db.prepare("UPDATE personal_tool_photos SET is_cover = 1 WHERE id = ? AND occupant_id = ?").run(photos[0]!.id, occupantId);
}

/** Adds photos to a tool. Every file is checked first, so a bad one adds nothing. */
export function addToolPhotos(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  toolId: string,
  files: ToolPhotoFile[],
): PersonalTool {
  const tool = readTool(db, occupantId, toolId);
  if (files.length === 0) throw new ToolError("photo-empty");
  if (tool.photos.length + files.length > TOOL_PHOTO_LIMIT) throw new ToolError("photo-limit");
  for (const file of files) {
    const problem = photoProblem(file);
    if (problem) throw new ToolError(problem);
  }
  const now = new Date().toISOString();
  for (const file of files) storePhoto(db, occupantId, uploadsDir, toolId, file, now);
  touch(db, occupantId, toolId, now);
  return readTool(db, occupantId, toolId);
}

/** Each photo becomes a draft tool named after its file. Files that aren't photos are listed back. */
export function toolsFromPhotos(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  files: ToolPhotoFile[],
): { tools: PersonalTool[]; skipped: Array<{ name: string; error: ToolErrorCode }> } {
  const tools: PersonalTool[] = [];
  const skipped: Array<{ name: string; error: ToolErrorCode }> = [];
  for (const file of files) {
    const problem = photoProblem(file);
    if (problem) {
      skipped.push({ name: file.name, error: problem });
      continue;
    }
    const now = new Date().toISOString();
    const id = insertTool(db, occupantId, draftToolName(file.name), true, now);
    storePhoto(db, occupantId, uploadsDir, id, file, now);
    tools.push(readTool(db, occupantId, id));
  }
  return { tools, skipped };
}

function photoRow(db: DatabaseSync, occupantId: string, toolId: string, photoId: string): PhotoRow {
  const row = db
    .prepare(`SELECT ${PHOTO_COLUMNS} FROM personal_tool_photos WHERE id = ? AND tool_id = ? AND occupant_id = ?`)
    .get(photoId, toolId, occupantId) as PhotoRow | undefined;
  if (!row) throw new ToolError("not-found");
  return row;
}

function touch(db: DatabaseSync, occupantId: string, toolId: string, now: string) {
  db.prepare("UPDATE personal_tools SET updated_at = ? WHERE id = ? AND occupant_id = ?").run(now, toolId, occupantId);
}

/** Takes a photo off; when it was the cover, the next one becomes the cover. */
export function removeToolPhoto(db: DatabaseSync, occupantId: string, uploadsDir: string, toolId: string, photoId: string): PersonalTool {
  const photo = photoRow(db, occupantId, toolId, photoId);
  db.prepare("DELETE FROM personal_tool_photos WHERE id = ? AND occupant_id = ?").run(photoId, occupantId);
  ensureCover(db, occupantId, toolId);
  touch(db, occupantId, toolId, new Date().toISOString());
  deleteFile(uploadsDir, photo.stored_name);
  return readTool(db, occupantId, toolId);
}

export function setToolCover(db: DatabaseSync, occupantId: string, toolId: string, photoId: string): PersonalTool {
  photoRow(db, occupantId, toolId, photoId);
  db.prepare("UPDATE personal_tool_photos SET is_cover = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE occupant_id = ? AND tool_id = ?").run(
    photoId,
    occupantId,
    toolId,
  );
  touch(db, occupantId, toolId, new Date().toISOString());
  return readTool(db, occupantId, toolId);
}

export function loadToolPhoto(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  toolId: string,
  photoId: string,
): { bytes: Uint8Array; type: string } | null {
  const photo = photoRow(db, occupantId, toolId, photoId);
  // A restored backup can name any type: only photo types are ever served.
  if (!isAvatarType(photo.media_type)) return null;
  try {
    return { bytes: new Uint8Array(readFileSync(uploadPath(uploadsDir, photo.stored_name))), type: photo.media_type };
  } catch {
    return null;
  }
}

/** A role was deleted: it comes off every tool; the tools stay. */
export function forgetToolRoleLinks(db: DatabaseSync, occupantId: string, roleId: string): void {
  db.prepare("DELETE FROM personal_tool_roles WHERE occupant_id = ? AND role_id = ?").run(occupantId, roleId);
}

/** How a photo shows. The file itself never changes. */
export function setPhotoFraming(db: DatabaseSync, occupantId: string, toolId: string, photoId: string, raw: unknown): PersonalTool {
  photoRow(db, occupantId, toolId, photoId);
  const read = readPhotoFraming(raw);
  if (!read.ok) throw new ToolError(read.error);
  const framing = read.value;
  db.prepare(
    `UPDATE personal_tool_photos SET rotation = ?, flip_h = ?, flip_v = ?, zoom = ?, focus_x = ?, focus_y = ?
     WHERE id = ? AND occupant_id = ?`,
  ).run(framing.rotation, framing.flipH ? 1 : 0, framing.flipV ? 1 : 0, framing.zoom, framing.focusX, framing.focusY, photoId, occupantId);
  touch(db, occupantId, toolId, new Date().toISOString());
  return readTool(db, occupantId, toolId);
}

// ---- Kits ----

export function listKits(db: DatabaseSync, occupantId: string): ToolKit[] {
  return (
    db.prepare("SELECT id, name, created_at FROM tool_kits WHERE occupant_id = ? ORDER BY name COLLATE NOCASE, rowid").all(occupantId) as Array<{
      id: string;
      name: string;
      created_at: string;
    }>
  ).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

function readKit(db: DatabaseSync, occupantId: string, kitId: string): ToolKit {
  const kit = listKits(db, occupantId).find((item) => item.id === kitId);
  if (!kit) throw new ToolError("not-found");
  return kit;
}

export function createKit(db: DatabaseSync, occupantId: string, rawName: unknown): ToolKit {
  const read = readKitName(rawName, listKits(db, occupantId));
  if (!read.ok) throw new ToolError(read.error);
  const id = randomUUID();
  db.prepare("INSERT INTO tool_kits (id, occupant_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, occupantId, read.name, new Date().toISOString());
  return readKit(db, occupantId, id);
}

export function renameKit(db: DatabaseSync, occupantId: string, kitId: string, rawName: unknown): ToolKit {
  readKit(db, occupantId, kitId);
  const read = readKitName(rawName, listKits(db, occupantId), kitId);
  if (!read.ok) throw new ToolError(read.error);
  db.prepare("UPDATE tool_kits SET name = ? WHERE id = ? AND occupant_id = ?").run(read.name, kitId, occupantId);
  return readKit(db, occupantId, kitId);
}

/** Deletes a kit; its tools stay. */
export function removeKit(db: DatabaseSync, occupantId: string, kitId: string): void {
  readKit(db, occupantId, kitId);
  db.prepare("DELETE FROM tool_kit_items WHERE occupant_id = ? AND kit_id = ?").run(occupantId, kitId);
  db.prepare("DELETE FROM tool_kits WHERE occupant_id = ? AND id = ?").run(occupantId, kitId);
}

// ---- Changing many tools at once ----

/**
 * Applies one change to every picked tool, all or nothing. A bulk change never
 * touches a tool's other fields, so a draft stays a draft. Photo files of
 * deleted tools go only after the change is saved.
 */
export function bulkChangeTools(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  raw: unknown,
): { tools: PersonalTool[]; deleted: string[]; kit: ToolKit | null } {
  const current = new Map(listTools(db, occupantId).map((tool) => [tool.id, tool]));
  const read = readBulkRequest(raw, { toolIds: new Set(current.keys()), kits: listKits(db, occupantId) });
  if (!read.ok) throw new ToolError(read.error);
  const { ids, change } = read;
  const now = new Date().toISOString();
  const files: string[] = [];
  let kit: ToolKit | null = null;
  db.exec("BEGIN");
  try {
    if (change.kind === "delete") {
      for (const id of ids) files.push(...deleteToolRows(db, occupantId, id));
    } else {
      let newKitId: string | undefined;
      if (change.kind === "addKit" && "newKitName" in change) {
        newKitId = randomUUID();
        db.prepare("INSERT INTO tool_kits (id, occupant_id, name, created_at) VALUES (?, ?, ?, ?)").run(newKitId, occupantId, change.newKitName, now);
      }
      const write = db.prepare(
        "UPDATE personal_tools SET category = ?, ownership = ?, condition = ?, tags = ?, updated_at = ? WHERE id = ? AND occupant_id = ?",
      );
      const unkit = db.prepare("DELETE FROM tool_kit_items WHERE occupant_id = ? AND tool_id = ?");
      const inKit = db.prepare("INSERT INTO tool_kit_items (id, occupant_id, kit_id, tool_id, created_at) VALUES (?, ?, ?, ?, ?)");
      for (const id of ids) {
        const next = applyBulkChange(current.get(id)!, change, newKitId);
        write.run(next.category, next.ownership, next.condition, JSON.stringify(next.tags), now, id, occupantId);
        unkit.run(occupantId, id);
        for (const kitId of next.kitIds) inKit.run(randomUUID(), occupantId, kitId, id, now);
      }
      if (newKitId) kit = readKit(db, occupantId, newKitId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const storedName of files) deleteFile(uploadsDir, storedName);
  if (change.kind === "delete") return { tools: [], deleted: ids, kit: null };
  return { tools: ids.map((id) => readTool(db, occupantId, id)), deleted: [], kit };
}
