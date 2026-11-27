import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";

const NAV_ID = "home-nav";
/**
 * Customizations. Only the ready ones are shown, at the bottom of the panel; the
 * rest come back one by one as they are built, so nothing in the panel is a dead end.
 */
const CUSTOMIZATIONS = [
  { id: "overview", label: "Overview", ready: false },
  { id: "canvas", label: "Canvas", ready: true },
  { id: "plugins", label: "Plugins", ready: false },
  { id: "extensions", label: "Extensions", ready: false },
  { id: "tools", label: "Tools", ready: false },
] as const;

export type HomePage =
  | "home"
  | "history"
  | "historyReserve"
  | "resumes"
  | "documents"
  | "tools"
  | "network"
  | "opportunities";

export function HomeNav({
  collapsed,
  mobileOpen,
  page,
  width,
  onCloseMobile,
  onExpand,
  onGoHome,
  onGoHistory,
  onGoPage,
  onCanvas,
  canvasOpen = false,
  history,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  page: HomePage;
  width?: number;
  onCloseMobile: () => void;
  /** Opens the full menu from the icons-only one, for what needs the room. */
  onExpand?: () => void;
  onGoHome: () => void;
  onGoHistory: (jobId?: string) => void;
  onGoPage: (page: HomePage) => void;
  onCanvas: (open: boolean) => void;
  canvasOpen?: boolean;
  history?: ReactNode;
}) {
  const slim = collapsed && !mobileOpen;
  const [customId, setCustomId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasOpen && customId === "canvas") setCustomId(null);
  }, [canvasOpen, customId]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseMobile();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  function go(next: HomePage) {
    setCustomId(null);
    onCanvas(false);
    onGoPage(next);
    onCloseMobile();
  }

  function openGalleryRole(id: string) {
    setCustomId(null);
    onCanvas(false);
    onGoHistory(id);
    onCloseMobile();
  }

  // Only Canvas is ready today; the other branch serves Customizations as they come back.
  function chooseCustom(id: string) {
    if (id === "canvas") {
      const next = customId !== "canvas";
      setCustomId(next ? "canvas" : null);
      onCanvas(next);
      onCloseMobile();
      return;
    }
    setCustomId(id);
    onCanvas(false);
    onCloseMobile();
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="home-nav-backdrop"
          aria-label="Close menu"
          onClick={onCloseMobile}
        />
      ) : null}
      <nav
        id={NAV_ID}
        className={[
          "home-nav",
          slim ? "is-collapsed" : "",
          mobileOpen ? "is-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Main"
        style={width ? { width } : undefined}
      >
        <div className="home-nav-main">
        {page === "history" && history ? (
          history
        ) : (
        <>
        <NavHeading label="Your career" slim={slim} />
        <NavRow
          icon="home"
          label="Home"
          current={customId ? false : page === "home"}
          slim={slim}
          onSelect={() => {
            setCustomId(null);
            onCanvas(false);
            onGoHome();
            onCloseMobile();
          }}
        />
        <NavRow
          icon="history"
          label="Career History"
          tour="history-nav"
          current={customId ? false : page === "history"}
          slim={slim}
          onSelect={() => {
            setCustomId(null);
            onCanvas(false);
            onGoHistory();
            onCloseMobile();
          }}
        />
        <NavRow
          icon="network"
          label="My Network"
          current={customId ? false : page === "network"}
          slim={slim}
          tour="network"
          onSelect={() => go("network")}
        />
        <NavHeading label="Tools" slim={slim} />
        <NavRow
          icon="compass"
          label="Opportunities"
          current={customId ? false : page === "opportunities"}
          slim={slim}
          onSelect={() => go("opportunities")}
        />
        <NavRow
          icon="studio"
          label="Resume Studio"
          current={customId ? false : page === "resumes"}
          slim={slim}
          onSelect={() => go("resumes")}
        />
        <NavRow
          icon="docs"
          label="My Docs"
          current={customId ? false : page === "documents"}
          slim={slim}
          onSelect={() => go("documents")}
        />
        <NavRow
          icon="tools"
          label="My Tools"
          current={customId ? false : page === "tools"}
          slim={slim}
          onSelect={() => go("tools")}
        />
        <GalleryResource slim={slim} onExpand={onExpand} onOpenRole={openGalleryRole} />
        </>
        )}
        </div>
        <div className="home-nav-foot">
          {CUSTOMIZATIONS.filter((item) => item.ready).map((item) => (
            <NavRow
              key={item.id}
              icon={item.id}
              label={item.label}
              current={customId === item.id}
              slim={slim}
              onSelect={() => chooseCustom(item.id)}
            />
          ))}
        </div>
      </nav>
    </>
  );
}

export const HOME_NAV_ID = NAV_ID;

/** A section heading that never folds; a thin line when the panel is icons only. */
function NavHeading({ label, slim }: { label: string; slim: boolean }) {
  return slim ? (
    <h2 className="home-nav-divider">
      <span className="sr-only">{label}</span>
    </h2>
  ) : (
    <h2 className="home-nav-heading">{label}</h2>
  );
}

function NavRow({
  icon,
  label,
  current,
  slim,
  onSelect,
  tour,
}: {
  icon: IconName;
  label: string;
  current?: boolean;
  slim: boolean;
  onSelect?: () => void;
  /** Where the tour points at this row. */
  tour?: string;
}) {
  const className = ["home-nav-item", current ? "is-current" : ""]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <Icon name={icon} />
      {slim ? <span className="sr-only">{label}</span> : label}
    </>
  );
  if (!onSelect) {
    return (
      <span className={className} title={slim ? label : undefined} data-tour={tour}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={slim ? label : undefined}
      aria-current={current ? "page" : undefined}
      data-tour={tour}
      onClick={onSelect}
    >
      {inner}
    </button>
  );
}

function GalleryResource({
  slim,
  onExpand,
  onOpenRole,
}: {
  slim: boolean;
  /** Icons only: the photos need the full menu's width, so Gallery opens it first. */
  onExpand?: () => void;
  onOpenRole: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [covers, setCovers] = useState<GalleryCover[]>([]);
  const [status, setStatus] = useState<GalleryStatus>("idle");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let cancelled = false;
    setStatus("loading");
    void fetch("/api/work-map", { signal: controller.signal })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const body = (await response.json()) as { roles?: WorkMapRole[] };
        if (cancelled) return;
        setCovers(coverPhotos(body.roles ?? []));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, attempt]);

  return (
    <>
      <button
        type="button"
        className={open ? "home-nav-item is-current" : "home-nav-item"}
        aria-expanded={open}
        title={slim ? "Gallery" : undefined}
        onClick={() => {
          if (slim && onExpand) {
            onExpand();
            return;
          }
          if (!open) setStatus("loading");
          setOpen((value) => !value);
        }}
      >
        <Icon name="gallery" />
        {slim ? <span className="sr-only">Gallery</span> : "Gallery"}
      </button>
      {open ? (
        <div className="home-nav-gallery">
          {status === "error" ? (
            <div className="home-nav-gallery-error">
              <p>The gallery could not be loaded.</p>
              <Button label="Try again" variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)} />
            </div>
          ) : status === "loading" ? (
            <p>Loading photos.</p>
          ) : covers.length > 0 ? (
            <div className="home-nav-photos">
              {covers.map((item) => (
                <Thumbnail
                  key={item.id}
                  className="home-nav-thumb"
                  src={item.url}
                  alt={item.organization || item.title || "Photo"}
                  label={item.organization || item.title || "Photo"}
                  onClick={() => onOpenRole(item.roleId)}
                />
              ))}
            </div>
          ) : (
            <p>No photos yet.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

type GalleryStatus = "idle" | "loading" | "ready" | "error";

type GalleryCover = {
  id: string;
  url: string;
  title: string;
  organization: string;
  roleId: string;
};

function coverPhotos(roles: WorkMapRole[]): GalleryCover[] {
  return roles.flatMap((role) => {
    const photo = roleCoverPhoto(role.media);
    return photo
      ? [{ ...photo, roleId: role.id, organization: role.organization || role.title }]
      : [];
  });
}

type IconName =
  | "home"
  | "history"
  | "docs"
  | "tools"
  | "studio"
  | "network"
  | "gallery"
  | "search"
  | "compass"
  | "canvas"
  | "notice"
  | "menu"
  | "rail"
  | "railOff"
  | "proforna"
  | "panel"
  | "panelOff"
  | "chat"
  | "request";

export function Icon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" ? (
        <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      ) : null}
      {name === "history" ? (
        <>
          <path d="M4 11.5a8 8 0 1 0 2.3-5.7" />
          <path d="M4 5.5v4h4M12 8v5l3 1.5" />
        </>
      ) : null}
      {name === "docs" ? (
        <>
          <path d="M4 7.5h6l1.5 2H20v10.5H4z" />
          <path d="M4 7.5V5.5h6l1.2 1.6" />
        </>
      ) : null}
      {name === "tools" ? <path d="M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1-3 3l-6-6a6 6 0 0 1-8-8z" /> : null}
      {name === "studio" ? (
        <>
          <path d="M5 5.5h14v13H5z" />
          <path d="M5 10h14M10 5.5v13" />
        </>
      ) : null}
      {name === "network" ? (
        <>
          <circle cx="9" cy="8" r="2.4" />
          <circle cx="16.5" cy="8" r="2.4" />
          <circle cx="12.5" cy="16.5" r="2.6" />
          <path d="M10.6 10.1 11.4 14.1M15 10.1 13.7 14" />
        </>
      ) : null}
      {name === "gallery" ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <circle cx="9" cy="10" r="1.4" />
          <path d="m4 16 4.5-4 3 3 2.2-2.2L20 16" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.6-3.6" />
        </>
      ) : null}
      {name === "compass" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m15.2 8.8-2 4.4-4.4 2 2-4.4z" />
        </>
      ) : null}
      {name === "canvas" ? <path d="M8 3v18M16 3v18M3 8h18M3 16h18" /> : null}
      {name === "notice" ? (
        <>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      ) : null}
      {name === "menu" || name === "railOff" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M9.5 4v16" />
        </>
      ) : null}
      {name === "rail" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M9.5 4v16" />
          <path className="home-panel-fill" d="M4.2 5.2H9.5v13.6H4.2z" />
        </>
      ) : null}
      {name === "proforna" ? (
        <>
          <path d="M5 6.5h14v11l-4-2.5H5z" />
          <path d="M8.5 10.5h7M8.5 13.5h4.5" />
        </>
      ) : null}
      {name === "panel" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M14.5 4v16" />
          <path className="home-panel-fill" d="M14.5 5.2h5.3v13.6H14.5z" />
        </>
      ) : null}
      {name === "panelOff" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M14.5 4v16" />
        </>
      ) : null}
      {name === "chat" ? (
        <>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          <path className="home-panel-fill" d="M12 8.5l.9 1.8 1.8.9-1.8.9-.9 1.8-.9-1.8-1.8-.9 1.8-.9z" />
        </>
      ) : null}
      {name === "request" ? (
        <>
          <path d="M10 14l11 -11" />
          <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
        </>
      ) : null}
    </svg>
  );
}
