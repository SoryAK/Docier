import { useState, type FormEvent } from "react";
import type { PersonalTool, ToolKit } from "@core/personal-tools";

const KIT_ERROR: Record<string, string> = {
  "kit-name-required": "Give the kit a name.",
  "kit-name-taken": "There's already a kit with that name.",
};

/**
 * The kits row on My Tools: All tools, each kit with its count, and + New kit.
 * The picked kit can be renamed or deleted here; deleting keeps its tools.
 */
export function ToolKits({
  kits,
  tools,
  selected,
  onSelect,
  onKits,
}: {
  kits: ToolKit[];
  tools: PersonalTool[];
  selected: string | null;
  onSelect: (kitId: string | null) => void;
  /** The kits after one was added, renamed, or deleted. */
  onKits: (kits: ToolKit[], deleted?: string) => void;
}) {
  // "new" while naming a new kit, a kit's id while renaming it.
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const picked = kits.find((kit) => kit.id === selected) ?? null;

  function startNaming(kit: ToolKit | null) {
    setNaming(kit ? kit.id : "new");
    setName(kit?.name ?? "");
    setError("");
    setConfirming(false);
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!naming) return;
    setBusy(true);
    try {
      const response = await fetch(naming === "new" ? "/api/tools/kits" : `/api/tools/kits/${encodeURIComponent(naming)}`, {
        method: naming === "new" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json().catch(() => ({}))) as { kit?: ToolKit; error?: string };
      if (!response.ok || !body.kit) {
        setError(KIT_ERROR[body.error ?? ""] ?? "The kit couldn't be saved. Try again.");
        return;
      }
      const kit = body.kit;
      const next = kits.some((item) => item.id === kit.id) ? kits.map((item) => (item.id === kit.id ? kit : item)) : [...kits, kit];
      onKits(next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      setNaming(null);
    } catch {
      setError("The kit couldn't be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!picked) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tools/kits/${encodeURIComponent(picked.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("kit");
      onKits(
        kits.filter((kit) => kit.id !== picked.id),
        picked.id,
      );
      onSelect(null);
      setConfirming(false);
    } catch {
      setError("The kit couldn't be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const nameField = (
    <form className="tools-kit-form" onSubmit={saveName}>
      <input
        aria-label="Kit name"
        value={name}
        maxLength={60}
        placeholder="e.g. Electrical kit"
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setNaming(null);
          }
        }}
      />
      <button type="submit" className="tools-chip" disabled={busy}>
        {naming === "new" ? "Add kit" : "Save"}
      </button>
      <button type="button" className="tools-chip" onClick={() => setNaming(null)}>
        Cancel
      </button>
    </form>
  );

  return (
    <div className="tools-kits">
      <div className="tools-kit-row" role="group" aria-label="Kits">
        <button type="button" className="tools-chip" aria-pressed={selected === null} onClick={() => onSelect(null)}>
          All tools
        </button>
        {kits.map((kit) =>
          naming === kit.id ? (
            <span key={kit.id}>{nameField}</span>
          ) : (
            <button
              key={kit.id}
              type="button"
              className="tools-chip is-kit"
              aria-pressed={selected === kit.id}
              onClick={() => {
                onSelect(kit.id);
                setConfirming(false);
              }}
            >
              {kit.name} <span>{tools.filter((tool) => tool.kitIds.includes(kit.id)).length}</span>
            </button>
          ),
        )}
        {naming === "new" ? (
          nameField
        ) : (
          <button type="button" className="tools-chip is-add" onClick={() => startNaming(null)}>
            + New kit
          </button>
        )}
      </div>
      {picked && naming === null ? (
        <div className="tools-kit-actions">
          {confirming ? (
            <>
              <span>Delete {picked.name}? Its tools stay.</span>
              <button type="button" className="tool-danger is-solid" disabled={busy} onClick={() => void remove()}>
                Delete
              </button>
              <button type="button" className="tools-chip" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" className="tools-link" aria-label="Rename kit" onClick={() => startNaming(picked)}>
                Rename
              </button>
              <button type="button" className="tools-link is-danger" aria-label="Delete kit" onClick={() => setConfirming(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      ) : null}
      {error ? (
        <p className="tool-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
