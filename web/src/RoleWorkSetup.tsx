import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { WorkMapRole } from "@core/work-map";
import {
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABEL,
  WORK_MODE_LABEL,
  shiftLabel,
  workSetupSummary,
  type RolePromotion,
  type RoleShift,
  type WorkMode,
} from "@core/role-work-setup";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";

const MESSAGE: Record<string, string> = {
  "schedule-type-invalid": "Pick a schedule type from the list.",
  "days-on-site-invalid": "Days on site run from 1 to 7.",
  "hours-invalid": "Hours a week run from 1 to 168.",
  "shift-name-required": "Give every shift a name.",
  "shift-time-invalid": "Give every shift a start and an end time.",
  "team-size-invalid": "Team size is a whole number, 1 or more.",
  "promotion-title-required": "Give every promotion its new title.",
  "promotion-date-invalid": "Give every promotion a month.",
};

function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/**
 * How the work was set up: schedule, shifts, team, and growth. A section on the
 * role's Overview, closed to one line, with a popout to change it.
 */
export function RoleWorkSetup({ role, onSaved }: { role: WorkMapRole; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const d = role.details;
  const summary = workSetupSummary({ schedule: d.schedule, team: d.team });
  const hasAny =
    summary !== "" ||
    d.schedule.shift !== "" ||
    d.shifts.length > 0 ||
    d.skills.length > 0 ||
    d.skillsGained.length > 0 ||
    d.promotions.length > 0 ||
    d.growth !== "";
  const shared = [d.share.schedule && "schedule", d.share.team && "team", d.share.growth && "growth"].filter(Boolean) as string[];

  return (
    <section className="role-view-section role-setup" aria-labelledby={`${role.id}-setup`}>
      <div className="role-view-section-head">
        <h2 id={`${role.id}-setup`}>Work setup</h2>
        <span className="role-setup-actions">
          {hasAny ? (
            <button type="button" className="role-view-text" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? "Hide" : "Show all"}
              <ChevronDown size={14} aria-hidden="true" className={open ? "role-setup-flip" : undefined} />
            </button>
          ) : null}
          <button type="button" className="role-view-text" onClick={() => setEditing(true)}>
            {hasAny ? "Edit" : "+ Add"}
          </button>
        </span>
      </div>
      {!hasAny ? (
        <p className="role-view-empty">Your schedule, shifts, who you reported to, and what you learned. Only you see it unless you share it.</p>
      ) : (
        <p className="role-setup-line">{summary || "Set up, with details inside"}</p>
      )}
      {hasAny && open ? (
        <dl className="role-view-facts role-setup-facts">
          {d.schedule.shift ? <Fact label="Schedule">{d.schedule.shift}</Fact> : null}
          {d.shifts.length > 0 ? (
            <Fact label="Shifts">
              <ul className="role-setup-list">
                {d.shifts.map((shift) => (
                  <li key={shift.id}>
                    <b>{shift.name}</b> {shiftLabel(shift)}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {d.team.reportsTo ? <Fact label="Reported to">{d.team.reportsTo}</Fact> : null}
          {d.team.department ? <Fact label="Department">{d.team.department}</Fact> : null}
          {d.team.size ? <Fact label="Team size">{d.team.size}</Fact> : null}
          {d.skills.length > 0 ? <Fact label="Skills used">{d.skills.join(", ")}</Fact> : null}
          {d.skillsGained.length > 0 ? <Fact label="Skills gained">{d.skillsGained.join(", ")}</Fact> : null}
          {d.promotions.length > 0 ? (
            <Fact label="Promotions">
              <ul className="role-setup-list">
                {d.promotions.map((item) => (
                  <li key={item.id}>
                    <b>{monthYear(item.date)}</b> {item.title}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {d.growth ? <Fact label="Growth notes">{d.growth}</Fact> : null}
          <Fact label="On my page">{shared.length ? `Shows the ${shared.join(", ")}` : "Nothing; only you see this"}</Fact>
        </dl>
      ) : null}
      {editing ? (
        <WorkSetupPopout
          role={role}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

type ShiftDraft = Omit<RoleShift, "id"> & { id?: string; key: string };
type PromotionDraft = Omit<RolePromotion, "id"> & { id?: string; key: string };

let draftKey = 0;
const nextKey = () => `draft-${++draftKey}`;

function WorkSetupPopout({ role, onClose, onSaved }: { role: WorkMapRole; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const d = role.details;
  const [workMode, setWorkMode] = useState<WorkMode>(d.schedule.workMode);
  const [shifts, setShifts] = useState<ShiftDraft[]>(d.shifts.map((shift) => ({ ...shift, key: shift.id })));
  const [promotions, setPromotions] = useState<PromotionDraft[]>(d.promotions.map((item) => ({ ...item, key: item.id })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const names = [...new Set((role.people ?? []).map((person) => person.name))];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    const list = (key: string) =>
      field(key)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/work-setup`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schedule: {
            type: field("type"),
            workMode,
            daysOnSite: workMode === "hybrid" ? field("daysOnSite") : "",
            hoursPerWeek: field("hoursPerWeek"),
            shift: field("shift"),
          },
          shifts: shifts.map(({ id, name, start, end }) => ({ id, name, start, end })),
          team: { reportsTo: field("reportsTo"), department: field("department"), size: field("teamSize") },
          skills: list("skills"),
          skillsGained: list("skillsGained"),
          promotions: promotions.map(({ id, title, date }) => ({ id, title, date })),
          growth: field("growth"),
          share: {
            schedule: form.get("shareSchedule") === "on",
            team: form.get("shareTeam") === "on",
            growth: form.get("shareGrowth") === "on",
          },
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(MESSAGE[String(body.error)] ?? "That could not be saved. Try again.");
        return;
      }
      onSaved();
    } catch {
      setMessage("That could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="achievement-popout role-editor-popout"
      aria-label="Work setup"
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
        <form className="role-view-editor role-setup-form" onSubmit={save}>
          <h2>Work setup</h2>
          <p className="role-setup-note">{[role.organization, role.title].filter(Boolean).join(" · ")} — only you see this unless you share a part below.</p>
          <fieldset disabled={busy}>
            <h3>Schedule</h3>
            <div className="role-view-two">
              <label>
                Type
                <select name="type" defaultValue={d.schedule.type}>
                  <option value="">Not set</option>
                  {SCHEDULE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SCHEDULE_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hours a week
                <input name="hoursPerWeek" type="number" min={1} max={168} step="0.5" defaultValue={d.schedule.hoursPerWeek ?? ""} />
              </label>
            </div>
            <div className="role-view-two">
              <label>
                Where
                <select name="workMode" value={workMode} onChange={(event) => setWorkMode(event.target.value as WorkMode)}>
                  {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {WORK_MODE_LABEL[mode]}
                    </option>
                  ))}
                </select>
              </label>
              {workMode === "hybrid" ? (
                <label>
                  Days on site a week
                  <input name="daysOnSite" type="number" min={1} max={7} defaultValue={d.schedule.daysOnSite ?? ""} />
                </label>
              ) : (
                <span />
              )}
            </div>
            <label>
              Schedule notes
              <input name="shift" defaultValue={d.schedule.shift} placeholder="e.g. Overnight, every other weekend" />
            </label>
            <label className="role-view-check">
              <input type="checkbox" name="shareSchedule" defaultChecked={d.share.schedule} />
              Show my schedule on my page
            </label>

            <h3>Shifts</h3>
            {shifts.length === 0 ? <p className="role-setup-hint">Name the shifts you worked, like Days or Nights.</p> : null}
            {shifts.map((shift, index) => (
              <div key={shift.key} className="role-setup-row">
                <label>
                  Name
                  <input
                    value={shift.name}
                    onChange={(event) => setShifts(shifts.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                    placeholder="Nights"
                    required
                  />
                </label>
                <label>
                  Starts
                  <input
                    type="time"
                    value={shift.start}
                    onChange={(event) => setShifts(shifts.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))}
                    required
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="time"
                    value={shift.end}
                    onChange={(event) => setShifts(shifts.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))}
                    required
                  />
                </label>
                <button type="button" className="role-setup-remove" aria-label={`Remove ${shift.name || "this shift"}`} title="Remove" onClick={() => setShifts(shifts.filter((_, i) => i !== index))}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
                {shift.start && shift.end ? <small className="role-setup-row-note">{shiftLabel(shift)}</small> : null}
              </div>
            ))}
            <button type="button" className="role-view-text role-setup-add" onClick={() => setShifts([...shifts, { key: nextKey(), name: "", start: "", end: "" }])}>
              <Plus size={14} aria-hidden="true" /> Add a shift
            </button>

            <h3>Team</h3>
            <label>
              Reported to
              <input name="reportsTo" list={`${role.id}-people`} defaultValue={d.team.reportsTo} placeholder="Your manager or supervisor" />
              <datalist id={`${role.id}-people`}>
                {names.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <div className="role-view-two">
              <label>
                Department
                <input name="department" defaultValue={d.team.department} />
              </label>
              <label>
                Team size
                <input name="teamSize" type="number" min={1} defaultValue={d.team.size ?? ""} />
              </label>
            </div>
            <label className="role-view-check">
              <input type="checkbox" name="shareTeam" defaultChecked={d.share.team} />
              Show the department and team size on my page (never who you reported to)
            </label>

            <h3>Growth</h3>
            <label>
              Skills used <span className="role-setup-hint">separate with commas</span>
              <input name="skills" defaultValue={d.skills.join(", ")} />
            </label>
            <label>
              Skills gained <span className="role-setup-hint">separate with commas</span>
              <input name="skillsGained" defaultValue={d.skillsGained.join(", ")} />
            </label>
            <span className="role-setup-label">Promotions</span>
            {promotions.map((item, index) => (
              <div key={item.key} className="role-setup-row is-promotion">
                <label>
                  New title
                  <input
                    value={item.title}
                    onChange={(event) => setPromotions(promotions.map((p, i) => (i === index ? { ...p, title: event.target.value } : p)))}
                    required
                  />
                </label>
                <label>
                  Month
                  <input
                    type="month"
                    value={item.date}
                    onChange={(event) => setPromotions(promotions.map((p, i) => (i === index ? { ...p, date: event.target.value } : p)))}
                    required
                  />
                </label>
                <button type="button" className="role-setup-remove" aria-label={`Remove ${item.title || "this promotion"}`} title="Remove" onClick={() => setPromotions(promotions.filter((_, i) => i !== index))}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button type="button" className="role-view-text role-setup-add" onClick={() => setPromotions([...promotions, { key: nextKey(), title: "", date: "" }])}>
              <Plus size={14} aria-hidden="true" /> Add a promotion
            </button>
            <label>
              Growth notes
              <textarea name="growth" rows={3} defaultValue={d.growth} />
            </label>
            <label className="role-view-check">
              <input type="checkbox" name="shareGrowth" defaultChecked={d.share.growth} />
              Show promotions, skills gained, and growth notes on my page
            </label>
          </fieldset>
          {message ? (
            <p className="role-view-error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="role-view-editor-actions">
            <button type="button" className="role-view-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="role-view-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
