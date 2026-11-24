import type { RoleAchievement } from "./role-achievements";
import type { WorkMapRoleDetails } from "./work-map";

/**
 * A record of changes to a role. The role's own fields and its details can be
 * undone; people, places, photos, and evidence are only logged.
 */

export type RoleEditArea = "role" | "details" | "people" | "places" | "photos" | "evidence" | "documents";

/** The role's own fields, as one edit changes them. */
export type RoleFields = {
  kind: string;
  title: string;
  organization: string;
  locationLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: RoleAchievement[];
};

/** Why an edit can't be undone, when it can't. */
export type RoleEditBlock = "changed-since" | "undone" | "log-only";

export type RoleEdit = {
  id: string;
  /** When it was made, ISO. */
  at: string;
  area: RoleEditArea;
  summary: string;
  canUndo: boolean;
  blocked: RoleEditBlock | null;
};

/** What changed, as the keys that changed and how it reads. Null when nothing did. */
export type EditChange = { keys: string[]; summary: string };

/** JSON with object keys in order, so equal values compare equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, (item as Record<string, unknown>)[key]]))
      : item,
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

function clip(value: string, max = 60): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 2) return parts.join("; ");
  return `${parts.slice(0, 2).join("; ")}; and ${parts.length - 2} more`;
}

const FIELD_LABEL: Record<Exclude<keyof RoleFields, "achievements">, string> = {
  kind: "kind",
  title: "title",
  organization: "company",
  locationLabel: "place",
  startDate: "start date",
  endDate: "end date",
  isCurrent: "current",
  description: "description",
};

function describeAchievements(before: RoleAchievement[], after: RoleAchievement[]): string[] {
  const parts: string[] = [];
  const was = new Map(before.map((item) => [item.id, item]));
  const now = new Map(after.map((item) => [item.id, item]));
  for (const item of after) {
    const old = was.get(item.id);
    const name = clip(item.title || item.statement);
    if (!old) {
      parts.push(`Added an achievement: ${name}`);
      continue;
    }
    if (old.statement !== item.statement) parts.push(`Reworded an achievement: ${name}`);
    if ((old.title ?? "") !== (item.title ?? "")) parts.push(item.title ? `Titled an achievement: ${clip(item.title)}` : `Removed an achievement's title: ${name}`);
    if ((old.date ?? "") !== (item.date ?? "")) parts.push(item.date ? `Dated an achievement: ${name}` : `Removed an achievement's date: ${name}`);
    if (!sameValue(old.links, item.links)) parts.push(`Changed what an achievement is linked to: ${name}`);
  }
  for (const item of before) {
    if (!now.has(item.id)) parts.push(`Removed an achievement: ${clip(item.title || item.statement)}`);
  }
  const kept = after.filter((item) => was.has(item.id)).map((item) => item.id);
  const keptBefore = before.filter((item) => now.has(item.id)).map((item) => item.id);
  if (parts.length === 0 && kept.join() !== keptBefore.join()) parts.push("Reordered the achievements");
  return parts;
}

/** What one save changed in the role's own fields. */
export function describeRoleFieldsChange(before: RoleFields, after: RoleFields): EditChange | null {
  const keys: string[] = [];
  const parts: string[] = [];
  for (const key of Object.keys(FIELD_LABEL) as Array<keyof typeof FIELD_LABEL>) {
    if (sameValue(before[key], after[key])) continue;
    keys.push(key);
    if (key === "isCurrent") parts.push(after.isCurrent ? "Marked as current" : "Marked as ended");
    else if (key === "title" || key === "organization") parts.push(after[key] ? `Changed the ${FIELD_LABEL[key]} to ${clip(String(after[key]))}` : `Cleared the ${FIELD_LABEL[key]}`);
    else if (key === "kind") parts.push(`Changed the kind to ${after.kind}`);
    else parts.push(`Changed the ${FIELD_LABEL[key]}`);
  }
  if (!sameValue(before.achievements, after.achievements)) {
    keys.push("achievements");
    parts.push(...describeAchievements(before.achievements, after.achievements));
  }
  return keys.length ? { keys, summary: joinParts(parts) } : null;
}

const DETAIL_LABEL: Partial<Record<keyof WorkMapRoleDetails, string>> = {
  summary: "the summary",
  website: "the website",
  linkedin: "the LinkedIn link",
  instagram: "the Instagram link",
  facebook: "the Facebook link",
  x: "the X link",
  youtube: "the YouTube link",
  colleagues: "colleagues",
  overviewFields: "the overview",
  techStack: "the tools",
  compensation: "pay",
  payHistory: "pay history",
  benefitNotes: "benefit notes",
  timeOff: "time off",
  schedule: "the schedule",
  shifts: "the shifts",
  team: "the team",
  benefits: "benefits",
  paidTimeOff: "time off notes",
  environment: "the work environment",
  growth: "growth notes",
  departure: "why you left",
  workplaceRating: "the workplace rating",
  uniform: "uniform notes",
  equipment: "equipment",
  ratings: "the ratings",
  leaving: "why you left",
  commute: "the commute",
  skills: "skills used",
  skillsGained: "skills gained",
  promotions: "promotions",
  glance: "what shows under the name",
  share: "what shows on your page",
};

/** Named lists, where adding or removing one reads better than "changed". */
const NAMED_LISTS: Partial<Record<keyof WorkMapRoleDetails, string>> = {
  notes: "a note",
  milestones: "a milestone",
  events: "an event",
  shifts: "a shift",
  promotions: "a promotion",
  equipmentItems: "equipment",
  uniformItems: "a uniform item",
};

function describeList(noun: string, before: unknown, after: unknown): string[] {
  const list = (value: unknown) => (Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []);
  const name = (item: Record<string, unknown>) => clip(String(item.title || item.name || item.item || item.detail || ""));
  const was = new Map(list(before).map((item) => [String(item.id), item]));
  const now = new Map(list(after).map((item) => [String(item.id), item]));
  const parts: string[] = [];
  for (const [id, item] of now) {
    const old = was.get(id);
    if (!old) parts.push(`Added ${noun}: ${name(item)}`);
    else if (!sameValue(old, item)) parts.push(`Changed ${noun}: ${name(item)}`);
  }
  for (const [id, item] of was) if (!now.has(id)) parts.push(`Removed ${noun}: ${name(item)}`);
  return parts;
}

/** What one save changed in the role's details. */
export function describeDetailsChange(before: WorkMapRoleDetails, after: WorkMapRoleDetails): EditChange | null {
  const keys: string[] = [];
  const parts: string[] = [];
  const all = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof WorkMapRoleDetails>;
  for (const key of all) {
    if (sameValue(before[key], after[key])) continue;
    keys.push(key);
    // Equipment names follow the items, which say what changed.
    if (key === "equipment" && !sameValue(before.equipmentItems, after.equipmentItems)) continue;
    if (key === "glance") {
      parts.push(after.glance?.pay ? "Showed pay under the name" : "Hid pay under the name");
      continue;
    }
    const noun = NAMED_LISTS[key];
    if (noun) parts.push(...describeList(noun, before[key], after[key]));
    else parts.push(`Changed ${DETAIL_LABEL[key] ?? key}`);
  }
  return keys.length ? { keys, summary: joinParts(parts) } : null;
}

/** Only the given keys of a value. */
export function pick<T extends object>(value: T, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]));
}

/**
 * Whether an edit can be undone now: it changed the role or its details, it
 * hasn't been undone, and everything it changed is still as it left it.
 */
export function undoBlock(
  edit: { area: RoleEditArea; keys: string[]; after: Record<string, unknown> | null; undoneAt: string | null },
  current: object,
): RoleEditBlock | null {
  if (edit.area !== "role" && edit.area !== "details") return "log-only";
  if (edit.undoneAt) return "undone";
  if (!edit.after) return "log-only";
  for (const key of edit.keys) {
    if (!sameValue((current as Record<string, unknown>)[key], edit.after[key])) return "changed-since";
  }
  return null;
}
