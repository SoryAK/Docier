import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Check, Download, ImagePlus, ListChecks, Plus, Search, Share2, Wrench } from "lucide-react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory } from "@core/role-gear";
import {
  TOOL_CONDITIONS,
  TOOL_CONDITION_LABEL,
  TOOL_OWNERSHIPS,
  TOOL_OWNERSHIP_LABEL,
  TOOL_PHOTO_DRAG_TYPE,
  filterTools,
  matchParts,
  toolPhotoProblem,
  toolTotals,
  toolsCsv,
  type BulkChange,
  type PersonalTool,
  type ToolKit,
} from "@core/personal-tools";
import { ToolBulkBar, type BulkResult } from "./ToolBulkBar";
import { ToolKits } from "./ToolKits";
import { FramedPhoto } from "./ToolPhotoFrame";
import { ToolGallery, type ToolRoleChoice } from "./ToolGallery";
import { ToolShareDialog } from "./ToolShareDialog";
import "./tools.css";

/** The tool open in the panel lives in the address, `#/tools/<id>` (or `#/tools/new`). */
function readOpenTool(): string | null {
  const match = window.location.hash.replace(/^#\/?/, "").split("?")[0].match(/^tools\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** Shows another tool in the open popout without a new history step, so Back returns to the grid. */
function showTool(id: string) {
  const hash = `#/tools/${encodeURIComponent(id)}`;
  if (window.location.hash !== hash) window.location.replace(hash);
}

function openTool(id: string | null) {
  const hash = id ? `#/tools/${encodeURIComponent(id)}` : "#/tools";
  if (window.location.hash !== hash) window.location.hash = hash;
}

const SKIP_REASON: Record<string, string> = {
  "photo-type": "isn't a photo",
  "photo-too-large": "is over 5 MB",
  "photo-empty": "is empty",
};

/** Photos go up a few at a time, so one request never grows too large. */
const BATCH = 5;

/** Dollars, with cents only when there are some: $300, $525.50. */
function money(amount: number): string {
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "2 tools · $525.50 paid · worth $300 now · 1 with photos", for the tools shown. */
function totalsLine(tools: PersonalTool[]): string {
  const totals = toolTotals(tools);
  return [
    `${totals.count} ${totals.count === 1 ? "tool" : "tools"}`,
    totals.paid === null ? "" : `${money(totals.paid)} paid`,
    totals.worth === null ? "" : `worth ${money(totals.worth)} now`,
    `${totals.withPhotos} with photos`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Text with the parts that match the search marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {matchParts(text, query).map((part, index) => (part.match ? <mark key={index}>{part.text}</mark> : part.text))}
    </>
  );
}

/**
 * Page shortcuts stay out of the way while typing, inside an open tool's panel
 * or the picked-tools bar (where a stray key could lose edits or picks), and
 * while any dialog is open.
 */
function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return true;
  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable || target?.closest?.("input, textarea, select, .tool-gallery, .tools-bulk")) return true;
  return Boolean(document.querySelector("[role='dialog'], dialog[open]"));
}

/**
 * My Tools: your own tools and equipment, as a grid of cards with a panel for
 * adding and changing one. Add from photos turns each photo into a draft.
 */
export function ToolsPage() {
  const [tools, setTools] = useState<PersonalTool[] | null>(null);
  const [roles, setRoles] = useState<ToolRoleChoice[]>([]);
  const [kits, setKits] = useState<ToolKit[]>([]);
  const [kit, setKit] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(readOpenTool);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EquipmentCategory | "all">("all");
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [note, setNote] = useState<{ added: number; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Choosing: a click picks a card instead of opening it, for changing many at once.
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // The Share dialog: a page about the tools shown (or picked) to send someone.
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // With no kits yet, "+ New kit" sits with the page's buttons and asks the kits row to open its name field.
  const [newKitRequest, setNewKitRequest] = useState(0);
  const newKitRef = useRef<HTMLButtonElement>(null);
  // The card whose quick change didn't save.
  const [quickFailed, setQuickFailed] = useState<string | null>(null);
  // A tool added in the panel keeps that panel (and what it says) once saved.
  const [adopted, setAdopted] = useState<string | null>(null);
  // The card a tool was opened from gets focus back when its panel closes.
  const openedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (open && open !== "new") {
      openedFrom.current = open;
      return;
    }
    if (open === null && openedFrom.current) {
      document.querySelector<HTMLElement>(`.tools-card[data-tool-id="${CSS.escape(openedFrom.current)}"]`)?.focus();
      openedFrom.current = null;
    }
  }, [open]);

  useEffect(() => {
    const onRoute = () => setOpen(readOpenTool());
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  useEffect(() => {
    void fetch("/api/tools")
      .then(async (response) => {
        if (!response.ok) throw new Error("tools");
        const loaded = ((await response.json()) as { tools: PersonalTool[] }).tools;
        // A tool added while the list was loading stays, even if the list was read before it existed.
        setTools((current) => [...(current ?? []).filter((tool) => !loaded.some((item) => item.id === tool.id)), ...loaded]);
      })
      .catch(() => setFailed(true));
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { roles?: Array<{ id: string; kind: string; organization: string; title: string }> };
        setRoles(
          (body.roles ?? [])
            .filter((role) => role.kind !== "school")
            .map((role) => ({ id: role.id, name: role.organization || role.title || "Untitled role" })),
        );
      })
      .catch(() => setRoles([]));
    void fetch("/api/tools/kits")
      .then(async (response) => {
        if (response.ok) setKits(((await response.json()) as { kits: ToolKit[] }).kits);
      })
      .catch(() => setKits([]));
  }, []);

  function stopChoosing() {
    setChoosing(false);
    setPicked([]);
  }

  useEffect(() => {
    if (!choosing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) stopChoosing();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [choosing]);

  // Opening a tool (by its address, or browser Back) ends choosing, so picks never outlive the tools they name.
  useEffect(() => {
    if (open && choosing) stopChoosing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addTool() {
    // A fresh panel: the tool added last time is no longer "the new one".
    setAdopted(null);
    openTool("new");
  }

  // `/` goes to search; `n` adds a tool, but not while choosing, where opening a tool would drop the picks.
  const choosingRef = useRef(choosing);
  choosingRef.current = choosing;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;
      if (event.key === "/" && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
      } else if ((event.key === "n" || event.key === "N") && !choosingRef.current) {
        event.preventDefault();
        addTool();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Changes one field of one tool from its card. Only that field changes, so a draft stays a draft. */
  async function quickChange(tool: PersonalTool, change: BulkChange) {
    setQuickFailed(null);
    try {
      const response = await fetch("/api/tools/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [tool.id], change }),
      });
      if (!response.ok) throw new Error("quick");
      bulkDone((await response.json()) as BulkResult);
    } catch {
      setQuickFailed(tool.id);
    }
  }

  function bulkDone(result: BulkResult) {
    const changed = new Map(result.tools.map((tool) => [tool.id, tool]));
    const gone = new Set(result.deleted);
    setTools((list) => (list ?? []).filter((tool) => !gone.has(tool.id)).map((tool) => changed.get(tool.id) ?? tool));
    if (gone.size) setPicked((ids) => ids.filter((id) => !gone.has(id)));
    if (result.kit) setKits((list) => [...list, result.kit!].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
  }

  const all = tools ?? [];
  const visible = useMemo(
    () => filterTools(all, { query, category, draftsOnly }).filter((tool) => kit === null || tool.kitIds.includes(kit)),
    [all, query, category, draftsOnly, kit],
  );
  // What Share sends: the picked tools while picking (none picked, nothing), else the tools shown.
  const shareSet = useMemo(
    () => (choosing ? all.filter((tool) => picked.includes(tool.id)) : visible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choosing, picked, visible, tools],
  );
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name;
  const drafts = all.filter((tool) => tool.draft).length;
  const categories = EQUIPMENT_CATEGORIES.filter((key) => all.some((tool) => tool.category === key));
  const current = open && open !== "new" ? all.find((tool) => tool.id === open) ?? null : null;
  const panelOpen = open === "new" || Boolean(current);
  // The draft after the open one in the grid's order (wrapping), while others wait.
  const nextDraft = useMemo(() => {
    if (!current?.draft) return null;
    const waiting = visible.filter((tool) => tool.draft);
    const others = all.filter((tool) => tool.draft && tool.id !== current.id);
    if (others.length === 0) return null;
    const at = waiting.findIndex((tool) => tool.id === current.id);
    const after = [...waiting.slice(at + 1), ...waiting.slice(0, Math.max(at, 0))].filter((tool) => tool.id !== current.id);
    const next = after[0] ?? others[0]!;
    return { id: next.id, left: others.length };
  }, [current, visible, all]);

  function saved(tool: PersonalTool) {
    setTools((list) => {
      const rest = (list ?? []).filter((item) => item.id !== tool.id);
      return (list ?? []).some((item) => item.id === tool.id)
        ? (list ?? []).map((item) => (item.id === tool.id ? tool : item))
        : [tool, ...rest];
    });
  }

  async function addFromPhotos(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setNote(null);
    const added: PersonalTool[] = [];
    const skipped: string[] = [];
    // Files that can't be photos are named here and never sent.
    const good = list.filter((file) => {
      const problem = toolPhotoProblem({ type: file.type, size: file.size });
      if (problem) skipped.push(`${file.name} ${SKIP_REASON[problem]}.`);
      return !problem;
    });
    try {
      for (let start = 0; start < good.length; start += BATCH) {
        const batch = good.slice(start, start + BATCH);
        const form = new FormData();
        for (const file of batch) form.append("photos", file);
        try {
          const response = await fetch("/api/tools/from-photos", { method: "POST", body: form });
          if (!response.ok) throw new Error("from-photos");
          const body = (await response.json()) as { tools: PersonalTool[]; skipped: Array<{ name: string; error: string }> };
          added.push(...body.tools);
          skipped.push(...body.skipped.map((item) => `${item.name} ${SKIP_REASON[item.error] ?? "couldn't be added"}.`));
        } catch {
          skipped.push(`${batch.map((file) => file.name).join(", ")} couldn't be added. Try again.`);
        }
      }
      setTools((current) => [...added.slice().reverse(), ...(current ?? [])]);
      setNote({ added: added.length, skipped });
      // An unsaved new tool isn't swapped out for the first draft.
      // Read the address now, not when the upload started: a new tool opened meanwhile keeps its panel.
      if (added[0] && readOpenTool() !== "new") openTool(added[0].id);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Downloads the tools shown as my-tools.csv. */
  function exportCsv() {
    const csv = toolsCsv(visible, { role: roleName, kit: (id) => kits.find((item) => item.id === id)?.name });
    // A byte-order mark first, so spreadsheets read accented names as UTF-8.
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-tools.csv";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers start the download after the click returns: let go of the file a moment later.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    // A photo moved within a tool isn't a new photo.
    if (event.dataTransfer?.types.includes(TOOL_PHOTO_DRAG_TYPE)) return;
    void addFromPhotos(event.dataTransfer.files);
  }

  return (
    <section
      className={["tools-page", dragging ? "is-dragging" : ""].filter(Boolean).join(" ")}
      aria-label="My Tools"
      onDragOver={(event) => {
        const types = event.dataTransfer?.types ?? [];
        // Some browsers list an image dragged within the page as files too.
        if (!types.includes("Files") || types.includes(TOOL_PHOTO_DRAG_TYPE)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="tools-main">
        <header className="tools-head">
          <div>
            <h1>My Tools</h1>
            <p>Your own tools and equipment, with photos and the jobs you used them on. Only you see these.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => void addFromPhotos(event.target.files)}
          />
          {all.length > 0 ? (
            <button
              type="button"
              className="tools-btn"
              aria-pressed={choosing}
              onClick={() => {
                if (choosing) {
                  stopChoosing();
                  return;
                }
                setChoosing(true);
                openTool(null);
              }}
            >
              <ListChecks size={16} aria-hidden="true" />
              Select
            </button>
          ) : null}
          {all.length > 0 && kits.length === 0 ? (
            <button ref={newKitRef} type="button" className="tools-btn" onClick={() => setNewKitRequest((count) => count + 1)}>
              + New kit
            </button>
          ) : null}
          {all.length > 0 ? (
            <button
              type="button"
              className="tools-btn"
              disabled={shareSet.length === 0}
              title={choosing && picked.length === 0 ? "Pick tools to share them" : undefined}
              onClick={() => setSharing(true)}
            >
              <Share2 size={16} aria-hidden="true" />
              Share
            </button>
          ) : null}
          {all.length > 0 ? (
            <button type="button" className="tools-btn" disabled={visible.length === 0} onClick={exportCsv}>
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>
          ) : null}
          <button type="button" className="tools-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            {busy ? "Adding…" : "Add from photos"}
          </button>
          <button
            type="button"
            className="tools-btn is-primary"
            title="Add a tool (N)"
            onClick={addTool}
          >
            <Plus size={16} aria-hidden="true" />
            Add a tool
          </button>
        </header>

        {note ? (
          <div className="tools-note" role="status">
            {note.added > 0 ? (
              <p>
                {note.added === 1 ? "1 photo added as a draft." : `${note.added} photos added as drafts.`} Open each one to fill in its
                details.
              </p>
            ) : null}
            {note.skipped.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}

        {all.length > 0 ? <p className="tools-totals">{totalsLine(visible)}</p> : null}

        {tools !== null && !failed ? (
          <ToolKits
            kits={kits}
            tools={all}
            selected={kit}
            onSelect={setKit}
            newKitRequest={newKitRequest}
            onNamingClosed={() => newKitRef.current?.focus()}
            onKits={(next, deleted) => {
              setKits(next);
              if (deleted) {
                setTools((list) => (list ?? []).map((tool) => ({ ...tool, kitIds: tool.kitIds.filter((id) => id !== deleted) })));
              }
            }}
          />
        ) : null}

        {all.length > 0 ? (
          <div className="tools-filters">
            <label className="tools-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search tools</span>
              <input
                ref={searchRef}
                type="search"
                placeholder="Name, maker, model, or tag"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd className="tools-search-key" title="Press / to search" aria-hidden="true">
                /
              </kbd>
            </label>
            {(["all", ...categories] as const).map((key) => (
              <button
                key={key}
                type="button"
                className="tools-chip"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
              >
                {key === "all" ? "All" : EQUIPMENT_CATEGORY_LABEL[key]}{" "}
                <span>{key === "all" ? all.length : all.filter((tool) => tool.category === key).length}</span>
              </button>
            ))}
            {/* While the filter is on it keeps its button, even with no drafts left, so it can be turned off. */}
            {drafts > 0 || draftsOnly ? (
              <button type="button" className="tools-chip is-drafts" aria-pressed={draftsOnly} onClick={() => setDraftsOnly((on) => !on)}>
                Needs details <span>{drafts}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {choosing && all.length > 0 ? (
          <ToolBulkBar
            picked={picked}
            shownIds={visible.map((tool) => tool.id)}
            kits={kits}
            tools={all}
            onPick={setPicked}
            onDone={bulkDone}
          />
        ) : null}

        {failed ? (
          <p className="tools-empty">Your tools couldn't be loaded. Reload the page to try again.</p>
        ) : tools === null ? (
          <p className="tools-empty">Loading your tools…</p>
        ) : all.length === 0 ? (
          <div className="tools-start">
            <Wrench size={28} aria-hidden="true" />
            <p>Add your first tool, or add several from photos.</p>
            <p className="tools-hint">You can also drop photos anywhere on this page.</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="tools-empty">No tools match. Clear the search or pick All.</p>
        ) : (
          <ul className="tools-grid">
            {visible.map((tool) => {
              const cover = tool.photos.find((photo) => photo.cover) ?? tool.photos[0];
              const used = tool.roleIds.map(roleName).filter(Boolean);
              const isPicked = picked.includes(tool.id);
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={["tools-card", isPicked ? "is-picked" : ""].filter(Boolean).join(" ")}
                    aria-label={choosing ? `Pick ${tool.name}` : `Open ${tool.name}`}
                    aria-pressed={choosing ? isPicked : undefined}
                    data-tool-id={tool.id}
                    aria-current={!choosing && open === tool.id ? "true" : undefined}
                    onClick={() =>
                      choosing
                        ? setPicked((ids) => (ids.includes(tool.id) ? ids.filter((id) => id !== tool.id) : [...ids, tool.id]))
                        : openTool(tool.id)
                    }
                  >
                    <span className="tools-cover">
                      {choosing ? (
                        <span className="tools-pick" aria-hidden="true">
                          {isPicked ? <Check size={14} /> : null}
                        </span>
                      ) : null}
                      {cover ? <FramedPhoto photo={cover} /> : <Wrench size={30} aria-hidden="true" />}
                      {/* One photo is what the cover shows; a count says there are more. */}
                      {tool.photos.length > 1 ? <span className="tools-count">{tool.photos.length} photos</span> : null}
                      {tool.draft ? <span className="tools-draft">Needs details</span> : null}
                    </span>
                    <span className="tools-card-body">
                      <strong>
                        <Highlight text={tool.name} query={query} />
                      </strong>
                      {tool.maker || tool.model ? (
                        <span className="tools-muted">
                          <Highlight text={[tool.maker, tool.model].filter(Boolean).join(" · ")} query={query} />
                        </span>
                      ) : null}
                      {/* Most tools are tools: the category shows only when it says something. */}
                      {tool.category !== "tool" || tool.tags.length ? (
                        <span className="tools-tags">
                          {tool.category !== "tool" ? <span>{EQUIPMENT_CATEGORY_LABEL[tool.category]}</span> : null}
                          {tool.tags.map((tag) => (
                            <span key={tag} className="is-own">
                              <Highlight text={tag} query={query} />
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {used.length ? <span className="tools-muted">Used at {used.join(", ")}</span> : null}
                    </span>
                  </button>
                  {/* The open tool is changed in its panel, whose save would undo a change made here. */}
                  {choosing || open === tool.id ? null : (
                    <div className="tools-card-quick">
                      <select
                        aria-label={`Whose ${tool.name} is`}
                        value={tool.ownership}
                        onChange={(event) => void quickChange(tool, { kind: "ownership", ownership: event.target.value as never })}
                      >
                        {TOOL_OWNERSHIPS.map((key) => (
                          <option key={key} value={key}>
                            {TOOL_OWNERSHIP_LABEL[key]}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`Condition of ${tool.name}`}
                        value={tool.condition}
                        onChange={(event) => void quickChange(tool, { kind: "condition", condition: event.target.value as never })}
                      >
                        {TOOL_CONDITIONS.map((key) => (
                          <option key={key || "none"} value={key}>
                            {key ? TOOL_CONDITION_LABEL[key] : tool.condition ? "Not set" : "Condition?"}
                          </option>
                        ))}
                      </select>
                      {quickFailed === tool.id ? (
                        <span className="tool-field-error" role="alert">
                          Couldn't save. Try again.
                        </span>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {panelOpen ? (
        <ToolGallery
          // One popout for all existing tools, so paging changes the tool in it rather than
          // rebuilding it; a new tool (and the one it becomes once added) has its own.
          key={open === "new" || (current && current.id === adopted) ? "new" : "tool"}
          tool={current}
          roles={roles}
          kits={kits}
          pageIds={visible.map((tool) => tool.id)}
          onSaved={(tool) => {
            saved(tool);
            // Read the address now: if the new tool's popout was closed while it saved, it stays closed.
            if (readOpenTool() === "new") {
              setAdopted(tool.id);
              showTool(tool.id);
            }
          }}
          onRemoved={(id) => {
            setTools((list) => (list ?? []).filter((item) => item.id !== id));
            openTool(null);
          }}
          onClose={() => openTool(null)}
          onOpen={showTool}
          nextDraft={nextDraft}
        />
      ) : null}
      {sharing ? (
        <ToolShareDialog
          tools={shareSet}
          roles={roles}
          kits={kits}
          onClose={() => setSharing(false)}
        />
      ) : null}
      {dragging ? <div className="tools-drop" aria-hidden="true">Drop photos to add them as drafts</div> : null}
    </section>
  );
}
