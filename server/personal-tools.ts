import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { avatarExtension, isAvatarType } from "../core/profile";
import {
  TOOL_PHOTO_LIMIT,
  draftToolName,
  readToolInput,
  toolPhotoProblem,
  type PersonalTool,
  type ToolInput,
  type ToolInputError,
} from "../core/personal-tools";
import { uploadPath } from "./upload-path";

/**
 * My Tools storage: `personal_tools`, their photos (`personal_tool_photos`,
 * files in uploads named here as tool-<uuid>.<ext>, never from input), and the
 * roles each was used on (`personal_tool_roles`).
 */

export type ToolErrorCode = ToolInputError | "not-found" | "photo-type" | "photo-too-large" | "photo-empty" | "photo-limit";

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

type PhotoRow = { id: string; tool_id: string; stored_name: string; media_type: string; is_cover: number };

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

function present(row: ToolRow, photos: PhotoRow[], roleIds: string[]): PersonalTool {
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
    photos: photos.map((photo) => ({ id: photo.id, url: toolPhotoUrl(row.id, photo.id), cover: photo.is_cover === 1 })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function photoRows(db: DatabaseSync, occupantId: string, toolId?: string): PhotoRow[] {
  const sql = `SELECT id, tool_id, stored_name, media_type, is_cover FROM personal_tool_photos
    WHERE occupant_id = ?${toolId ? " AND tool_id = ?" : ""} ORDER BY sort_order, rowid`;
  return (toolId ? db.prepare(sql).all(occupantId, toolId) : db.prepare(sql).all(occupantId)) as unknown as PhotoRow[];
}

function roleLinks(db: DatabaseSync, occupantId: string, toolId?: string): Array<{ tool_id: string; role_id: string }> {
  const sql = `SELECT tool_id, role_id FROM personal_tool_roles WHERE occupant_id = ?${toolId ? " AND tool_id = ?" : ""} ORDER BY rowid`;
  return (toolId ? db.prepare(sql).all(occupantId, toolId) : db.prepare(sql).all(occupantId)) as Array<{ tool_id: string; role_id: string }>;
}

export function listTools(db: DatabaseSync, occupantId: string): PersonalTool[] {
  const rows = db
    .prepare("SELECT * FROM personal_tools WHERE occupant_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(occupantId) as unknown as ToolRow[];
  const photos = photoRows(db, occupantId);
  const links = roleLinks(db, occupantId);
  return rows.map((row) =>
    present(
      row,
      photos.filter((photo) => photo.tool_id === row.id),
      links.filter((link) => link.tool_id === row.id).map((link) => link.role_id),
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
  );
}

function checkInput(db: DatabaseSync, occupantId: string, raw: unknown): ToolInput {
  const roles = db.prepare("SELECT id FROM work_history WHERE occupant_id = ?").all(occupantId) as Array<{ id: string }>;
  const read = readToolInput(raw, new Set(roles.map((role) => role.id)));
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

export function removeTool(db: DatabaseSync, occupantId: string, uploadsDir: string, toolId: string): void {
  readTool(db, occupantId, toolId);
  const photos = photoRows(db, occupantId, toolId);
  db.prepare("DELETE FROM personal_tool_photos WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  db.prepare("DELETE FROM personal_tool_roles WHERE occupant_id = ? AND tool_id = ?").run(occupantId, toolId);
  db.prepare("DELETE FROM personal_tools WHERE occupant_id = ? AND id = ?").run(occupantId, toolId);
  for (const photo of photos) deleteFile(uploadsDir, photo.stored_name);
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
    .prepare("SELECT id, tool_id, stored_name, media_type, is_cover FROM personal_tool_photos WHERE id = ? AND tool_id = ? AND occupant_id = ?")
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
