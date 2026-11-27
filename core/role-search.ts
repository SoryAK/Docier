import type { WorkMapRole } from "./work-map";

/** Where a search hit opens on its role. */
export type RoleSearchTarget =
  | { tab: "setup" | "documents" }
  | { achievement: string }
  | { person: string };

export type RoleSearchEntry = {
  /** Unique across all roles. */
  id: string;
  roleId: string;
  /** What the hit is, for its group in the results. */
  group: "Skills" | "Equipment" | "Achievements" | "Colleagues" | "Documents";
  label: string;
  detail: string;
  target: RoleSearchTarget;
};

/**
 * The things inside a role that search can find by name: its skills, its
 * equipment, its achievements, the colleagues linked to it, and the files kept
 * with it. Pay, ratings, and why you left stay out of search.
 */
export function roleSearchEntries(role: WorkMapRole): RoleSearchEntry[] {
  const where = role.organization || role.title || "Untitled role";
  const entries: RoleSearchEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: Omit<RoleSearchEntry, "roleId">) => {
    const key = `${entry.group}:${entry.label.toLowerCase()}`;
    if (!entry.label || seen.has(key)) return;
    seen.add(key);
    entries.push({ ...entry, roleId: role.id });
  };
  const details = role.details;

  for (const skill of details.skills) {
    add({ id: `skill:${role.id}:${skill}`, group: "Skills", label: skill.trim(), detail: `Used at ${where}`, target: { tab: "setup" } });
  }
  for (const skill of details.skillsGained) {
    add({ id: `skill:${role.id}:${skill}`, group: "Skills", label: skill.trim(), detail: `Gained at ${where}`, target: { tab: "setup" } });
  }
  for (const item of details.techStack) {
    add({ id: `skill:${role.id}:${item}`, group: "Skills", label: item.trim(), detail: `Used at ${where}`, target: { tab: "setup" } });
  }
  const equipment = details.equipmentItems.length ? details.equipmentItems.map((item) => item.name) : details.equipment;
  for (const name of equipment) {
    add({ id: `equipment:${role.id}:${name}`, group: "Equipment", label: name.trim(), detail: `At ${where}`, target: { tab: "setup" } });
  }
  role.achievements.forEach((statement, index) => {
    const id = role.achievementIds?.[index];
    const title = role.achievementTitles?.[index]?.trim();
    if (!id || !statement.trim()) return;
    add({ id: `achievement:${id}`, group: "Achievements", label: title || statement.trim(), detail: where, target: { achievement: id } });
  });
  for (const person of role.people ?? []) {
    add({
      id: `person:${person.linkId}`,
      group: "Colleagues",
      label: person.name,
      detail: [person.role, where].filter(Boolean).join(" · "),
      target: { person: person.linkId },
    });
  }
  for (const document of role.documents ?? []) {
    add({ id: `document:${document.linkId}`, group: "Documents", label: document.name, detail: `Kept with ${where}`, target: { tab: "documents" } });
  }
  return entries;
}
