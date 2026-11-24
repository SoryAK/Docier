import { describe, expect, it } from "vitest";
import {
  countedGaps,
  jobFields,
  jobGaps,
  parseFirstRunUpdate,
  schoolFields,
  schoolGaps,
  pickAnchors,
  shouldWelcome,
  tourSteps,
  welcomeCard,
  welcomeHeading,
  welcomeNudge,
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
      expect(network).toMatchObject({ anchors: ["network"], fallback: ["menu"] });
      expect(network).not.toHaveProperty("reveal");
      expect(steps.find((step) => step.id === "history")?.fallback).toEqual(["menu"]);
    }
  });

  it("points a step at what is on screen, or falls back to the menu", () => {
    const network = tourSteps({ empty: false }).find((step) => step.id === "network")!;
    const history = tourSteps({ empty: false }).find((step) => step.id === "history")!;
    const on = (...anchors: TourAnchor[]) => new Set<TourAnchor>(anchors);
    expect(pickAnchors(network, on("network", "menu"))).toEqual(["network"]);
    expect(pickAnchors(network, on("menu"))).toEqual(["menu"]);
    expect(pickAnchors(network, on())).toBeNull();
    expect(pickAnchors(history, on("map", "menu"))).toEqual(["map"]);
    expect(pickAnchors(history, on("history-nav", "map"))).toEqual(["history-nav", "map"]);
    expect(pickAnchors(history, on("menu"))).toEqual(["menu"]);
  });

  it("lists what a saved role still lacks, always offering company details", () => {
    const full = { company: "Giants Direct", location: "Lancaster, PA", startDate: "2024-06-01", description: "Robots.", achievements: ["Kept it running"] };
    expect(jobGaps(full).map((gap) => gap.kind)).toEqual(["company-details"]);
    expect(countedGaps(jobGaps(full))).toBe(0);
    const bare = { company: "Untitled role", location: "", startDate: "", description: " ", achievements: [] };
    expect(jobGaps(bare).map((gap) => gap.label)).toEqual([
      "Name the company",
      "Add dates",
      "Add the place",
      "Describe it",
      "Add achievements",
      "Company details",
    ]);
    expect(countedGaps(jobGaps(bare))).toBe(5);
    // A pinned site is saved by its id, so a place of "67" is a place, not a gap.
    expect(jobGaps({ ...full, location: "67" }).map((gap) => gap.kind)).toEqual(["company-details"]);
    const school = { degree: "BS Biology", location: "Gainesville, FL", startDate: "2010-08-01" };
    expect(schoolGaps(school).map((gap) => gap.kind)).toEqual(["school-details"]);
    expect(countedGaps(schoolGaps(school))).toBe(0);
    // Dates saved but no degree or place: the count matches the two fields the card shows as missing.
    const partial = { ...school, degree: "", location: "" };
    expect(schoolGaps(partial).map((gap) => gap.kind)).toEqual(["degree", "place", "school-details"]);
    expect(countedGaps(schoolGaps(partial))).toBe(schoolFields(partial).filter((field) => !field.done).length);
    expect(schoolGaps({ degree: "", location: "", startDate: "" }).map((gap) => gap.kind)).toEqual([
      "degree",
      "dates",
      "place",
      "school-details",
    ]);
  });

  it("lists a role's fields in order, each done or not", () => {
    const fields = jobFields({ company: "Values into Action", location: "", startDate: "2016-03-01", description: "", achievements: ["Helped"] });
    expect(fields.map((field) => `${field.kind}:${field.done}`)).toEqual([
      "company:true",
      "dates:true",
      "place:false",
      "description:false",
      "achievements:true",
    ]);
    expect(jobFields({ company: "Untitled role", location: "", startDate: "", description: "", achievements: [" "] }).every((field) => !field.done)).toBe(
      true,
    );
    expect(schoolFields({ degree: "Associate Degree", location: "", startDate: "2014-09-01" }).map((field) => field.done)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("nudges toward the most useful next step for each section", () => {
    const job = (patch: Partial<Parameters<typeof jobGaps>[0] & { title: string; isCurrent: boolean }>) => ({
      company: "Acme",
      title: "Engineer",
      location: "Philadelphia, PA",
      startDate: "2020-01-01",
      isCurrent: false,
      description: "Built things.",
      achievements: ["Shipped it"],
      ...patch,
    });
    const page = { targetRole: "", visibility: "access-controlled" };
    // The current role comes first when it is missing something.
    expect(
      welcomeNudge("history", {
        jobs: [job({ company: "Sharp Packaging", isCurrent: true }), job({ company: "Giants Direct", isCurrent: true, description: "" })],
        people: 0,
        page,
      }),
    ).toBe("Start with your role at Giants Direct: add a few lines on what you did there.");
    // What you did comes before where it was.
    expect(
      welcomeNudge("history", { jobs: [job({ company: "Values into Action", isCurrent: true, location: "", description: "" })], people: 0, page }),
    ).toBe("Start with your role at Values into Action: add a few lines on what you did there.");
    // Otherwise the most common gap, counted.
    expect(
      welcomeNudge("history", { jobs: [job({ description: "" }), job({ company: "Rowa", description: "" })], people: 0, page }),
    ).toBe("2 roles have no description yet. A few lines on what you did in each goes a long way.");
    expect(welcomeNudge("history", { jobs: [job({})], people: 0, page })).toBe(
      "Your roles are filled in. Add company details, so your page says where you did the work.",
    );
    expect(welcomeNudge("network", { jobs: [job({ company: "Giants Direct", isCurrent: true })], people: 0, page })).toBe(
      "Start with someone from Giants Direct who can vouch for your work.",
    );
    expect(welcomeNudge("share", { jobs: [], people: 0, page })).toBe(
      "Set a target role, so your page leads with the work you want next.",
    );
    expect(welcomeNudge("share", { jobs: [], people: 0, page: { ...page, targetRole: "Robotics technician" } })).toBe(
      "Your page is private. Preview it, then choose who can see it.",
    );
  });

  it("reads a first-run update and refuses anything else", () => {
    expect(parseFirstRunUpdate({ welcomeSeen: true })).toEqual({ ok: true, update: { welcomeSeen: true } });
    expect(parseFirstRunUpdate({ tourDone: false })).toEqual({ ok: true, update: { tourDone: false } });
    expect(parseFirstRunUpdate({})).toEqual({ ok: false });
    expect(parseFirstRunUpdate({ welcomeSeen: "yes" })).toEqual({ ok: false });
    expect(parseFirstRunUpdate(null)).toEqual({ ok: false });
  });
});
