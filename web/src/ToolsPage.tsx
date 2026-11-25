import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Plus, Search, Wrench } from "lucide-react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory } from "@core/role-gear";
import { TOOL_OWNERSHIP_LABEL, filterTools, type PersonalTool } from "@core/personal-tools";
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
  "photo-too-large": "is too large",
  "photo-empty": "is empty",
};

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
    try {
      const form = new FormData();
      for (const file of list) form.append("photos", file);
      const response = await fetch("/api/tools/from-photos", { method: "POST", body: form });
      if (!response.ok) throw new Error("from-photos");
      const body = (await response.json()) as { tools: PersonalTool[]; skipped: Array<{ name: string; error: string }> };
      setTools((current) => [...body.tools, ...(current ?? [])]);
      setNote({
        added: body.tools.length,
        skipped: body.skipped.map((item) => `${item.name} ${SKIP_REASON[item.error] ?? "couldn't be added"}.`),
      });
      if (body.tools[0]) openTool(body.tools[0].id);
    } catch {
      setNote({ added: 0, skipped: ["The photos couldn't be added. Try again."] });
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
          <button type="button" className="tools-btn is-primary" onClick={() => openTool("new")}>
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
          key={current?.id ?? "new"}
          tool={current}
          roles={roles}
          onSaved={(tool) => {
            saved(tool);
            if (open === "new") openTool(tool.id);
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
