import { describe, expect, it } from "vitest";
import { parseFirstRunUpdate, shouldWelcome, tourSteps, welcomeSavedLine } from "./first-run";

describe("first run", () => {
  it("welcomes once, after onboarding", () => {
    expect(shouldWelcome({ onboardingCompletedAt: null, welcomeSeenAt: null })).toBe(false);
    expect(shouldWelcome({ onboardingCompletedAt: "2026-11-22T00:00:00Z", welcomeSeenAt: null })).toBe(true);
    expect(shouldWelcome({ onboardingCompletedAt: "2026-11-22T00:00:00Z", welcomeSeenAt: "2026-11-22T00:01:00Z" })).toBe(
      false,
    );
  });

  it("names only what was saved", () => {
    expect(welcomeSavedLine({ jobs: 9, schools: 2 })).toBe("Saved: 9 jobs · 2 schools");
    expect(welcomeSavedLine({ jobs: 1, schools: 0 })).toBe("Saved: 1 job");
    expect(welcomeSavedLine({ jobs: 0, schools: 0 })).toBeNull();
  });

  it("tours the whole of Home with a career, and ends on adding a job without one", () => {
    const full = tourSteps({ empty: false });
    expect(full.map((step) => step.id)).toEqual(["overview", "history", "find", "share"]);
    expect(full.some((step) => step.finish)).toBe(false);
    const short = tourSteps({ empty: true });
    expect(short.map((step) => step.id)).toEqual(["start", "history", "find"]);
    expect(short.at(-1)?.finish).toBe("add-job");
  });

  it("reads a first-run update and refuses anything else", () => {
    expect(parseFirstRunUpdate({ welcomeSeen: true })).toEqual({ ok: true, update: { welcomeSeen: true } });
    expect(parseFirstRunUpdate({ tourDone: false })).toEqual({ ok: true, update: { tourDone: false } });
    expect(parseFirstRunUpdate({})).toEqual({ ok: false });
    expect(parseFirstRunUpdate({ welcomeSeen: "yes" })).toEqual({ ok: false });
    expect(parseFirstRunUpdate(null)).toEqual({ ok: false });
  });
});
