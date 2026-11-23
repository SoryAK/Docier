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
