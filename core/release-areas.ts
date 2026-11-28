/**
 * Areas left out of this release. They stay in the code and keep their data,
 * but they're out of the sidebar, an old link to one opens Home, and a notice
 * that would open one opens Home instead. Bring one back by taking it off
 * this list.
 */
const HIDDEN_AREAS: ReadonlySet<string> = new Set(["opportunities", "resumes"]);

export function isHiddenArea(area: string): boolean {
  return HIDDEN_AREAS.has(area);
}
