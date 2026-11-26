import { describe, expect, it } from "vitest";
import { DOCUMENT_KIND_LABEL, DOCUMENT_KINDS, prepareStoredDocument } from "./document-vault";
import { groupRoleDocuments, type RoleDocument } from "./role-documents";

const doc = (name: string, kind: RoleDocument["kind"], createdAt = "2026-01-01T00:00:00Z"): RoleDocument => ({
  linkId: `link-${name}`,
  documentId: `doc-${name}`,
  name,
  kind,
  mediaType: "application/pdf",
  sizeBytes: 1000,
  createdAt,
});

describe("a role's documents", () => {
  it("can be kept as a benefits package, a handbook, a policy, and more", () => {
    for (const kind of ["benefits", "handbook", "policy", "pay-stub", "contract", "review", "training", "other"]) {
      expect(DOCUMENT_KINDS).toContain(kind);
      expect(prepareStoredDocument({ name: "file.pdf", size: 10, kind })).toEqual({ ok: true, value: { name: "file.pdf", kind } });
    }
    expect(DOCUMENT_KIND_LABEL.benefits).toBe("Benefits");
    expect(DOCUMENT_KIND_LABEL["pay-stub"]).toBe("Pay stub");
  });

  it("are grouped by kind, the job's own papers first, newest first within a kind", () => {
    const groups = groupRoleDocuments([
      doc("Old handbook", "handbook", "2024-01-01T00:00:00Z"),
      doc("Offer letter", "offer"),
      doc("2026 benefits guide", "benefits"),
      doc("New handbook", "handbook", "2025-06-01T00:00:00Z"),
    ]);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.name)])).toEqual([
      ["Offer", ["Offer letter"]],
      ["Benefits", ["2026 benefits guide"]],
      ["Handbook", ["New handbook", "Old handbook"]],
    ]);
  });

  it("is no groups with no documents", () => {
    expect(groupRoleDocuments([])).toEqual([]);
  });

  it("shows a document of a kind it doesn't know under Other, so it never goes missing", () => {
    const restored = { linkId: "l9", documentId: "d9", name: "old.pdf", kind: "mystery" as never, mediaType: "application/pdf", sizeBytes: 1, createdAt: "2024-01-01" };
    const groups = groupRoleDocuments([restored]);
    expect(groups.map((group) => [group.kind, group.items.map((item) => item.name)])).toEqual([["other", ["old.pdf"]]]);
  });
});
