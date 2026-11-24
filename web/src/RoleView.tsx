import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { CalendarDays, ChevronRight, Globe, ImagePlus, Images, MapPin, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { AchievementDate } from "./AchievementDate";
import { AchievementDetail } from "./AchievementDetail";
import { AchievementProof } from "./AchievementProof";
import { RolePeople } from "./RolePeople";
import "./role-view.css";

type RoleTab = "overview" | "achievements";

/** A thing picked in the role's History, to show in the role. */
export type RoleFocusRequest = { kind: "achievement" | "person" | "overview"; id: string; nonce: number };

/**
 * One role, opened from Career History: its photo as a banner (or a cream band),
 * buttons for what it has, and two tabs. The role's History sits beside it.
 */
export function RoleView({
  role,
  roles,
  onSaved,
  focusRequest = null,
}: {
  role: WorkMapRole;
  roles: WorkMapRole[];
  onSaved: () => void;
  focusRequest?: RoleFocusRequest | null;
}) {
  const [tab, setTab] = useState<RoleTab>("overview");
  const [editing, setEditing] = useState(false);
  const galleryRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    setPhotoMessage("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("photo", file);
        const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/photos`, { method: "POST", body: form });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setPhotoMessage(body.error ?? "That photo could not be added.");
          break;
        }
      }
      onSaved();
    } catch {
      setPhotoMessage("The photo could not be added. Check your connection and try again.");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(id: string) {
    if (!window.confirm("Remove this photo from the role?")) return;
    setPhotoBusy(true);
    setPhotoMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/media/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) setPhotoMessage("That photo could not be removed. Try again.");
      else onSaved();
    } catch {
      setPhotoMessage("That photo could not be removed. Check your connection and try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  // Something picked in History: show it here. An achievement opens on its own;
  // a person opens the list of people worked with.
  const [openAchievement, setOpenAchievement] = useState<string | null>(null);
  const [peopleRequest, setPeopleRequest] = useState<{ linkId: string; nonce: number } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    setEditing(false);
    if (focusRequest.kind === "overview") {
      setTab("overview");
      return;
    }
    if (focusRequest.kind === "person") {
      setPeopleRequest({ linkId: focusRequest.id, nonce: focusRequest.nonce });
      return;
    }
    setTab("achievements");
    setOpenAchievement(focusRequest.id);
  }, [focusRequest]);

  // A different role starts on its overview, with nothing left open.
  useEffect(() => {
    setTab("overview");
    setEditing(false);
    setOpenAchievement(null);
  }, [role.id]);

  const name = role.organization.trim() || role.title.trim() || "Untitled";
  const subtitle = role.organization.trim() ? role.title.trim() : "";
  const cover = roleCoverPhoto(role.media);
  const photos = role.media.filter((item) => item.kind === "photo");
  const place = formatHistoryPlace(role);
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(tenureMonths(role.startDate, role.endDate, role.isCurrent));
  const details = role.details;
  const summary = details.summary.trim();
  const description = role.description.trim();
  const events = [...(details.events ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const sites = role.locations.filter((location) => location.kind !== "primary");

  return (
    <article className="role-view" aria-label={name}>
      <header className={cover ? "role-view-banner" : "role-view-banner is-cream"}>
        {cover ? <img className="role-view-cover" src={cover.url} alt="" /> : null}
        {details.website || details.linkedin ? (
          <div className="role-view-corner">
            {details.website ? (
              <a className="role-view-round" href={details.website} target="_blank" rel="noreferrer" title="Website" aria-label="Website">
                <Globe size={16} aria-hidden="true" />
              </a>
            ) : null}
            {details.linkedin ? (
              <a className="role-view-round" href={details.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" aria-label="LinkedIn">
                <UserRound size={16} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="role-view-heading">
          <div className="role-view-names">
            <h1>{name}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="role-view-actions">
            {photos.length > 0 ? (
              <button type="button" className="role-view-glass" onClick={() => galleryRef.current?.showModal()}>
                <Images size={15} aria-hidden="true" />
                {photos.length === 1 ? "1 photo" : `${photos.length} photos`}
              </button>
            ) : (
              <button type="button" className="role-view-glass" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} aria-hidden="true" />
                {photoBusy ? "Adding…" : "Add photos"}
              </button>
            )}
            <button type="button" className="role-view-glass" onClick={() => setEditing(true)}>
              <Pencil size={14} aria-hidden="true" />
              Edit
            </button>
          </div>
        </div>
      </header>

      <div className="role-view-meta">
        <p>
          {[place, period].filter(Boolean).join(" · ")}
          {role.isCurrent ? <mark>Current</mark> : null}
          {tenure ? <span className="role-view-tenure">({tenure})</span> : null}
        </p>
        <RolePeople role={role} roles={roles} onSaved={onSaved} openRequest={peopleRequest} />
      </div>

      {editing ? (
        <RoleEditorPopout role={role} onClose={() => setEditing(false)} onSaved={onSaved} />
      ) : null}
      {(
        <>
          <div className="role-view-tabs" role="tablist" aria-label={`${name} sections`}>
            <button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "achievements"}
              onClick={() => {
                setTab("achievements");
                setOpenAchievement(null);
              }}
            >
              Achievements
              {role.achievements.length > 0 ? <span>{role.achievements.length}</span> : null}
            </button>
          </div>

          {tab === "overview" ? (
            <div className="role-view-pane" role="tabpanel">
              {summary || description ? (
                <div className="role-view-story">
                  {summary ? <p className="role-view-lead">{summary}</p> : null}
                  {description && description !== summary ? <p>{description}</p> : null}
                </div>
              ) : (
                <p className="role-view-empty">
                  Nothing written about this job yet.{" "}
                  <button type="button" className="role-view-text" onClick={() => setEditing(true)}>
                    + Add a few lines
                  </button>
                </p>
              )}

              <section className="role-view-section" aria-labelledby={`${role.id}-photos`}>
                <div className="role-view-section-head">
                  <h2 id={`${role.id}-photos`}>Photos &amp; events</h2>
                  {photos.length > 0 ? (
                    <button type="button" className="role-view-text" onClick={() => galleryRef.current?.showModal()}>
                      See all
                    </button>
                  ) : null}
                </div>
                <div className="role-view-strip">
                  {photos.slice(0, 6).map((photo) => (
                    <button key={photo.id} type="button" onClick={() => galleryRef.current?.showModal()} aria-label={photo.caption || photo.title || "Photo"}>
                      <img src={photo.url} alt="" />
                    </button>
                  ))}
                  <button type="button" className="role-view-add-photo" disabled={photoBusy} onClick={() => fileRef.current?.click()} aria-label="Add photos">
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </div>
                {photoMessage ? <p className="role-view-error" role="alert">{photoMessage}</p> : null}
                {events.length > 0 ? (
                  <ul className="role-view-events">
                    {events.map((event) => (
                      <li key={event.id}>
                        <b>{monthYear(event.date)}</b> {event.title || event.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="role-view-section" aria-labelledby={`${role.id}-places`}>
                <div className="role-view-section-head">
                  <h2 id={`${role.id}-places`}>Places</h2>
                </div>
                <dl className="role-view-facts">
                  <dt>Main site</dt>
                  <dd>{place || <span className="role-view-empty">Not set</span>}</dd>
                  {sites.map((site) => (
                    <FactRow key={site.id} label={siteKind(site.kind)} value={site.label || site.address} />
                  ))}
                </dl>
              </section>
            </div>
          ) : (
            <div className="role-view-pane" role="tabpanel">
              {openAchievement ? (
                <AchievementDetail role={role} achievementId={openAchievement} onBack={() => setOpenAchievement(null)} onSaved={onSaved} />
              ) : role.achievements.length > 0 ? (
                <ol className="achievement-rows">
                  {role.achievements.map((achievement, index) => {
                    const id = role.achievementIds?.[index];
                    const links = role.achievementLinks?.[index];
                    const counts = [
                      { icon: UserRound, n: links?.people.length ?? 0, label: "people" },
                      { icon: CalendarDays, n: links?.moments.length ?? 0, label: "events and milestones" },
                      { icon: MapPin, n: links?.places.length ?? 0, label: "places" },
                    ].filter((item) => item.n > 0);
                    return (
                      <li key={id ?? index} className="achievement-row" data-achievement-id={id}>
                        {id ? (
                          <button type="button" className="achievement-row-open" onClick={() => setOpenAchievement(id)}>
                            <span className="achievement-row-text" title={achievement}>
                              {achievement}
                            </span>
                            <ChevronRight size={16} aria-hidden="true" className="achievement-row-chevron" />
                          </button>
                        ) : (
                          <span className="achievement-row-text">{achievement}</span>
                        )}
                        {id ? (
                          <div className="achievement-row-meta">
                            <AchievementDate role={role} achievementId={id} date={role.achievementDates?.[index] ?? ""} onSaved={onSaved} />
                            <AchievementProof role={role} achievementId={id} statement={achievement} onSaved={onSaved} />
                            {counts.map(({ icon: CountIcon, n, label }) => (
                              <span key={label} className="achievement-row-count" title={`Linked to ${n} ${label}`}>
                                <CountIcon size={12} aria-hidden="true" /> {n}
                              </span>
                            ))}
                            {(links?.skills ?? []).slice(0, 3).map((skill) => (
                              <span key={skill} className="achievement-row-skill">
                                {skill}
                              </span>
                            ))}
                            {(links?.skills.length ?? 0) > 3 ? (
                              <span className="achievement-row-count">+{(links?.skills.length ?? 0) - 3}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="role-view-empty">No achievements yet. What are you proud of from {name}?</p>
              )}
              {openAchievement ? null : (
                <button type="button" className="role-view-text" onClick={() => setEditing(true)}>
                  + Add an achievement
                </button>
              )}
            </div>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => void addPhotos(event.target.files)}
      />
      <dialog
        ref={galleryRef}
        className="role-view-gallery"
        aria-label={`${name} photos`}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="role-view-gallery-head">
          <b>{name} · Photos</b>
          <button type="button" className="role-view-round" aria-label="Close" onClick={() => galleryRef.current?.close()}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="role-view-gallery-grid">
          {photos.map((photo) => (
            <figure key={photo.id}>
              <img src={photo.url} alt={photo.caption || photo.title || ""} />
              <figcaption>
                <span>{photo.caption}</span>
                <button type="button" className="role-view-text" disabled={photoBusy} onClick={() => void removePhoto(photo.id)}>
                  <Trash2 size={13} aria-hidden="true" /> Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      </dialog>
    </article>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/** The role's editor in a window over the page, so the role stays where it was. */
function RoleEditorPopout({ role, onClose, onSaved }: { role: WorkMapRole; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="achievement-popout role-editor-popout"
      aria-label={`Edit ${role.organization || role.title || "role"}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="achievement-popout-body">
        <button type="button" className="role-view-round achievement-popout-close" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
        <RoleEditor role={role} onClose={onClose} onSaved={onSaved} />
      </div>
    </dialog>
  );
}

/** The fields used to add a role are the fields used to change it. */
function RoleEditor({ role, onClose, onSaved }: { role: WorkMapRole; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState(role.isCurrent);
  // A pinned site is saved by its id; show its name, and keep the pin unless the place is changed.
  const pinned = /^\d+$/.test(role.locationLabel.trim());
  const shownPlace = pinned ? formatHistoryPlace(role) : role.locationLabel;
  // A month field shows YYYY-MM; an unchanged date keeps what was saved.
  const keep = (value: string, saved: string) => (value === saved.slice(0, 7) ? saved : value);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: field("kind") || role.kind,
          title: field("title"),
          organization: field("organization"),
          locationLabel: pinned && field("locationLabel") === shownPlace.trim() ? role.locationLabel : field("locationLabel"),
          startDate: keep(field("startDate"), role.startDate),
          endDate: current ? "" : keep(field("endDate"), role.endDate),
          isCurrent: current,
          description: field("description"),
          achievements: field("achievements")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        setMessage("The role could not be saved. Check the fields and try again.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setMessage("The role could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="role-view-editor" onSubmit={save}>
      <h2>Edit role</h2>
      <fieldset disabled={busy}>
        <label>
          Kind
          <select name="kind" defaultValue={role.kind}>
            <option value="job">Job</option>
            <option value="internship">Internship</option>
            <option value="school">School</option>
          </select>
        </label>
        <label>
          {role.kind === "school" ? "School" : "Company"}
          <input name="organization" defaultValue={role.organization} />
        </label>
        <label>
          {role.kind === "school" ? "Degree or program" : "Title"}
          <input name="title" defaultValue={role.title} />
        </label>
        <label>
          Place
          <input name="locationLabel" defaultValue={shownPlace} />
        </label>
        <div className="role-view-two">
          <label>
            Start
            <input name="startDate" type="month" defaultValue={role.startDate.slice(0, 7)} />
          </label>
          <label>
            End
            <input name="endDate" type="month" defaultValue={role.endDate.slice(0, 7)} disabled={current} />
          </label>
        </div>
        <label className="role-view-check">
          <input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} />
          {role.kind === "school" ? "I study here now" : "I work here now"}
        </label>
        <label>
          Description
          <textarea name="description" rows={4} defaultValue={role.description} />
        </label>
        <label>
          Achievements, one per line
          <textarea name="achievements" rows={7} defaultValue={role.achievements.join("\n")} />
        </label>
      </fieldset>
      {message ? <p className="role-view-error" role="alert">{message}</p> : null}
      <div className="role-view-editor-actions">
        <button type="button" className="role-view-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="role-view-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function siteKind(kind: WorkMapRole["locations"][number]["kind"]): string {
  return kind === "client" ? "Client site" : kind === "travel" ? "Travel" : "Site";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(date: string): string {
  const match = date.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return date;
  const month = match[2] ? MONTHS[Number(match[2]) - 1] : "";
  return month ? `${month} ${match[1]}` : match[1]!;
}
