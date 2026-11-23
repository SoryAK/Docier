import type { WorkMapMoment, WorkMapRole } from "./work-map";

/**
 * A role's own history, year by year: when it started and ended, and the
 * milestones, events, notes, and achievements in between. Shown beside the
 * role in Career History.
 */

export type RoleHistoryKind = "start" | "end" | "milestone" | "event" | "note" | "achievement";

export type RoleHistoryItem = {
  id: string;
  kind: RoleHistoryKind;
  text: string;
  /** As saved: YYYY, YYYY-MM, or YYYY-MM-DD. */
  date: string;
  /** "Jun", or "" when the date is a year alone. */
  month: string;
};

export type RoleHistoryYear = { year: string; label: string; items: RoleHistoryItem[] };

export type RoleHistoryFilter = "all" | "note" | "milestone" | "event" | "achievement";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Year and month from a saved date, or null when there is no usable year. */
function readDate(value: string): { year: string; month: number | null; key: string } | null {
  const match = value.trim().match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!match) return null;
  const month = match[2] ? Number(match[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  const day = match[3] ?? "00";
  return { year: match[1]!, month, key: `${match[1]}-${match[2] ?? "00"}-${day}` };
}

// Within one date: an ending comes after everything else that day, a start before it.
const SAME_DAY_RANK: Record<RoleHistoryKind, number> = {
  start: 0,
  achievement: 1,
  milestone: 2,
  event: 2,
  note: 2,
  end: 3,
};

export function roleHistory(
  role: WorkMapRole,
  options: { filter?: RoleHistoryFilter; query?: string; order?: "newest" | "oldest"; now?: Date } = {},
): RoleHistoryYear[] {
  const filter = options.filter ?? "all";
  const needle = (options.query ?? "").trim().toLowerCase();
  const now = options.now ?? new Date();
  const start = readDate(role.startDate);
  const end = role.isCurrent ? null : readDate(role.endDate);
  const details = role.details as Partial<WorkMapRole["details"]> | undefined;

  type Dated = RoleHistoryItem & { key: string; year: string };
  const all: Dated[] = [];
  const push = (id: string, kind: RoleHistoryKind, text: string, date: string) => {
    const read = readDate(date);
    if (!read || !text.trim()) return;
    all.push({ id, kind, text: text.trim(), date, month: read.month ? MONTHS[read.month - 1]! : "", key: read.key, year: read.year });
  };

  const name = role.organization.trim() || role.title.trim();
  if (start) push(`${role.id}:start`, "start", role.title.trim() ? `Started as ${role.title.trim()}` : `Started at ${name}`, role.startDate);
  if (end) push(`${role.id}:end`, "end", `Left ${name}`, role.endDate);
  const moments = (kind: "milestone" | "event" | "note", list: WorkMapMoment[] | undefined) => {
    for (const item of list ?? []) push(item.id, kind, item.title || item.detail, item.date);
  };
  moments("milestone", details?.milestones);
  moments("event", details?.events);
  moments("note", details?.notes);
  // Achievements have no dates of their own yet, so they sit in the year the role started.
  role.achievements.forEach((text, index) => {
    if (start) push(role.achievementIds?.[index] ?? `${role.id}:achievement:${index}`, "achievement", text, role.startDate);
  });

  const shown = all.filter(
    (item) =>
      (filter === "all" || item.kind === filter) && (!needle || item.text.toLowerCase().includes(needle)),
  );
  shown.sort((a, b) => (a.key === b.key ? SAME_DAY_RANK[b.kind] - SAME_DAY_RANK[a.kind] : a.key < b.key ? 1 : -1));
  if (options.order === "oldest") shown.reverse();

  const years: RoleHistoryYear[] = [];
  for (const item of shown) {
    let group = years.at(-1);
    if (!group || group.year !== item.year) {
      group = { year: item.year, label: yearLabel(item.year, start, end, role.isCurrent, now), items: [] };
      years.push(group);
    }
    const { key: _key, year: _year, ...plain } = item;
    group.items.push(plain);
  }
  return years;
}

function yearLabel(
  year: string,
  start: ReturnType<typeof readDate>,
  end: ReturnType<typeof readDate>,
  isCurrent: boolean,
  now: Date,
): string {
  if (start && year === start.year) return start.month ? `Started in ${MONTH_NAMES[start.month - 1]}` : "Started";
  if (end && year === end.year) return end.month ? `Left in ${MONTH_NAMES[end.month - 1]}` : "Left";
  if (isCurrent && year === String(now.getFullYear())) return "So far";
  if (start) return `Year ${Number(year) - Number(start.year) + 1}`;
  return "";
}
