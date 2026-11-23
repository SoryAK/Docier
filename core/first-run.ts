/**
 * The first run after onboarding: a welcome card, then an offered tour of Home.
 * The tour's steps live here, in one place, so a change to a screen the tour
 * points at has one list to update. Every release reviews them: docs/release.md.
 */

/** Where a step points. Each anchor is a `data-tour` value on Home. */
export type TourAnchor =
  | "overview"
  | "history-nav"
  | "map"
  | "share"
  | "start"
  | "network"
  /** The sidebar's Resources toggle; My Network sits inside it. */
  | "resources"
  /** The menu button, for stops whose part of Home is in a hidden sidebar (phones). */
  | "menu";

export type TourStep = {
  id: string;
  /** Highlighted together. The popover sits by the first one on screen. */
  anchors: TourAnchor[];
  title: string;
  body: string;
  /** The last step's main button does this instead of just closing the tour. */
  finish?: "add-job";
  /** A closed group to open for this step, so its anchors come on screen. */
  reveal?: "resources";
  /** Pointed at when neither the anchors nor the group to open are on screen. */
  fallback?: TourAnchor[];
};

const NETWORK_STEP: TourStep = {
  id: "network",
  anchors: ["network"],
  reveal: "resources",
  fallback: ["menu"],
  title: "Build your network",
  body: "My Network keeps the people you've worked with and your conversations with them. Add someone to start.",
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
    fallback: ["menu"],
    title: "Everything you've done",
    body: "Every job, school, and achievement lives in Career History. Open one to edit it or add evidence. The map shows where you've worked; pin a job's place to add it.",
  },
  NETWORK_STEP,
  {
    id: "share",
    anchors: ["share"],
    title: "Share when you're ready",
    // Only the page's privacy is promised: a cloud model, if chosen, already reads resumes.
    body: "Preview your page, then publish it. Your page stays private until you publish.",
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
    fallback: ["menu"],
    title: "Everything you've done",
    body: "Career History holds every job and school. Open one to change it or add evidence.",
  },
  { ...NETWORK_STEP, finish: "add-job" },
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

/**
 * What a step points at, given the anchors on screen: its own anchors; or, when
 * they sit in a closed group that is on screen, its own anchors once the group
 * opens; or its fallback; or nothing, and the step is left out.
 */
export function pickAnchors(step: TourStep, onScreen: ReadonlySet<TourAnchor>): TourAnchor[] | null {
  const own = step.anchors.filter((anchor) => onScreen.has(anchor));
  if (own.length > 0) return own;
  if (step.reveal && onScreen.has(step.reveal)) return step.anchors;
  const fallback = (step.fallback ?? []).filter((anchor) => onScreen.has(anchor));
  return fallback.length > 0 ? fallback : null;
}

/** "Welcome, Sory." with the name set apart, or just "Welcome." */
export function welcomeHeading(firstName: string): { lead: string; name: string | null } {
  const name = firstName.trim();
  return { lead: "Welcome", name: name || null };
}

export type WelcomeTile = {
  icon: "history" | "network" | "share" | "add";
  title: string;
  body: string;
  /** The tour stop this tile previews; the tiles follow the stops' order. */
  stop: string;
};

/** Something a saved job or school still lacks, filled in where the role is edited. */
export type RoleGap = {
  kind: "company" | "degree" | "dates" | "place" | "description" | "achievements" | "company-details" | "school-details";
  label: string;
};

/**
 * What a job still lacks, in the order it is worth doing. "Company details" is always
 * offered: only the company's name is kept so far.
 */
export function jobGaps(job: {
  company: string;
  location: string;
  startDate: string;
  description: string;
  achievements: string[];
}): RoleGap[] {
  const gaps: RoleGap[] = [];
  if (!job.company.trim() || /^untitled/i.test(job.company.trim())) gaps.push({ kind: "company", label: "Name the company" });
  if (!job.startDate.trim()) gaps.push({ kind: "dates", label: "Add dates" });
  // A saved place may be a pinned site's id rather than words, so only an empty one is missing.
  if (!job.location.trim()) gaps.push({ kind: "place", label: "Add the place" });
  if (!job.description.trim()) gaps.push({ kind: "description", label: "Describe it" });
  if (job.achievements.filter((line) => line.trim()).length === 0) gaps.push({ kind: "achievements", label: "Add achievements" });
  gaps.push({ kind: "company-details", label: "Company details" });
  return gaps;
}

/** One field of a saved role, and whether it is filled in. */
export type RoleField = {
  kind: "company" | "dates" | "place" | "description" | "achievements" | "degree";
  label: string;
  done: boolean;
};

/** A job's fields in a fixed order, for the welcome card's strip of icons and its progress. */
export function jobFields(job: {
  company: string;
  location: string;
  startDate: string;
  description: string;
  achievements: string[];
}): RoleField[] {
  return [
    { kind: "company", label: "Company", done: Boolean(job.company.trim()) && !/^untitled/i.test(job.company.trim()) },
    { kind: "dates", label: "Dates", done: Boolean(job.startDate.trim()) },
    { kind: "place", label: "Place", done: Boolean(job.location.trim()) },
    { kind: "description", label: "Description", done: Boolean(job.description.trim()) },
    { kind: "achievements", label: "Achievements", done: job.achievements.some((line) => line.trim()) },
  ];
}

/** A school's fields in a fixed order. */
export function schoolFields(school: { degree: string; location: string; startDate: string }): RoleField[] {
  return [
    { kind: "degree", label: "Degree", done: Boolean(school.degree.trim()) },
    { kind: "dates", label: "Dates", done: Boolean(school.startDate.trim()) },
    { kind: "place", label: "Place", done: Boolean(school.location.trim()) },
  ];
}

/**
 * What a school still lacks, in the same order as `schoolFields`, so the card's count
 * matches the fields it shows. "School details" is always offered, like a job's company details.
 */
export function schoolGaps(school: { degree: string; location: string; startDate: string }): RoleGap[] {
  const gaps: RoleGap[] = [];
  if (!school.degree.trim()) gaps.push({ kind: "degree", label: "Add the degree" });
  if (!school.startDate.trim()) gaps.push({ kind: "dates", label: "Add dates" });
  if (!school.location.trim()) gaps.push({ kind: "place", label: "Add the place" });
  gaps.push({ kind: "school-details", label: "School details" });
  return gaps;
}

/** Gaps worth counting on the card: the always-offered details are not counted. */
export function countedGaps(gaps: RoleGap[]): number {
  return gaps.filter((gap) => gap.kind !== "company-details" && gap.kind !== "school-details").length;
}

type NudgeJob = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
};

const GAP_ADVICE: Partial<Record<RoleGap["kind"], { one: string; many: (n: number) => string }>> = {
  description: { one: "a few lines on what you did there", many: (n) => `${n} roles have no description yet. A few lines on what you did in each goes a long way.` },
  achievements: { one: "an achievement or two", many: (n) => `${n} roles have no achievements yet. Add one thing you're proud of in each.` },
  place: { one: "where it was", many: (n) => `${n} roles have no place yet. Add where each one was, so they show on your map.` },
  dates: { one: "when it was", many: (n) => `${n} roles have no dates yet. Add when each one was, so your timeline is complete.` },
  company: { one: "the company's name", many: (n) => `${n} roles have no company name yet.` },
};

/**
 * One line under the welcome card's tagline that points at the most useful next step
 * for the open section, from what is saved.
 */
export function welcomeNudge(
  which: "history" | "network" | "share",
  input: {
    jobs: NudgeJob[];
    people: number | null;
    page: { targetRole: string; visibility: string } | null;
  },
): string {
  const jobs = input.jobs.filter((job) => job.company.trim() || job.title.trim());
  const latest = [...jobs].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.startDate.localeCompare(a.startDate))[0];
  if (which === "history") {
    const kinds = ["description", "achievements", "place", "dates", "company"] as const;
    // A current role that still lacks something comes first; there can be more than one.
    const current = jobs.find((job) => job.isCurrent && jobGaps(job).some((gap) => gap.kind in GAP_ADVICE));
    // The most useful gap first: what you did, then what you achieved, then where and when.
    const firstGap = current && kinds.find((kind) => jobGaps(current).some((gap) => gap.kind === kind));
    if (current && firstGap) {
      return `Start with your role at ${current.company.trim() || "your current job"}: add ${GAP_ADVICE[firstGap]!.one}.`;
    }
    for (const kind of kinds) {
      const count = jobs.filter((job) => jobGaps(job).some((gap) => gap.kind === kind)).length;
      if (count > 1) return GAP_ADVICE[kind]!.many(count);
      if (count === 1) {
        const job = jobs.find((row) => jobGaps(row).some((gap) => gap.kind === kind))!;
        return `Your role at ${job.company.trim() || job.title.trim()} still needs ${GAP_ADVICE[kind]!.one}.`;
      }
    }
    return "Your roles are filled in. Add company details, so your page says where you did the work.";
  }
  if (which === "network") {
    if (!input.people) {
      return latest?.company.trim()
        ? `Start with someone from ${latest.company.trim()} who can vouch for your work.`
        : "Start with someone who can vouch for your work: a manager, a teammate, or a client.";
    }
    return "Add someone from each job you've had, so every role has a person behind it.";
  }
  if (!input.page) return "Set up your page, then preview it before anyone else sees it.";
  if (!input.page.targetRole.trim()) return "Set a target role, so your page leads with the work you want next.";
  if (input.page.visibility === "access-controlled") return "Your page is private. Preview it, then choose who can see it.";
  return "Preview your page, then publish it when it says what you want.";
}

/** The welcome card's line and its three tiles, in the tour's order. */
export function welcomeCard(input: { empty: boolean }): { lede: string; tiles: WelcomeTile[] } {
  if (input.empty) {
    return {
      lede: "Let's build your career here, one job at a time.",
      tiles: [
        { icon: "add", title: "Add your first job", body: "Start with the role you have now", stop: "start" },
        { icon: "history", title: "Build your history", body: "Every job and school in one place", stop: "history" },
        { icon: "network", title: "Build your network", body: "Add the people you've worked with", stop: "network" },
      ],
    };
  }
  return {
    lede: "Everything you've done, in one place you control.",
    tiles: [
      { icon: "history", title: "Add your history", body: "Jobs, schools, and proof of your work", stop: "history" },
      { icon: "network", title: "Build your network", body: "People you've worked with and trust", stop: "network" },
      { icon: "share", title: "Share it", body: "Publish a page when you're ready", stop: "share" },
    ],
  };
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
