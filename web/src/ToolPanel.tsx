import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL } from "@core/role-gear";
import {
  TOOL_CONDITIONS,
  TOOL_CONDITION_LABEL,
  TOOL_OWNERSHIPS,
  TOOL_OWNERSHIP_LABEL,
  TOOL_PHOTO_LIMIT,
  type PersonalTool,
} from "@core/personal-tools";

export type ToolRoleChoice = { id: string; name: string };

type Draft = {
  name: string;
  category: string;
  ownership: string;
  maker: string;
  model: string;
  serial: string;
  condition: string;
  skill: string;
  acquired: string;
  paid: string;
  worth: string;
  keptAt: string;
  tags: string;
  notes: string;
  roleIds: string[];
};

function draftOf(tool: PersonalTool | null): Draft {
  return {
    name: tool?.name ?? "",
    category: tool?.category ?? "tool",
    ownership: tool?.ownership ?? "mine",
    maker: tool?.maker ?? "",
    model: tool?.model ?? "",
    serial: tool?.serial ?? "",
    condition: tool?.condition ?? "",
    skill: tool?.skill ? String(tool.skill) : "",
    acquired: tool?.acquired ?? "",
    paid: tool?.paid === null || tool?.paid === undefined ? "" : String(tool.paid),
    worth: tool?.worth === null || tool?.worth === undefined ? "" : String(tool.worth),
    keptAt: tool?.keptAt ?? "",
    tags: tool?.tags.join(", ") ?? "",
    notes: tool?.notes ?? "",
    roleIds: tool?.roleIds ?? [],
  };
}

/** What each refusal from the server means, shown beside its field. */
const FIELD_ERROR: Record<string, { field: keyof Draft | "form"; text: string }> = {
  "name-required": { field: "name", text: "Give the tool a name." },
  "category-invalid": { field: "category", text: "Pick a category." },
  "ownership-invalid": { field: "ownership", text: "Pick whose it is." },
  "condition-invalid": { field: "condition", text: "Pick a condition." },
  "skill-invalid": { field: "skill", text: "Pick 1 to 5." },
  "acquired-invalid": { field: "acquired", text: "Pick a month." },
  "amount-invalid": { field: "paid", text: "Use a number, like 425 or 425.50." },
  "role-missing": { field: "roleIds", text: "One of these roles is gone. Take it off and save again." },
};

const PHOTO_ERROR: Record<string, string> = {
  "photo-type": "That file isn't a photo.",
  "photo-too-large": "That photo is too large.",
  "photo-empty": "That photo is empty.",
  "photo-limit": `A tool keeps at most ${TOOL_PHOTO_LIMIT} photos.`,
};

/**
 * One tool, for adding or changing: every field, its photos, the roles it was
 * used on, and Remove. Adding uses the same fields as changing.
 */
export function ToolPanel({
  tool,
  roles,
  onSaved,
  onRemoved,
  onClose,
}: {
  /** The tool to change; null to add one. */
  tool: PersonalTool | null;
  roles: ToolRoleChoice[];
  onSaved: (tool: PersonalTool) => void;
  onRemoved: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(tool));
  const [error, setError] = useState<{ field: keyof Draft | "form"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Photos picked before a new tool is saved, uploaded right after it is.
  const [pending, setPending] = useState<Array<{ file: File; url: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // On a narrow screen the panel sits under the grid: bring it into view.
    if (window.matchMedia("(max-width: 800px)").matches) panelRef.current?.scrollIntoView({ block: "start" });
    if (!tool) nameRef.current?.focus({ preventScroll: true });
    // Only when the panel opens.
  }, []);
  // Previews of photos not yet uploaded are let go when the panel closes.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const fieldError = (field: keyof Draft) =>
    error?.field === field ? (
      <span className="tool-field-error" role="alert">
        {error.text}
      </span>
    ) : null;

  async function uploadPhotos(id: string, files: File[]): Promise<PersonalTool | null> {
    const form = new FormData();
    for (const file of files) form.append("photos", file);
    const response = await fetch(`/api/tools/${encodeURIComponent(id)}/photos`, { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setPhotoNote(PHOTO_ERROR[body.error ?? ""] ?? "The photos couldn't be added.");
      return null;
    }
    setPhotoNote("");
    return ((await response.json()) as { tool: PersonalTool }).tool;
  }

  async function addPhotos(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (fileRef.current) fileRef.current.value = "";
    if (list.length === 0) return;
    if (!tool) {
      setPending((current) => [...current, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      return;
    }
    setBusy(true);
    const next = await uploadPhotos(tool.id, list).finally(() => setBusy(false));
    if (next) onSaved(next);
  }

  async function photoAction(method: "DELETE" | "PUT", path: string) {
    if (!tool) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/photos/${path}`, { method });
      if (!response.ok) throw new Error("photo");
      onSaved(((await response.json()) as { tool: PersonalTool }).tool);
      setPhotoNote("");
    } catch {
      setPhotoNote("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(tool ? `/api/tools/${encodeURIComponent(tool.id)}` : "/api/tools", {
        method: tool ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => ({}))) as { tool?: PersonalTool; error?: string };
      if (!response.ok || !body.tool) {
        setError(FIELD_ERROR[body.error ?? ""] ?? { field: "form", text: "The tool couldn't be saved. Try again." });
        return;
      }
      let savedTool = body.tool;
      if (!tool && pending.length) {
        savedTool = (await uploadPhotos(savedTool.id, pending.map((item) => item.file))) ?? savedTool;
      }
      onSaved(savedTool);
      if (tool) onClose();
    } catch {
      setError({ field: "form", text: "The tool couldn't be saved. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!tool) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("remove");
      onRemoved(tool.id);
    } catch {
      setError({ field: "form", text: "The tool couldn't be removed. Try again." });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const title = tool ? tool.name : "New tool";
  const photoCount = (tool?.photos.length ?? 0) + pending.length;
  const unlinked = roles.filter((role) => !draft.roleIds.includes(role.id));

  return (
    <aside ref={panelRef} className="tool-panel" aria-label={title}>
      <form onSubmit={save} noValidate>
        <div className="tool-panel-head">
          <h2>{title}</h2>
          <button type="button" className="tool-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {tool?.draft ? (
          <p className="tool-draft-note">Added from a photo. Fill in what you know and save; it stops needing details.</p>
        ) : null}

        <div className="tool-photos">
          <p className="tool-label">Photos</p>
          <div className="tool-photo-row">
            {tool?.photos.map((photo) => (
              <div key={photo.id} className="tool-photo">
                <img src={photo.url} alt="" />
                {photo.cover ? (
                  <span className="tool-cover">Cover</span>
                ) : (
                  <button
                    type="button"
                    className="tool-photo-btn is-cover"
                    aria-label="Make this the cover"
                    title="Make this the cover"
                    disabled={busy}
                    onClick={() => void photoAction("PUT", `${encodeURIComponent(photo.id)}/cover`)}
                  >
                    <Star size={12} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="tool-photo-btn"
                  aria-label="Remove photo"
                  disabled={busy}
                  onClick={() => void photoAction("DELETE", encodeURIComponent(photo.id))}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
            {pending.map((item, index) => (
              <div key={item.url} className="tool-photo">
                <img src={item.url} alt="" />
                {index === 0 && !tool?.photos.length ? <span className="tool-cover">Cover</span> : null}
                <button
                  type="button"
                  className="tool-photo-btn"
                  aria-label="Remove photo"
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    setPending((current) => current.filter((other) => other.url !== item.url));
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
            {photoCount < TOOL_PHOTO_LIMIT ? (
              <button type="button" className="tool-photo-add" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus size={18} aria-hidden="true" />
                Add photos
              </button>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void addPhotos(event.target.files)} />
          </div>
          {photoNote ? (
            <p className="tool-field-error" role="alert">
              {photoNote}
            </p>
          ) : null}
        </div>

        <label className="tool-field">
          Name
          <input ref={nameRef} value={draft.name} placeholder="e.g. Fluke 87V multimeter" onChange={(event) => set("name", event.target.value)} />
          {fieldError("name")}
        </label>
        <div className="tool-grid">
          <label className="tool-field">
            Category
            <select value={draft.category} onChange={(event) => set("category", event.target.value)}>
              {EQUIPMENT_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {EQUIPMENT_CATEGORY_LABEL[key]}
                </option>
              ))}
            </select>
            {fieldError("category")}
          </label>
          <label className="tool-field">
            Whose it is
            <select value={draft.ownership} onChange={(event) => set("ownership", event.target.value)}>
              {TOOL_OWNERSHIPS.map((key) => (
                <option key={key} value={key}>
                  {TOOL_OWNERSHIP_LABEL[key]}
                </option>
              ))}
            </select>
            {fieldError("ownership")}
          </label>
          <label className="tool-field">
            Maker
            <input value={draft.maker} onChange={(event) => set("maker", event.target.value)} />
          </label>
          <label className="tool-field">
            Model
            <input value={draft.model} onChange={(event) => set("model", event.target.value)} />
          </label>
          <label className="tool-field">
            Serial
            <input value={draft.serial} onChange={(event) => set("serial", event.target.value)} />
          </label>
          <label className="tool-field">
            Condition
            <select value={draft.condition} onChange={(event) => set("condition", event.target.value)}>
              {TOOL_CONDITIONS.map((key) => (
                <option key={key} value={key}>
                  {TOOL_CONDITION_LABEL[key]}
                </option>
              ))}
            </select>
            {fieldError("condition")}
          </label>
          <label className="tool-field">
            How well you use it
            <select value={draft.skill} onChange={(event) => set("skill", event.target.value)}>
              <option value="">Not set</option>
              <option value="1">1 · Learning</option>
              <option value="2">2</option>
              <option value="3">3 · Comfortable</option>
              <option value="4">4</option>
              <option value="5">5 · Expert</option>
            </select>
            {fieldError("skill")}
          </label>
          <label className="tool-field">
            When you got it
            <input type="month" value={draft.acquired} onChange={(event) => set("acquired", event.target.value)} />
            {fieldError("acquired")}
          </label>
          <label className="tool-field">
            What you paid
            <input inputMode="decimal" value={draft.paid} placeholder="$" onChange={(event) => set("paid", event.target.value)} />
            {fieldError("paid")}
          </label>
          <label className="tool-field">
            Worth now
            <input inputMode="decimal" value={draft.worth} placeholder="$" onChange={(event) => set("worth", event.target.value)} />
          </label>
        </div>
        <label className="tool-field">
          Where it's kept
          <input value={draft.keptAt} placeholder="e.g. Truck toolbox" onChange={(event) => set("keptAt", event.target.value)} />
        </label>
        <label className="tool-field">
          Tags
          <input value={draft.tags} placeholder="Comma between tags" onChange={(event) => set("tags", event.target.value)} />
        </label>

        <div className="tool-roles">
          <p className="tool-label">Used on</p>
          <div className="tool-role-row">
            {draft.roleIds.map((id) => (
              <span key={id} className="tool-role">
                {roles.find((role) => role.id === id)?.name ?? "A removed role"}
                <button
                  type="button"
                  aria-label="Take off this role"
                  onClick={() => set("roleIds", draft.roleIds.filter((other) => other !== id))}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
            {unlinked.length ? (
              <select
                aria-label="Add a role"
                className="tool-role-add"
                value=""
                onChange={(event) => {
                  if (event.target.value) set("roleIds", [...draft.roleIds, event.target.value]);
                }}
              >
                <option value="">+ Add a role</option>
                {unlinked.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            ) : roles.length === 0 ? (
              <span className="tools-muted">Add a job in Career History to link it here.</span>
            ) : null}
          </div>
          {fieldError("roleIds")}
        </div>

        <label className="tool-field">
          Notes
          <textarea rows={3} value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>

        {error?.field === "form" ? (
          <p className="tool-field-error" role="alert">
            {error.text}
          </p>
        ) : null}

        <div className="tool-panel-foot">
          {tool ? (
            confirming ? (
              <span className="tool-confirm">
                Remove {tool.name} and its photos?
                <button type="button" className="tool-danger" disabled={busy} onClick={() => void remove()}>
                  Remove
                </button>
                <button type="button" className="tools-btn" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="tool-danger" onClick={() => setConfirming(true)}>
                Remove tool
              </button>
            )
          ) : null}
          <span className="tool-spacer" />
          {confirming ? null : (
            <>
              <button type="button" className="tools-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="tools-btn is-primary" disabled={busy}>
                {tool ? "Save" : "Add tool"}
              </button>
            </>
          )}
        </div>
      </form>
    </aside>
  );
}
