import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@core/document-vault";
import { groupRoleDocuments, ROLE_DOCUMENT_KINDS, type RoleDocument } from "@core/role-documents";
import type { WorkMapRole } from "@core/work-map";
import { FileText, Pencil, Plus, Upload, X } from "lucide-react";
import { monthYear } from "./RoleGroups";

type VaultFile = { id: string; originalName: string; category: string; createdAt: string };

type Draft = { link: RoleDocument; name: string; kind: DocumentKind };

/**
 * The role's Documents tab: benefits packages, handbooks, policies, and other
 * files about the job. Each is a file in Documents linked to this role; taking
 * it off the role keeps it in Documents.
 */
export function RoleDocuments({ role, onSaved }: { role: WorkMapRole; onSaved: () => void }) {
  const documents = role.documents ?? [];
  const groups = useMemo(() => groupRoleDocuments(documents), [documents]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("benefits");
  const [vault, setVault] = useState<VaultFile[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/api/work-map/roles/${encodeURIComponent(role.id)}/documents`;

  useEffect(() => {
    setAdding(false);
    setDraft(null);
    setMessage("");
  }, [role.id]);

  // Files already in Documents, to pick from; read when the add form opens.
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    void fetch("/api/documents")
      .then(async (response) => (response.ok ? ((await response.json()) as { documents?: VaultFile[] }) : {}))
      .then((body) => {
        if (!cancelled) setVault(body.documents ?? []);
      })
      .catch(() => {
        if (!cancelled) setVault([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adding]);

  const linkedIds = new Set(documents.map((item) => item.documentId));
  // Only papers: not resumes, and not the photos and models a canvas keeps in Documents.
  const pickable = (vault ?? []).filter((item) => (ROLE_DOCUMENT_KINDS as string[]).includes(item.category) && !linkedIds.has(item.id));

  async function run(task: () => Promise<Response>, failure: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await task();
      if (!response.ok) {
        const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
        setMessage(messageFor(code, failure));
        return false;
      }
      onSaved();
      return true;
    } catch {
      setMessage("Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const ok = await run(() => fetch(base, { method: "POST", body: form }), "That file couldn't be added.");
      if (!ok) break;
    }
    if (fileRef.current) fileRef.current.value = "";
    setAdding(false);
  }

  async function pick(documentId: string) {
    const ok = await run(
      () => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) }),
      "That file couldn't be added.",
    );
    if (ok) setAdding(false);
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const ok = await run(
      () =>
        fetch(`/api/documents/${encodeURIComponent(draft.link.documentId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: draft.name, kind: draft.kind }),
        }),
      "That change couldn't be saved.",
    );
    if (ok) setDraft(null);
  }

  async function takeOff(link: RoleDocument) {
    if (!window.confirm(`Take “${link.name}” off this role? It stays in Documents.`)) return;
    await run(() => fetch(`${base}/${encodeURIComponent(link.linkId)}`, { method: "DELETE" }), "That couldn't be taken off. Try again.");
  }

  return (
    <section className="role-view-section role-documents" aria-label="Documents">

      {adding ? (
        <div className="role-documents-add">
          <label>
            What is it?
            <select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)} disabled={busy}>
              {ROLE_DOCUMENT_KINDS.map((item) => (
                <option key={item} value={item}>
                  {DOCUMENT_KIND_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="role-view-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={14} aria-hidden="true" /> {busy ? "Adding…" : "Upload a file"}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} />
          {pickable.length > 0 ? (
            <div className="role-documents-pick">
              <p>Or add one already in Documents</p>
              <ul>
                {pickable.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void pick(item.id)} disabled={busy}>
                      <FileText size={14} aria-hidden="true" />
                      <span>{item.originalName}</span>
                      <small>{DOCUMENT_KIND_LABEL[item.category as DocumentKind] ?? item.category}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button type="button" className="role-view-ghost" onClick={() => setAdding(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="role-view-error" role="alert">
          {message}
        </p>
      ) : null}

      {documents.length === 0 && !adding ? (
        <button type="button" className="role-group-add" onClick={() => setAdding(true)}>
          + Add a benefits package, handbook, policy, or another file from {role.organization.trim() || "this job"}
        </button>
      ) : null}

      {groups.length > 0 ? (
        <div className="role-groups">
          {groups.map((group) => (
            <section key={group.kind} className="role-group is-wide" aria-label={group.label}>
              <div className="role-group-head">
                <h3>{group.label}</h3>
              </div>
              <ul className="role-group-rows">
                {group.items.map((item) =>
                  draft?.link.linkId === item.linkId ? (
                    <li key={item.linkId}>
                      <form className="role-documents-edit" onSubmit={saveDraft}>
                        <input aria-label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={180} required autoFocus />
                        <select aria-label="Kind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as DocumentKind })}>
                          {ROLE_DOCUMENT_KINDS.map((kindOption) => (
                            <option key={kindOption} value={kindOption}>
                              {DOCUMENT_KIND_LABEL[kindOption]}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="role-view-ghost" onClick={() => setDraft(null)} disabled={busy}>
                          Cancel
                        </button>
                        <button type="submit" className="role-view-primary" disabled={busy || !draft.name.trim()}>
                          Save
                        </button>
                      </form>
                    </li>
                  ) : (
                    <li key={item.linkId}>
                      <span className="role-group-icon" aria-hidden="true">
                        <FileText size={16} />
                      </span>
                      <a className="role-group-row-text role-documents-open" href={`/api/documents/${encodeURIComponent(item.documentId)}?inline=1`} target="_blank" rel="noreferrer">
                        <b>{item.name}</b>
                        <small>{[fileType(item), fileSize(item.sizeBytes), `added ${monthYear(item.createdAt.slice(0, 7))}`].filter(Boolean).join(" · ")}</small>
                      </a>
                      <span className="role-documents-actions">
                        <button type="button" aria-label={`Rename or change ${item.name}`} title="Rename or change the kind" onClick={() => setDraft({ link: item, name: item.name, kind: item.kind })} disabled={busy}>
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Take ${item.name} off this role`} title="Take off this role" onClick={() => void takeOff(item)} disabled={busy}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {documents.length > 0 && !adding ? (
        <button type="button" className="role-view-text role-inline-add" onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden="true" /> Add a document
        </button>
      ) : null}

      <p className="role-group-share">Kept in Documents too. Only you see these; they never go on your page.</p>
    </section>
  );
}

function fileType(item: RoleDocument): string {
  const ext = item.name.includes(".") ? item.name.split(".").pop()!.toUpperCase() : "";
  if (item.mediaType === "application/pdf") return "PDF";
  if (item.mediaType.startsWith("image/")) return "Image";
  return ext.length <= 4 ? ext : "";
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function messageFor(code: string | undefined, fallback: string): string {
  return code === "file-too-large"
    ? "That file is over 25 MB."
    : code === "already-linked"
      ? "That file is already on this role."
      : code === "name-required"
        ? "Give it a name."
        : fallback;
}
