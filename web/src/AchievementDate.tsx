import { useState } from "react";
import type { WorkMapRole } from "@core/work-map";

/**
 * When an achievement happened, so it lands in the right year of the role's
 * history. Opens a month field limited to the role's dates.
 */
export function AchievementDate({
  role,
  achievementId,
  date,
  onSaved,
}: {
  role: WorkMapRole;
  achievementId: string;
  date: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const min = role.startDate.slice(0, 7) || undefined;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const max = (role.isCurrent ? thisMonth : role.endDate.slice(0, 7)) || thisMonth;

  async function save(next: string) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/work-map/roles/${encodeURIComponent(role.id)}/achievements/${encodeURIComponent(achievementId)}`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: next }) },
      );
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setOpen(false);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <span className="role-view-when is-open">
        <input
          type="month"
          aria-label="When this happened"
          defaultValue={date}
          min={min}
          max={max}
          autoFocus
          disabled={busy}
          onChange={(event) => {
            if (event.target.value) void save(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
        {date ? (
          <button type="button" className="role-view-text" onClick={() => void save("")} disabled={busy}>
            Clear
          </button>
        ) : null}
        <button type="button" className="role-view-text" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        {failed ? <span className="role-view-error">Not saved. Try again.</span> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={date ? "role-view-when" : "role-view-when is-empty"}
      onClick={() => setOpen(true)}
      title={date ? "Change when this happened" : "Add when this happened"}
    >
      {date ? monthYear(date) : "+ When"}
    </button>
  );
}


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(date: string): string {
  const match = date.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return date;
  const month = match[2] ? MONTHS[Number(match[2]) - 1] : "";
  return month ? `${month} ${match[1]}` : match[1]!;
}
