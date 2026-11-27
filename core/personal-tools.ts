/**
 * My Tools: the occupant's own tools and equipment, with photos and the roles
 * they used them on. A role's Setup holds the employer's equipment; these are
 * yours (or shared, borrowed, rented). Never published.
 */
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory } from "./role-gear";
import { PROFILE_AVATAR_MAX_BYTES, avatarExtension, isAvatarType } from "./profile";

export const TOOL_OWNERSHIPS = ["mine", "shared", "borrowed", "rented"] as const;
export type ToolOwnership = (typeof TOOL_OWNERSHIPS)[number];
export const TOOL_OWNERSHIP_LABEL: Record<ToolOwnership, string> = {
  mine: "Mine",
  shared: "Shared",
  borrowed: "Borrowed",
  rented: "Rented",
};

export const TOOL_CONDITIONS = ["", "new", "good", "fair", "poor"] as const;
export type ToolCondition = (typeof TOOL_CONDITIONS)[number];
export const TOOL_CONDITION_LABEL: Record<ToolCondition, string> = {
  "": "Not set",
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/** The most photos one tool keeps. */
export const TOOL_PHOTO_LIMIT = 20;

/** How a photo shows, without changing the file: a quarter turn, flips, zoom, and the point kept in view. */
export type PhotoFraming = {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** 1 to 3. */
  zoom: number;
  /** 0 to 100, from the left. */
  focusX: number;
  /** 0 to 100, from the top. */
  focusY: number;
};

export const DEFAULT_FRAMING: PhotoFraming = { rotation: 0, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 };

export function readPhotoFraming(raw: unknown): { ok: true; value: PhotoFraming } | { ok: false; error: "framing-invalid" } {
  const bad = { ok: false, error: "framing-invalid" } as const;
  if (!raw || typeof raw !== "object") return bad;
  const value = raw as Record<string, unknown>;
  const within = (number: unknown, min: number, max: number) =>
    typeof number === "number" && Number.isFinite(number) && number >= min && number <= max;
  if (![0, 90, 180, 270].includes(value.rotation as number)) return bad;
  if (typeof value.flipH !== "boolean" || typeof value.flipV !== "boolean") return bad;
  if (!within(value.zoom, 1, 3) || !within(value.focusX, 0, 100) || !within(value.focusY, 0, 100)) return bad;
  return {
    ok: true,
    value: {
      rotation: value.rotation as PhotoFraming["rotation"],
      flipH: value.flipH,
      flipV: value.flipV,
      zoom: value.zoom as number,
      focusX: value.focusX as number,
      focusY: value.focusY as number,
    },
  };
}

/**
 * The CSS that shows a photo framed. The chosen point (a point on the photo as
 * taken) is lined up in its box, and the photo turns and zooms around it, so it
 * stays in view. Flips come before the turn, so "across" means across on screen.
 */
export function framingStyle(framing: PhotoFraming): { objectPosition: string; transformOrigin: string; transform: string | undefined } {
  const parts = [
    framing.flipH ? "scaleX(-1)" : "",
    framing.flipV ? "scaleY(-1)" : "",
    framing.rotation ? `rotate(${framing.rotation}deg)` : "",
    framing.zoom !== 1 ? `scale(${framing.zoom})` : "",
  ].filter(Boolean);
  const point = `${framing.focusX}% ${framing.focusY}%`;
  return { objectPosition: point, transformOrigin: point, transform: parts.length ? parts.join(" ") : undefined };
}

export type ToolPhoto = { id: string; url: string; cover: boolean; framing: PhotoFraming };

/** A named group of tools, like "Electrical kit". A tool can be in several. */
export type ToolKit = { id: string; name: string; createdAt: string };

const KIT_NAME_MAX = 60;

/** Checks a kit's name: required, and not another kit's name in any case. `selfId` is the kit being renamed. */
export function readKitName(
  raw: unknown,
  kits: ToolKit[],
  selfId?: string,
): { ok: true; name: string } | { ok: false; error: "kit-name-required" | "kit-name-taken" } {
  const name = typeof raw === "string" ? raw.trim().slice(0, KIT_NAME_MAX) : "";
  if (!name) return { ok: false, error: "kit-name-required" };
  const taken = kits.some((kit) => kit.id !== selfId && kit.name.toLowerCase() === name.toLowerCase());
  return taken ? { ok: false, error: "kit-name-taken" } : { ok: true, name };
}

export type ToolPhotoProblem = "photo-type" | "photo-empty" | "photo-too-large";

/** Why a file can't be a tool photo, or null when it can. Checked in the browser before sending, and again on the server. */
export function toolPhotoProblem(file: { type: string; size: number }): ToolPhotoProblem | null {
  if (!isAvatarType(file.type) || !avatarExtension(file.type)) return "photo-type";
  if (file.size === 0) return "photo-empty";
  if (file.size > PROFILE_AVATAR_MAX_BYTES) return "photo-too-large";
  return null;
}

export type PersonalTool = {
  id: string;
  name: string;
  category: EquipmentCategory;
  ownership: ToolOwnership;
  maker: string;
  model: string;
  serial: string;
  condition: ToolCondition;
  /** How well you use it, 1 to 5, or not set. */
  skill: number | null;
  /** When you got it, YYYY-MM, or "". */
  acquired: string;
  paid: number | null;
  worth: number | null;
  /** Where it's kept. */
  keptAt: string;
  tags: string[];
  notes: string;
  /** Added from a photo and not yet saved with details. */
  draft: boolean;
  roleIds: string[];
  kitIds: string[];
  /** Shown on the published career page (drafts never are). */
  onCareerPage: boolean;
  photos: ToolPhoto[];
  createdAt: string;
  updatedAt: string;
};

/** What adding a tool and changing one both take. */
export type ToolInput = Omit<PersonalTool, "id" | "draft" | "photos" | "createdAt" | "updatedAt">;

export type ToolInputError =
  | "name-required"
  | "category-invalid"
  | "ownership-invalid"
  | "condition-invalid"
  | "skill-invalid"
  | "acquired-invalid"
  | "amount-invalid"
  | "role-missing"
  | "kit-missing";

const TEXT_MAX = 120;
const NOTES_MAX = 2000;
const TAG_MAX = 40;
const TAGS_MAX = 20;

const text = (value: unknown, max = TEXT_MAX) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const blank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());

function readTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of list) {
    const tag = text(item, TAG_MAX);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (tags.length === TAGS_MAX) break;
  }
  return tags;
}

/** A number that is blank (null), or a finite amount of zero or more; undefined when it is neither. */
function readAmount(value: unknown): number | null | undefined {
  if (blank(value)) return null;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

/** Checks what was sent to add or change a tool. `roleIds` are the occupant's roles. */
export function readToolInput(
  raw: unknown,
  roleIds: ReadonlySet<string>,
  kitIds: ReadonlySet<string> = new Set(),
): { ok: true; value: ToolInput } | { ok: false; error: ToolInputError } {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = text(value.name);
  if (!name) return { ok: false, error: "name-required" };

  const category = blank(value.category) ? "tool" : value.category;
  if (!EQUIPMENT_CATEGORIES.includes(category as EquipmentCategory)) return { ok: false, error: "category-invalid" };
  const ownership = blank(value.ownership) ? "mine" : value.ownership;
  if (!TOOL_OWNERSHIPS.includes(ownership as ToolOwnership)) return { ok: false, error: "ownership-invalid" };
  const condition = value.condition ?? "";
  if (!TOOL_CONDITIONS.includes(condition as ToolCondition)) return { ok: false, error: "condition-invalid" };

  let skill: number | null = null;
  if (!blank(value.skill)) {
    skill = Number(value.skill);
    if (!Number.isInteger(skill) || skill < 1 || skill > 5) return { ok: false, error: "skill-invalid" };
  }
  const acquired = text(value.acquired);
  if (acquired && !/^\d{4}-(0[1-9]|1[0-2])$/.test(acquired)) return { ok: false, error: "acquired-invalid" };
  const paid = readAmount(value.paid);
  const worth = readAmount(value.worth);
  if (paid === undefined || worth === undefined) return { ok: false, error: "amount-invalid" };

  const linked = [...new Set(Array.isArray(value.roleIds) ? value.roleIds.filter((id): id is string => typeof id === "string") : [])];
  if (linked.some((id) => !roleIds.has(id))) return { ok: false, error: "role-missing" };
  const kits = [...new Set(Array.isArray(value.kitIds) ? value.kitIds.filter((id): id is string => typeof id === "string") : [])];
  if (kits.some((id) => !kitIds.has(id))) return { ok: false, error: "kit-missing" };

  return {
    ok: true,
    value: {
      name,
      category: category as EquipmentCategory,
      ownership: ownership as ToolOwnership,
      maker: text(value.maker),
      model: text(value.model),
      serial: text(value.serial),
      condition: condition as ToolCondition,
      skill,
      acquired,
      paid,
      worth,
      keptAt: text(value.keptAt),
      tags: readTags(value.tags),
      notes: text(value.notes, NOTES_MAX),
      roleIds: linked,
      kitIds: kits,
      onCareerPage: value.onCareerPage === true,
    },
  };
}

// ---- Changing many tools at once ----

export const BULK_TOOLS_MAX = 500;

/** The drag type of a photo being moved within a tool, so a drop zone for new photos can tell it apart. */
export const TOOL_PHOTO_DRAG_TYPE = "application/x-tool-photo";

/** One change applied to every picked tool. Only fields one value can fit for many tools. */
export type BulkChange =
  | { kind: "category"; category: EquipmentCategory }
  | { kind: "ownership"; ownership: ToolOwnership }
  | { kind: "condition"; condition: ToolCondition }
  | { kind: "addTags"; tags: string[] }
  | { kind: "removeTags"; tags: string[] }
  | { kind: "addKit"; kitId: string }
  | { kind: "addKit"; newKitName: string }
  | { kind: "removeKit"; kitId: string }
  | { kind: "careerPage"; on: boolean }
  | { kind: "delete" };

export type BulkError = "bulk-ids" | "bulk-too-many" | "bulk-change" | "not-found" | "kit-missing" | "kit-name-required" | "kit-name-taken";

export type BulkFields = Pick<PersonalTool, "category" | "ownership" | "condition" | "tags" | "kitIds" | "onCareerPage">;

function readBulkChange(raw: unknown, kits: ToolKit[]): { ok: true; change: BulkChange } | { ok: false; error: BulkError } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "bulk-change" };
  const value = raw as Record<string, unknown>;
  const bad = { ok: false, error: "bulk-change" } as const;
  const kitKnown = (id: unknown) => typeof id === "string" && kits.some((kit) => kit.id === id);
  switch (value.kind) {
    case "category":
      return EQUIPMENT_CATEGORIES.includes(value.category as EquipmentCategory)
        ? { ok: true, change: { kind: "category", category: value.category as EquipmentCategory } }
        : bad;
    case "ownership":
      return TOOL_OWNERSHIPS.includes(value.ownership as ToolOwnership)
        ? { ok: true, change: { kind: "ownership", ownership: value.ownership as ToolOwnership } }
        : bad;
    case "condition":
      return TOOL_CONDITIONS.includes(value.condition as ToolCondition)
        ? { ok: true, change: { kind: "condition", condition: value.condition as ToolCondition } }
        : bad;
    case "addTags":
    case "removeTags": {
      const tags = readTags(value.tags);
      return tags.length ? { ok: true, change: { kind: value.kind, tags } } : bad;
    }
    case "addKit": {
      if (value.newKitName !== undefined) {
        const name = readKitName(value.newKitName, kits);
        return name.ok ? { ok: true, change: { kind: "addKit", newKitName: name.name } } : name;
      }
      return kitKnown(value.kitId) ? { ok: true, change: { kind: "addKit", kitId: value.kitId as string } } : { ok: false, error: "kit-missing" };
    }
    case "removeKit":
      return kitKnown(value.kitId) ? { ok: true, change: { kind: "removeKit", kitId: value.kitId as string } } : { ok: false, error: "kit-missing" };
    case "careerPage":
      return typeof value.on === "boolean" ? { ok: true, change: { kind: "careerPage", on: value.on } } : bad;
    case "delete":
      return { ok: true, change: { kind: "delete" } };
    default:
      return bad;
  }
}

/** Reads `{ ids, change }`. Every id must be one of the occupant's tools, or nothing changes. */
export function readBulkRequest(
  raw: unknown,
  known: { toolIds: Set<string>; kits: ToolKit[] },
): { ok: true; ids: string[]; change: BulkChange } | { ok: false; error: BulkError } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (!Array.isArray(body.ids)) return { ok: false, error: "bulk-ids" };
  const ids = [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  if (ids.length === 0) return { ok: false, error: "bulk-ids" };
  if (ids.length > BULK_TOOLS_MAX) return { ok: false, error: "bulk-too-many" };
  if (ids.some((id) => !known.toolIds.has(id))) return { ok: false, error: "not-found" };
  const change = readBulkChange(body.change, known.kits);
  return change.ok ? { ok: true, ids, change: change.change } : change;
}

/** A tool's shared fields after one change. `newKitId` is the kit just made for `newKitName`. */
export function applyBulkChange(fields: BulkFields, change: Exclude<BulkChange, { kind: "delete" }>, newKitId?: string): BulkFields {
  switch (change.kind) {
    case "category":
      return { ...fields, category: change.category };
    case "ownership":
      return { ...fields, ownership: change.ownership };
    case "condition":
      return { ...fields, condition: change.condition };
    case "addTags":
      return { ...fields, tags: readTags([...fields.tags, ...change.tags]) };
    case "removeTags": {
      const gone = new Set(change.tags.map((tag) => tag.toLowerCase()));
      return { ...fields, tags: fields.tags.filter((tag) => !gone.has(tag.toLowerCase())) };
    }
    case "addKit": {
      const kitId = "kitId" in change ? change.kitId : newKitId;
      if (!kitId || fields.kitIds.includes(kitId)) return fields;
      return { ...fields, kitIds: [...fields.kitIds, kitId] };
    }
    case "removeKit":
      return { ...fields, kitIds: fields.kitIds.filter((id) => id !== change.kitId) };
    case "careerPage":
      return { ...fields, onCareerPage: change.on };
  }
}

/** A draft added from a photo is named after its file, so the drafts can be told apart. */
export function draftToolName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = (dot > 0 ? fileName.slice(0, dot) : dot === 0 ? "" : fileName).trim().slice(0, TEXT_MAX);
  return stem || "Untitled tool";
}

export type ToolFilter = { query: string; category: EquipmentCategory | "all"; draftsOnly: boolean };

/** What search matches a tool on: its name, maker, model, and tags. */
export function toolSearchText(tool: PersonalTool): string {
  return [tool.name, tool.maker, tool.model, ...tool.tags].filter(Boolean).join(" ");
}

export function filterTools(tools: PersonalTool[], filter: ToolFilter): PersonalTool[] {
  const needle = filter.query.trim().toLowerCase();
  return tools.filter(
    (tool) =>
      (!filter.draftsOnly || tool.draft) &&
      (filter.category === "all" || tool.category === filter.category) &&
      (!needle || toolSearchText(tool).toLowerCase().includes(needle)),
  );
}

/** A duplicate's name: "<name> (copy)", cut so it stays within the name limit. */
export function duplicateToolName(name: string): string {
  const suffix = " (copy)";
  return `${name.slice(0, TEXT_MAX - suffix.length).trimEnd()}${suffix}`;
}

/** Reads `{ photoIds }`: every one of the tool's photos, each exactly once. */
export function readPhotoOrder(raw: unknown, current: string[]): { ok: true; ids: string[] } | { ok: false; error: "photo-order" } {
  const ids = raw && typeof raw === "object" ? (raw as { photoIds?: unknown }).photoIds : undefined;
  const bad = { ok: false, error: "photo-order" } as const;
  if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length) return bad;
  const known = new Set(current);
  return ids.every((id) => typeof id === "string" && known.has(id)) ? { ok: true, ids: ids as string[] } : bad;
}

/** Splits text into the parts that match a search and the rest, ignoring case. The query is plain text. */
export function matchParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  if (!text) return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/** The tools used on a role, by name. */
export function toolsForRole(tools: PersonalTool[], roleId: string): PersonalTool[] {
  return tools.filter((tool) => tool.roleIds.includes(roleId)).sort((a, b) => a.name.localeCompare(b.name));
}

/** What the tools shown add up to. A money total is null when no tool has that value. */
export function toolTotals(tools: PersonalTool[]): { count: number; paid: number | null; worth: number | null; withPhotos: number } {
  const sum = (pick: (tool: PersonalTool) => number | null) => {
    const values = tools.map(pick).filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100 : null;
  };
  return {
    count: tools.length,
    paid: sum((tool) => tool.paid),
    worth: sum((tool) => tool.worth),
    withPhotos: tools.filter((tool) => tool.photos.length > 0).length,
  };
}

const CSV_HEADER = [
  "Name",
  "Category",
  "Whose it is",
  "Maker",
  "Model",
  "Serial",
  "Condition",
  "How well you use it",
  "When you got it",
  "Paid",
  "Worth now",
  "Where it's kept",
  "Tags",
  "Used on",
  "Kits",
  "Notes",
  "Needs details",
];

/** One CSV cell: quoted when it must be, and never read as a formula by a spreadsheet. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The tools as CSV, a header row first, roles and kits by name. */
export function toolsCsv(
  tools: PersonalTool[],
  names: { role: (id: string) => string | undefined; kit: (id: string) => string | undefined },
): string {
  const named = (ids: string[], name: (id: string) => string | undefined) =>
    ids.map(name).filter((value): value is string => Boolean(value)).join("; ");
  const rows = tools.map((tool) => [
    tool.name,
    EQUIPMENT_CATEGORY_LABEL[tool.category],
    TOOL_OWNERSHIP_LABEL[tool.ownership],
    tool.maker,
    tool.model,
    tool.serial,
    tool.condition ? TOOL_CONDITION_LABEL[tool.condition] : "",
    tool.skill === null ? "" : String(tool.skill),
    tool.acquired,
    tool.paid === null ? "" : String(tool.paid),
    tool.worth === null ? "" : String(tool.worth),
    tool.keptAt,
    tool.tags.join("; "),
    named(tool.roleIds, names.role),
    named(tool.kitIds, names.kit),
    tool.notes,
    tool.draft ? "Yes" : "",
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
