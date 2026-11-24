/**
 * Looking back on a role: how it rated, why you left, whether you'd go back,
 * the commute, and what the place was like. The overall rating, the reason in
 * your words, and the environment can be shown on your page; the rest is yours.
 */

export const RATING_AREAS = ["culture", "growth", "pay", "balance", "management"] as const;
export type RatingArea = (typeof RATING_AREAS)[number];
export const RATING_AREA_LABEL: Record<RatingArea, string> = {
  culture: "Culture",
  growth: "Growth",
  pay: "Pay",
  balance: "Work-life balance",
  management: "Management",
};

export const LEAVING_REASONS = ["better-offer", "growth", "relocation", "layoff", "contract-end", "culture", "school", "personal", "other"] as const;
export type LeavingReason = (typeof LEAVING_REASONS)[number];
export const LEAVING_REASON_LABEL: Record<LeavingReason, string> = {
  "better-offer": "A better offer",
  growth: "Room to grow",
  relocation: "Moved",
  layoff: "Laid off",
  "contract-end": "Contract ended",
  culture: "The culture",
  school: "Went back to school",
  personal: "Personal reasons",
  other: "Something else",
};

export const COMMUTE_MODES = ["driving", "transit", "walking", "biking", "remote"] as const;
export type CommuteMode = (typeof COMMUTE_MODES)[number];
export const COMMUTE_MODE_LABEL: Record<CommuteMode, string> = {
  driving: "Driving",
  transit: "Transit",
  walking: "Walking",
  biking: "Biking",
  remote: "Worked from home",
};

export type RoleRatings = Record<RatingArea, number | null>;
export type RoleLeaving = { reason: LeavingReason | ""; wouldReturn: "yes" | "no" | "maybe" | "" };
export type RoleCommute = { minutes: number | null; miles: number | null; mode: CommuteMode | "" };

export type RoleReflection = {
  /** Overall, 1 to 5. */
  workplaceRating: number | null;
  ratings: RoleRatings;
  leaving: RoleLeaving;
  /** Why you left, in your words. */
  departure: string;
  commute: RoleCommute;
  environment: string;
  share: { workplaceRating: boolean; departure: boolean; environment: boolean };
};

export type ReflectionError = "rating-invalid" | "reason-invalid" | "commute-invalid";

export const EMPTY_RATINGS: RoleRatings = { culture: null, growth: null, pay: null, balance: null, management: null };
export const EMPTY_LEAVING: RoleLeaving = { reason: "", wouldReturn: "" };
export const EMPTY_COMMUTE: RoleCommute = { minutes: null, miles: null, mode: "" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stars(value: unknown): number | null | false {
  if (value === undefined || value === null || value === "" || value === 0) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : false;
}

function amount(value: unknown, max: number): number | null | false {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > max) return false;
  return Math.round(number * 10) / 10;
}

function notes(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

/** Checks a reflection as the form sends it. */
export function prepareReflection(
  input: Partial<Record<keyof RoleReflection, unknown>>,
): { ok: true; value: RoleReflection } | { ok: false; error: ReflectionError } {
  const overall = stars(input.workplaceRating);
  if (overall === false) return { ok: false, error: "rating-invalid" };
  const ratingsIn = record(input.ratings);
  const ratings = { ...EMPTY_RATINGS };
  for (const area of RATING_AREAS) {
    const value = stars(ratingsIn[area]);
    if (value === false) return { ok: false, error: "rating-invalid" };
    ratings[area] = value;
  }

  const leavingIn = record(input.leaving);
  const reason = typeof leavingIn.reason === "string" ? leavingIn.reason : "";
  if (reason && !(LEAVING_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "reason-invalid" };
  const wouldReturn = leavingIn.wouldReturn === "yes" || leavingIn.wouldReturn === "no" || leavingIn.wouldReturn === "maybe" ? leavingIn.wouldReturn : "";

  const commuteIn = record(input.commute);
  const minutes = amount(commuteIn.minutes, 600);
  const miles = amount(commuteIn.miles, 1000);
  if (minutes === false || miles === false) return { ok: false, error: "commute-invalid" };
  const mode = (COMMUTE_MODES as readonly string[]).includes(String(commuteIn.mode)) ? (commuteIn.mode as CommuteMode) : "";

  const share = record(input.share);
  return {
    ok: true,
    value: {
      workplaceRating: overall,
      ratings,
      leaving: { reason: reason as RoleLeaving["reason"], wouldReturn },
      departure: notes(input.departure),
      commute: { minutes, miles, mode },
      environment: notes(input.environment),
      share: { workplaceRating: share.workplaceRating === true, departure: share.departure === true, environment: share.environment === true },
    },
  };
}

/** "25 min · 12 mi · Driving". */
export function commuteText(commute: RoleCommute): string {
  if (commute.mode === "remote") return COMMUTE_MODE_LABEL.remote;
  return [
    commute.minutes != null ? `${commute.minutes} min` : "",
    commute.miles != null ? `${commute.miles} mi` : "",
    commute.mode ? COMMUTE_MODE_LABEL[commute.mode] : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One line for the closed section, or "" when nothing is set. */
export function reflectionSummary(value: Pick<RoleReflection, "workplaceRating" | "leaving" | "commute">): string {
  const parts: string[] = [];
  if (value.workplaceRating) parts.push(`${value.workplaceRating}/5 overall`);
  if (value.leaving.reason) parts.push(`Left: ${LEAVING_REASON_LABEL[value.leaving.reason]}`);
  if (value.leaving.wouldReturn) parts.push(value.leaving.wouldReturn === "yes" ? "Would go back" : value.leaving.wouldReturn === "no" ? "Wouldn't go back" : "Might go back");
  const commute = commuteText(value.commute);
  if (commute) parts.push(commute);
  return parts.join(" · ");
}
