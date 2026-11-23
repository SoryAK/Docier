import { describe, expect, it } from "vitest";
import { roleHistory } from "./role-history";
import type { WorkMapMoment, WorkMapRole } from "./work-map";

const moment = (id: string, date: string, title: string): WorkMapMoment => ({ id, date, title, detail: "", isPublic: true });

function role(over: Partial<WorkMapRole> & { milestones?: WorkMapMoment[]; events?: WorkMapMoment[]; notes?: WorkMapMoment[] } = {}): WorkMapRole {
  const { milestones = [], events = [], notes = [], ...rest } = over;
  return {
    id: "r1",
    kind: "job",
    title: "Mechatronics and Robotics Technician",
    organization: "Giants Direct",
    locationLabel: "",
    startDate: "2024-06-01",
    endDate: "",
    isCurrent: true,
    description: "",
    achievements: ["Kept the robots running"],
    factId: null,
    factVersion: null,
    evidenceIds: [],
    claims: [],
    locations: [],
    media: [],
    linkedEvidence: [],
    details: { milestones, events, notes } as unknown as WorkMapRole["details"],
    ...rest,
  };
}

const NOW = new Date(2026, 10, 23);

describe("roleHistory", () => {
  it("tells a current role year by year, newest first", () => {
    const years = roleHistory(
      role({
        milestones: [moment("m1", "2025-02", "Certified on the pick-and-place cell")],
        events: [moment("e1", "2025-11-03", "Peak season")],
        notes: [moment("n1", "2026-03", "Ask Maria for a reference")],
      }),
      { now: NOW },
    );
    expect(years.map((year) => [year.year, year.label])).toEqual([
      ["2026", "So far"],
      ["2025", "Year 2"],
      ["2024", "Started in June"],
    ]);
    expect(years[1]!.items.map((item) => [item.kind, item.month])).toEqual([
      ["event", "Nov"],
      ["milestone", "Feb"],
    ]);
    // Achievements have no dates yet, so they sit in the year the role started.
    expect(years[2]!.items.map((item) => item.kind)).toEqual(["achievement", "start"]);
    expect(years[2]!.items.find((item) => item.kind === "start")?.text).toBe(
      "Started as Mechatronics and Robotics Technician",
    );
  });

  it("ends an ended role with the year it left, and no 'So far'", () => {
    const years = roleHistory(
      role({ startDate: "2022-03", endDate: "2023-09", isCurrent: false, achievements: [] }),
      { now: NOW },
    );
    expect(years.map((year) => year.label)).toEqual(["Left in September", "Started in March"]);
    expect(years[0]!.items).toMatchObject([{ kind: "end", text: "Left Giants Direct", month: "Sep" }]);
  });

  it("starts and ends in one year", () => {
    const years = roleHistory(role({ startDate: "2017-10", endDate: "2017-12", isCurrent: false, achievements: [] }), { now: NOW });
    expect(years).toHaveLength(1);
    expect(years[0]!.label).toBe("Started in October");
    expect(years[0]!.items.map((item) => item.kind)).toEqual(["end", "start"]);
  });

  it("filters by kind and searches the text", () => {
    const r = role({
      milestones: [moment("m1", "2025-02", "Certified")],
      notes: [moment("n1", "2026-03", "Ask Maria for a reference"), moment("n2", "2025-05", "Met Dan")],
    });
    const notes = roleHistory(r, { filter: "note", now: NOW });
    expect(notes.flatMap((year) => year.items.map((item) => item.text))).toEqual(["Ask Maria for a reference", "Met Dan"]);
    // Start and end only show under All.
    expect(roleHistory(r, { filter: "achievement", now: NOW }).flatMap((y) => y.items.map((i) => i.kind))).toEqual(["achievement"]);
    expect(roleHistory(r, { query: "MARIA", now: NOW }).flatMap((y) => y.items.map((i) => i.id))).toEqual(["n1"]);
    expect(roleHistory(r, { query: "nothing like this", now: NOW })).toEqual([]);
  });

  it("can run oldest first", () => {
    const years = roleHistory(role({ notes: [moment("n1", "2026-03", "A"), moment("n2", "2026-08", "B")] }), {
      order: "oldest",
      now: NOW,
    });
    expect(years.map((year) => year.year)).toEqual(["2024", "2026"]);
    expect(years[1]!.items.map((item) => item.id)).toEqual(["n1", "n2"]);
  });

  it("leaves out what has no usable date, and gives nothing for a role with no start", () => {
    const years = roleHistory(role({ notes: [moment("n1", "someday", "Undated"), moment("n2", "", "Blank")] }), { now: NOW });
    expect(years.flatMap((year) => year.items.map((item) => item.id))).not.toContain("n1");
    expect(roleHistory(role({ startDate: "", notes: [moment("n3", "2025-01", "Still shows")] }), { now: NOW })
      .flatMap((year) => year.items.map((item) => item.id))).toEqual(["n3"]);
    expect(roleHistory(role({ startDate: "", achievements: [] }), { now: NOW })).toEqual([]);
  });

  it("accepts a year alone as a date", () => {
    const years = roleHistory(role({ startDate: "2019", achievements: [], isCurrent: false, endDate: "" }), { now: NOW });
    expect(years).toEqual([{ year: "2019", label: "Started", items: [expect.objectContaining({ kind: "start", month: "" })] }]);
  });
});
