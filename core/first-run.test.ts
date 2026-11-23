import { describe, expect, it } from "vitest";
import {
  parseFirstRunUpdate,
  pickAnchors,
  shouldWelcome,
  tourSteps,
  welcomeCard,
  welcomeHeading,
  type TourAnchor,
} from "./first-run";

describe("first run", () => {
  it("welcomes once, after onboarding", () => {
    expect(shouldWelcome({ onboardingCompletedAt: null, welcomeSeenAt: null })).toBe(false);
    expect(shouldWelcome({ onboardingCompletedAt: "2026-11-22T00:00:00Z", welcomeSeenAt: null })).toBe(true);
    expect(shouldWelcome({ onboardingCompletedAt: "2026-11-22T00:00:00Z", welcomeSeenAt: "2026-11-22T00:01:00Z" })).toBe(
      false,
    );
  });

  it("greets by first name, or just welcomes", () => {
    expect(welcomeHeading("  Sory ")).toEqual({ lead: "Welcome", name: "Sory" });
    expect(welcomeHeading("")).toEqual({ lead: "Welcome", name: null });
  });

  it("previews the tour on the card, with a version for an empty career", () => {
    expect(welcomeCard({ empty: false })).toEqual({
      lede: "Everything you've done, in one place you control.",
      tiles: [
        { icon: "history", title: "Add your history", body: "Jobs, schools, and proof of your work", stop: "history" },
        { icon: "network", title: "Build your network", body: "People you've worked with and trust", stop: "network" },
        { icon: "share", title: "Share it", body: "Publish a page when you're ready", stop: "share" },
      ],
    });
    expect(welcomeCard({ empty: true })).toEqual({
      lede: "Let's build your career here, one job at a time.",
      tiles: [
        { icon: "add", title: "Add your first job", body: "Start with the role you have now", stop: "start" },
        { icon: "history", title: "Build your history", body: "Every job and school in one place", stop: "history" },
        { icon: "network", title: "Build your network", body: "Add the people you've worked with", stop: "network" },
      ],
    });
  });

  it("tours the whole of Home with a career, and ends on adding a job without one", () => {
    const full = tourSteps({ empty: false });
    expect(full.map((step) => step.id)).toEqual(["overview", "history", "network", "share"]);
    expect(full.some((step) => step.finish)).toBe(false);
    const short = tourSteps({ empty: true });
    expect(short.map((step) => step.id)).toEqual(["start", "history", "network"]);
    expect(short.at(-1)?.finish).toBe("add-job");
    // A cloud model may already read resumes, so only the page's privacy is promised.
    expect(full.at(-1)?.body).toBe("Preview your page, then publish it. Your page stays private until you publish.");
    for (const steps of [full, short]) {
      const network = steps.find((step) => step.id === "network");
      expect(network).toMatchObject({ anchors: ["network"], reveal: "resources", fallback: ["menu"] });
      expect(steps.find((step) => step.id === "history")?.fallback).toEqual(["menu"]);
    }
  });

  it("points a step at what is on screen, opening Resources or falling back to the menu", () => {
    const network = tourSteps({ empty: false }).find((step) => step.id === "network")!;
    const history = tourSteps({ empty: false }).find((step) => step.id === "history")!;
    const on = (...anchors: TourAnchor[]) => new Set<TourAnchor>(anchors);
    expect(pickAnchors(network, on("network", "resources", "menu"))).toEqual(["network"]);
    expect(pickAnchors(network, on("resources", "menu"))).toEqual(["network"]);
    expect(pickAnchors(network, on("menu"))).toEqual(["menu"]);
    expect(pickAnchors(network, on())).toBeNull();
    expect(pickAnchors(history, on("map", "menu"))).toEqual(["map"]);
    expect(pickAnchors(history, on("history-nav", "map"))).toEqual(["history-nav", "map"]);
    expect(pickAnchors(history, on("menu"))).toEqual(["menu"]);
  });

  it("reads a first-run update and refuses anything else", () => {
    expect(parseFirstRunUpdate({ welcomeSeen: true })).toEqual({ ok: true, update: { welcomeSeen: true } });
    expect(parseFirstRunUpdate({ tourDone: false })).toEqual({ ok: true, update: { tourDone: false } });
    expect(parseFirstRunUpdate({})).toEqual({ ok: false });
    expect(parseFirstRunUpdate({ welcomeSeen: "yes" })).toEqual({ ok: false });
    expect(parseFirstRunUpdate(null)).toEqual({ ok: false });
  });
});
