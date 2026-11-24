import { describe, expect, it } from "vitest";
import {
  achievementStatement,
  prepareAchievementDate,
  readRoleAchievements,
  reconcileRoleAchievements,
  roleAchievementStatements,
} from "./role-achievements";

describe("role achievements", () => {
  it("keeps an id when the line is edited", () => {
    const previous = [
      { id: "a", statement: "Kept the line." },
      { id: "b", statement: "Tuned the belt." },
    ];
    expect(
      reconcileRoleAchievements(previous, ["Kept the line.", "Tuned the night belt."], () => "new"),
    ).toEqual([
      { id: "a", statement: "Kept the line." },
      { id: "b", statement: "Tuned the night belt." },
    ]);
  });

  it("keeps ids when lines are reordered and mints one for a new line", () => {
    const previous = [
      { id: "a", statement: "First" },
      { id: "b", statement: "Second" },
    ];
    expect(reconcileRoleAchievements(previous, ["Second", "Added", "First"], () => "c")).toEqual([
      { id: "b", statement: "Second" },
      { id: "c", statement: "Added" },
      { id: "a", statement: "First" },
    ]);
  });

  it("drops the id of a removed line", () => {
    expect(
      reconcileRoleAchievements(
        [
          { id: "a", statement: "Stay" },
          { id: "b", statement: "Go" },
        ],
        ["Stay"],
        () => "new",
      ),
    ).toEqual([{ id: "a", statement: "Stay" }]);
  });

  it("reads legacy strings and stored records", () => {
    let n = 0;
    const legacy = readRoleAchievements(["  Kept the line. ", ""], () => `id-${(n += 1)}`);
    expect(legacy).toEqual({
      items: [{ id: "id-1", statement: "Kept the line." }],
      changed: true,
    });
    const stored = readRoleAchievements(
      [{ id: "a", statement: "Kept the line." }],
      () => "unused",
    );
    expect(stored).toEqual({
      items: [{ id: "a", statement: "Kept the line." }],
      changed: false,
    });
    expect(roleAchievementStatements(JSON.stringify(["Kept the line.", { id: "b", statement: "Second" }]))).toEqual([
      "Kept the line.",
      "Second",
    ]);
  });

  it("returns the current statement for an achievement id", () => {
    expect(achievementStatement(["Old", "Current"], ["a", "b"], "b")).toBe("Current");
    expect(achievementStatement(["Old"], ["a"], "missing")).toBeNull();
  });

  it("keeps an achievement's month through reading, rewording, and reordering", () => {
    const stored = JSON.stringify([
      { id: "a", statement: "Cut downtime", date: "2025-04" },
      { id: "b", statement: "Trained two technicians", date: "2025-13" },
      { id: "c", statement: "Rebuilt the conveyor", date: "  " },
    ]);
    const read = readRoleAchievements(stored, () => "new");
    expect(read.items).toEqual([
      { id: "a", statement: "Cut downtime", date: "2025-04" },
      { id: "b", statement: "Trained two technicians" },
      { id: "c", statement: "Rebuilt the conveyor" },
    ]);
    // A bad month is dropped on read, and that counts as a change to save.
    expect(read.changed).toBe(true);
    const next = reconcileRoleAchievements(read.items, ["Rebuilt the conveyor", "Cut robot downtime by a third"], () => "new");
    expect(next).toEqual([
      { id: "c", statement: "Rebuilt the conveyor" },
      { id: "a", statement: "Cut robot downtime by a third", date: "2025-04" },
    ]);
  });

  it("reads a month for an achievement, or clears it", () => {
    expect(prepareAchievementDate("2025-04")).toEqual({ ok: true, value: "2025-04" });
    expect(prepareAchievementDate("2025-04-17")).toEqual({ ok: true, value: "2025-04" });
    expect(prepareAchievementDate("")).toEqual({ ok: true, value: "" });
    expect(prepareAchievementDate(null)).toEqual({ ok: true, value: "" });
    expect(prepareAchievementDate("April")).toEqual({ ok: false, error: "date-invalid" });
    expect(prepareAchievementDate("2025-00")).toEqual({ ok: false, error: "date-invalid" });
  });
});
