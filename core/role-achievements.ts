/**
 * What an achievement is linked to on its role: people worked with (their link
 * ids), events and milestones (moment ids), places (location ids), and skills
 * or tools it shows (short text).
 */
export type AchievementLinks = { people: string[]; moments: string[]; places: string[]; skills: string[] };

/** One achievement on a role. `date` is the month it happened (YYYY-MM), when set. */
export type RoleAchievement = { id: string; statement: string; date?: string; links?: AchievementLinks };

const SKILL_MAX = 60;
const LINKS_MAX = 50;

function idList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))].slice(0, LINKS_MAX);
}

function skillList(value: unknown, strict: boolean): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const skill = item.trim().replace(/\s+/g, " ");
    if (!skill) continue;
    if (skill.length > SKILL_MAX) {
      if (strict) return null;
      continue;
    }
    if (!out.some((kept) => kept.toLowerCase() === skill.toLowerCase())) out.push(skill);
  }
  return out.slice(0, LINKS_MAX);
}

const NO_LINKS: AchievementLinks = { people: [], moments: [], places: [], skills: [] };

/** An achievement's links, keeping only people, moments, and places still on the role. */
export function liveAchievementLinks(
  links: AchievementLinks | undefined,
  onRole: { people: readonly string[]; moments: readonly string[]; places: readonly string[] },
): AchievementLinks {
  if (!links) return { ...NO_LINKS };
  return {
    people: links.people.filter((id) => onRole.people.includes(id)),
    moments: links.moments.filter((id) => onRole.moments.includes(id)),
    places: links.places.filter((id) => onRole.places.includes(id)),
    skills: [...links.skills],
  };
}

/** The links for an achievement, as sent to change them. */
export function prepareAchievementLinks(value: unknown): { ok: true; value: AchievementLinks } | { ok: false; error: "links-invalid" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "links-invalid" };
  const record = value as Record<string, unknown>;
  const people = idList(record.people);
  const moments = idList(record.moments);
  const places = idList(record.places);
  const skills = skillList(record.skills, true);
  if (!people || !moments || !places || !skills) return { ok: false, error: "links-invalid" };
  return { ok: true, value: { people, moments, places, skills } };
}

/** Stored links, read leniently: anything that isn't a link is dropped. */
function readLinks(value: unknown): AchievementLinks | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const links = {
    people: idList(Array.isArray(record.people) ? record.people : undefined) ?? [],
    moments: idList(Array.isArray(record.moments) ? record.moments : undefined) ?? [],
    places: idList(Array.isArray(record.places) ? record.places : undefined) ?? [],
    skills: skillList(Array.isArray(record.skills) ? record.skills : undefined, false) ?? [],
  };
  return links.people.length || links.moments.length || links.places.length || links.skills.length ? links : undefined;
}

/** A month an achievement happened, as YYYY-MM; "" clears it. */
export function prepareAchievementDate(value: unknown): { ok: true; value: string } | { ok: false; error: "date-invalid" } {
  if (value === null || value === undefined) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: "date-invalid" };
  const raw = value.trim();
  if (!raw) return { ok: true, value: "" };
  const month = readMonth(raw);
  return month ? { ok: true, value: month } : { ok: false, error: "date-invalid" };
}

function readMonth(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

function withDate(item: { id: string; statement: string }, raw: unknown, rawLinks?: unknown): RoleAchievement {
  const date = typeof raw === "string" ? readMonth(raw.trim()) : null;
  const links = readLinks(rawLinks);
  return { ...item, ...(date ? { date } : {}), ...(links ? { links } : {}) };
}

export function roleAchievementStatements(value: unknown): string[] {
  return readRoleAchievements(value, () => "").items.map((item) => item.statement);
}

export function readRoleAchievements(
  value: unknown,
  mintId: () => string,
): { items: RoleAchievement[]; changed: boolean } {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return { items: [], changed: false };
  const items: RoleAchievement[] = [];
  let changed = false;
  for (const entry of parsed) {
    if (typeof entry === "string") {
      const statement = entry.trim();
      if (!statement) {
        changed = true;
        continue;
      }
      items.push({ id: mintId(), statement });
      changed = true;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      changed = true;
      continue;
    }
    const record = entry as { id?: unknown; statement?: unknown; date?: unknown; links?: unknown };
    const statement = typeof record.statement === "string" ? record.statement.trim() : "";
    if (!statement) {
      changed = true;
      continue;
    }
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      items.push(withDate({ id: mintId(), statement }, record.date, record.links));
      changed = true;
      continue;
    }
    const item = withDate({ id, statement }, record.date, record.links);
    items.push(item);
    if (
      record.id !== id ||
      record.statement !== statement ||
      (record.date ?? undefined) !== item.date ||
      JSON.stringify(record.links ?? undefined) !== JSON.stringify(item.links)
    ) {
      changed = true;
    }
  }
  return { items, changed };
}

export function reconcileRoleAchievements(
  previous: readonly RoleAchievement[],
  lines: readonly string[],
  mintId: () => string,
): RoleAchievement[] {
  const wanted = lines.map((line) => line.trim()).filter(Boolean);
  const pool = previous.map((item) => ({ ...item, used: false }));
  // An achievement's month follows its id, so rewording or moving it keeps the date.
  // Its links follow it too.
  const keep = (from: RoleAchievement, statement: string): RoleAchievement => ({
    id: from.id,
    statement,
    ...(from.date ? { date: from.date } : {}),
    ...(from.links ? { links: from.links } : {}),
  });
  const matched = wanted.map((statement) => {
    const found = pool.find((item) => !item.used && item.statement === statement);
    if (!found) return null;
    found.used = true;
    return keep(found, statement);
  });
  const leftover = pool.filter((item) => !item.used);
  let cursor = 0;
  return matched.map((item, index) => {
    if (item) return item;
    const reuse = leftover[cursor];
    cursor += 1;
    if (reuse) return keep(reuse, wanted[index] ?? "");
    return { id: mintId(), statement: wanted[index] ?? "" };
  });
}

export function achievementStatement(
  achievements: readonly string[],
  achievementIds: readonly string[] | undefined,
  achievementId: string,
): string | null {
  const index = achievementIds?.indexOf(achievementId) ?? -1;
  if (index < 0) return null;
  const statement = achievements[index]?.trim() ?? "";
  return statement || null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
