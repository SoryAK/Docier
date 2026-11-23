import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shouldWelcome, tourSteps, welcomeSavedLine, type TourAnchor, type TourStep } from "@core/first-run";
import mark from "./branding/docier-mark.svg";
import { readTourPreview } from "./dev-routes";
import "./welcome-tour.css";

export type FirstRunMarks = {
  onboardingCompletedAt?: string | null;
  welcomeSeenAt?: string | null;
  tourCompletedAt?: string | null;
};

type Rect = { top: number; left: number; width: number; height: number };

const HOLE_PAD = 6;
const CARD_WIDTH = 320;
const GUTTER = 16;

/**
 * The first run after onboarding: a welcome card that offers the tour, and the
 * tour itself, a popover per step over the real Home. Steps come from core.
 */
export function WelcomeTour({
  firstName,
  marks,
  counts,
  tourRequest,
  onBeforeTour,
  onSaved,
  onAddJob,
}: {
  firstName: string;
  marks: FirstRunMarks;
  counts: { jobs: number; schools: number };
  /** Changes when the occupant asks for the tour again (from the user menu). */
  tourRequest: number;
  /** Gets Home on screen before the tour looks for its anchors. */
  onBeforeTour: () => void;
  onSaved: (profile: FirstRunMarks & Record<string, unknown>) => void;
  onAddJob: () => void;
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
    return (
      <WelcomeCard
        firstName={firstName}
        saved={welcomeSavedLine(counts)}
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

function WelcomeCard({
  firstName,
  saved,
  onNotNow,
  onStart,
}: {
  firstName: string;
  saved: string | null;
  onNotNow: () => void;
  onStart: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="welcome-card"
      aria-labelledby="welcome-card-title"
      onCancel={(event) => {
        event.preventDefault();
        onNotNow();
      }}
    >
      <img className="welcome-card-mark" src={mark} alt="" width={36} height={36} />
      <h2 id="welcome-card-title">
        Welcome to Docier{firstName.trim() ? `, ${firstName.trim()}` : ""}.
      </h2>
      <p>Your career lives here: jobs, schools, places, and a page you can publish when you're ready.</p>
      {saved ? <p className="welcome-card-saved">{saved}</p> : null}
      <p className="welcome-card-ask">Take a 1-minute tour?</p>
      <div className="welcome-card-actions">
        <button type="button" className="welcome-btn welcome-btn-ghost" onClick={onNotNow}>
          Not now
        </button>
        <button type="button" className="welcome-btn welcome-btn-solid" autoFocus onClick={onStart}>
          Start the tour
        </button>
      </div>
    </dialog>
  );
}

/** Each anchor's elements merged into one box; anchors not on screen are left out. */
function anchorRects(anchors: TourAnchor[]): Rect[] {
  return anchors.flatMap((anchor) => {
    const boxes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)]
      .map((el) => el.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
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
  const last = steps ? index === steps.length - 1 : false;

  // Home may still be drawing or loading its story, so look for the anchors for a moment before starting.
  // Only steps with an anchor on screen are kept; on a narrow screen the sidebar's stop drops out.
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const look = () => {
      // The sidebar and top bar draw first; wait for Home's own content, the tiles or "Start your story".
      const loaded = anchorRects(["overview", "start"]).length > 0;
      const isEmpty = empty ?? document.querySelector('[data-tour="start"]') !== null;
      const shown = tourSteps({ empty: isEmpty }).filter((candidate) => anchorRects(candidate.anchors).length > 0);
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
    const first = document.querySelector<HTMLElement>(
      step.anchors.map((anchor) => `[data-tour="${anchor}"]`).join(", "),
    );
    first?.scrollIntoView({ block: "nearest", inline: "nearest" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRects(anchorRects(step.anchors)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    cardRef.current?.focus();
  }, [index, rects.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
    return { top: rect.top + rect.height + gap, left: clampLeft(rect.left) };
  }
  if (rect.top - gap - cardHeight >= GUTTER) {
    return { top: rect.top - gap - cardHeight, left: clampLeft(rect.left) };
  }
  if (rect.left + rect.width + gap + cardWidth <= width - GUTTER) {
    return { top: clampTop(rect.top), left: rect.left + rect.width + gap };
  }
  return { top: clampTop(rect.top), left: clampLeft(rect.left - gap - cardWidth) };
}
