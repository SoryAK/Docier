import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DocumentKind } from "../core/document-vault";
import type { RoleDocument } from "../core/role-documents";
import { storeDocument } from "./documents";
import { logRoleEvent } from "./role-edits";

/**
 * Documents kept with a role: files in Documents, linked to the role
 * (`role_documents`). Taking one off a role keeps it in Documents; removing it
 * from Documents takes it off every role (see `removeDocument`).
 */

export type RoleDocumentErrorCode = "role-missing" | "document-missing" | "already-linked" | "link-missing";

export class RoleDocumentError extends Error {
  constructor(readonly code: RoleDocumentErrorCode) {
    super(code);
  }
}

const SELECT = `
  SELECT rd.id AS linkId, d.id AS documentId, d.original_name AS name, d.category AS kind,
         d.media_type AS mediaType, d.size_bytes AS sizeBytes, d.created_at AS createdAt
  FROM role_documents rd
  JOIN documents d ON d.id = rd.document_id AND d.occupant_id = rd.occupant_id`;

export function readRoleDocuments(db: DatabaseSync, occupantId: string, roleId: string): RoleDocument[] {
  return db
    .prepare(`${SELECT} WHERE rd.occupant_id = ? AND rd.role_id = ? ORDER BY d.created_at DESC, rd.rowid`)
    .all(occupantId, roleId) as unknown as RoleDocument[];
}

function requireRole(db: DatabaseSync, occupantId: string, roleId: string) {
  const found = db.prepare("SELECT id FROM work_history WHERE id = ? AND occupant_id = ?").get(roleId, occupantId);
  if (!found) throw new RoleDocumentError("role-missing");
}

function readLink(db: DatabaseSync, occupantId: string, roleId: string, linkId: string): RoleDocument {
  const found = db.prepare(`${SELECT} WHERE rd.occupant_id = ? AND rd.role_id = ? AND rd.id = ?`).get(occupantId, roleId, linkId) as
    | RoleDocument
    | undefined;
  if (!found) throw new RoleDocumentError("link-missing");
  return found;
}

function insertLink(db: DatabaseSync, occupantId: string, roleId: string, documentId: string): RoleDocument {
  const existing = db
    .prepare("SELECT id FROM role_documents WHERE occupant_id = ? AND role_id = ? AND document_id = ?")
    .get(occupantId, roleId, documentId);
  if (existing) throw new RoleDocumentError("already-linked");
  const linkId = randomUUID();
  db.prepare("INSERT INTO role_documents (id, occupant_id, role_id, document_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
    linkId,
    occupantId,
    roleId,
    documentId,
    new Date().toISOString(),
  );
  return readLink(db, occupantId, roleId, linkId);
}

/** Links a file already in Documents to the role. */
export function linkRoleDocument(db: DatabaseSync, occupantId: string, roleId: string, documentId: unknown): RoleDocument {
  requireRole(db, occupantId, roleId);
  if (typeof documentId !== "string" || !documentId) throw new RoleDocumentError("document-missing");
  const found = db.prepare("SELECT id FROM documents WHERE id = ? AND occupant_id = ?").get(documentId, occupantId);
  if (!found) throw new RoleDocumentError("document-missing");
  const linked = insertLink(db, occupantId, roleId, documentId);
  logRoleEvent(db, occupantId, roleId, "documents", `Added a document: ${linked.name}`);
  return linked;
}

/** Adds a new file to Documents and links it to the role. */
export function uploadRoleDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  roleId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  kind: DocumentKind | string,
): RoleDocument {
  requireRole(db, occupantId, roleId);
  const stored = storeDocument(db, occupantId, uploadsDir, file, kind);
  const linked = insertLink(db, occupantId, roleId, stored.id);
  logRoleEvent(db, occupantId, roleId, "documents", `Added a document: ${linked.name}`);
  return linked;
}

/** Takes the file off this role; it stays in Documents. */
export function unlinkRoleDocument(db: DatabaseSync, occupantId: string, roleId: string, linkId: string): void {
  const linked = readLink(db, occupantId, roleId, linkId);
  db.prepare("DELETE FROM role_documents WHERE id = ? AND occupant_id = ? AND role_id = ?").run(linkId, occupantId, roleId);
  logRoleEvent(db, occupantId, roleId, "documents", `Took a document off: ${linked.name}`);
}

/** A role was deleted: its links go; the files stay in Documents. */
export function forgetRoleDocumentLinks(db: DatabaseSync, occupantId: string, roleId: string): void {
  db.prepare("DELETE FROM role_documents WHERE occupant_id = ? AND role_id = ?").run(occupantId, roleId);
}
