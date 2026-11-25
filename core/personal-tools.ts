/**
 * My Tools: the occupant's own tools and equipment, with photos and the roles
 * they used them on. A role's Setup holds the employer's equipment; these are
 * yours (or shared, borrowed, rented). Never published.
 */
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from "./role-gear";

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

export type ToolPhoto = { id: string; url: string; cover: boolean };

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
  | "role-missing";

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
    },
  };
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

/** The tools used on a role, by name. */
export function toolsForRole(tools: PersonalTool[], roleId: string): PersonalTool[] {
  return tools.filter((tool) => tool.roleIds.includes(roleId)).sort((a, b) => a.name.localeCompare(b.name));
}
