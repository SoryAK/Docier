import { useState, type ReactNode } from "react";
import type { WorkMapRole } from "@core/work-map";
import { shiftLabel, workSetupSummary } from "@core/role-work-setup";
import { ChevronDown } from "lucide-react";
import type { RoleSettingsPanel } from "./RoleSettings";

function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/**
 * How the work was set up: schedule, shifts, team, and growth. A section on the
 * role's Overview, closed to one line; changed in the role's settings.
 */
export function RoleWorkSetup({ role, onEdit }: { role: WorkMapRole; onEdit: (panel: RoleSettingsPanel) => void }) {
  const [open, setOpen] = useState(false);
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
          <button type="button" className="role-view-text" onClick={() => onEdit("schedule")}>
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
