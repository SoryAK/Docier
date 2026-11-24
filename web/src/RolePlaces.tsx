import { useState, type FormEvent } from "react";
import type { WorkMapLocation, WorkMapRole } from "@core/work-map";
import { MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { lookupNote, searchPlaces, type PlaceHit } from "./place-search";

type Kind = Exclude<WorkMapLocation["kind"], "primary">;
type Draft = {
  id: string | null;
  label: string;
  kind: Kind;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isPublic: boolean;
};

const KIND_LABEL: Record<Kind, string> = { site: "Site", client: "Client site", travel: "Travel" };

/**
 * A role's other places: sites, client sites, and travel. Each can be added,
 * changed, or removed in place. An address is looked up so it goes on the map.
 */
export function RolePlaces({ role, mainPlace, onSaved }: { role: WorkMapRole; mainPlace: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [matches, setMatches] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sites = role.locations.filter((location) => location.kind !== "primary");
  const base = `/api/work-map/roles/${encodeURIComponent(role.id)}/locations`;

  function open(next: Draft) {
    setDraft(next);
    setMatches([]);
    setMessage("");
  }

  function pick(place: PlaceHit) {
    if (!draft) return;
    setDraft({ ...draft, address: place.address, latitude: place.latitude, longitude: place.longitude, label: draft.label || place.label });
    setMatches([]);
    setMessage("");
  }

  async function find() {
    if (!draft) return;
    const query = draft.address.trim() || draft.label.trim();
    if (!query) {
      setMessage("Type an address or a place name to find.");
      return;
    }
    setBusy(true);
    setMessage("");
    setMatches([]);
    try {
      const found = await searchPlaces(query);
      if (!found) {
        setMessage("The address couldn't be looked up. Try again.");
        return;
      }
      const note = lookupNote(found);
      if (found.places.length === 0) setMessage(note || "Nothing matched. Try a fuller street or city.");
      else if (found.places.length === 1) {
        pick(found.places[0]!);
        if (note) setMessage(note);
      } else {
        setMatches(found.places.slice(0, 5));
        setMessage(note || "Several places matched. Pick one.");
      }
    } catch {
      setMessage("The address couldn't be looked up. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (draft.latitude == null || draft.longitude == null) {
      setMessage("Find the address first, so the place can go on your map.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(draft.id ? `${base}/${encodeURIComponent(draft.id)}` : base, {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: draft.label.trim(),
          kind: draft.kind,
          address: draft.address.trim(),
          latitude: draft.latitude,
          longitude: draft.longitude,
          isPublic: draft.isPublic,
        }),
      });
      if (!response.ok) {
        setMessage("The place could not be saved. Try again.");
        return;
      }
      setDraft(null);
      onSaved();
    } catch {
      setMessage("The place could not be saved. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(site: WorkMapLocation) {
    if (!window.confirm(`Remove “${site.label || site.address}” from this role?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(site.id)}`, { method: "DELETE" });
      if (!response.ok) setMessage("The place could not be removed. Try again.");
      else onSaved();
    } catch {
      setMessage("The place could not be removed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="role-places">
      <dl className="role-view-facts">
        <dt>Main site</dt>
        <dd>{mainPlace || <span className="role-view-empty">Not set</span>}</dd>
        {sites.map((site) => (
          <div key={site.id} className="role-places-row">
            <dt>{KIND_LABEL[site.kind as Kind] ?? "Site"}</dt>
            <dd>
              <span title={site.address}>{site.label || site.address}</span>
              <span className="role-row-actions">
                <button
                  type="button"
                  aria-label={`Change ${site.label}`}
                  title="Change"
                  disabled={busy}
                  onClick={() =>
                    open({ id: site.id, label: site.label, kind: (site.kind as Kind) || "site", address: site.address, latitude: site.latitude, longitude: site.longitude, isPublic: site.isPublic })
                  }
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Remove ${site.label}`} title="Remove" disabled={busy} onClick={() => void remove(site)}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {draft ? (
        <form className="role-inline-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <div className="role-inline-row">
              <label className="is-wide">
                Name
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Lancaster DC" autoFocus />
              </label>
              <label>
                Kind
                <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Address
              <span className="role-inline-find">
                <input
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value, latitude: null, longitude: null })}
                  placeholder="Street, city, and state"
                />
                <button type="button" className="role-view-ghost" onClick={() => void find()} disabled={busy}>
                  <Search size={13} aria-hidden="true" /> Find
                </button>
              </span>
            </label>
            {matches.length > 0 ? (
              <ul className="role-inline-matches">
                {matches.map((place) => (
                  <li key={`${place.latitude},${place.longitude}`}>
                    <button type="button" onClick={() => pick(place)}>
                      <MapPin size={13} aria-hidden="true" />
                      <span>
                        <b>{place.label}</b>
                        <small>{place.address}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : draft.latitude != null ? (
              <p className="role-inline-found">
                <MapPin size={13} aria-hidden="true" /> On the map at {draft.address || "this spot"}
              </p>
            ) : null}
            <label className="role-view-check">
              <input type="checkbox" checked={draft.isPublic} onChange={(e) => setDraft({ ...draft, isPublic: e.target.checked })} />
              Show on my page
            </label>
          </fieldset>
          {message ? <p className="role-view-error" role="alert">{message}</p> : null}
          <div className="role-view-editor-actions">
            <button type="button" className="role-view-ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="role-view-primary" disabled={busy}>
              {busy ? "Saving…" : draft.id ? "Save" : "Add"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {message ? <p className="role-view-error" role="alert">{message}</p> : null}
          <button
            type="button"
            className="role-view-text role-inline-add"
            onClick={() => open({ id: null, label: "", kind: "site", address: "", latitude: null, longitude: null, isPublic: false })}
          >
            <Plus size={14} aria-hidden="true" /> Add a place: another site, a client site, or travel
          </button>
        </>
      )}
    </div>
  );
}
