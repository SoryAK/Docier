import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatHistoryPeriod } from "@core/career-history";
import { roleHistory, type RoleHistoryFilter, type RoleHistoryKind } from "@core/role-history";
import { roleCoverPhoto, type WorkMapMoment, type WorkMapRole } from "@core/work-map";
import { ChevronDown, Search, X } from "lucide-react";
import "./role-view.css";

const KIND_LABEL: Record<RoleHistoryKind, string> = {
  start: "Start",
  end: "Left",
  milestone: "Milestone",
  event: "Event",
  note: "Note",
  achievement: "Achievement",
  person: "People",
};

/** A role's story over time, year by year, beside the role in Career History. */
export function RoleHistoryPanel({
  role,
  onSaved,
  onSelect,
}: {
  role: WorkMapRole;
  onSaved: () => void;
  /** Shows an entry in the role: an achievement, a person, or the role's overview. */
  onSelect?: (target: { kind: "achievement" | "person" | "overview"; id: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleHistoryFilter>("all");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"note" | "milestone">("note");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const years = useMemo(() => roleHistory(role, { filter, query, order }), [role, filter, query, order]);

  // A different role starts fresh, with its latest year open.
  useEffect(() => {
    setQuery("");
    setFilter("all");
    setOrder("newest");
    setDraft("");
    setMessage("");
    const latest = roleHistory(role)[0]?.year;
    setOpenYears(new Set(latest ? [latest] : []));
    // Only when the role changes, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  function toggleYear(year: string) {
    setOpenYears((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const list: WorkMapMoment[] = kind === "note" ? role.details.notes ?? [] : role.details.milestones ?? [];
    const entry = { date: today(), title: text, detail: "", isPublic: kind === "milestone" };
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/details`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [kind === "note" ? "notes" : "milestones"]: [...list, entry] }),
      });
      if (!response.ok) {
        setMessage(`The ${kind} could not be saved. Try again.`);
        return;
      }
      setDraft("");
      setOpenYears((current) => new Set(current).add(today().slice(0, 4)));
      onSaved();
    } catch {
      setMessage(`The ${kind} could not be saved. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "note" | "milestone" | "event", id: string) {
    const key = kind === "note" ? "notes" : kind === "milestone" ? "milestones" : "events";
    const list: WorkMapMoment[] = role.details[key] ?? [];
    if (!window.confirm(`Remove this ${kind}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/details`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: list.filter((item) => item.id !== id) }),
      });
      if (!response.ok) setMessage(`The ${kind} could not be removed. Try again.`);
      else onSaved();
    } catch {
      setMessage(`The ${kind} could not be removed. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  const cover = roleCoverPhoto(role.media);
  const name = role.organization.trim() || role.title.trim() || "Untitled";
  const span = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent).replace("Present", "now");
  const searching = query.trim().length > 0;

  return (
    <section className="role-history" aria-label={`History of ${name}`}>
      <header className="role-history-head">
        {cover ? (
          <img className="role-history-mark" src={cover.url} alt="" />
        ) : (
          <span className="role-history-mark is-cream" aria-hidden="true">{name[0]?.toUpperCase()}</span>
        )}
        <div>
          <h2>History</h2>
          <p>{[name, span].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="role-history-tools">
        <label className="role-history-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search…"
            aria-label={`Search the history of ${name}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as RoleHistoryFilter)}>
          <option value="all">All</option>
          <option value="note">Notes</option>
          <option value="milestone">Milestones</option>
          <option value="event">Events</option>
          <option value="achievement">Achievements</option>
          <option value="person">People</option>
        </select>
        <select aria-label="Order" value={order} onChange={(event) => setOrder(event.target.value as "newest" | "oldest")}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <div className="role-history-list">
        {years.length === 0 ? (
          <p className="role-view-empty">
            {searching ? `Nothing matches “${query.trim()}”.` : role.startDate ? "Nothing here yet." : "Add a start date to see this role year by year."}
          </p>
        ) : (
          years.map((year) => {
            const open = searching || openYears.has(year.year);
            return (
              <section key={year.year} className="role-history-year">
                <button type="button" aria-expanded={open} onClick={() => toggleYear(year.year)}>
                  <b>{year.year}</b>
                  {year.label ? <span>{year.label}</span> : null}
                  <i>
                    {year.items.length}
                    <ChevronDown size={14} aria-hidden="true" className={open ? "is-open" : undefined} />
                  </i>
                </button>
                {open ? (
                  <ol>
                    {year.items.map((item) => (
                      <li key={`${item.kind}:${item.id}`}>
                        <small>{item.month}</small>
                        <span className="role-history-kind">{KIND_LABEL[item.kind]}</span>
                        {target(item) && onSelect ? (
                          <button type="button" className="role-history-text role-history-go" title={item.text} onClick={() => onSelect(target(item)!)}>
                            {item.text}
                          </button>
                        ) : (
                          <span className="role-history-text" title={item.text}>
                            {item.text}
                          </span>
                        )}
                        {item.kind === "note" || item.kind === "milestone" || item.kind === "event" ? (
                          <button
                            type="button"
                            className="role-history-remove"
                            aria-label={`Remove ${KIND_LABEL[item.kind].toLowerCase()}: ${item.text}`}
                            title="Remove"
                            disabled={busy}
                            onClick={() => void remove(item.kind as "note" | "milestone" | "event", item.id)}
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <form className="role-history-compose" onSubmit={add}>
        <div className="role-history-kinds" role="radiogroup" aria-label="Add a">
          {(["note", "milestone"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}>
              {value === "note" ? "Note" : "Milestone"}
            </button>
          ))}
        </div>
        <div className="role-history-add">
          <input
            aria-label={`New ${kind}`}
            placeholder={kind === "note" ? "Add a note…" : "Add a milestone…"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
          />
          <button type="submit" className="role-view-ghost" disabled={busy || !draft.trim()}>
            Add
          </button>
        </div>
        {message ? <p className="role-view-error" role="alert">{message}</p> : null}
      </form>
    </section>
  );
}

/** Where an entry leads in the role, or null for entries shown in full here. */
function target(item: { kind: RoleHistoryKind; id: string }): { kind: "achievement" | "person" | "overview"; id: string } | null {
  if (item.kind === "achievement") return { kind: "achievement", id: item.id };
  // A confirmation entry carries the link's id with a ":confirmed" ending.
  if (item.kind === "person") return { kind: "person", id: item.id.replace(/:confirmed$/, "") };
  if (item.kind === "start" || item.kind === "end") return { kind: "overview", id: item.id };
  return null;
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
