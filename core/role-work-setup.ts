/**
 * How a role's work was set up: its schedule, named shifts, team, and growth.
 * Kept in the role's details; private unless its share switch is on.
 */

export const SCHEDULE_TYPES = ["full-time", "part-time", "contract", "temporary", "seasonal", "freelance"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  seasonal: "Seasonal",
  freelance: "Freelance",
};

export type WorkMode = "onsite" | "hybrid" | "remote";
export const WORK_MODE_LABEL: Record<WorkMode, string> = { onsite: "On site", hybrid: "Hybrid", remote: "Remote" };

export type RoleSchedule = {
  type: ScheduleType | "";
  workMode: WorkMode;
  /** Days a week on site; only for hybrid work. */
  daysOnSite: number | null;
  hoursPerWeek: number | null;
  /** Free notes about the schedule, e.g. "Overnight, every other weekend". */
  shift: string;
};

/** A named shift. Times are "HH:MM", 24-hour; an end before the start runs overnight. */
export type RoleShift = { id: string; name: string; start: string; end: string };
export type RoleTeam = { reportsTo: string; department: string; size: number | null };
/** A promotion within the role: the new title and the month (YYYY-MM). */
export type RolePromotion = { id: string; title: string; date: string };
export type WorkSetupShare = { schedule: boolean; team: boolean; growth: boolean };

export type WorkSetup = {
  schedule: RoleSchedule;
  shifts: RoleShift[];
  team: RoleTeam;
  skills: string[];
  skillsGained: string[];
  promotions: RolePromotion[];
  growth: string;
  share: WorkSetupShare;
};

export type WorkSetupError =
  | "schedule-type-invalid"
  | "days-on-site-invalid"
  | "hours-invalid"
  | "shift-name-required"
  | "shift-time-invalid"
  | "team-size-invalid"
  | "promotion-title-required"
  | "promotion-date-invalid";

export const EMPTY_SCHEDULE: RoleSchedule = { type: "", workMode: "onsite", daysOnSite: null, hoursPerWeek: null, shift: "" };
export const EMPTY_TEAM: RoleTeam = { reportsTo: "", department: "", size: null };

const TEXT_MAX = 200;
const NOTES_MAX = 2000;
const LIST_MAX = 50;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function line(value: unknown, max = TEXT_MAX): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function wholeNumber(value: unknown, min: number, max: number): number | null | false {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max) return false;
  return number;
}

function skills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const skill = line(item, 60);
    if (skill && !out.some((kept) => kept.toLowerCase() === skill.toLowerCase())) out.push(skill);
  }
  return out.slice(0, LIST_MAX);
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, LIST_MAX).map(record) : [];
}

function idOr(value: unknown, makeId: () => string): string {
  const id = line(value, 80);
  return id || makeId();
}

/** Checks a whole work setup, as the form sends it. New shifts and promotions get ids. */
export function prepareWorkSetup(
  input: Partial<Record<keyof WorkSetup, unknown>>,
  makeId: () => string,
): { ok: true; value: WorkSetup } | { ok: false; error: WorkSetupError } {
  const scheduleIn = record(input.schedule);
  const type = line(scheduleIn.type);
  if (type && !(SCHEDULE_TYPES as readonly string[]).includes(type)) return { ok: false, error: "schedule-type-invalid" };
  const workMode: WorkMode = scheduleIn.workMode === "hybrid" || scheduleIn.workMode === "remote" ? scheduleIn.workMode : "onsite";
  const daysOnSite = wholeNumber(scheduleIn.daysOnSite, 1, 7);
  if (daysOnSite === false) return { ok: false, error: "days-on-site-invalid" };
  const hoursRaw = scheduleIn.hoursPerWeek;
  let hoursPerWeek: number | null = null;
  if (hoursRaw !== undefined && hoursRaw !== null && hoursRaw !== "") {
    const hours = typeof hoursRaw === "string" ? Number(hoursRaw) : hoursRaw;
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || hours > 168) return { ok: false, error: "hours-invalid" };
    hoursPerWeek = Math.round(hours * 10) / 10;
  }
  const schedule: RoleSchedule = {
    type: type as RoleSchedule["type"],
    workMode,
    daysOnSite: workMode === "hybrid" ? daysOnSite : null,
    hoursPerWeek,
    shift: line(scheduleIn.shift, NOTES_MAX),
  };

  const shifts: RoleShift[] = [];
  for (const item of list(input.shifts)) {
    const name = line(item.name, 80);
    if (!name) return { ok: false, error: "shift-name-required" };
    const start = line(item.start);
    const end = line(item.end);
    if (!TIME.test(start) || !TIME.test(end)) return { ok: false, error: "shift-time-invalid" };
    shifts.push({ id: idOr(item.id, makeId), name, start, end });
  }

  const teamIn = record(input.team);
  const size = wholeNumber(teamIn.size, 1, 100000);
  if (size === false) return { ok: false, error: "team-size-invalid" };
  const team: RoleTeam = { reportsTo: line(teamIn.reportsTo), department: line(teamIn.department), size };

  const promotions: RolePromotion[] = [];
  for (const item of list(input.promotions)) {
    const title = line(item.title, 120);
    if (!title) return { ok: false, error: "promotion-title-required" };
    const date = line(item.date);
    if (!MONTH.test(date)) return { ok: false, error: "promotion-date-invalid" };
    promotions.push({ id: idOr(item.id, makeId), title, date });
  }
  promotions.sort((a, b) => a.date.localeCompare(b.date));

  const shareIn = record(input.share);
  return {
    ok: true,
    value: {
      schedule,
      shifts,
      team,
      skills: skills(input.skills),
      skillsGained: skills(input.skillsGained),
      promotions,
      growth: typeof input.growth === "string" ? input.growth.trim().slice(0, NOTES_MAX) : "",
      share: { schedule: shareIn.schedule === true, team: shareIn.team === true, growth: shareIn.growth === true },
    },
  };
}

function clock(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** "11 PM – 7 AM (overnight)". */
export function shiftLabel(shift: { start: string; end: string }): string {
  const overnight = shift.end <= shift.start;
  return `${clock(shift.start)} – ${clock(shift.end)}${overnight ? " (overnight)" : ""}`;
}

/** One line for the closed section, or "" when nothing is set. */
export function workSetupSummary(setup: { schedule: RoleSchedule; team: RoleTeam }): string {
  const { schedule, team } = setup;
  const parts: string[] = [];
  if (schedule.type) parts.push(SCHEDULE_TYPE_LABEL[schedule.type]);
  const mode =
    schedule.workMode === "hybrid" && schedule.daysOnSite
      ? `Hybrid, ${schedule.daysOnSite} day${schedule.daysOnSite === 1 ? "" : "s"} on site`
      : WORK_MODE_LABEL[schedule.workMode];
  const rest: string[] = [];
  if (schedule.hoursPerWeek) rest.push(`${schedule.hoursPerWeek} h/week`);
  if (team.reportsTo) rest.push(`Reports to ${team.reportsTo}`);
  else if (team.department || team.size) {
    rest.push([team.department, team.size ? `team of ${team.size}` : ""].filter(Boolean).join(", "));
  }
  // On site is the default, so it only shows next to something else.
  if (schedule.workMode !== "onsite" || parts.length || rest.length) parts.push(mode);
  return [...parts, ...rest].join(" · ");
}
