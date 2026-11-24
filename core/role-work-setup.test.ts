import { describe, expect, it } from "vitest";
import { prepareWorkSetup, shiftLabel, workSetupSummary } from "./role-work-setup";

let n = 0;
const makeId = () => `id${++n}`;

describe("work setup", () => {
  it("takes the schedule, shifts, team, and growth", () => {
    const result = prepareWorkSetup(
      {
        schedule: { type: "full-time", workMode: "hybrid", daysOnSite: 3, hoursPerWeek: 40, shift: " Nights,  every other weekend " },
        shifts: [{ name: "Nights", start: "23:00", end: "07:00" }, { id: "keep", name: "Days", start: "07:00", end: "15:30" }],
        team: { reportsTo: "Dana Kim", department: "Maintenance", size: 12 },
        skills: ["PLC", "plc", "Hydraulics"],
        skillsGained: ["SAP"],
        promotions: [{ title: "Lead technician", date: "2023-04" }],
        growth: "Moved to nights to learn the line.",
        share: { schedule: true, team: false, growth: true },
      },
      makeId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value;
    expect(value.schedule).toEqual({ type: "full-time", workMode: "hybrid", daysOnSite: 3, hoursPerWeek: 40, shift: "Nights, every other weekend" });
    expect(value.shifts.map((shift) => shift.name)).toEqual(["Nights", "Days"]);
    expect(value.shifts[1]!.id).toBe("keep");
    expect(value.shifts[0]!.id).toMatch(/^id/);
    expect(value.team).toEqual({ reportsTo: "Dana Kim", department: "Maintenance", size: 12 });
    expect(value.skills).toEqual(["PLC", "Hydraulics"]);
    expect(value.promotions[0]).toMatchObject({ title: "Lead technician", date: "2023-04" });
    expect(value.share).toEqual({ schedule: true, team: false, growth: true });
  });

  it("drops days on site unless the work is hybrid, and leaves blanks empty", () => {
    const result = prepareWorkSetup({ schedule: { workMode: "remote", daysOnSite: 2 } }, makeId);
    expect(result.ok && result.value.schedule).toEqual({ type: "", workMode: "remote", daysOnSite: null, hoursPerWeek: null, shift: "" });
    expect(result.ok && result.value.team).toEqual({ reportsTo: "", department: "", size: null });
  });

  it("refuses what isn't a time, a month, a type, or a sensible number", () => {
    const bad: Array<[unknown, string]> = [
      [{ schedule: { type: "gig" } }, "schedule-type-invalid"],
      [{ schedule: { workMode: "hybrid", daysOnSite: 8 } }, "days-on-site-invalid"],
      [{ schedule: { hoursPerWeek: 200 } }, "hours-invalid"],
      [{ shifts: [{ name: "Nights", start: "25:00", end: "07:00" }] }, "shift-time-invalid"],
      [{ shifts: [{ name: "", start: "23:00", end: "07:00" }] }, "shift-name-required"],
      [{ team: { size: 0 } }, "team-size-invalid"],
      [{ promotions: [{ title: "Lead", date: "April" }] }, "promotion-date-invalid"],
      [{ promotions: [{ title: "", date: "2023-04" }] }, "promotion-title-required"],
    ];
    for (const [input, error] of bad) {
      expect(prepareWorkSetup(input as never, makeId)).toEqual({ ok: false, error });
    }
  });

  it("labels shifts in 12-hour time and marks overnight ones", () => {
    expect(shiftLabel({ start: "23:00", end: "07:00" })).toBe("11 PM – 7 AM (overnight)");
    expect(shiftLabel({ start: "07:00", end: "15:30" })).toBe("7 AM – 3:30 PM");
    expect(shiftLabel({ start: "00:00", end: "12:00" })).toBe("12 AM – 12 PM");
  });

  it("sums the setup up in one line", () => {
    expect(
      workSetupSummary({
        schedule: { type: "full-time", workMode: "hybrid", daysOnSite: 3, hoursPerWeek: 40, shift: "" },
        team: { reportsTo: "Dana Kim", department: "", size: null },
      }),
    ).toBe("Full-time · Hybrid, 3 days on site · 40 h/week · Reports to Dana Kim");
    // On site is the default, so it only shows next to something else.
    expect(workSetupSummary({ schedule: { type: "", workMode: "onsite", daysOnSite: null, hoursPerWeek: null, shift: "" }, team: { reportsTo: "", department: "", size: null } })).toBe("");
    expect(workSetupSummary({ schedule: { type: "part-time", workMode: "onsite", daysOnSite: null, hoursPerWeek: null, shift: "" }, team: { reportsTo: "", department: "Lab", size: 4 } })).toBe("Part-time · On site · Lab, team of 4");
  });
});
