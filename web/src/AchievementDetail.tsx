import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatHistoryPlace } from "@core/career-history";
import type { AchievementLinks } from "@core/role-achievements";
import type { WorkMapRole } from "@core/work-map";
import { ArrowLeft, CalendarDays, ChevronDown, Link2, MapPin, Pencil, Plus, UserRound, Wrench, X } from "lucide-react";
import { AchievementProof } from "./AchievementProof";
import { AchievementDate } from "./AchievementDate";

type Group = "people" | "moments" | "places" | "skills";

const EMPTY: AchievementLinks = { people: [], moments: [], places: [], skills: [] };

/**
 * One achievement on its own: its wording, when it happened, the evidence
 * behind it, and what it's linked to on the role — people, events and
 * milestones, places, and the skills or tools it shows.
 */
export function AchievementDetail({
  role,
  achievementId,
  onBack,
  onSaved,
  backLabel = "All achievements",
}: {
  role: WorkMapRole;
  achievementId: string;
  onBack: () => void;
  onSaved: () => void;
  /** The way back to the list; null when shown in a popout, which has its own close. */
  backLabel?: string | null;
}) {
  const index = role.achievementIds?.indexOf(achievementId) ?? -1;
  const statement = index >= 0 ? role.achievements[index] ?? "" : "";
  const links = (index >= 0 ? role.achievementLinks?.[index] : undefined) ?? EMPTY;
  const [editing, setEditing] = useState(false);
  const title = (index >= 0 ? role.achievementTitles?.[index] : "") ?? "";
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(title);
  const [text, setText] = useState(statement);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState<Group | null>(null);
  const [linkMenu, setLinkMenu] = useState(false);
  const [evidenceRequest, setEvidenceRequest] = useState(0);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!linkMenu) return;
    function onDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setLinkMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLinkMenu(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [linkMenu]);

  useEffect(() => {
    setEditing(false);
    setEditingTitle(false);
    setAdding(null);
    setMessage("");
  }, [achievementId]);

  // Choices: what's on the role and not yet linked.
  const people = role.people ?? [];
  const moments = [
    ...(role.details.milestones ?? []).map((item) => ({ ...item, kind: "Milestone" })),
    ...(role.details.events ?? []).map((item) => ({ ...item, kind: "Event" })),
  ];
  const placeName = (location: WorkMapRole["locations"][number]) =>
    location.kind === "primary" && /^\d+$/.test(location.label.trim())
      ? formatHistoryPlace(role)
      : location.label || location.address || "A place";
  const skillSuggestions = useMemo(() => {
    const pool = [
      ...(role.details.skills ?? []),
      ...(role.details.techStack ?? []),
      ...(role.achievementLinks ?? []).flatMap((item) => item.skills),
    ];
    const seen = new Set(links.skills.map((skill) => skill.toLowerCase()));
    return [...new Set(pool.map((skill) => skill.trim()).filter(Boolean))].filter((skill) => !seen.has(skill.toLowerCase()));
  }, [role, links.skills]);

  if (index < 0) {
    return (
      <div className="achievement-detail">
        <button type="button" className="role-view-text" onClick={onBack}>
          <ArrowLeft size={13} aria-hidden="true" /> All achievements
        </button>
        <p className="role-view-empty">That achievement isn't on this role any more.</p>
      </div>
    );
  }

  async function saveLinks(next: AchievementLinks) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/work-map/roles/${encodeURIComponent(role.id)}/achievements/${encodeURIComponent(achievementId)}`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ links: next }) },
      );
      if (!response.ok) {
        setMessage("That link could not be saved. Try again.");
        return;
      }
      setAdding(null);
      onSaved();
    } catch {
      setMessage("That link could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/work-map/roles/${encodeURIComponent(role.id)}/achievements/${encodeURIComponent(achievementId)}`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: titleText }) },
      );
      if (!response.ok) {
        setMessage("The title could not be saved. Keep it under 80 characters.");
        return;
      }
      setEditingTitle(false);
      onSaved();
    } catch {
      setMessage("The title could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // The wording is saved with the role's achievements, so its facts stay in step.
  async function saveText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wording = text.trim();
    if (!wording) return;
    setBusy(true);
    setMessage("");
    try {
      const lines = role.achievements.map((line, at) => (at === index ? wording : line));
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ achievements: lines }),
      });
      if (!response.ok) {
        setMessage("The wording could not be saved. Try again.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setMessage("The wording could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const add = (group: Group, value: string) =>
    void saveLinks({ ...links, [group]: [...links[group], value] } as AchievementLinks);
  const drop = (group: Group, value: string) =>
    void saveLinks({ ...links, [group]: links[group].filter((item) => item !== value) } as AchievementLinks);

  const rows: Array<{
    group: Group;
    label: string;
    icon: typeof UserRound;
    chips: Array<{ value: string; label: string }>;
    options: Array<{ value: string; label: string }>;
    empty: string;
  }> = [
    {
      group: "people",
      label: "People",
      icon: UserRound,
      chips: links.people.map((id) => ({ value: id, label: people.find((p) => p.linkId === id)?.name ?? "Someone" })),
      options: people.filter((p) => !links.people.includes(p.linkId)).map((p) => ({ value: p.linkId, label: p.name })),
      empty: "Add people to the role first, under Colleagues.",
    },
    {
      group: "moments",
      label: "Events & milestones",
      icon: CalendarDays,
      chips: links.moments.map((id) => ({ value: id, label: moments.find((m) => m.id === id)?.title || "A moment" })),
      options: moments.filter((m) => !links.moments.includes(m.id)).map((m) => ({ value: m.id, label: `${m.title || m.detail} · ${m.kind}` })),
      empty: "Add a milestone in History, or an event, first.",
    },
    {
      group: "places",
      label: "Places",
      icon: MapPin,
      chips: links.places.map((id) => {
        const location = role.locations.find((l) => l.id === id);
        return { value: id, label: location ? placeName(location) : "A place" };
      }),
      options: role.locations.filter((l) => !links.places.includes(l.id)).map((l) => ({ value: l.id, label: placeName(l) })),
      empty: "Add a site to the role first, under Places.",
    },
    {
      group: "skills",
      label: "Skills & tools",
      icon: Wrench,
      chips: links.skills.map((skill) => ({ value: skill, label: skill })),
      options: [],
      empty: "",
    },
  ];

  return (
    <div className="achievement-detail">
      {backLabel ? (
        <button type="button" className="role-view-text achievement-detail-back" onClick={onBack}>
          <ArrowLeft size={13} aria-hidden="true" /> {backLabel}
        </button>
      ) : null}

      {/* Every achievement is labelled the same way: what it is, where it was, then its title and date. */}
      <header className="achievement-detail-head">
        <h2>Achievement</h2>
        <p className="achievement-detail-where">{[role.organization, role.title].filter(Boolean).join(" · ")}</p>
      </header>
      {editingTitle ? (
        <form className="achievement-detail-title-edit" onSubmit={saveTitle}>
          <input
            value={titleText}
            onChange={(event) => setTitleText(event.target.value)}
            maxLength={80}
            placeholder="A short title, such as Cut robot downtime"
            aria-label="Short title"
            autoFocus
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditingTitle(false);
            }}
          />
          <button type="button" className="role-view-ghost" onClick={() => setEditingTitle(false)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="role-view-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      ) : (
        <p className="achievement-detail-meta">
          {title ? (
            <button
              type="button"
              className="achievement-detail-title"
              title="Change the short title"
              onClick={() => { setTitleText(title); setEditingTitle(true); }}
            >
              <span>Title:</span> {title}
              <Pencil size={12} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="achievement-detail-add-title" onClick={() => { setTitleText(""); setEditingTitle(true); }}>
              + Add a short title
            </button>
          )}
          <AchievementDate role={role} achievementId={achievementId} date={role.achievementDates?.[index] ?? ""} onSaved={onSaved} />
        </p>
      )}
      {message ? <p className="role-view-error" role="alert">{message}</p> : null}

      <section className="achievement-detail-section">
        <span className="achievement-detail-section-head">
          <h3>Description</h3>
          {editing ? null : (
            <button type="button" className="role-view-text" onClick={() => { setText(statement); setEditing(true); }}>
              <Pencil size={12} aria-hidden="true" /> Edit
            </button>
          )}
        </span>
        {editing ? (
          <form className="achievement-detail-edit" onSubmit={saveText}>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} autoFocus disabled={busy} aria-label="Description" />
            <span className="role-view-editor-actions">
              <button type="button" className="role-view-ghost" onClick={() => { setEditing(false); setText(statement); }} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="role-view-primary" disabled={busy || !text.trim()}>
                {busy ? "Saving…" : "Save"}
              </button>
            </span>
          </form>
        ) : (
          <p className="achievement-detail-description">{statement}</p>
        )}
      </section>

      <section className="achievement-detail-section achievement-backing">
        <h3>Proof &amp; links</h3>
        <p className="achievement-backing-copy">
          Back it up with proof and connections. Add evidence like an article, a review, or an award, and link the
          people, events, places, and skills it involved.
        </p>
        <div className="achievement-backing-actions">
          <button type="button" className="role-view-ghost achievement-backing-button" onClick={() => setEvidenceRequest(Date.now())} disabled={busy}>
            <Plus size={13} aria-hidden="true" /> Add evidence
          </button>
          <span className="achievement-link-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="role-view-ghost achievement-backing-button"
              aria-expanded={linkMenu}
              aria-haspopup="menu"
              onClick={() => setLinkMenu((open) => !open)}
              disabled={busy}
            >
              <Link2 size={13} aria-hidden="true" /> Link <ChevronDown size={12} aria-hidden="true" />
            </button>
            {linkMenu ? (
              <span className="achievement-link-menu" role="menu">
                {rows.map((row) => (
                  <button
                    key={row.group}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAdding(row.group);
                      setLinkMenu(false);
                    }}
                  >
                    <row.icon size={14} aria-hidden="true" /> {row.label}
                  </button>
                ))}
              </span>
            ) : null}
          </span>
        </div>

        {adding ? (
          <div className="achievement-link-picker">
            {(() => {
              const row = rows.find((item) => item.group === adding)!;
              return (
                <>
                  <span className="achievement-links-label">
                    <row.icon size={14} aria-hidden="true" /> Link {row.label.toLowerCase()}
                  </span>
                  {row.group === "skills" ? (
                    <SkillInput suggestions={skillSuggestions} disabled={busy} onAdd={(skill) => add("skills", skill)} onCancel={() => setAdding(null)} />
                  ) : row.options.length > 0 ? (
                    <span className="achievement-link-choose">
                      <select
                        autoFocus
                        defaultValue=""
                        disabled={busy}
                        aria-label={`Link ${row.label.toLowerCase()}`}
                        onChange={(event) => event.target.value && add(row.group, event.target.value)}
                      >
                        <option value="" disabled>
                          Choose…
                        </option>
                        {row.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="role-view-text" onClick={() => setAdding(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="achievement-link-choose">
                      <span className="role-view-empty achievement-links-hint">
                        {row.chips.length > 0 ? "Everything on the role is linked." : row.empty}
                      </span>
                      <button type="button" className="role-view-text" onClick={() => setAdding(null)}>
                        Close
                      </button>
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        ) : null}

        <AchievementProof
          role={role}
          achievementId={achievementId}
          statement={statement}
          onSaved={onSaved}
          inline
          bare
          addRequest={evidenceRequest}
        />

        {rows.some((row) => row.chips.length > 0) ? (
          <div className="achievement-linked">
            {rows.flatMap((row) =>
              row.chips.map((chip) => (
                <span key={`${row.group}:${chip.value}`} className="achievement-chip" title={row.label}>
                  <row.icon size={12} aria-hidden="true" />
                  {chip.label}
                  <button type="button" aria-label={`Unlink ${chip.label}`} onClick={() => drop(row.group, chip.value)} disabled={busy}>
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              )),
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SkillInput({
  suggestions,
  disabled,
  onAdd,
  onCancel,
}: {
  suggestions: string[];
  disabled: boolean;
  onAdd: (skill: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const listId = useRef(`skills-${Math.random().toString(36).slice(2)}`).current;
  return (
    <form
      className="achievement-skill-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onAdd(value.trim());
      }}
    >
      <input
        autoFocus
        list={listId}
        value={value}
        maxLength={60}
        placeholder="PLC troubleshooting…"
        aria-label="Skill or tool"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <datalist id={listId}>
        {suggestions.map((skill) => (
          <option key={skill} value={skill} />
        ))}
      </datalist>
      <button type="submit" className="role-view-ghost" disabled={disabled || !value.trim()}>
        Add
      </button>
      <button type="button" className="role-view-text" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
