/**
 * The first run after onboarding: a welcome card, then an offered tour of Home.
 * The tour's steps live here, in one place, so a change to a screen the tour
 * points at has one list to update.
 */

/** Where a step points. Each anchor is a `data-tour` value on Home. */
export type TourAnchor =
  | "overview"
  | "history-nav"
  | "map"
  | "search"
  | "recent"
  | "share"
  | "start";

export type TourStep = {
  id: string;
  /** Highlighted together. The popover sits by the first one on screen. */
  anchors: TourAnchor[];
  title: string;
  body: string;
  /** The last step's main button does this instead of just closing the tour. */
  finish?: "add-job";
};

const FULL_TOUR: TourStep[] = [
  {
    id: "overview",
    anchors: ["overview"],
    title: "Your career at a glance",
    body: "Jobs, roles, tenure, and places, with a timeline of where you've been.",
  },
  {
    id: "history",
    anchors: ["history-nav", "map"],
    title: "Everything you've done",
    body: "Every job, school, and achievement lives in Career History. Open one to edit it or add evidence. The map shows where you've worked; pin a job's place to add it.",
  },
  {
    id: "find",
    anchors: ["search", "recent"],
    title: "Find anything",
    body: "Search jobs, skills, and notes. Recent, Notes, and Milestones show what changed and what you keep.",
  },
  {
    id: "share",
    anchors: ["share"],
    title: "Share when you're ready",
    body: "Preview your page, then publish it. Nothing leaves this computer until you publish.",
  },
];

const SHORT_TOUR: TourStep[] = [
  {
    id: "start",
    // An empty Home shows "Start your story"; previewing the short tour over a full Home points at the overview.
    anchors: ["start", "overview"],
    title: "Start your story",
    body: "The jobs and schools you add become your timeline, your map, and your page.",
  },
  {
    id: "history",
    anchors: ["history-nav"],
    title: "Everything you've done",
    body: "Career History holds every job and school. Open one to change it or add evidence.",
  },
  {
    id: "find",
    anchors: ["search"],
    title: "Find anything",
    body: "Search jobs, skills, and notes once they're here.",
    finish: "add-job",
  },
];

/** The full tour when there is a career to show; a short one that ends on adding a job when there isn't. */
export function tourSteps(input: { empty: boolean }): TourStep[] {
  return input.empty ? SHORT_TOUR : FULL_TOUR;
}

/** The welcome card shows once, after onboarding is finished. */
export function shouldWelcome(profile: {
  onboardingCompletedAt: string | null;
  welcomeSeenAt?: string | null;
}): boolean {
  return Boolean(profile.onboardingCompletedAt) && !profile.welcomeSeenAt;
}

/** "Saved: 9 jobs · 2 schools", naming only what was saved; null when nothing was. */
export function welcomeSavedLine(counts: { jobs: number; schools: number }): string | null {
  const parts = [
    counts.jobs > 0 ? `${counts.jobs} ${counts.jobs === 1 ? "job" : "jobs"}` : "",
    counts.schools > 0 ? `${counts.schools} ${counts.schools === 1 ? "school" : "schools"}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `Saved: ${parts.join(" · ")}` : null;
}

/** Set or clear the first-run marks. true stamps now; false clears it, so the card or tour can show again. */
export type FirstRunUpdate = {
  welcomeSeen?: boolean;
  tourDone?: boolean;
};

export function parseFirstRunUpdate(raw: unknown): { ok: true; update: FirstRunUpdate } | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const body = raw as Record<string, unknown>;
  const update: FirstRunUpdate = {};
  for (const key of ["welcomeSeen", "tourDone"] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] !== "boolean") return { ok: false };
    update[key] = body[key] as boolean;
  }
  if (update.welcomeSeen === undefined && update.tourDone === undefined) return { ok: false };
  return { ok: true, update };
}
