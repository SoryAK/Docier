import { useRef, useState } from "react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL } from "@core/role-gear";
import {
  TOOL_CONDITIONS,
  TOOL_CONDITION_LABEL,
  TOOL_OWNERSHIPS,
  TOOL_OWNERSHIP_LABEL,
  type BulkChange,
  type PersonalTool,
  type ToolKit,
} from "@core/personal-tools";

export type BulkResult = { tools: PersonalTool[]; deleted: string[]; kit: ToolKit | null };

/** What went wrong, where the person can do something about it. */
const BULK_PROBLEM: Record<string, string> = {
  "kit-name-taken": "There's already a kit called that. Pick it from Add to a kit.",
  "kit-missing": "That kit is gone. Reload the page to see your kits.",
  "not-found": "Some picked tools are gone. Reload the page to see your tools.",
  "bulk-too-many": "Pick 500 tools or fewer at a time.",
};

const count = (n: number) => `${n} ${n === 1 ? "tool" : "tools"}`;

/**
 * The bar shown while choosing tools: how many are picked, and the changes
 * that can be made to all of them at once. Each change saves for every picked
 * tool or for none.
 */
export function ToolBulkBar({
  picked,
  shownIds,
  kits,
  tools,
  onPick,
  onDone,
}: {
  picked: string[];
  shownIds: string[];
  kits: ToolKit[];
  tools: PersonalTool[];
  onPick: (ids: string[]) => void;
  onDone: (result: BulkResult, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [kitName, setKitName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const tagRef = useRef<HTMLInputElement>(null);

  const shown = new Set(shownIds);
  const hidden = picked.filter((id) => !shown.has(id)).length;
  const pickedTools = tools.filter((tool) => picked.includes(tool.id));
  const pickedTags = [...new Map(pickedTools.flatMap((tool) => tool.tags).map((tag) => [tag.toLowerCase(), tag])).values()].sort((a, b) =>
    a.localeCompare(b),
  );
  const pickedKits = kits.filter((kit) => pickedTools.some((tool) => tool.kitIds.includes(kit.id)));
  const none = picked.length === 0 || busy;

  async function apply(change: BulkChange, done: (result: BulkResult) => string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/tools/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: picked, change }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "bulk");
      }
      const result = (await response.json()) as BulkResult;
      const text = done(result);
      setMessage(text);
      onDone(result, text);
      return true;
    } catch (failure) {
      const problem = failure instanceof Error ? BULK_PROBLEM[failure.message] : undefined;
      setError(problem ? `${problem} Nothing was changed.` : "The change couldn't be saved. Nothing was changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const changed = (result: BulkResult) => `${count(result.tools.length)} changed.`;

  return (
    <div
      className="tools-bulk"
      role="toolbar"
      aria-label="Picked tools"
      onKeyDown={(event) => {
        // Escape backs out of what's open in the bar; only outside it does Escape stop choosing.
        if (event.key !== "Escape") return;
        if (confirming) {
          event.preventDefault();
          setConfirming(false);
        } else if (event.target === tagRef.current) {
          event.preventDefault();
          setTagDraft("");
        }
      }}
    >
      <div className="tools-bulk-row">
        <strong>{hidden ? `${picked.length} picked, ${hidden} not shown` : `${picked.length} picked`}</strong>
        <button type="button" className="tools-link" disabled={shownIds.length === 0} onClick={() => onPick([...new Set([...picked, ...shownIds])])}>
          Pick all shown ({shownIds.length})
        </button>
        <button type="button" className="tools-link" disabled={picked.length === 0} onClick={() => onPick([])}>
          Clear
        </button>
      </div>
      <div className="tools-bulk-row">
        <select
          aria-label="Set category"
          value=""
          disabled={none}
          onChange={(event) => void apply({ kind: "category", category: event.target.value as never }, changed)}
        >
          <option value="">Category…</option>
          {EQUIPMENT_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {EQUIPMENT_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
        <select
          aria-label="Set whose it is"
          value=""
          disabled={none}
          onChange={(event) => void apply({ kind: "ownership", ownership: event.target.value as never }, changed)}
        >
          <option value="">Whose it is…</option>
          {TOOL_OWNERSHIPS.map((key) => (
            <option key={key} value={key}>
              {TOOL_OWNERSHIP_LABEL[key]}
            </option>
          ))}
        </select>
        <select
          aria-label="Set condition"
          value="choose"
          disabled={none}
          onChange={(event) => void apply({ kind: "condition", condition: event.target.value as never }, changed)}
        >
          <option value="choose" disabled>
            Condition…
          </option>
          {TOOL_CONDITIONS.map((key) => (
            <option key={key || "none"} value={key}>
              {key ? TOOL_CONDITION_LABEL[key] : "Not set"}
            </option>
          ))}
        </select>
        <form
          className="tools-bulk-tags"
          onSubmit={(event) => {
            event.preventDefault();
            const tags = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
            if (tags.length === 0) return;
            void apply({ kind: "addTags", tags }, changed).then((ok) => ok && setTagDraft(""));
          }}
        >
          <input
            ref={tagRef}
            aria-label="Tags to add"
            placeholder="Tags, with commas"
            value={tagDraft}
            disabled={none}
            onChange={(event) => setTagDraft(event.target.value)}
          />
          <button type="submit" className="tools-btn" disabled={none || !tagDraft.trim()}>
            Add tags
          </button>
        </form>
        {pickedTags.length ? (
          <select
            aria-label="Remove a tag"
            value=""
            disabled={none}
            onChange={(event) => void apply({ kind: "removeTags", tags: [event.target.value] }, changed)}
          >
            <option value="">Remove a tag…</option>
            {pickedTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        ) : null}
        {naming ? (
          <form
            className="tools-bulk-tags"
            onSubmit={(event) => {
              event.preventDefault();
              const name = kitName.trim();
              if (!name) return;
              void apply({ kind: "addKit", newKitName: name }, (result) => `${count(result.tools.length)} moved to ${result.kit?.name ?? name}.`).then(
                (ok) => {
                  if (!ok) return;
                  setNaming(false);
                  setKitName("");
                },
              );
            }}
          >
            <input
              aria-label="New kit name"
              placeholder="Kit name"
              maxLength={60}
              value={kitName}
              disabled={busy}
              autoFocus
              onChange={(event) => setKitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  // Only the name field closes.
                  event.preventDefault();
                  setNaming(false);
                }
              }}
            />
            <button type="submit" className="tools-btn" disabled={busy || !kitName.trim()}>
              Add
            </button>
            <button type="button" className="tools-link" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <select
            aria-label="Add to a kit"
            value=""
            disabled={none}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "new") {
                setNaming(true);
                return;
              }
              const kit = kits.find((item) => item.id === value);
              void apply({ kind: "addKit", kitId: value }, (result) => `${count(result.tools.length)} moved to ${kit?.name ?? "the kit"}.`);
            }}
          >
            <option value="">Add to a kit…</option>
            {kits.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name}
              </option>
            ))}
            <option value="new">New kit…</option>
          </select>
        )}
        {pickedKits.length ? (
          <select
            aria-label="Take out of a kit"
            value=""
            disabled={none}
            onChange={(event) => {
              const kit = kits.find((item) => item.id === event.target.value);
              void apply({ kind: "removeKit", kitId: event.target.value }, (result) => `${count(result.tools.length)} taken out of ${kit?.name ?? "the kit"}.`);
            }}
          >
            <option value="">Take out of a kit…</option>
            {pickedKits.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="tools-btn is-danger" disabled={none} onClick={() => setConfirming(true)}>
          Delete
        </button>
      </div>
      {confirming && picked.length ? (
        <div className="tools-bulk-row tools-bulk-confirm">
          <span>Delete {count(picked.length)}? Their photos go too.</span>
          <button
            type="button"
            className="tools-btn is-danger"
            aria-label={`Delete ${count(picked.length)}`}
            disabled={busy}
            onClick={() =>
              void apply({ kind: "delete" }, (result) => `${count(result.deleted.length)} deleted.`).then(() => setConfirming(false))
            }
          >
            Delete
          </button>
          <button type="button" className="tools-btn" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : null}
      <p className="tools-bulk-status" role="status">
        {message}
      </p>
      {error ? (
        <p className="tool-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
