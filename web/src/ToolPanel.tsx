import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Crop, ImagePlus, Star, X } from "lucide-react";
import { FramedPhoto, ToolPhotoFrame } from "./ToolPhotoFrame";
import { ToolPhotoViewer } from "./ToolPhotoViewer";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL } from "@core/role-gear";
import {
  TOOL_CONDITIONS,
  TOOL_CONDITION_LABEL,
  TOOL_OWNERSHIPS,
  TOOL_OWNERSHIP_LABEL,
  TOOL_PHOTO_DRAG_TYPE,
  TOOL_PHOTO_LIMIT,
  toolPhotoProblem,
  type PersonalTool,
  type ToolKit,
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
  kitIds: string[];
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
    kitIds: tool?.kitIds ?? [],
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
  "kit-missing": { field: "kitIds", text: "One of these kits is gone. Take it off and save again." },
};

const PHOTO_ERROR: Record<string, string> = {
  "photo-type": "That file isn't a photo.",
  "photo-too-large": "That photo is over 5 MB.",
  "photo-empty": "That photo is empty.",
  "photo-limit": `A tool keeps at most ${TOOL_PHOTO_LIMIT} photos.`,
};

const PHOTO_REASON: Record<string, string> = {
  "photo-type": "isn't a photo",
  "photo-too-large": "is over 5 MB",
  "photo-empty": "is empty",
};

/** Splits picked files into photos that can be sent and a line naming the ones that can't. */
function checkPhotos(files: File[]): { good: File[]; note: string } {
  const good: File[] = [];
  const bad: string[] = [];
  for (const file of files) {
    const problem = toolPhotoProblem({ type: file.type, size: file.size });
    if (problem) bad.push(`${file.name} ${PHOTO_REASON[problem]}`);
    else good.push(file);
  }
  return { good, note: bad.length ? `Not added: ${bad.join("; ")}.` : "" };
}

/**
 * One tool, for adding or changing: every field, its photos, the roles it was
 * used on, and Remove. Adding uses the same fields as changing.
 */
export function ToolPanel({
  tool,
  roles,
  kits = [],
  onSaved,
  onRemoved,
  onClose,
  onOpen,
  nextDraft = null,
}: {
  /** The tool to change; null to add one. */
  tool: PersonalTool | null;
  roles: ToolRoleChoice[];
  kits?: ToolKit[];
  onSaved: (tool: PersonalTool) => void;
  onRemoved: (id: string) => void;
  onClose: () => void;
  /** Opens another tool in the panel: a duplicate just made, or the next draft. */
  onOpen?: (id: string) => void;
  /** The draft after this one, while this is a draft and others wait. */
  nextDraft?: { id: string; left: number } | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(tool));
  const [error, setError] = useState<{ field: keyof Draft | "form"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  // The photo shown full size, by its place in the row.
  const [viewing, setViewing] = useState<number | null>(null);
  // The photo being dragged to a new place.
  const dragged = useRef<number | null>(null);
  // After a move, focus follows the moved photo (its own move button may be gone).
  const focusPhoto = useRef<number | null>(null);
  useEffect(() => {
    if (focusPhoto.current === null) return;
    panelRef.current?.querySelector<HTMLElement>(`[aria-label="View photo ${focusPhoto.current + 1}"]`)?.focus();
    focusPhoto.current = null;
  }, [tool?.photos]);
  // Asking "Copy the photos too?" before duplicating.
  const [duplicating, setDuplicating] = useState(false);
  // The photo being framed in the Adjust photo dialog.
  const [adjusting, setAdjusting] = useState<string | null>(null);
  // Photos picked before a new tool is saved, uploaded right after it is.
  const [pending, setPending] = useState<Array<{ file: File; url: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // When the panel sits under the grid (a narrow page), bring it into view.
    const panel = panelRef.current;
    const grid = panel?.previousElementSibling;
    if (panel && grid && panel.getBoundingClientRect().top >= grid.getBoundingClientRect().bottom - 1) {
      panel.scrollIntoView({ block: "start" });
    }
    // Keyboard users land in the panel: on the name for a new tool, else on its heading.
    if (tool) headingRef.current?.focus({ preventScroll: true });
    else nameRef.current?.focus({ preventScroll: true });
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

  /** Sends photos to a saved tool. Returns the tool, or the reason they weren't added. */
  async function uploadPhotos(id: string, files: File[]): Promise<{ tool: PersonalTool } | { failed: string }> {
    try {
      const form = new FormData();
      for (const file of files) form.append("photos", file);
      const response = await fetch(`/api/tools/${encodeURIComponent(id)}/photos`, { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { failed: PHOTO_ERROR[body.error ?? ""] ?? "The photos couldn't be added. Try again." };
      }
      return { tool: ((await response.json()) as { tool: PersonalTool }).tool };
    } catch {
      return { failed: "The photos couldn't be added. Try again." };
    }
  }

  async function addPhotos(files: FileList | null) {
    const { good, note } = checkPhotos(files ? Array.from(files) : []);
    if (fileRef.current) fileRef.current.value = "";
    setPhotoNote(note);
    if (good.length === 0) return;
    if (!tool) {
      setPending((current) => [...current, ...good.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      return;
    }
    setBusy(true);
    const result = await uploadPhotos(tool.id, good).finally(() => setBusy(false));
    if ("tool" in result) onSaved(result.tool);
    else setPhotoNote([note, result.failed].filter(Boolean).join(" "));
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

  /** Moves the photo at `from` to `to` and saves the new order. The cover stays the cover. */
  async function movePhoto(from: number, to: number) {
    if (!tool || from === to || to < 0 || to >= tool.photos.length) return;
    const ids = tool.photos.map((photo) => photo.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    setBusy(true);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/photos/order`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoIds: ids }),
      });
      if (!response.ok) throw new Error("order");
      focusPhoto.current = to;
      onSaved(((await response.json()) as { tool: PersonalTool }).tool);
      setPhotoNote("");
    } catch {
      setPhotoNote("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent, thenOpen?: string) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let savedTool: PersonalTool;
    try {
      const response = await fetch(tool ? `/api/tools/${encodeURIComponent(tool.id)}` : "/api/tools", {
        method: tool ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => ({}))) as { tool?: PersonalTool; error?: string };
      if (!response.ok || !body.tool) {
        setError(FIELD_ERROR[body.error ?? ""] ?? { field: "form", text: "The tool couldn't be saved. Try again." });
        setBusy(false);
        return;
      }
      savedTool = body.tool;
    } catch {
      setError({ field: "form", text: "The tool couldn't be saved. Try again." });
      setBusy(false);
      return;
    }
    // The tool is saved. Photos picked before saving go up now; if they can't,
    // the tool stays saved and the panel says what happened to the photos.
    if (!tool && pending.length) {
      const result = await uploadPhotos(savedTool.id, pending.map((item) => item.file));
      pending.forEach((item) => URL.revokeObjectURL(item.url));
      setPending([]);
      if ("tool" in result) savedTool = result.tool;
      else setPhotoNote(`The tool is saved, but its photos weren't added. ${result.failed}`);
    }
    setBusy(false);
    onSaved(savedTool);
    if (tool && thenOpen && onOpen) onOpen(thenOpen);
    else if (tool) onClose();
  }

  /** Makes a copy of this tool, with or without its photos, and opens it. */
  async function duplicate(withPhotos: boolean) {
    if (!tool) return;
    setBusy(true);
    setError(null);
    try {
      // Changes not yet saved are saved first, so neither the tool nor its copy loses them.
      if (JSON.stringify(draft) !== JSON.stringify(draftOf(tool))) {
        const saved = await fetch(`/api/tools/${encodeURIComponent(tool.id)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        });
        const body = (await saved.json().catch(() => ({}))) as { tool?: PersonalTool; error?: string };
        if (!saved.ok || !body.tool) {
          setError(FIELD_ERROR[body.error ?? ""] ?? { field: "form", text: "The tool couldn't be saved. Try again." });
          setDuplicating(false);
          return;
        }
        onSaved(body.tool);
      }
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photos: withPhotos }),
      });
      if (!response.ok) throw new Error("duplicate");
      const copy = ((await response.json()) as { tool: PersonalTool }).tool;
      onSaved(copy);
      onOpen?.(copy.id);
    } catch {
      setError({ field: "form", text: "The tool couldn't be duplicated. Try again." });
      setDuplicating(false);
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
  const otherKits = kits.filter((kit) => !draft.kitIds.includes(kit.id));

  return (
    <aside ref={panelRef} className="tool-panel" aria-label={title}>
      <form onSubmit={save} noValidate>
        <div className="tool-panel-head">
          <h2 ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
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
            {tool?.photos.map((photo, index) => (
              <div
                key={photo.id}
                className="tool-photo"
                draggable={!busy}
                onDragStart={(event) => {
                  dragged.current = index;
                  event.dataTransfer?.setData(TOOL_PHOTO_DRAG_TYPE, photo.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (dragged.current !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  // A photo dropped here takes this place; files dropped on the page are handled there.
                  if (dragged.current === null) return;
                  event.stopPropagation();
                  const from = dragged.current;
                  dragged.current = null;
                  void movePhoto(from, index);
                }}
                onDragEnd={() => {
                  dragged.current = null;
                }}
              >
                <button type="button" className="tool-photo-view" aria-label={`View photo ${index + 1}`} onClick={() => setViewing(index)}>
                  <FramedPhoto photo={photo} />
                </button>
                {index > 0 ? (
                  <button
                    type="button"
                    className="tool-photo-btn is-left"
                    aria-label={`Move photo ${index + 1} left`}
                    title="Move left"
                    disabled={busy}
                    onClick={() => void movePhoto(index, index - 1)}
                  >
                    <ChevronLeft size={12} aria-hidden="true" />
                  </button>
                ) : null}
                {index < tool.photos.length - 1 ? (
                  <button
                    type="button"
                    className="tool-photo-btn is-right"
                    aria-label={`Move photo ${index + 1} right`}
                    title="Move right"
                    disabled={busy}
                    onClick={() => void movePhoto(index, index + 1)}
                  >
                    <ChevronRight size={12} aria-hidden="true" />
                  </button>
                ) : null}
                {photo.cover ? (
                  <span className="tool-cover">Cover</span>
                ) : (
                  <button
                    type="button"
                    className="tool-photo-btn is-cover"
                    aria-label={`Make photo ${index + 1} the cover`}
                    title="Make this the cover"
                    disabled={busy}
                    onClick={() => void photoAction("PUT", `${encodeURIComponent(photo.id)}/cover`)}
                  >
                    <Star size={12} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="tool-photo-btn is-adjust"
                  aria-label={`Adjust photo ${index + 1}`}
                  title="Adjust: rotate, flip, zoom"
                  disabled={busy}
                  onClick={() => setAdjusting(photo.id)}
                >
                  <Crop size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tool-photo-btn"
                  aria-label={`Remove photo ${index + 1}`}
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

        {kits.length > 0 || draft.kitIds.length > 0 ? (
          <div className="tool-roles">
            <p className="tool-label">Kits</p>
            <div className="tool-role-row">
              {draft.kitIds.map((id) => {
                const name = kits.find((kit) => kit.id === id)?.name ?? "A deleted kit";
                return (
                  <span key={id} className="tool-role is-kit">
                    {name}
                    <button
                      type="button"
                      aria-label={`Take out of ${name}`}
                      onClick={() => set("kitIds", draft.kitIds.filter((other) => other !== id))}
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
              {otherKits.length ? (
                <select
                  aria-label="Add to a kit"
                  className="tool-role-add"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) set("kitIds", [...draft.kitIds, event.target.value]);
                  }}
                >
                  <option value="">+ Add to a kit</option>
                  {otherKits.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {fieldError("kitIds")}
          </div>
        ) : null}

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
            ) : duplicating ? (
              <span className="tool-confirm">
                Copy the photos too?
                <button type="button" className="tools-btn" disabled={busy} onClick={() => void duplicate(true)}>
                  With photos
                </button>
                <button type="button" className="tools-btn" disabled={busy} onClick={() => void duplicate(false)}>
                  Without photos
                </button>
                <button type="button" className="tools-link" onClick={() => setDuplicating(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <>
                <button type="button" className="tool-danger" onClick={() => setConfirming(true)}>
                  Remove tool
                </button>
                <button type="button" className="tools-link" onClick={() => setDuplicating(true)}>
                  Duplicate
                </button>
              </>
            )
          ) : null}
          <span className="tool-spacer" />
          {confirming || duplicating ? null : (
            <>
              <button type="button" className="tools-btn" onClick={onClose}>
                Cancel
              </button>
              {tool?.draft && nextDraft ? (
                <button type="button" className="tools-btn" disabled={busy} onClick={(event) => void save(event, nextDraft.id)}>
                  Save and next draft ({nextDraft.left} left)
                </button>
              ) : null}
              <button type="submit" className="tools-btn is-primary" disabled={busy}>
                {tool ? "Save" : "Add tool"}
              </button>
            </>
          )}
        </div>
      </form>
      {tool && viewing !== null && tool.photos.length ? (
        <ToolPhotoViewer photos={tool.photos} start={viewing} onClose={() => setViewing(null)} />
      ) : null}
      {tool && adjusting && tool.photos.some((photo) => photo.id === adjusting) ? (
        <ToolPhotoFrame
          toolId={tool.id}
          photo={tool.photos.find((photo) => photo.id === adjusting)!}
          onSaved={onSaved}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </aside>
  );
}
