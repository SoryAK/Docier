import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tourSteps, welcomeCard, type TourAnchor } from "./first-run";

/**
 * The tour points at Home by `data-tour` names. When Home changes, a stop can be
 * left pointing at nothing. This reads Home's components and fails if that
 * happens, so the release review (docs/release.md) starts from a tour that works.
 */

const WEB = join(__dirname, "..", "web", "src");

/**
 * The `data-tour="x"` and `tour="x"` attributes written in JSX. An attribute follows
 * whitespace; a selector the tour looks up, such as `'[data-tour="menu"]'`, follows a
 * bracket and is not a marker, so it is not counted.
 */
function markersIn(source: string): string[] {
  return [...source.matchAll(/(?<=\s)(?:data-tour|tour)="([a-z-]+)"/g)].map((match) => match[1]!);
}

/** Every marker written in the web components. */
function anchorsOnHome(): Set<string> {
  const found = new Set<string>();
  for (const file of readdirSync(WEB)) {
    if (!file.endsWith(".tsx")) continue;
    for (const name of markersIn(readFileSync(join(WEB, file), "utf8"))) found.add(name);
  }
  return found;
}

/** Every name a stop can point at: its anchors and its fallback. */
function anchorsInTour(): Set<TourAnchor> {
  const used = new Set<TourAnchor>();
  for (const empty of [false, true]) {
    for (const step of tourSteps({ empty })) {
      for (const anchor of [...step.anchors, ...(step.fallback ?? [])]) {
        used.add(anchor);
      }
    }
  }
  return used;
}

describe("the tour and Home", () => {
  it("counts JSX markers, not selectors that look for them", () => {
    const source = `
      <button data-tour="menu" />
      <HomeNavRow tour="network" />
      const start = document.querySelector('[data-tour="start"]');
    `;
    expect(markersIn(source)).toEqual(["menu", "network"]);
  });

  it("points every stop at something that is on Home", () => {
    const onHome = anchorsOnHome();
    const missing = [...anchorsInTour()].filter((anchor) => !onHome.has(anchor));
    expect(missing, "tour stops point at data-tour names no Home component has").toEqual([]);
  });

  it("marks Home only with names the tour knows", () => {
    const known = anchorsInTour();
    const unknown = [...anchorsOnHome()].filter((anchor) => !known.has(anchor as TourAnchor));
    expect(unknown, "data-tour names on Home that no tour stop uses (a typo, or a stop removed)").toEqual([]);
  });

  it("previews real stops on the welcome card, in the tour's order", () => {
    for (const empty of [false, true]) {
      const stops = tourSteps({ empty }).map((step) => step.id);
      const previewed = welcomeCard({ empty }).tiles.map((tile) => tile.stop);
      expect(previewed.every((stop) => stops.includes(stop)), `tiles name stops not in the ${empty ? "short" : "full"} tour`).toBe(
        true,
      );
      const order = previewed.map((stop) => stops.indexOf(stop));
      expect(order, "tiles follow the tour's order").toEqual([...order].sort((a, b) => a - b));
    }
  });
});
