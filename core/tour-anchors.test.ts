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

/** Every `data-tour="x"` and `tour="x"` written in the web components. */
function anchorsOnHome(): Set<string> {
  const found = new Set<string>();
  for (const file of readdirSync(WEB)) {
    if (!file.endsWith(".tsx")) continue;
    const source = readFileSync(join(WEB, file), "utf8");
    for (const match of source.matchAll(/\b(?:data-tour|tour)="([a-z-]+)"/g)) found.add(match[1]!);
  }
  return found;
}

/** Every name a stop can point at: its anchors, its fallback, and the group it opens. */
function anchorsInTour(): Set<TourAnchor> {
  const used = new Set<TourAnchor>();
  for (const empty of [false, true]) {
    for (const step of tourSteps({ empty })) {
      for (const anchor of [...step.anchors, ...(step.fallback ?? []), ...(step.reveal ? [step.reveal] : [])]) {
        used.add(anchor);
      }
    }
  }
  return used;
}

describe("the tour and Home", () => {
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
