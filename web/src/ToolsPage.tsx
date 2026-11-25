import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Plus, Search, Wrench } from "lucide-react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory } from "@core/role-gear";
import { TOOL_OWNERSHIP_LABEL, filterTools, toolPhotoProblem, type PersonalTool } from "@core/personal-tools";
import { ToolPanel, type ToolRoleChoice } from "./ToolPanel";
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

/**
 * My Tools: your own tools and equipment, as a grid of cards with a panel for
 * adding and changing one. Add from photos turns each photo into a draft.
 */
export function ToolsPage() {
  const [tools, setTools] = useState<PersonalTool[] | null>(null);
  const [roles, setRoles] = useState<ToolRoleChoice[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(readOpenTool);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EquipmentCategory | "all">("all");
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [note, setNote] = useState<{ added: number; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
        setTools(((await response.json()) as { tools: PersonalTool[] }).tools);
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
  }, []);

  const all = tools ?? [];
  const visible = useMemo(() => filterTools(all, { query, category, draftsOnly }), [all, query, category, draftsOnly]);
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name;
  const drafts = all.filter((tool) => tool.draft).length;
  const categories = EQUIPMENT_CATEGORIES.filter((key) => all.some((tool) => tool.category === key));
  const current = open && open !== "new" ? all.find((tool) => tool.id === open) ?? null : null;
  const panelOpen = open === "new" || Boolean(current);

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
      if (added[0] && open !== "new") openTool(added[0].id);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void addFromPhotos(event.dataTransfer.files);
  }

  return (
    <section
      className={["tools-page", panelOpen ? "has-panel" : "", dragging ? "is-dragging" : ""].filter(Boolean).join(" ")}
      aria-label="My Tools"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
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
          <button type="button" className="tools-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            {busy ? "Adding…" : "Add from photos"}
          </button>
          <button
            type="button"
            className="tools-btn is-primary"
            onClick={() => {
              // A fresh panel: the tool added last time is no longer "the new one".
              setAdopted(null);
              openTool("new");
            }}
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

        {all.length > 0 ? (
          <div className="tools-filters">
            <label className="tools-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search tools</span>
              <input type="search" placeholder="Name, maker, model, or tag" value={query} onChange={(event) => setQuery(event.target.value)} />
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
            {drafts > 0 ? (
              <button type="button" className="tools-chip is-drafts" aria-pressed={draftsOnly} onClick={() => setDraftsOnly((on) => !on)}>
                Needs details <span>{drafts}</span>
              </button>
            ) : null}
          </div>
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
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    className="tools-card"
                    data-tool-id={tool.id}
                    aria-current={open === tool.id ? "true" : undefined}
                    onClick={() => openTool(tool.id)}
                  >
                    <span className="tools-cover">
                      {cover ? <img src={cover.url} alt="" loading="lazy" /> : <Wrench size={30} aria-hidden="true" />}
                      {tool.photos.length ? (
                        <span className="tools-count">{tool.photos.length === 1 ? "1 photo" : `${tool.photos.length} photos`}</span>
                      ) : null}
                      {tool.draft ? <span className="tools-draft">Needs details</span> : null}
                    </span>
                    <span className="tools-card-body">
                      <strong>{tool.name}</strong>
                      <span className="tools-muted">{[tool.maker, tool.model].filter(Boolean).join(" · ") || "No maker or model yet"}</span>
                      <span className="tools-tags">
                        <span>{TOOL_OWNERSHIP_LABEL[tool.ownership]}</span>
                        <span>{EQUIPMENT_CATEGORY_LABEL[tool.category]}</span>
                      </span>
                      <span className="tools-muted">{used.length ? `Used at ${used.join(", ")}` : "Not linked to a role"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {panelOpen ? (
        <ToolPanel
          key={current && current.id !== adopted ? current.id : "new"}
          tool={current}
          roles={roles}
          onSaved={(tool) => {
            saved(tool);
            if (open === "new") {
              setAdopted(tool.id);
              openTool(tool.id);
            }
          }}
          onRemoved={(id) => {
            setTools((list) => (list ?? []).filter((item) => item.id !== id));
            openTool(null);
          }}
          onClose={() => openTool(null)}
        />
      ) : null}
      {dragging ? <div className="tools-drop" aria-hidden="true">Drop photos to add them as drafts</div> : null}
    </section>
  );
}
