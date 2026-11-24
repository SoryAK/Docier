/**
 * The gear of a role: equipment you were given or worked on, and what you wore.
 * Equipment names and the uniform can be shown on your page; serials, asset
 * tags, and notes never are.
 */

export const EQUIPMENT_CATEGORIES = ["tool", "machine", "vehicle", "computer", "software", "safety", "other"] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  tool: "Tool",
  machine: "Machine",
  vehicle: "Vehicle",
  computer: "Computer",
  software: "Software",
  safety: "Safety gear",
  other: "Other",
};

/** Given to you to use, or something you worked on, like a machine you serviced. */
export type EquipmentUsage = "assigned" | "worked-on";
export const EQUIPMENT_USAGE_LABEL: Record<EquipmentUsage, string> = { assigned: "Given to me", "worked-on": "Worked on" };

export type EquipmentItem = {
  id: string;
  name: string;
  usage: EquipmentUsage;
  category: EquipmentCategory;
  maker: string;
  model: string;
  serial: string;
  assetTag: string;
  /** Months, YYYY-MM, or "". */
  from: string;
  to: string;
  notes: string;
};

export type UniformProvider = "employer" | "me" | "";
export type UniformItem = { id: string; item: string; color: string; providedBy: UniformProvider };

export type RoleGear = {
  equipmentItems: EquipmentItem[];
  /** Equipment names, kept in step with the items: what your page can show. */
  equipment: string[];
  uniformItems: UniformItem[];
  /** Notes on the uniform, e.g. "Steel toes, bought my own". */
  uniform: string;
  share: { equipment: boolean; uniform: boolean };
};

export type GearError = "equipment-name-required" | "equipment-month-invalid" | "uniform-item-required";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const LIST_MAX = 100;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, LIST_MAX).map(record) : [];
}

/** Equipment saved before items existed, as names alone, read as items. */
export function equipmentFromNames(names: string[], makeId: () => string): EquipmentItem[] {
  return names.filter(Boolean).map((name) => ({
    id: makeId(),
    name,
    usage: "assigned",
    category: "other",
    maker: "",
    model: "",
    serial: "",
    assetTag: "",
    from: "",
    to: "",
    notes: "",
  }));
}

/** Checks the gear as the form sends it. New items get ids. */
export function prepareGear(
  input: Partial<Record<keyof RoleGear, unknown>>,
  makeId: () => string,
): { ok: true; value: RoleGear } | { ok: false; error: GearError } {
  const equipmentItems: EquipmentItem[] = [];
  for (const item of list(input.equipmentItems)) {
    const name = text(item.name, 120);
    if (!name) return { ok: false, error: "equipment-name-required" };
    const from = text(item.from, 7);
    const to = text(item.to, 7);
    if ((from && !MONTH.test(from)) || (to && !MONTH.test(to))) return { ok: false, error: "equipment-month-invalid" };
    const category = (EQUIPMENT_CATEGORIES as readonly string[]).includes(String(item.category)) ? (item.category as EquipmentCategory) : "other";
    equipmentItems.push({
      id: text(item.id, 80) || makeId(),
      name,
      usage: item.usage === "worked-on" ? "worked-on" : "assigned",
      category,
      maker: text(item.maker),
      model: text(item.model),
      serial: text(item.serial),
      assetTag: text(item.assetTag),
      from,
      to,
      notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 2000) : "",
    });
  }

  const uniformItems: UniformItem[] = [];
  for (const item of list(input.uniformItems)) {
    const name = text(item.item, 80);
    if (!name) return { ok: false, error: "uniform-item-required" };
    const providedBy: UniformProvider = item.providedBy === "employer" || item.providedBy === "me" ? item.providedBy : "";
    uniformItems.push({ id: text(item.id, 80) || makeId(), item: name, color: text(item.color, 40), providedBy });
  }

  const share = record(input.share);
  const names: string[] = [];
  for (const item of equipmentItems) if (!names.some((kept) => kept.toLowerCase() === item.name.toLowerCase())) names.push(item.name);
  return {
    ok: true,
    value: {
      equipmentItems,
      equipment: names,
      uniformItems,
      uniform: typeof input.uniform === "string" ? input.uniform.trim().slice(0, 2000) : "",
      share: { equipment: share.equipment === true, uniform: share.uniform === true },
    },
  };
}

/** "Black coveralls (provided)". */
export function uniformItemText(item: UniformItem): string {
  const head = [item.color, item.item].filter(Boolean).join(" ");
  return item.providedBy === "employer" ? `${head} (provided)` : item.providedBy === "me" ? `${head} (my own)` : head;
}

/** The uniform as your page shows it: the items, then the notes. */
export function uniformLine(gear: Pick<RoleGear, "uniformItems" | "uniform">): string {
  return [gear.uniformItems.map(uniformItemText).join(", "), gear.uniform].filter(Boolean).join(". ");
}

/** One line for the closed section, or "" when nothing is set. */
export function gearSummary(gear: Pick<RoleGear, "equipmentItems" | "uniformItems" | "uniform">): string {
  const parts: string[] = [];
  const given = gear.equipmentItems.filter((item) => item.usage === "assigned").length;
  const worked = gear.equipmentItems.length - given;
  if (given) parts.push(`${given} given to me`);
  if (worked) parts.push(`${worked} worked on`);
  if (gear.uniformItems.length) parts.push(`uniform: ${gear.uniformItems.map((item) => item.item).join(", ")}`);
  else if (gear.uniform) parts.push("uniform notes");
  const line = parts.join(" · ");
  return line ? line[0]!.toUpperCase() + line.slice(1) : "";
}
