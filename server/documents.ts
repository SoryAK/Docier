import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  DOCUMENT_MAX_BYTES,
  prepareDocumentChange,
  prepareDocumentRemoval,
  prepareStoredDocument,
} from "../core/document-vault";
import { DOCX_MEDIA_TYPE } from "../core/resume-preview";
import { evidenceCited, saveEvidence } from "./career-memory";
import { uploadPath } from "./upload-path";

/** Largest document or resume an occupant can upload. */
export const UPLOAD_MAX_BYTES = DOCUMENT_MAX_BYTES;

export type DocumentRow = {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  checksum: string;
  category: string;
  createdAt: string;
};

/**
 * Every file in the vault, newest first. A resume added during onboarding is
 * kept in its own store, with resume Evidence that its jobs point at; it is
 * listed here beside uploaded files so it can be opened, changed, and removed.
 */
export function listDocuments(
  db: DatabaseSync,
  occupantId: string,
): DocumentRow[] {
  const uploaded = db
    .prepare(
      `SELECT id, original_name AS originalName, stored_name AS storedName,
              media_type AS mediaType, size_bytes AS sizeBytes, checksum,
              category, created_at AS createdAt
       FROM documents WHERE occupant_id = ?`,
    )
    .all(occupantId) as unknown as Array<DocumentRow & { storedName: string }>;
  const resumes = (
    db
      .prepare(
        `SELECT id, original_name AS originalName, stored_name AS storedName,
                category, created_at AS createdAt
         FROM resumes WHERE occupant_id = ?`,
      )
      .all(occupantId) as unknown as ResumeRecord[]
  ).map((row) => resumeDocument(db, occupantId, row));
  return [...uploaded, ...resumes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(presentDocument);
}

export function storeDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  file: { name: string; type: string; bytes: Uint8Array },
  category: string,
): DocumentRow {
  const planned = prepareStoredDocument({
    name: file.name,
    size: file.bytes.length,
    kind: category,
  });
  if (!planned.ok) throw new DocumentStoreError(planned.error);
  const id = randomUUID();
  const extension = extname(file.name).slice(0, 12);
  const storedName = `documents/${id}${extension}`;
  const fullPath = uploadPath(uploadsDir, storedName);
  mkdirSync(join(uploadsDir, "documents"), { recursive: true });
  writeFileSync(fullPath, file.bytes);
  const now = new Date().toISOString();
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  try {
    db.prepare(
      `INSERT INTO documents
        (id, occupant_id, original_name, stored_name, media_type, size_bytes,
         checksum, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      occupantId,
      planned.value.name,
      storedName,
      file.type || "application/octet-stream",
      file.bytes.length,
      checksum,
      planned.value.kind,
      now,
    );
    saveEvidence(db, occupantId, {
      sourceType: "document",
      sourceRef: id,
      title: planned.value.name,
      content: {
        documentId: id,
        mediaType: file.type || "application/octet-stream",
        checksum,
        category: planned.value.kind,
      },
    });
  } catch (error) {
    unlinkSync(fullPath);
    throw error;
  }
  return presentDocument({
    id,
    originalName: planned.value.name,
    storedName,
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.bytes.length,
    checksum,
    category: planned.value.kind,
    createdAt: now,
  });
}

export function updateDocument(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: { name?: unknown; kind?: unknown },
): DocumentRow {
  const removal = prepareDocumentRemoval(id);
  if (!removal.ok) throw new DocumentStoreError(removal.error);
  const planned = prepareDocumentChange(input);
  if (!planned.ok) throw new DocumentStoreError(planned.error);
  const current = loadDocumentRecord(db, occupantId, removal.value);
  if (!current) throw new DocumentStoreError("not-found");
  const table = current.store === "resume" ? "resumes" : "documents";
  db.prepare(
    `UPDATE ${table} SET original_name = ?, category = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(planned.value.name, planned.value.kind, current.id, occupantId);
  // Only the title follows the new name. The Evidence content stays as it was
  // captured, so the jobs that cite it keep pointing at the same file.
  db.prepare(
    `UPDATE evidence SET title = ?
      WHERE occupant_id = ? AND source_type = ? AND source_ref = ?`,
  ).run(planned.value.name, occupantId, current.store, current.id);
  return presentDocument({
    ...current,
    originalName: planned.value.name,
    category: planned.value.kind,
  });
}

export function removeDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  id: string,
): void {
  const planned = prepareDocumentRemoval(id);
  if (!planned.ok) throw new DocumentStoreError(planned.error);
  const current = loadDocumentRecord(db, occupantId, planned.value);
  if (!current) throw new DocumentStoreError("not-found");
  const evidence = db
    .prepare("SELECT id FROM evidence WHERE occupant_id = ? AND source_type = ? AND source_ref = ?")
    .get(occupantId, current.store, current.id) as { id: string } | undefined;
  // Jobs and schools read from a resume cite it. Like any cited Evidence, it
  // stays while they do.
  if (current.store === "resume" && evidence && evidenceCited(db, occupantId, evidence.id)) {
    throw new DocumentStoreError("in-use");
  }
  const fullPath = vaultFilePath(uploadsDir, current.storedName);
  if (fullPath) {
    try {
      unlinkSync(fullPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  db.prepare(
    `DELETE FROM evidence
      WHERE occupant_id = ? AND source_type = ? AND source_ref = ?`,
  ).run(occupantId, current.store, current.id);
  const table = current.store === "resume" ? "resumes" : "documents";
  db.prepare(`DELETE FROM ${table} WHERE id = ? AND occupant_id = ?`).run(current.id, occupantId);
  // A file that leaves Documents leaves every role it was kept with.
  db.prepare("DELETE FROM role_documents WHERE occupant_id = ? AND document_id = ?").run(occupantId, current.id);
}

type StoredRecord = DocumentRow & { storedName: string; store: "document" | "resume" };

type ResumeRecord = {
  id: string;
  originalName: string;
  storedName: string;
  category: string;
  createdAt: string;
};

function loadDocumentRecord(
  db: DatabaseSync,
  occupantId: string,
  id: string,
): StoredRecord | null {
  const uploaded = db
    .prepare(
      `SELECT id, original_name AS originalName, stored_name AS storedName,
              media_type AS mediaType, size_bytes AS sizeBytes, checksum,
              category, created_at AS createdAt
       FROM documents WHERE id = ? AND occupant_id = ?`,
    )
    .get(id, occupantId) as (DocumentRow & { storedName: string }) | undefined;
  if (uploaded) return { ...uploaded, store: "document" };
  const resume = db
    .prepare(
      `SELECT id, original_name AS originalName, stored_name AS storedName,
              category, created_at AS createdAt
       FROM resumes WHERE id = ? AND occupant_id = ?`,
    )
    .get(id, occupantId) as ResumeRecord | undefined;
  return resume ? resumeDocument(db, occupantId, resume) : null;
}

/** A stored resume as a vault file. Its size and checksum were kept on its Evidence. */
function resumeDocument(db: DatabaseSync, occupantId: string, resume: ResumeRecord): StoredRecord {
  const evidence = db
    .prepare(
      `SELECT checksum, content_json AS contentJson FROM evidence
        WHERE occupant_id = ? AND source_type = 'resume' AND source_ref = ?`,
    )
    .get(occupantId, resume.id) as { checksum: string; contentJson: string } | undefined;
  let content: { checksum?: unknown; sizeBytes?: unknown } = {};
  try {
    content = evidence ? (JSON.parse(evidence.contentJson) as typeof content) : {};
  } catch {
    content = {};
  }
  return {
    ...resume,
    // Resumes were stored without a media type; it is read from the name.
    mediaType: "application/octet-stream",
    sizeBytes: typeof content.sizeBytes === "number" ? content.sizeBytes : 0,
    checksum: typeof content.checksum === "string" ? content.checksum : (evidence?.checksum ?? ""),
    store: "resume",
  };
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: DOCX_MEDIA_TYPE,
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  webm: "video/webm",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

export function servedMediaType(name: string, mediaType: string, storedName = ""): string {
  const stored = mediaType.trim();
  if (isActiveMarkup(stored)) return "text/plain; charset=utf-8";
  if (stored && stored !== "application/octet-stream") return stored;
  // A resume is stored as `<id>.bin`, so an unknown stored extension falls
  // back to the extension of the name the occupant gave it.
  const known = [fileExtension(storedName), fileExtension(name)]
    .map((extension) => (Object.hasOwn(EXTENSION_TYPES, extension) ? EXTENSION_TYPES[extension] : undefined))
    .find(Boolean);
  return known ?? (stored || "application/octet-stream");
}

function presentDocument(record: DocumentRow & { storedName?: string; store?: string }): DocumentRow {
  const { storedName = "", store: _store, ...row } = record;
  return { ...row, mediaType: servedMediaType(row.originalName, row.mediaType, storedName) };
}

function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function isActiveMarkup(mediaType: string): boolean {
  const type = mediaType.toLowerCase();
  return type.startsWith("text/html") || type.startsWith("application/xhtml") || type === "image/svg+xml";
}

function vaultFilePath(uploadsDir: string, storedName: string): string | null {
  try {
    return uploadPath(uploadsDir, storedName);
  } catch {
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export function loadDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  id: string,
): { row: DocumentRow; bytes: Uint8Array } | null {
  const record = loadDocumentRecord(db, occupantId, id);
  if (!record) return null;
  const fullPath = vaultFilePath(uploadsDir, record.storedName);
  if (!fullPath) return null;
  return { row: presentDocument(record), bytes: readFileSync(fullPath) };
}

export class DocumentStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DocumentStoreError";
  }
}
