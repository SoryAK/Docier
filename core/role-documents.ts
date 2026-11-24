/**
 * Documents kept with a role: files from Documents, linked to the job they are
 * about. One file can be linked to several roles; taking it off a role keeps
 * it in Documents. Never published.
 */
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "./document-vault";

export type RoleDocument = {
  /** The link between this role and the file. */
  linkId: string;
  documentId: string;
  name: string;
  kind: DocumentKind;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
};

/** The order kinds show in on a role: the job's own papers first, then the company's, then the rest. */
const ROLE_KIND_ORDER: DocumentKind[] = [
  "offer",
  "contract",
  "benefits",
  "pay-stub",
  "handbook",
  "policy",
  "review",
  "training",
  "certificate",
  "evidence",
  "resume",
  "other",
];

/** The kinds offered when adding a document to a role, in that order. */
export const ROLE_DOCUMENT_KINDS: DocumentKind[] = ROLE_KIND_ORDER.filter((kind) => kind !== "resume");

export function groupRoleDocuments(documents: RoleDocument[]): Array<{ kind: DocumentKind; label: string; items: RoleDocument[] }> {
  return ROLE_KIND_ORDER.map((kind) => ({
    kind,
    label: DOCUMENT_KIND_LABEL[kind],
    items: documents.filter((item) => item.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })).filter((group) => group.items.length > 0);
}
