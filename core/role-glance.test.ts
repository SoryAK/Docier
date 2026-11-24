import { describe, expect, it } from "vitest";
import { commuteGlance, prepareRoleGlance, roleGlance } from "./role-glance";
import { EMPTY_WORK_MAP_DETAILS, normalizeWorkMapDetails } from "./work-map";

const details = (over: Partial<typeof EMPTY_WORK_MAP_DETAILS> = {}) => normalizeWorkMapDetails(over);

describe("a role at a glance", () => {
  it("is empty when nothing is filled in", () => {
    expect(roleGlance(details())).toEqual([]);
  });

  it("names the setup, hours, manager, and rating, each with its tab, and leaves the commute to the place", () => {
    const items = roleGlance(
      details({
        schedule: { type: "full-time", workMode: "onsite", daysOnSite: null, hoursPerWeek: 40, shift: "" },
        team: { reportsTo: "Mike Reyes", department: "", size: null },
        workplaceRating: 4,
        commute: { minutes: 22, miles: 14, mode: "driving" },
      }),
    );
    expect(items).toEqual([
      { kind: "work", tab: "setup", text: "Full-time, on site" },
      { kind: "hours", tab: "setup", text: "40 h/week" },
      { kind: "manager", tab: "setup", text: "Reports to Mike Reyes" },
      { kind: "rating", tab: "back", text: "4/5 overall" },
    ]);
  });

  it("leaves pay out until it is asked for", () => {
    const pay = { ...EMPTY_WORK_MAP_DETAILS.compensation, amount: 31.5, period: "hourly" as const };
    expect(roleGlance(details({ compensation: pay })).map((item) => item.kind)).toEqual([]);
    expect(roleGlance(details({ compensation: pay, glance: { pay: true } }))).toEqual([{ kind: "pay", tab: "pay", text: "$31.50/hr" }]);
  });

  it("shows nothing for pay that is asked for but not set", () => {
    expect(roleGlance(details({ glance: { pay: true } }))).toEqual([]);
  });

  it("says how hybrid and remote work went, and skips on site alone", () => {
    const schedule = EMPTY_WORK_MAP_DETAILS.schedule;
    expect(roleGlance(details({ schedule: { ...schedule, workMode: "hybrid", daysOnSite: 3 } }))[0]?.text).toBe("Hybrid, 3 days on site");
    expect(roleGlance(details({ schedule: { ...schedule, type: "contract", workMode: "remote" } }))[0]?.text).toBe("Contract, remote");
    expect(roleGlance(details({ schedule: { ...schedule, workMode: "onsite" } }))).toEqual([]);
  });

  it("says a commute by time, by distance, or as working from home, beside the place", () => {
    expect(commuteGlance({ minutes: 22, miles: 14, mode: "driving" })).toBe("22 min commute");
    expect(commuteGlance({ minutes: null, miles: 14, mode: "driving" })).toBe("14 mi commute");
    expect(commuteGlance({ minutes: null, miles: null, mode: "remote" })).toBe("Worked from home");
    expect(commuteGlance({ minutes: null, miles: null, mode: "" })).toBe("");
  });

  it("is off for pay in a role saved before the switch existed", () => {
    expect(normalizeWorkMapDetails({}).glance).toEqual({ pay: false });
  });
});

describe("what a role shows at a glance", () => {
  it("takes a yes or no for pay", () => {
    expect(prepareRoleGlance({ pay: true })).toEqual({ ok: true, value: { glance: { pay: true } } });
    expect(prepareRoleGlance({ pay: false })).toEqual({ ok: true, value: { glance: { pay: false } } });
  });

  it("refuses anything else", () => {
    expect(prepareRoleGlance({ pay: "yes" })).toEqual({ ok: false, error: "glance-invalid" });
    expect(prepareRoleGlance({})).toEqual({ ok: false, error: "glance-invalid" });
  });
});
