/** One achievement on a role. `date` is the month it happened (YYYY-MM), when set. */
export type RoleAchievement = { id: string; statement: string; date?: string };

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

function withDate(item: { id: string; statement: string }, raw: unknown): RoleAchievement {
  const date = typeof raw === "string" ? readMonth(raw.trim()) : null;
  return date ? { ...item, date } : item;
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
    const record = entry as { id?: unknown; statement?: unknown; date?: unknown };
    const statement = typeof record.statement === "string" ? record.statement.trim() : "";
    if (!statement) {
      changed = true;
      continue;
    }
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      items.push(withDate({ id: mintId(), statement }, record.date));
      changed = true;
      continue;
    }
    const item = withDate({ id, statement }, record.date);
    items.push(item);
    if (record.id !== id || record.statement !== statement || (record.date ?? undefined) !== item.date) changed = true;
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
  const keep = (from: RoleAchievement, statement: string): RoleAchievement =>
    from.date ? { id: from.id, statement, date: from.date } : { id: from.id, statement };
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
