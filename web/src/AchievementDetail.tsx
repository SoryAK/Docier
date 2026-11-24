import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatHistoryPlace } from "@core/career-history";
import type { AchievementLinks } from "@core/role-achievements";
import type { WorkMapRole } from "@core/work-map";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Plus, UserRound, Wrench, X } from "lucide-react";
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
}: {
  role: WorkMapRole;
  achievementId: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const index = role.achievementIds?.indexOf(achievementId) ?? -1;
  const statement = index >= 0 ? role.achievements[index] ?? "" : "";
  const links = (index >= 0 ? role.achievementLinks?.[index] : undefined) ?? EMPTY;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(statement);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState<Group | null>(null);

  useEffect(() => {
    setEditing(false);
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
      empty: "Add people to the role first, under Who you worked with.",
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
      <button type="button" className="role-view-text achievement-detail-back" onClick={onBack}>
        <ArrowLeft size={13} aria-hidden="true" /> All achievements
      </button>

      {editing ? (
        <form className="achievement-detail-edit" onSubmit={saveText}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} autoFocus disabled={busy} aria-label="Achievement" />
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
        <div className="achievement-detail-head">
          <h2>{statement}</h2>
          <button type="button" className="role-view-ghost" onClick={() => { setText(statement); setEditing(true); }}>
            <Pencil size={13} aria-hidden="true" /> Edit
          </button>
        </div>
      )}
      <p className="achievement-detail-meta">
        <AchievementDate role={role} achievementId={achievementId} date={role.achievementDates?.[index] ?? ""} onSaved={onSaved} />
        <span>{[role.organization, role.title].filter(Boolean).join(" · ")}</span>
      </p>
      {message ? <p className="role-view-error" role="alert">{message}</p> : null}

      <section className="achievement-detail-section">
        <h3>Evidence</h3>
        <AchievementProof role={role} achievementId={achievementId} statement={statement} onSaved={onSaved} inline />
      </section>

      <section className="achievement-detail-section">
        <h3>Linked to</h3>
        <ul className="achievement-links">
          {rows.map((row) => (
            <li key={row.group}>
              <span className="achievement-links-label">
                <row.icon size={14} aria-hidden="true" /> {row.label}
              </span>
              <span className="achievement-links-chips">
                {row.chips.map((chip) => (
                  <span key={chip.value} className="achievement-chip">
                    {chip.label}
                    <button type="button" aria-label={`Unlink ${chip.label}`} onClick={() => drop(row.group, chip.value)} disabled={busy}>
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {adding === row.group ? (
                  row.group === "skills" ? (
                    <SkillInput suggestions={skillSuggestions} disabled={busy} onAdd={(skill) => add("skills", skill)} onCancel={() => setAdding(null)} />
                  ) : row.options.length > 0 ? (
                    <select
                      autoFocus
                      defaultValue=""
                      disabled={busy}
                      aria-label={`Link ${row.label.toLowerCase()}`}
                      onChange={(event) => event.target.value && add(row.group, event.target.value)}
                      onBlur={() => setAdding(null)}
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
                  ) : (
                    <span className="role-view-empty achievement-links-hint">
                      {row.chips.length > 0 ? "Everything on the role is linked." : row.empty}
                    </span>
                  )
                ) : (
                  <button type="button" className="achievement-links-add" onClick={() => setAdding(row.group)} disabled={busy}>
                    <Plus size={12} aria-hidden="true" /> Link
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
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
