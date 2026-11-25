import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import { formatHistoryPlace } from "@core/career-history";
import type { WorkMapRole } from "@core/work-map";
import { roleSearchEntries, type RoleSearchTarget } from "@core/role-search";
import { EQUIPMENT_CATEGORY_LABEL } from "@core/role-gear";
import { TOOL_OWNERSHIP_LABEL, toolSearchText, type PersonalTool } from "@core/personal-tools";
import { liveUpdates } from "./HomeCenter";

const PLACES = [
  { id: "profile", label: "Profile", detail: "Name and links" },
  { id: "history", label: "Career history", detail: "Roles on this board" },
  { id: "map", label: "Map", detail: "Places for the roles" },
  { id: "updates", label: "Updates", detail: "Notes from current roles" },
  { id: "media", label: "Media and events", detail: "Photos and events" },
  { id: "proforna", label: "Chat", detail: "Ask about your career" },
] as const;

export type SearchPlace = (typeof PLACES)[number]["id"];

type PaletteHit = SearchableItem<{
  group: string;
  detail: string;
  haystack: string;
}>;

export function HomeSearch({
  open,
  onOpenChange,
  onPlace,
  onRole,
  onUpdate,
  onTool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlace: (id: SearchPlace) => void;
  /** Opens a role, at the thing that was found in it when there is one. */
  onRole: (id: string, target?: RoleSearchTarget) => void;
  onUpdate: (id: string, roleId: string) => void;
  /** Opens a tool in My Tools. */
  onTool: (id: string) => void;
}) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [tools, setTools] = useState<PersonalTool[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { roles?: WorkMapRole[] };
        setRoles(body.roles ?? []);
      })
      .catch(() => setRoles([]));
    void fetch("/api/tools")
      .then(async (response) => {
        if (!response.ok) return;
        setTools(((await response.json()) as { tools?: PersonalTool[] }).tools ?? []);
      })
      .catch(() => setTools([]));
  }, [open]);

  const palette = useMemo(() => buildPalette(roles, tools), [roles, tools]);
  const targets = useMemo(
    () => new Map(roles.flatMap((role) => roleSearchEntries(role)).map((entry) => [entry.id, entry])),
    [roles],
  );

  function pick(value: string) {
    const split = value.indexOf(":");
    const kind = split === -1 ? "" : value.slice(0, split);
    const target = split === -1 ? value : value.slice(split + 1);
    if (kind === "place" && PLACES.some((item) => item.id === target)) {
      onPlace(target as SearchPlace);
      return;
    }
    if (kind === "role") onRole(target);
    if (kind === "tool") onTool(target);
    if (kind === "inside") {
      const entry = targets.get(target);
      if (entry) onRole(entry.roleId, entry.target);
    }
    if (kind === "update") {
      const cut = target.indexOf(":");
      if (cut === -1) return;
      onUpdate(target.slice(cut + 1), target.slice(0, cut));
    }
  }

  return (
    <CommandPalette
      isOpen={open}
      onOpenChange={onOpenChange}
      searchSource={palette}
      label="Search"
      emptySearchText="Nothing matches that."
      onValueChange={pick}
      renderItem={(item) => (
        <span className="home-palette-hit">
          <strong>{item.label}</strong>
          {item.auxiliaryData?.detail ? <span>{item.auxiliaryData.detail}</span> : null}
        </span>
      )}
    />
  );
}

function buildPalette(roles: WorkMapRole[], tools: PersonalTool[]): SearchSource<PaletteHit> {
  const places: PaletteHit[] = PLACES.map((item) => ({
    id: `place:${item.id}`,
    label: item.label,
    auxiliaryData: {
      group: "Places",
      detail: item.detail,
      haystack: `${item.label} ${item.detail}`,
    },
  }));
  const roleHits: PaletteHit[] = roles.map((role) => {
    const label = role.organization || role.title || "Untitled";
    const detail = [role.title, formatHistoryPlace(role)].filter(Boolean).join(" · ");
    return {
      id: `role:${role.id}`,
      label,
      auxiliaryData: {
        group: "Roles",
        detail,
        haystack: [label, detail, role.details.summary, role.description, ...role.details.skills, ...role.details.skillsGained].join(" "),
      },
    };
  });
  const updateHits: PaletteHit[] = roles.flatMap((role) =>
    // Achievements have a group of their own, so Updates leaves them out.
    liveUpdates([role]).filter((item) => item.kind !== "Achievement").map((item) => ({
      id: `update:${role.id}:${item.id}`,
      label: item.organization,
      auxiliaryData: {
        group: "Updates",
        detail: `${item.kind} · ${item.text}`,
        haystack: `${item.organization} ${item.kind} ${item.text}`,
      },
    })),
  );
  const insideHits: PaletteHit[] = roles.flatMap((role) =>
    roleSearchEntries(role).map((entry) => ({
      id: `inside:${entry.id}`,
      label: entry.label,
      auxiliaryData: { group: entry.group, detail: entry.detail, haystack: `${entry.label} ${entry.detail}` },
    })),
  );
  const toolHits: PaletteHit[] = tools.map((tool) => ({
    id: `tool:${tool.id}`,
    label: tool.name,
    auxiliaryData: {
      group: "Tools",
      detail: `${TOOL_OWNERSHIP_LABEL[tool.ownership]} · ${EQUIPMENT_CATEGORY_LABEL[tool.category]}`,
      haystack: toolSearchText(tool),
    },
  }));
  const all = [...places, ...roleHits, ...insideHits, ...toolHits, ...updateHits];
  return {
    bootstrap: () => places,
    search: (query) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return places;
      return all.filter((item) => (item.auxiliaryData?.haystack ?? item.label).toLowerCase().includes(needle));
    },
  };
}
