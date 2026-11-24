import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  describeDetailsChange,
  describeRoleFieldsChange,
  pick,
  undoBlock,
  type RoleEdit,
  type RoleEditArea,
  type RoleFields,
} from "../core/role-edits";
import { readRoleAchievements } from "../core/role-achievements";
import type { WorkMapRoleDetails } from "../core/work-map";

/** Storage for a role's record of changes. */

type Row = {
  id: string;
  at: string;
  area: RoleEditArea;
  summary: string;
  keys_json: string;
  after_json: string | null;
  before_json: string | null;
  undone_at: string | null;
  undoes_id: string | null;
};

export type StoredEdit = {
  id: string;
  area: RoleEditArea;
  summary: string;
  keys: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  undoneAt: string | null;
  undoesId: string | null;
};

/** The role's own fields, as stored. */
export function readRoleFields(db: DatabaseSync, occupantId: string, roleId: string): RoleFields | null {
  const row = db
    .prepare(
      `SELECT kind, title, company, location, start_date, end_date, is_current,
              description, achievements_json
       FROM work_history WHERE id = ? AND occupant_id = ?`,
    )
    .get(roleId, occupantId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    kind: String(row.kind),
    title: String(row.title),
    organization: String(row.company),
    locationLabel: String(row.location),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    isCurrent: Boolean(row.is_current),
    description: String(row.description),
    achievements: readRoleAchievements(row.achievements_json, randomUUID).items,
  };
}

function insert(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  area: RoleEditArea,
  summary: string,
  change?: { keys: string[]; before: Record<string, unknown>; after: Record<string, unknown>; undoes?: string },
) {
  db.prepare(
    `INSERT INTO role_edits
      (id, occupant_id, role_id, at, area, summary, keys_json, before_json, after_json, undoes_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    occupantId,
    roleId,
    new Date().toISOString(),
    area,
    summary,
    JSON.stringify(change?.keys ?? []),
    change ? JSON.stringify(change.before) : null,
    change ? JSON.stringify(change.after) : null,
    change?.undoes ?? null,
  );
}

/** Records a change to the role's own fields, if anything changed. */
export function recordFieldsEdit(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  before: RoleFields,
  after: RoleFields,
  undo?: { of: StoredEdit },
) {
  const change = describeRoleFieldsChange(before, after);
  if (!change) return;
  const summary = undo ? `Undid: ${undo.of.summary}` : change.summary;
  insert(db, occupantId, roleId, "role", summary, { keys: change.keys, before: pick(before, change.keys), after: pick(after, change.keys), undoes: undo?.of.id });
}

/** Records a change to the role's details, if anything changed. */
export function recordDetailsEdit(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  before: WorkMapRoleDetails,
  after: WorkMapRoleDetails,
  undo?: { of: StoredEdit },
) {
  const change = describeDetailsChange(before, after);
  if (!change) return;
  const summary = undo ? `Undid: ${undo.of.summary}` : change.summary;
  insert(db, occupantId, roleId, "details", summary, { keys: change.keys, before: pick(before, change.keys), after: pick(after, change.keys), undoes: undo?.of.id });
}

/** Logs a change that can't be undone from here: people, places, photos, evidence. */
export function logRoleEvent(db: DatabaseSync, occupantId: string, roleId: string, area: RoleEditArea, summary: string) {
  insert(db, occupantId, roleId, area, summary);
}

function stored(row: Row): StoredEdit {
  return {
    id: row.id,
    area: row.area,
    summary: row.summary,
    keys: JSON.parse(row.keys_json) as string[],
    before: row.before_json ? (JSON.parse(row.before_json) as Record<string, unknown>) : null,
    after: row.after_json ? (JSON.parse(row.after_json) as Record<string, unknown>) : null,
    undoneAt: row.undone_at,
    undoesId: row.undoes_id,
  };
}

export function readStoredEdit(db: DatabaseSync, occupantId: string, roleId: string, editId: string): StoredEdit | null {
  const row = db
    .prepare("SELECT * FROM role_edits WHERE id = ? AND occupant_id = ? AND role_id = ?")
    .get(editId, occupantId, roleId) as Row | undefined;
  return row ? stored(row) : null;
}

/** Marks an edit undone, and brings back the one it undid, if any. */
export function markUndone(db: DatabaseSync, occupantId: string, edit: StoredEdit) {
  db.prepare("UPDATE role_edits SET undone_at = ? WHERE id = ? AND occupant_id = ?").run(new Date().toISOString(), edit.id, occupantId);
  if (edit.undoesId) {
    db.prepare("UPDATE role_edits SET undone_at = NULL WHERE id = ? AND occupant_id = ?").run(edit.undoesId, occupantId);
  }
}

/** The role's changes, newest first, each saying whether it can be undone now. */
export function readRoleEdits(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  current: { fields: RoleFields; details: WorkMapRoleDetails },
  limit = 200,
): RoleEdit[] {
  const rows = db
    .prepare("SELECT * FROM role_edits WHERE occupant_id = ? AND role_id = ? ORDER BY at DESC, rowid DESC LIMIT ?")
    .all(occupantId, roleId, limit) as Row[];
  return rows.map((row) => {
    const edit = stored(row);
    const blocked = undoBlock(edit, edit.area === "role" ? current.fields : current.details);
    return { id: edit.id, at: row.at, area: edit.area, summary: edit.summary, canUndo: blocked === null, blocked };
  });
}

export function removeRoleEdits(db: DatabaseSync, occupantId: string, roleId: string) {
  db.prepare("DELETE FROM role_edits WHERE occupant_id = ? AND role_id = ?").run(occupantId, roleId);
}
