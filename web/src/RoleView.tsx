import { useEffect, useRef, useState } from "react";
import {
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import { roleLinkList } from "@core/role-links";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { ArrowLeft, CalendarDays, ChevronRight, ImagePlus, Images, MapPin, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { AchievementDate } from "./AchievementDate";
import { AchievementDetail } from "./AchievementDetail";
import { AchievementProof } from "./AchievementProof";
import { RolePeople } from "./RolePeople";
import { RoleSettings, type RoleSettingsPanel } from "./RoleSettings";
import { RoleEvents } from "./RoleEvents";
import { RoleGearSection, RoleReflectionSection } from "./RoleMoreSections";
import { RolePaySection } from "./RolePaySection";
import { RolePlaces } from "./RolePlaces";
import { RoleWorkSetup } from "./RoleWorkSetup";
import { SocialMark } from "./SocialMark";
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
  onClose,
}: {
  role: WorkMapRole;
  roles: WorkMapRole[];
  onSaved: () => void;
  focusRequest?: RoleFocusRequest | null;
  /** Back to the Career History list; shown where the list is hidden to make room. */
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<RoleTab>("overview");
  const [settings, setSettings] = useState<RoleSettingsPanel | null>(null);
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
    setSettings(null);
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
    setSettings(null);
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
  const links = roleLinkList(details);

  return (
    <article className="role-view" aria-label={name}>
      {onClose ? (
        <button type="button" className="role-view-back" onClick={onClose}>
          <ArrowLeft size={15} aria-hidden="true" />
          Career history
        </button>
      ) : null}
      <header className={cover ? "role-view-banner" : "role-view-banner is-cream"}>
        {cover ? <img className="role-view-cover" src={cover.url} alt="" /> : null}
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
            <button type="button" className="role-view-glass" onClick={() => setSettings("basics")}>
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

      {links.length > 0 ? (
        <nav className="role-view-links" aria-label="Company links">
          {links.map((link) => (
            <a key={link.kind} href={link.url} target="_blank" rel="noreferrer" title={link.url}>
              <SocialMark kind={link.kind === "website" ? "site" : link.kind} />
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      {settings ? <RoleSettings role={role} panel={settings} onClose={() => setSettings(null)} onSaved={onSaved} /> : null}
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
                  <button type="button" className="role-view-text" onClick={() => setSettings("about")}>
                    + Add a few lines
                  </button>
                </p>
              )}

              {role.kind === "school" ? null : <RoleWorkSetup role={role} onEdit={setSettings} />}
              {role.kind === "school" ? null : <RolePaySection role={role} onEdit={setSettings} />}
              {role.kind === "school" ? null : <RoleGearSection role={role} onEdit={setSettings} />}
              {role.kind === "school" ? null : <RoleReflectionSection role={role} onEdit={setSettings} />}

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
                <RoleEvents role={role} onSaved={onSaved} />
              </section>

              <section className="role-view-section" aria-labelledby={`${role.id}-places`}>
                <div className="role-view-section-head">
                  <h2 id={`${role.id}-places`}>Places</h2>
                </div>
                <RolePlaces role={role} mainPlace={place} onSaved={onSaved} />
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
                            {role.achievementTitles?.[index] ? (
                              <span className="achievement-row-titled">
                                <b>{role.achievementTitles[index]}</b>
                                <span className="achievement-row-text is-description" title={achievement}>
                                  {achievement}
                                </span>
                              </span>
                            ) : (
                              <span className="achievement-row-text" title={achievement}>
                                {achievement}
                              </span>
                            )}
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
                <button type="button" className="role-view-text" onClick={() => setSettings("achievements")}>
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

