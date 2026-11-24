import { describe, expect, it } from "vitest";
import { describeDetailsChange, describeRoleFieldsChange, undoBlock, type RoleFields } from "./role-edits";
import { EMPTY_WORK_MAP_DETAILS } from "./work-map";

const fields: RoleFields = {
  kind: "job",
  title: "Technician",
  organization: "Giants Direct",
  locationLabel: "Lancaster, PA",
  startDate: "2024-06-01",
  endDate: "",
  isCurrent: true,
  description: "",
  achievements: [
    { id: "a1", statement: "Cut robot downtime" },
    { id: "a2", statement: "Trained two technicians" },
  ],
};

describe("describing a change to a role", () => {
  it("says which fields changed, and nothing when none did", () => {
    expect(describeRoleFieldsChange(fields, { ...fields })).toBeNull();
    expect(describeRoleFieldsChange(fields, { ...fields, title: "Lead technician", description: "Days." })).toEqual({
      keys: ["title", "description"],
      summary: "Changed the title to Lead technician; Changed the description",
    });
    expect(describeRoleFieldsChange(fields, { ...fields, isCurrent: false, endDate: "2025-01" })?.summary).toBe(
      "Changed the end date; Marked as ended",
    );
  });

  it("names achievements added, removed, reworded, titled, and dated", () => {
    const after = {
      ...fields,
      achievements: [
        { id: "a1", statement: "Cut robot downtime by a third", date: "2025-04" },
        { id: "a3", statement: "Wrote the startup checklist" },
      ],
    };
    const change = describeRoleFieldsChange(fields, after)!;
    expect(change.keys).toEqual(["achievements"]);
    expect(change.summary).toBe("Reworded an achievement: Cut robot downtime by a third; Dated an achievement: Cut robot downtime by a third; and 2 more");
    expect(describeRoleFieldsChange(fields, { ...fields, achievements: [...fields.achievements].reverse() })?.summary).toBe("Reordered the achievements");
  });

  it("names notes and milestones added or removed, and other details by name", () => {
    const before = { ...EMPTY_WORK_MAP_DETAILS, notes: [{ id: "n1", date: "2025-01-01", title: "Moved to nights", detail: "", isPublic: false }] };
    const added = { ...before, milestones: [{ id: "m1", date: "2025-02", title: "Certified", detail: "", isPublic: true }] };
    expect(describeDetailsChange(before, added)).toEqual({ keys: ["milestones"], summary: "Added a milestone: Certified" });
    expect(describeDetailsChange(before, { ...before, notes: [] })?.summary).toBe("Removed a note: Moved to nights");
    expect(describeDetailsChange(before, { ...before, benefits: ["Health"] })?.summary).toBe("Changed benefits");
    expect(describeDetailsChange(before, structuredClone(before))).toBeNull();
  });
});

describe("when an edit can be undone", () => {
  const edit = { area: "role" as const, keys: ["title"], after: { title: "Lead technician" }, undoneAt: null };

  it("only while what it changed is still as it left it", () => {
    expect(undoBlock(edit, { ...fields, title: "Lead technician" })).toBeNull();
    // Something else changing doesn't matter.
    expect(undoBlock(edit, { ...fields, title: "Lead technician", description: "Later." })).toBeNull();
    expect(undoBlock(edit, { ...fields, title: "Supervisor" })).toBe("changed-since");
  });

  it("not twice, and never for what is only logged", () => {
    expect(undoBlock({ ...edit, undoneAt: "2026-11-23T10:00:00Z" }, { ...fields, title: "Lead technician" })).toBe("undone");
    expect(undoBlock({ area: "people", keys: [], after: null, undoneAt: null }, fields)).toBe("log-only");
  });
});

describe("edits in a role's history", () => {
  it("show only under Edits, newest first, with no role-year label", async () => {
    const { roleHistory } = await import("./role-history");
    const role = {
      id: "r1",
      kind: "job",
      title: "Technician",
      organization: "Giants Direct",
      locationLabel: "",
      startDate: "2022-03-01",
      endDate: "2022-09-01",
      isCurrent: false,
      description: "",
      achievements: [],
      details: EMPTY_WORK_MAP_DETAILS,
      edits: [
        { id: "e2", at: "2026-11-23T22:40:00.000Z", area: "role", summary: "Changed the title to Lead", canUndo: true, blocked: null },
        { id: "e1", at: "2026-11-23T22:32:00.000Z", area: "details", summary: "Added a note: Nights", canUndo: false, blocked: "changed-since" },
      ],
    } as never;
    expect(roleHistory(role).flatMap((year) => year.items).some((item) => item.kind === "edit")).toBe(false);
    const years = roleHistory(role, { filter: "edit" });
    expect(years).toHaveLength(1);
    expect(years[0]!.label).toBe("");
    expect(years[0]!.items.map((item) => item.id)).toEqual(["e2", "e1"]);
    expect(years[0]!.items[1]!.edit).toMatchObject({ canUndo: false, blocked: "changed-since" });
  });
});
