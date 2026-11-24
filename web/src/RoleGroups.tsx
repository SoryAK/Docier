import type { ReactNode } from "react";
import type { RoleSettingsPanel } from "./RoleSettings";

/**
 * The pieces a role's detail tabs are built from: groups that sit two across
 * where there's room, each with its own Edit, a grey note under it, and a line
 * saying what to add when it is empty.
 */
export function RoleGroups({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="role-groups" aria-label={label}>
      {children}
    </div>
  );
}

export function RoleGroup({
  title,
  panel,
  onEdit,
  empty,
  note,
  wide = false,
  children,
}: {
  title: string;
  panel: RoleSettingsPanel;
  onEdit: (panel: RoleSettingsPanel) => void;
  /** What to add, said when the group has nothing in it; `children` is ignored then. */
  empty: string | null;
  note?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  const className = ["role-group", wide ? "is-wide" : "", empty ? "is-empty" : ""].filter(Boolean).join(" ");
  return (
    <section className={className} aria-label={title}>
      <div className="role-group-head">
        <h3>{title}</h3>
        {empty ? null : (
          <button type="button" className="role-edit" onClick={() => onEdit(panel)} aria-label={`Edit ${title.toLowerCase()}`}>
            Edit
          </button>
        )}
      </div>
      {empty ? (
        <button type="button" className="role-group-add" onClick={() => onEdit(panel)}>
          + {empty}
        </button>
      ) : (
        <>
          {children}
          {note ? <p className="role-group-note">{note}</p> : null}
        </>
      )}
    </section>
  );
}

export function GroupFacts({ rows }: { rows: Array<[string, ReactNode] | null | false> }) {
  const kept = rows.filter(Boolean) as Array<[string, ReactNode]>;
  if (kept.length === 0) return null;
  return (
    <dl className="role-group-facts">
      {kept.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GroupTags({ items, tone }: { items: string[]; tone?: "new" }) {
  return (
    <ul className={tone ? `role-group-tags is-${tone}` : "role-group-tags"}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** A bar for an amount out of a whole: a rating out of 5, days used out of a year's. */
export function GroupMeter({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="role-group-meter">
      <span>{label}</span>
      <span>{text}</span>
      <span className="role-group-bar" role="img" aria-label={`${label}: ${text}`}>
        <i style={{ width: `${share * 100}%` }} />
      </span>
    </div>
  );
}

/** Dated steps, oldest first: promotions, raises, bonuses. */
export function GroupTimeline({ items }: { items: Array<{ id: string; when: string; text: ReactNode }> }) {
  return (
    <ol className="role-group-timeline">
      {items.map((item) => (
        <li key={item.id}>
          {item.text}
          <small>{item.when}</small>
        </li>
      ))}
    </ol>
  );
}

/** Where a shift falls in a day, as a bar from midnight to midnight; overnight shifts wrap. */
export function ShiftDay({ start, end }: { start: string; end: string }) {
  const hours = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
  };
  const from = hours(start);
  const to = hours(end);
  const spans = to > from ? [[from, to]] : [[from, 24], [0, to]];
  return (
    <span className="role-group-day" aria-hidden="true">
      {spans.map(([a, b]) => (
        <i key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }} />
      ))}
    </span>
  );
}

export function ShiftScale() {
  return (
    <span className="role-group-scale" aria-hidden="true">
      <span>12 AM</span>
      <span>6 AM</span>
      <span>12 PM</span>
      <span>6 PM</span>
      <span>12 AM</span>
    </span>
  );
}

export function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
