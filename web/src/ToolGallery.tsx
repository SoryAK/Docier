import { useEffect, useRef, useState, type FormEvent } from "react";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Crop, ImagePlus, Maximize2, Minimize2, Pencil, Star, Trash2, Wrench, X } from "lucide-react";
import { ToolPhotoFrame } from "./ToolPhotoFrame";
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

const LARGE_KEY = "tools.gallery.large";

/** The fields behind More details. */
const MORE_FIELDS = new Set<keyof Draft>(["category", "serial", "skill", "acquired", "paid", "worth", "keptAt", "tags", "kitIds", "notes"]);

/** Whether a tool has anything behind More details, so it opens by itself and nothing filled in is hidden. */
function hasMore(draft: Draft): boolean {
  return (
    draft.category !== "tool" ||
    Boolean(draft.serial || draft.skill || draft.acquired || draft.paid || draft.worth || draft.keptAt || draft.tags || draft.notes) ||
    draft.kitIds.length > 0
  );
}

function readLarge(): boolean {
  try {
    return localStorage.getItem(LARGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Dollars, with cents only when there are some. */
function money(amount: number | null): string {
  if (amount === null) return "";
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const SKILL_LABEL: Record<number, string> = { 1: "1 · Learning", 2: "2", 3: "3 · Comfortable", 4: "4", 5: "5 · Expert" };

/** "2024-06" as "June 2024". */
function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/**
 * One tool in a popout, like a gallery: its photos large on one side, its
 * details on the other, and ‹ › to move through the tools shown on the page.
 * Edit turns the details into the same fields used to add a tool.
 */
export function ToolGallery({
  tool,
  roles,
  kits = [],
  pageIds = [],
  onSaved,
  onRemoved,
  onClose,
  onOpen,
  nextDraft = null,
}: {
  /** The tool shown; null to add one. */
  tool: PersonalTool | null;
  roles: ToolRoleChoice[];
  kits?: ToolKit[];
  /** The tools shown on the page, in order, to move through with ‹ ›. */
  pageIds?: string[];
  onSaved: (tool: PersonalTool) => void;
  onRemoved: (id: string) => void;
  onClose: () => void;
  /** Opens another tool: the next or previous one, a duplicate just made, or the next draft. */
  onOpen?: (id: string) => void;
  /** The draft after this one, while this is a draft and others wait. */
  nextDraft?: { id: string; left: number } | null;
}) {
  // A new tool, or a draft, opens ready to fill in; anything else opens to read.
  const [editing, setEditing] = useState(() => !tool || tool.draft);
  const [draft, setDraft] = useState<Draft>(() => draftOf(tool));
  const [more, setMore] = useState(() => hasMore(draftOf(tool)));
  const [error, setError] = useState<{ field: keyof Draft | "form"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Asking "Copy the photos too?" before duplicating.
  const [duplicating, setDuplicating] = useState(false);
  // The photo shown large, by its place in the row.
  const [shown, setShown] = useState(0);
  // The photo open full size (the lightbox).
  const [fullSize, setFullSize] = useState(false);
  // The photo being framed in the Adjust photo dialog.
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [large, setLarge] = useState(readLarge);
  // Photos picked before a new tool is saved, uploaded right after it is.
  const [pending, setPending] = useState<Array<{ file: File; url: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // The photo being dragged to a new place.
  const dragged = useRef<number | null>(null);
  // After a move, focus follows the moved photo.
  const focusPhoto = useRef<number | null>(null);

  const photos = tool?.photos ?? [];
  const count = photos.length + pending.length;
  const at = Math.min(shown, Math.max(count - 1, 0));
  const shownPhoto = photos[at] ?? null;
  const shownPending = shownPhoto ? null : (pending[at - photos.length] ?? null);

  useEffect(() => {
    // Keyboard users land in the popout: on the name when filling it in, else on its heading.
    if (editing) nameRef.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
    // Only when the popout opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Previews of photos not yet uploaded are let go when the popout closes.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  useEffect(() => {
    stripRef.current?.querySelector(`[data-photo="${at}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (focusPhoto.current === null) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-photo="${focusPhoto.current}"] :is(input, button)`)?.focus();
    focusPhoto.current = null;
  }, [at, photos]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  // A refused field behind More details is shown, with what's wrong beside it.
  useEffect(() => {
    if (error && error.field !== "form" && MORE_FIELDS.has(error.field)) setMore(true);
  }, [error]);
  const fieldError = (field: keyof Draft) =>
    error?.field === field ? (
      <span className="tool-field-error" role="alert">
        {error.text}
      </span>
    ) : null;
  const changed = tool ? JSON.stringify(draft) !== JSON.stringify(draftOf(tool)) : true;

  /**
   * After an action whose button goes away (Save, Cancel, a photo action), focus
   * would fall out of the popout and ← → would stop working: it goes to the heading.
   */
  function keepFocus() {
    window.setTimeout(() => {
      const popout = headingRef.current?.closest("dialog") ?? nameRef.current?.closest("dialog");
      if (popout && popout.contains(document.activeElement) && document.activeElement !== document.body) return;
      (headingRef.current ?? nameRef.current)?.focus({ preventScroll: true });
    }, 0);
  }

  function toggleLarge() {
    setLarge((current) => {
      try {
        localStorage.setItem(LARGE_KEY, current ? "0" : "1");
      } catch {
        /* the size just isn't remembered */
      }
      return !current;
    });
  }

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
    if ("tool" in result) {
      onSaved(result.tool);
      // Show the first photo just added.
      setShown(photos.length);
      keepFocus();
    } else setPhotoNote([note, result.failed].filter(Boolean).join(" "));
  }

  async function photoAction(method: "DELETE" | "PUT", path: string) {
    if (!tool) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/photos/${path}`, { method });
      if (!response.ok) throw new Error("photo");
      onSaved(((await response.json()) as { tool: PersonalTool }).tool);
      setPhotoNote("");
      keepFocus();
    } catch {
      setPhotoNote("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Moves the photo at `from` to `to` and saves the new order. The cover stays the cover. */
  async function movePhoto(from: number, to: number) {
    if (!tool || busy || from === to || to < 0 || to >= photos.length) return;
    const ids = photos.map((photo) => photo.id);
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
      setShown(to);
      onSaved(((await response.json()) as { tool: PersonalTool }).tool);
      setPhotoNote("");
    } catch {
      setPhotoNote("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Saves the fields. Returns the saved tool, or null when it couldn't be saved (and says why). */
  async function saveFields(): Promise<PersonalTool | null> {
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
        return null;
      }
      savedTool = body.tool;
    } catch {
      setError({ field: "form", text: "The tool couldn't be saved. Try again." });
      setBusy(false);
      return null;
    }
    // The tool is saved. Photos picked before saving go up now; if they can't,
    // the tool stays saved and the popout says what happened to the photos.
    if (!tool && pending.length) {
      const result = await uploadPhotos(savedTool.id, pending.map((item) => item.file));
      pending.forEach((item) => URL.revokeObjectURL(item.url));
      setPending([]);
      if ("tool" in result) savedTool = result.tool;
      else setPhotoNote(`The tool is saved, but its photos weren't added. ${result.failed}`);
    }
    setBusy(false);
    onSaved(savedTool);
    return savedTool;
  }

  async function save(event: FormEvent, thenOpen?: string) {
    event.preventDefault();
    const saved = await saveFields();
    if (!saved) return;
    if (tool && thenOpen && onOpen) {
      onOpen(thenOpen);
      return;
    }
    // Saved: back to reading it.
    setDraft(draftOf(saved));
    setEditing(false);
    keepFocus();
  }

  /** Moves to another tool; changes not yet saved are saved first, and a failed save stays here. */
  async function goTo(id: string) {
    if (busy || !onOpen) return;
    if (editing && tool && changed && !(await saveFields())) return;
    onOpen(id);
  }

  const place = tool ? pageIds.indexOf(tool.id) : -1;
  const paging = place >= 0 && pageIds.length > 1;
  const step = (by: number) => pageIds[(place + by + pageIds.length) % pageIds.length]!;

  /** Makes a copy of this tool, with or without its photos, and opens it. */
  async function duplicate(withPhotos: boolean) {
    if (!tool) return;
    setBusy(true);
    setError(null);
    try {
      // Changes not yet saved are saved first, so neither the tool nor its copy loses them.
      if (changed) {
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
  const unlinked = roles.filter((role) => !draft.roleIds.includes(role.id));
  const otherKits = kits.filter((kit) => !draft.kitIds.includes(kit.id));
  const roleNames = (tool?.roleIds ?? []).map((id) => roles.find((role) => role.id === id)?.name).filter(Boolean);
  const kitNames = (tool?.kitIds ?? []).map((id) => kits.find((kit) => kit.id === id)?.name).filter(Boolean);
  const n = at + 1;

  const windowButtons = (
    <HStack gap={1}>
      <IconButton
        label={large ? "Make smaller" : "Make larger"}
        variant="ghost"
        size="sm"
        icon={large ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        onClick={toggleLarge}
      />
      <IconButton label="Close" variant="ghost" size="sm" icon={<X size={18} />} onClick={onClose} />
    </HStack>
  );

  const photoSide = (
    <div className="tool-gallery-photos">
      <div className="tool-gallery-hero">
        <AspectRatio ratio={4 / 3}>
          {shownPhoto ? (
            <img src={shownPhoto.url} alt={`${title}, photo ${n}`} draggable={false} />
          ) : shownPending ? (
            <img src={shownPending.url} alt={`${title}, photo ${n}`} draggable={false} />
          ) : (
            <span className="tool-gallery-empty">
              <Wrench size={34} aria-hidden="true" />
            </span>
          )}
        </AspectRatio>
        {shownPhoto ? (
          <>
            <div className="tool-gallery-hero-tools">
              {shownPhoto.cover ? null : (
                <IconButton
                  label={`Make photo ${n} the cover`}
                  variant="secondary"
                  size="sm"
                  icon={<Star size={15} />}
                  isDisabled={busy}
                  onClick={() => void photoAction("PUT", `${encodeURIComponent(shownPhoto.id)}/cover`)}
                />
              )}
              <IconButton label={`Adjust photo ${n}`} variant="secondary" size="sm" icon={<Crop size={15} />} isDisabled={busy} onClick={() => setAdjusting(shownPhoto.id)} />
              <IconButton
                label={`Remove photo ${n}`}
                variant="secondary"
                size="sm"
                icon={<Trash2 size={15} />}
                isDisabled={busy}
                onClick={() => void photoAction("DELETE", encodeURIComponent(shownPhoto.id))}
              />
              <IconButton label={`View photo ${n} full size`} variant="secondary" size="sm" icon={<Maximize2 size={15} />} onClick={() => setFullSize(true)} />
            </div>
            {shownPhoto.cover ? <span className="tool-cover">Cover</span> : null}
            {photos.length > 1 ? (
              <div className="tool-gallery-hero-move">
                {at > 0 ? (
                  <IconButton label={`Move photo ${n} left`} variant="secondary" size="sm" icon={<ChevronLeft size={15} />} isDisabled={busy} onClick={() => void movePhoto(at, at - 1)} />
                ) : null}
                {at < photos.length - 1 ? (
                  <IconButton label={`Move photo ${n} right`} variant="secondary" size="sm" icon={<ChevronRight size={15} />} isDisabled={busy} onClick={() => void movePhoto(at, at + 1)} />
                ) : null}
              </div>
            ) : null}
          </>
        ) : shownPending ? (
          <div className="tool-gallery-hero-tools">
            <IconButton
              label={`Remove photo ${n}`}
              variant="secondary"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => {
                URL.revokeObjectURL(shownPending.url);
                setPending((current) => current.filter((item) => item.url !== shownPending.url));
              }}
            />
          </div>
        ) : null}
      </div>
      {/* The photos scroll out from under the divider; Add photos stays put at the right. */}
      <div className="tool-gallery-strip-row">
        {count > 1 ? (
          <>
            <div ref={stripRef} className="tool-gallery-strip" role="group" aria-label="Photos">
              {[...photos.map((photo) => ({ key: photo.id, url: photo.url, saved: true })), ...pending.map((item) => ({ key: item.url, url: item.url, saved: false }))].map(
                (item, index) => (
                  <div
                    key={item.key}
                    className="tool-gallery-thumb"
                    data-photo={index}
                    draggable={item.saved && !busy}
                    onDragStart={(event) => {
                      dragged.current = index;
                      event.dataTransfer?.setData(TOOL_PHOTO_DRAG_TYPE, item.key);
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
                    <SelectableCard
                      label={`Show photo ${index + 1}`}
                      isSelected={at === index}
                      onChange={() => setShown(index)}
                      variant="transparent"
                      padding={0}
                      width="100%"
                      height="100%"
                    >
                      <img src={item.url} alt="" draggable={false} />
                    </SelectableCard>
                  </div>
                ),
              )}
            </div>
            <span className="tool-gallery-divider" aria-hidden="true" />
          </>
        ) : null}
        {count < TOOL_PHOTO_LIMIT ? (
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
  );

  const removeAndCopy = tool ? (
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
      <HStack gap={2}>
        <Button label="Duplicate" variant="ghost" size="sm" icon={<Copy size={14} />} onClick={() => setDuplicating(true)} />
        <Button label="Remove tool" variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirming(true)} />
      </HStack>
    )
  ) : null;

  const formError =
    error?.field === "form" ? (
      <p className="tool-field-error" role="alert">
        {error.text}
      </p>
    ) : null;

  const details = tool ? (
    <VStack gap={4}>
      <HStack justify="between" align="start" gap={3}>
        <VStack gap={1}>
          <Heading level={1} accessibilityLevel={2} ref={headingRef} tabIndex={-1} className="tool-gallery-title">
            {tool.name}
          </Heading>
          {tool.maker || tool.model ? <Text type="supporting">{[tool.maker, tool.model].filter(Boolean).join(" · ")}</Text> : null}
        </VStack>
        <HStack gap={2} align="center">
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            icon={<Pencil size={14} />}
            onClick={() => {
              setDraft(draftOf(tool));
              setMore(hasMore(draftOf(tool)));
              setEditing(true);
              window.setTimeout(() => nameRef.current?.focus(), 0);
            }}
          />
          {windowButtons}
        </HStack>
      </HStack>
      {tool.draft ? <Banner status="warning" title="Needs details" description="Added from a photo. Edit to fill in what you know." /> : null}
      <MetadataList columns={2}>
        <MetadataListItem label="Whose it is">{TOOL_OWNERSHIP_LABEL[tool.ownership]}</MetadataListItem>
        {tool.condition ? <MetadataListItem label="Condition">{TOOL_CONDITION_LABEL[tool.condition]}</MetadataListItem> : null}
        {tool.category !== "tool" ? <MetadataListItem label="Category">{EQUIPMENT_CATEGORY_LABEL[tool.category]}</MetadataListItem> : null}
        {tool.serial ? <MetadataListItem label="Serial">{tool.serial}</MetadataListItem> : null}
        {tool.skill ? <MetadataListItem label="How well you use it">{SKILL_LABEL[tool.skill] ?? String(tool.skill)}</MetadataListItem> : null}
        {tool.acquired ? <MetadataListItem label="When you got it">{monthLabel(tool.acquired)}</MetadataListItem> : null}
        {tool.keptAt ? <MetadataListItem label="Where it's kept">{tool.keptAt}</MetadataListItem> : null}
        {tool.paid !== null ? <MetadataListItem label="Paid">{money(tool.paid)}</MetadataListItem> : null}
        {tool.worth !== null ? <MetadataListItem label="Worth now">{money(tool.worth)}</MetadataListItem> : null}
        {roleNames.length ? <MetadataListItem label="Used at">{roleNames.join(", ")}</MetadataListItem> : null}
        {kitNames.length ? <MetadataListItem label="Kits">{kitNames.join(", ")}</MetadataListItem> : null}
      </MetadataList>
      {tool.tags.length ? (
        <HStack gap={2} wrap="wrap">
          {tool.tags.map((tag) => (
            <Badge key={tag} variant="neutral" label={tag} />
          ))}
        </HStack>
      ) : null}
      {tool.notes ? <Text>{tool.notes}</Text> : null}
      {formError}
      <Divider />
      {removeAndCopy}
    </VStack>
  ) : null;

  const form = (
    <form className="tool-gallery-form" onSubmit={save} noValidate>
      <HStack justify="between" align="start" gap={3}>
        <Heading level={1} accessibilityLevel={2} className="tool-gallery-title">
          {!tool ? "New tool" : tool.draft ? "Fill in this draft" : `Edit ${tool.name}`}
        </Heading>
        {windowButtons}
      </HStack>
      {tool?.draft ? <p className="tool-draft-note">Added from a photo. Fill in what you know and save; it stops needing details.</p> : null}
      <label className="tool-field">
        Name
        <input ref={nameRef} value={draft.name} placeholder="e.g. Fluke 87V multimeter" onChange={(event) => set("name", event.target.value)} />
        {fieldError("name")}
      </label>
      <div className="tool-grid">
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
          Maker
          <input value={draft.maker} onChange={(event) => set("maker", event.target.value)} />
        </label>
        <label className="tool-field">
          Model
          <input value={draft.model} onChange={(event) => set("model", event.target.value)} />
        </label>
      </div>
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

      {/* Most people fill in the basics; the rest waits behind More details. */}
      <button
        type="button"
        className="tool-more"
        aria-expanded={more}
        aria-controls="tool-more-fields"
        onClick={() => setMore((open) => !open)}
      >
        {more ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        More details
      </button>
      {more ? (
        <div id="tool-more-fields" className="tool-more-fields">
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
              Serial
              <input value={draft.serial} onChange={(event) => set("serial", event.target.value)} />
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
        </div>
      ) : null}
      {formError}
      <div className="tool-gallery-form-foot">
        <span className="tool-spacer" />
        {confirming || duplicating ? null : (
          <>
            <button
              type="button"
              className="tools-btn"
              onClick={() => {
                if (!tool) {
                  onClose();
                  return;
                }
                setDraft(draftOf(tool));
                setError(null);
                setEditing(false);
                keepFocus();
              }}
            >
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
  );

  return (
    <>
      <Dialog
        className="tool-gallery"
        aria-label={title}
        isOpen
        purpose="form"
        width={large ? "calc(100vw - 3rem)" : "min(52rem, calc(100vw - 2rem))"}
        maxHeight={large ? "calc(100dvh - 3rem)" : "min(76dvh, 38rem)"}
        padding={0}
        onOpenChange={(next) => {
          if (next) return;
          // Escape closes what's open on top first: the photo framing, then the full-size photo.
          if (adjusting) {
            setAdjusting(null);
            return;
          }
          if (fullSize) return;
          onClose();
        }}
        onKeyDown={(event) => {
          if (!paging || editing || fullSize || adjusting || event.defaultPrevented) return;
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, [role=slider], [role=group][aria-label=Photos]")) return;
          event.preventDefault();
          void goTo(step(event.key === "ArrowLeft" ? -1 : 1));
        }}
      >
        <Layout
          padding={0}
          content={
            <LayoutContent isScrollable label={title} padding={0}>
              <div className={large ? "tool-gallery-sides is-large" : "tool-gallery-sides"}>
                {photoSide}
                {/* The details scroll on their own; the card keeps the photo side's height. */}
                <div className="tool-gallery-info-cell">
                  <div className="tool-gallery-info">{editing || !tool ? form : details}</div>
                </div>
              </div>
            </LayoutContent>
          }
          footer={
            paging ? (
              <LayoutFooter>
                <Divider />
                <HStack justify="center" align="center" gap={2} className="tool-gallery-pages">
                  <IconButton label="Previous tool" variant="secondary" size="sm" icon={<ChevronLeft size={18} />} isDisabled={busy} onClick={() => void goTo(step(-1))} />
                  <Text type="supporting">
                    {place + 1} of {pageIds.length}
                  </Text>
                  <IconButton label="Next tool" variant="secondary" size="sm" icon={<ChevronRight size={18} />} isDisabled={busy} onClick={() => void goTo(step(1))} />
                </HStack>
              </LayoutFooter>
            ) : undefined
          }
        />
        {tool && adjusting && photos.some((photo) => photo.id === adjusting) ? (
          <ToolPhotoFrame
            toolId={tool.id}
            photo={photos.find((photo) => photo.id === adjusting)!}
            onSaved={onSaved}
            onClose={() => setAdjusting(null)}
            inPlace
          />
        ) : null}
        {photos.length ? (
          <Lightbox
            isOpen={fullSize}
            onOpenChange={setFullSize}
            media={photos.map((photo, index) => ({ src: photo.url, alt: `${title}, photo ${index + 1}` }))}
            index={Math.min(at, photos.length - 1)}
            onIndexChange={setShown}
            hasZoom
          />
        ) : null}
      </Dialog>
    </>
  );
}
