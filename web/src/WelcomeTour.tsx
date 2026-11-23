import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Globe,
  GraduationCap,
  History,
  Lightbulb,
  MapPin,
  Plus,
  Share,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CareerFile } from "@core/career-file";
import {
  countedGaps,
  jobFields,
  jobGaps,
  pickAnchors,
  schoolFields,
  schoolGaps,
  shouldWelcome,
  tourSteps,
  welcomeCard,
  welcomeHeading,
  welcomeNudge,
  type RoleField,
  type TourAnchor,
  type TourStep,
  type WelcomeTile,
} from "@core/first-run";
import banner from "./branding/docier-banner.webp";
import mark from "./branding/docier-mark.svg";
import { readTourPreview } from "./dev-routes";
import { TOUR_REVEAL, type TourReveal } from "./tour-reveal";
import "./welcome-tour.css";

/** Where an action on the card takes the occupant: the place it is filled in. */
export type WelcomeDestination =
  | { kind: "role"; id: string }
  | { kind: "history" }
  | { kind: "network" }
  | { kind: "page" };

export type FirstRunMarks = {
  onboardingCompletedAt?: string | null;
  welcomeSeenAt?: string | null;
  tourCompletedAt?: string | null;
};

type Rect = { top: number; left: number; width: number; height: number };

const HOLE_PAD = 6;
const ANCHORS: TourAnchor[] = ["overview", "history-nav", "map", "share", "start", "network", "resources", "menu"];

const CARD_WIDTH = 320;
const GUTTER = 16;

/**
 * The first run after onboarding: a welcome card that offers the tour, and the
 * tour itself, a popover per step over the real Home. Steps come from core.
 */
export function WelcomeTour({
  firstName,
  marks,
  career,
  ready,
  tourRequest,
  onBeforeTour,
  onSaved,
  onAddJob,
  onGo,
}: {
  firstName: string;
  marks: FirstRunMarks;
  /** The saved career: picks the card's version, and fills the boxes' summaries. */
  career: CareerFile;
  /** False while the career is still loading; the card waits so it shows the right version. */
  ready: boolean;
  /** Changes when the occupant asks for the tour again (from the user menu). */
  tourRequest: number;
  /** Gets Home on screen before the tour looks for its anchors. */
  onBeforeTour: () => void;
  onSaved: (profile: FirstRunMarks & Record<string, unknown>) => void;
  onAddJob: () => void;
  /** Leaves the card for where something is filled in. */
  onGo: (destination: WelcomeDestination) => void;
}) {
  const [preview, setPreview] = useState(readTourPreview);
  // Each start of the tour begins at its first step, even over one already open.
  const [tourRun, setTourRun] = useState(0);
  // Home passes new functions each render; keep the latest without restarting anything.
  const beforeTour = useRef(onBeforeTour);
  beforeTour.current = onBeforeTour;
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const [phase, setPhase] = useState<"welcome" | "tour" | null>(() => {
    const opened = readTourPreview();
    if (opened) return opened.mode;
    return shouldWelcome({ onboardingCompletedAt: marks.onboardingCompletedAt ?? null, welcomeSeenAt: marks.welcomeSeenAt })
      ? "welcome"
      : null;
  });

  useEffect(() => {
    // A preview lasts until it ends, even if going to Home changes the address on the way.
    function onRoute() {
      const opened = readTourPreview();
      if (opened) {
        setPreview(opened);
        if (opened.mode === "tour") {
          beforeTour.current();
          setTourRun((run) => run + 1);
        }
        setPhase(opened.mode);
      }
    }
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  useEffect(() => {
    if (tourRequest === 0) return;
    beforeTour.current();
    setTourRun((run) => run + 1);
    setPhase("tour");
  }, [tourRequest]);

  // A preview saves nothing, so it never changes the real first run.
  const save = useCallback(
    async (update: { welcomeSeen?: boolean; tourDone?: boolean }) => {
      if (preview) return;
      try {
        const res = await fetch("/api/first-run", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { profile?: FirstRunMarks & Record<string, unknown> };
        if (body.profile) saved.current(body.profile);
      } catch {
        /* The card or tour may show again next time; nothing else depends on it. */
      }
    },
    [preview],
  );

  function leavePreview() {
    if (!preview) return;
    setPreview(null);
    window.location.hash = "#/";
  }

  if (phase === "welcome") {
    if (!ready) return null;
    return (
      <WelcomeCard
        firstName={firstName}
        empty={preview ? preview.empty : career.jobs.length + career.schools.length === 0}
        career={career}
        onGo={(destination) => {
          setPhase(null);
          void save({ welcomeSeen: true });
          leavePreview();
          onGo(destination);
        }}
        onNotNow={() => {
          setPhase(null);
          void save({ welcomeSeen: true });
          leavePreview();
        }}
        onStart={() => {
          void save({ welcomeSeen: true });
          beforeTour.current();
          setTourRun((run) => run + 1);
          setPhase("tour");
        }}
      />
    );
  }

  if (phase === "tour") {
    // Before the career loads, Home shows "Start your story" and would pick the short tour.
    if (!ready) return null;
    return (
      <Tour
        key={tourRun}
        empty={preview ? preview.empty : null}
        onEnd={(finish) => {
          setPhase(null);
          void save({ tourDone: true });
          leavePreview();
          if (finish === "add-job") onAddJob();
        }}
      />
    );
  }

  return null;
}

const TILE_ICONS: Record<WelcomeTile["icon"], LucideIcon> = { history: History, network: Users, share: Share, add: Plus };

type Summary = "history" | "network" | "share";
const SUMMARY_FOR: Record<string, Summary> = { history: "history", network: "network", share: "share" };
type PageSettings = { slug: string; visibility: string; sections: string[]; targetRole: string };

function WelcomeCard({
  firstName,
  empty,
  career,
  onNotNow,
  onStart,
  onGo,
}: {
  firstName: string;
  /** Nothing saved yet: the card talks about starting, not about what is there. */
  empty: boolean;
  career: CareerFile;
  onNotNow: () => void;
  onStart: () => void;
  onGo: (destination: WelcomeDestination) => void;
}) {
  // With a career, each box opens a short summary in the boxes' own space; the card never grows.
  const [open, setOpen] = useState<Summary | null>(null);
  const [people, setPeople] = useState<number | null>(null);
  const [page, setPage] = useState<PageSettings | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const tileRefs = useRef<Partial<Record<Summary, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (empty) return;
    let cancel = false;
    void (async () => {
      try {
        const [network, settings] = await Promise.all([fetch("/api/career-management"), fetch("/api/work-map/settings")]);
        const contacts = network.ok ? (((await network.json()) as { contacts?: unknown[] }).contacts ?? []) : [];
        const saved = settings.ok ? ((await settings.json()) as { settings?: PageSettings }).settings ?? null : null;
        if (cancel) return;
        setPeople(contacts.length);
        setPage(saved);
      } catch {
        /* The summaries show what they have; the boxes still work. */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [empty]);
  useEffect(() => {
    // The grown card may scroll on a short screen; bring the summary into view.
    if (open) backRef.current?.focus();
  }, [open]);
  function closeSummary() {
    const was = open;
    setOpen(null);
    if (was) requestAnimationFrame(() => tileRefs.current[was]?.focus({ preventScroll: true }));
  }
  const todo: Record<Summary, number> = {
    history:
      career.jobs.reduce((sum, job) => sum + countedGaps(jobGaps(job)), 0) +
      career.schools.reduce((sum, school) => sum + countedGaps(schoolGaps(school)), 0),
    network: people === 0 ? 1 : 0,
    share: page ? 1 : 0,
  };
  const ref = useRef<HTMLDialogElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // The dialog would focus its first button; the tour is the one to land on.
    // Without scrolling: on a short screen the card scrolls, and should open at its top.
    startRef.current?.focus({ preventScroll: true });
    if (dialog) dialog.scrollTop = 0;
  }, []);
  const heading = welcomeHeading(firstName);
  const content = welcomeCard({ empty });
  return (
    <dialog
      ref={ref}
      className="welcome-card"
      aria-labelledby="welcome-card-title"
      onCancel={(event) => {
        event.preventDefault();
        // Escape steps back out of a summary first.
        if (open) closeSummary();
        else onNotNow();
      }}
    >
      <div className="welcome-card-banner">
        {/* The painted desk scene from branding, with a clear middle for the real mark and name. */}
        <img className="welcome-card-desk" src={banner} alt="" width={576} height={176} />
        <div className="welcome-card-brand">
          <img src={mark} alt="" width={42} height={42} />
          <span>Docier</span>
        </div>
      </div>
      <div className="welcome-card-body">
        <h2 id="welcome-card-title">
          {heading.lead}
          {heading.name ? (
            <>
              , <em>{heading.name}.</em>
            </>
          ) : (
            "."
          )}
        </h2>
        <p className="welcome-card-lede">{content.lede}</p>
        {open ? (
          <p key={open} className="welcome-card-nudge" aria-live="polite">
            <Lightbulb size={15} strokeWidth={1.9} aria-hidden="true" />
            <span>{welcomeNudge(open, { jobs: career.jobs, people, page })}</span>
          </p>
        ) : null}
        <div className={open ? "welcome-card-area is-open" : "welcome-card-area"}>
          <ol className="welcome-card-tiles" aria-hidden={open ? true : undefined}>
            {content.tiles.map((tile, at) => {
              const TileIcon = TILE_ICONS[tile.icon];
              const summary = empty ? undefined : SUMMARY_FOR[tile.stop];
              const inner = (
                <>
                  <span className="welcome-card-tile-n" aria-hidden="true">
                    {at + 1}
                  </span>
                  {summary && todo[summary] > 0 ? (
                    <span className="welcome-card-tile-todo" title="Things to do">
                      {todo[summary]}
                    </span>
                  ) : null}
                  <span className="welcome-card-tile-icon" aria-hidden="true">
                    <TileIcon size={18} strokeWidth={1.75} />
                  </span>
                  <strong>{tile.title}</strong>
                  <span className="welcome-card-tile-body">{tile.body}</span>
                  {summary ? <span className="welcome-card-tile-more">See details ›</span> : null}
                </>
              );
              return (
                <li key={tile.title} className="welcome-card-tile">
                  {summary ? (
                    <button
                      type="button"
                      className="welcome-card-tile-button"
                      ref={(node) => {
                        tileRefs.current[summary] = node;
                      }}
                      tabIndex={open ? -1 : undefined}
                      onClick={() => setOpen(summary)}
                    >
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ol>
          {open ? (
            <WelcomeSummary
              which={open}
              career={career}
              people={people}
              page={page}
              backRef={backRef}
              onBack={closeSummary}
              onGo={onGo}
            />
          ) : null}
        </div>
        <div className="welcome-card-actions">
          <button type="button" className="welcome-link" onClick={onNotNow}>
            I'll explore on my own
          </button>
          <button ref={startRef} type="button" className="welcome-btn welcome-btn-solid welcome-card-start" onClick={onStart}>
            Show me around <span aria-hidden="true">·</span> 1 min
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <p className="welcome-card-later">You can take the tour anytime from your menu.</p>
      </div>
    </dialog>
  );
}

type Tip = { text: string; rect: DOMRect };

/** A label over the hovered icon, drawn outside the scrolling list so it can't be clipped. */
function RoleTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  const above = tip.rect.top > 40;
  return createPortal(
    <span
      className={above ? "welcome-role-tip" : "welcome-role-tip is-below"}
      role="tooltip"
      style={{
        left: tip.rect.left + tip.rect.width / 2,
        top: above ? tip.rect.top - 8 : tip.rect.bottom + 8,
      }}
    >
      {tip.text}
    </span>,
    // Inside the open card: a modal dialog sits above the rest of the page.
    document.querySelector("dialog.welcome-card[open]") ?? document.body,
  );
}

const FIELD_ICONS: Record<RoleField["kind"], LucideIcon> = {
  company: Building2,
  dates: CalendarDays,
  place: MapPin,
  description: AlignLeft,
  achievements: Trophy,
  degree: GraduationCap,
};

/**
 * One saved role: a ring for how much is filled in, its name, and a strip of its fields.
 * Every icon opens the role, where the field is filled in.
 */
function RoleRow({
  title,
  meta,
  fields,
  extra,
  onOpen,
  onTip,
}: {
  title: string;
  meta: string;
  fields: RoleField[];
  /** Offered on every role, not yet kept, so not counted. */
  extra: { label: string; icon: LucideIcon };
  onOpen: () => void;
  /** Shows what an icon means while it is hovered or focused; null hides it. */
  onTip: (tip: Tip | null) => void;
}) {
  const tipProps = (text: string) => ({
    onPointerEnter: (event: PointerEvent<HTMLElement>) => onTip({ text, rect: event.currentTarget.getBoundingClientRect() }),
    onPointerLeave: () => onTip(null),
    onFocus: (event: FocusEvent<HTMLElement>) => onTip({ text, rect: event.currentTarget.getBoundingClientRect() }),
    onBlur: () => onTip(null),
  });
  const done = fields.filter((field) => field.done).length;
  const share = fields.length ? done / fields.length : 0;
  const Extra = extra.icon;
  return (
    <li className="welcome-role">
      <span
        className={done === fields.length ? "welcome-role-ring is-full" : "welcome-role-ring"}
        role="img"
        aria-label={`${done} of ${fields.length} filled in`}
        {...tipProps(`${done} of ${fields.length} filled in`)}
      >
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="welcome-role-ring-track" />
          <circle cx="18" cy="18" r="15" className="welcome-role-ring-fill" pathLength={100} strokeDasharray={`${share * 100} 100`} />
        </svg>
        <span aria-hidden="true">{done}</span>
      </span>
      <div className="welcome-role-name">
        <b>{title}</b>
        <small>{meta}</small>
      </div>
      <span className="welcome-role-fields">
        {fields.map((field) => {
          const FieldIcon = FIELD_ICONS[field.kind];
          const label = field.done ? `${field.label}: filled in` : `${field.label}: add it`;
          return (
            <button
              key={field.kind}
              type="button"
              className={field.done ? "welcome-role-field is-done" : "welcome-role-field"}
              aria-label={`${title}, ${label}`}
              {...tipProps(field.done ? `${field.label} · filled in` : `${field.label} · add it`)}
              onClick={onOpen}
            >
              <FieldIcon size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          );
        })}
        <span className="welcome-role-sep" aria-hidden="true" />
        <button
          type="button"
          className="welcome-role-field is-extra"
          aria-label={`${title}, ${extra.label}`}
          {...tipProps(`${extra.label} · coming soon`)}
          onClick={onOpen}
        >
          <Extra size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

function WelcomeSummary({
  which,
  career,
  people,
  page,
  backRef,
  onBack,
  onGo,
}: {
  which: Summary;
  career: CareerFile;
  people: number | null;
  page: PageSettings | null;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onGo: (destination: WelcomeDestination) => void;
}) {
  const year = (date: string) => date.slice(0, 4);
  const [tip, setTip] = useState<Tip | null>(null);
  const head = (title: string, meta: string, open: string, destination: WelcomeDestination) => (
    <div className="welcome-summary-head">
      <button ref={backRef} type="button" className="welcome-summary-back" aria-label="Back" onClick={onBack}>
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <strong>{title}</strong>
      <small>{meta}</small>
      <button type="button" className="welcome-summary-open" onClick={() => onGo(destination)}>
        {open}
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
  const chip = (label: string, destination: WelcomeDestination, key: string) => (
    <button key={key} type="button" className="welcome-summary-chip" onClick={() => onGo(destination)}>
      {label}
    </button>
  );

  if (which === "history") {
    const schools = career.schools.length;
    return (
      <section className="welcome-summary" aria-label="Your roles" onScrollCapture={() => setTip(null)}>
        <RoleTip tip={tip} />
        {head(
          "Your roles",
          `${career.jobs.length} ${career.jobs.length === 1 ? "job" : "jobs"} · ${schools} ${schools === 1 ? "school" : "schools"}`,
          "Open Career History",
          { kind: "history" },
        )}
        <ul className="welcome-summary-rows">
          {career.jobs.map((job) => (
            <RoleRow
              key={job.id}
              title={job.title || "Untitled role"}
              meta={`${job.company} · ${job.startDate ? year(job.startDate) : "no dates"}${job.isCurrent ? "–now" : job.endDate ? `–${year(job.endDate)}` : ""}`}
              fields={jobFields(job)}
              extra={{ label: "Company details", icon: Globe }}
              onOpen={() => onGo({ kind: "role", id: job.id })}
              onTip={setTip}
            />
          ))}
          {career.schools.map((school) => (
            <RoleRow
              key={school.id}
              title={school.institution}
              meta={[school.degree, school.field].filter(Boolean).join(" · ") || "School"}
              fields={schoolFields(school)}
              extra={{ label: "School details", icon: Globe }}
              onOpen={() => onGo({ kind: "role", id: school.id })}
              onTip={setTip}
            />
          ))}
        </ul>
      </section>
    );
  }

  if (which === "network") {
    const companies = [...new Set(career.jobs.map((job) => job.company.trim()).filter((name) => name && !/^untitled/i.test(name)))];
    return (
      <section className="welcome-summary" aria-label="Your network">
        {head("Your network", people === null ? "" : `${people} ${people === 1 ? "person" : "people"}`, "Open My Network", { kind: "network" })}
        <ul className="welcome-summary-rows">
          <li className="welcome-summary-note">
            {people
              ? "Add more people from the jobs you've had."
              : "No one in My Network yet. Start with someone from a job you've had: a manager, a teammate, or someone who can vouch for your work."}
          </li>
          {companies.map((company) => (
            <li key={company}>
              <div>
                <b>{company}</b>
                <small>
                  {career.jobs
                    .filter((job) => job.company.trim() === company)
                    .map((job) => job.title)
                    .join(", ")}
                </small>
              </div>
              <span className="welcome-summary-chips">{chip("Add someone", { kind: "network" }, "add")}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const rows: Array<{ label: string; value: string; action: string }> = page
    ? [
        { label: "Who can see it", value: page.visibility === "access-controlled" ? "Only people you let in" : "Anyone with the link", action: "Change" },
        { label: "Sections", value: page.sections.join(", "), action: "Choose" },
        { label: "Target role", value: page.targetRole || "Not set", action: page.targetRole ? "Change" : "Set it" },
      ]
    : [];
  return (
    <section className="welcome-summary" aria-label="Your page">
      {head("Your page", page ? `/${page.slug}` : "", "Page settings", { kind: "page" })}
      <ul className="welcome-summary-rows">
        {rows.length === 0 ? <li className="welcome-summary-note">Your page isn't set up yet.</li> : null}
        {rows.map((row) => (
          <li key={row.label}>
            <div>
              <b>{row.label}</b>
              <small>{row.value}</small>
            </div>
            <span className="welcome-summary-chips">{chip(row.action, { kind: "page" }, row.label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The anchors with something on screen. */
function anchorsOnScreen(): Set<TourAnchor> {
  return new Set(ANCHORS.filter((anchor) => anchorRects([anchor]).length > 0));
}

/**
 * Each anchor's elements merged into one box; anchors with nothing drawn are left out.
 * With `inView`, only boxes inside the window count, so one outline never spans a
 * part at the top and another far below the fold.
 */
function anchorRects(anchors: TourAnchor[], inView = false): Rect[] {
  return anchors.flatMap((anchor) => {
    const boxes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)]
      .map((el) => el.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .filter((box) => !inView || (box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth));
    if (boxes.length === 0) return [];
    const top = Math.min(...boxes.map((box) => box.top));
    const left = Math.min(...boxes.map((box) => box.left));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    const right = Math.max(...boxes.map((box) => box.right));
    return [{ top, left, width: right - left, height: bottom - top }];
  });
}

function Tour({
  empty,
  onEnd,
}: {
  /** From a preview route; otherwise read from Home ("Start your story" means nothing is saved yet). */
  empty: boolean | null;
  onEnd: (finish?: TourStep["finish"]) => void;
}) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [cardHeight, setCardHeight] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps?.[index];

  // Closing the tour puts focus back where it was, or on the menu button if that is gone.
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target =
        returnTo && returnTo.isConnected && returnTo !== document.body
          ? returnTo
          : document.querySelector<HTMLElement>('[data-tour="menu"]');
      // Only if nothing else took focus, such as the new job the short tour opens.
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) target?.focus();
      });
    };
  }, []);
  const last = steps ? index === steps.length - 1 : false;

  // Home may still be drawing or loading its story, so look for the anchors for a moment before starting.
  // Only steps with something to point at are kept: their anchors, a closed group holding them, or a fallback.
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const look = () => {
      // The sidebar and top bar draw first; wait for Home's own content, the tiles or "Start your story".
      const loaded = anchorRects(["overview", "start"]).length > 0;
      const isEmpty = empty ?? document.querySelector('[data-tour="start"]') !== null;
      const onScreen = anchorsOnScreen();
      const shown = tourSteps({ empty: isEmpty }).filter((candidate) => pickAnchors(candidate, onScreen) !== null);
      if ((loaded && shown.length > 0) || tries >= 20) {
        setSteps(shown);
        return;
      }
      tries += 1;
      timer = window.setTimeout(look, 100);
    };
    look();
    return () => window.clearTimeout(timer);
  }, [empty]);

  useEffect(() => {
    if (steps && steps.length === 0) onEnd();
  }, [steps, onEnd]);

  useLayoutEffect(() => {
    if (!step) return;
    const onScreen = anchorsOnScreen();
    const chosen = pickAnchors(step, onScreen) ?? [];
    // A stop inside a closed group opens it for this step, and puts it back after.
    const reveal =
      step.reveal && !step.anchors.some((anchor) => onScreen.has(anchor)) && onScreen.has(step.reveal)
        ? step.reveal
        : null;
    if (reveal) window.dispatchEvent(new CustomEvent<TourReveal>(TOUR_REVEAL, { detail: { target: reveal, open: true } }));
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      // Two frames: an opened group draws on the first.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const shown = anchorRects(chosen, true);
          setRects(shown.length > 0 ? shown : anchorRects(chosen));
        });
      });
    };
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(chosen.map((anchor) => `[data-tour="${anchor}"]`).join(", ") || "#none")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      if (reveal) {
        window.dispatchEvent(new CustomEvent<TourReveal>(TOUR_REVEAL, { detail: { target: reveal, open: false } }));
      }
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    cardRef.current?.focus();
  }, [index, rects.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Tab") {
        // The tour is modal: Tab cycles through the card's buttons, never into Home behind it.
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        if (buttons.length === 0) return;
        event.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      if (event.key === "Escape") onEnd();
      else if (event.key === "ArrowRight" && !last) setIndex((current) => current + 1);
      else if (event.key === "ArrowLeft" && index > 0) setIndex((current) => current - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, last, onEnd]);

  if (!step) return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const place = cardPlace(rects[0], cardHeight, width, height);

  return createPortal(
    <div className="tour">
      <svg className="tour-shade" width={width} height={height} aria-hidden="true">
        <defs>
          <mask id="tour-holes">
            <rect width={width} height={height} fill="white" />
            {rects.map((rect, at) => (
              <rect
                key={at}
                x={rect.left - HOLE_PAD}
                y={rect.top - HOLE_PAD}
                width={rect.width + HOLE_PAD * 2}
                height={rect.height + HOLE_PAD * 2}
                rx={12}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width={width} height={height} className="tour-shade-fill" mask="url(#tour-holes)" />
        {rects.map((rect, at) => (
          <rect
            key={at}
            x={rect.left - HOLE_PAD}
            y={rect.top - HOLE_PAD}
            width={rect.width + HOLE_PAD * 2}
            height={rect.height + HOLE_PAD * 2}
            rx={12}
            className="tour-ring"
          />
        ))}
      </svg>
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-card-title"
        aria-describedby="tour-card-body"
        tabIndex={-1}
        style={{ top: place.top, left: place.left, width: Math.min(CARD_WIDTH, width - GUTTER * 2) }}
      >
        <p className="tour-card-count">
          {index + 1} of {steps?.length ?? 0}
        </p>
        <h2 id="tour-card-title">{step.title}</h2>
        <p id="tour-card-body">{step.body}</p>
        <div className="tour-card-actions">
          <button type="button" className="welcome-link" onClick={() => onEnd()}>
            Skip tour
          </button>
          <span className="tour-card-move">
            {index > 0 ? (
              <button type="button" className="welcome-btn welcome-btn-ghost" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="welcome-btn welcome-btn-solid"
              onClick={() => (last ? onEnd(step.finish) : setIndex(index + 1))}
            >
              {last ? (step.finish === "add-job" ? "Add your first job" : "Done") : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Below the highlight when it fits, else above, else beside it; always inside the window. */
function cardPlace(rect: Rect | undefined, cardHeight: number, width: number, height: number) {
  const cardWidth = Math.min(CARD_WIDTH, width - GUTTER * 2);
  const clampLeft = (left: number) => Math.max(GUTTER, Math.min(left, width - cardWidth - GUTTER));
  const clampTop = (top: number) => Math.max(GUTTER, Math.min(top, height - cardHeight - GUTTER));
  if (!rect) return { top: clampTop((height - cardHeight) / 2), left: clampLeft((width - cardWidth) / 2) };
  const gap = HOLE_PAD + 12;
  if (rect.top + rect.height + gap + cardHeight <= height - GUTTER) {
    return { top: clampTop(rect.top + rect.height + gap), left: clampLeft(rect.left) };
  }
  if (rect.top - gap - cardHeight >= GUTTER) {
    return { top: clampTop(rect.top - gap - cardHeight), left: clampLeft(rect.left) };
  }
  if (rect.left + rect.width + gap + cardWidth <= width - GUTTER) {
    return { top: clampTop(rect.top), left: rect.left + rect.width + gap };
  }
  return { top: clampTop(rect.top), left: clampLeft(rect.left - gap - cardWidth) };
}
