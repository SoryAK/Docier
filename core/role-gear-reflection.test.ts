import { describe, expect, it } from "vitest";
import { equipmentFromNames, gearSummary, prepareGear, uniformLine } from "./role-gear";
import { commuteText, prepareReflection, reflectionSummary } from "./role-reflection";

let n = 0;
const makeId = () => `id${++n}`;

describe("gear", () => {
  it("takes equipment and uniform items, and keeps the names in step", () => {
    const result = prepareGear(
      {
        equipmentItems: [
          { name: " Fluke 87 ", category: "tool", serial: "SN-1", from: "2022-03" },
          { name: "Compressor C-204", usage: "worked-on", category: "machine" },
          { name: "fluke 87", category: "tool" },
        ],
        uniformItems: [{ item: "Coveralls", color: "Navy", providedBy: "employer" }],
        uniform: "Steel toes, bought my own.",
        share: { equipment: true },
      },
      makeId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipmentItems.map((item) => item.name)).toEqual(["Fluke 87", "Compressor C-204", "fluke 87"]);
    expect(result.value.equipment).toEqual(["Fluke 87", "Compressor C-204"]);
    expect(result.value.equipmentItems[1]!.usage).toBe("worked-on");
    expect(result.value.share).toEqual({ equipment: true, uniform: false });
    expect(uniformLine(result.value)).toBe("Navy Coveralls (provided). Steel toes, bought my own.");
    expect(gearSummary(result.value)).toBe("2 given to me · 1 worked on · uniform: Coveralls");
    expect(gearSummary({ ...result.value, equipmentItems: result.value.equipmentItems.filter((item) => item.usage === "worked-on"), uniformItems: [], uniform: "" })).toBe("1 worked on");
  });

  it("refuses unnamed items and bad months, and reads older names as items", () => {
    expect(prepareGear({ equipmentItems: [{ name: "" }] }, makeId)).toEqual({ ok: false, error: "equipment-name-required" });
    expect(prepareGear({ equipmentItems: [{ name: "Truck", from: "May" }] }, makeId)).toEqual({ ok: false, error: "equipment-month-invalid" });
    expect(prepareGear({ uniformItems: [{ item: "" }] }, makeId)).toEqual({ ok: false, error: "uniform-item-required" });
    expect(equipmentFromNames(["Fluke 87"], makeId)[0]).toMatchObject({ name: "Fluke 87", usage: "assigned", category: "other" });
  });
});

describe("reflection", () => {
  it("takes ratings, why you left, the commute, and the environment", () => {
    const result = prepareReflection({
      workplaceRating: 4,
      ratings: { culture: 5, pay: 3 },
      leaving: { reason: "better-offer", wouldReturn: "maybe" },
      departure: "Took a controls role.",
      commute: { minutes: "25", miles: 12, mode: "driving" },
      share: { workplaceRating: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ratings).toEqual({ culture: 5, growth: null, pay: 3, balance: null, management: null });
    expect(result.value.commute).toEqual({ minutes: 25, miles: 12, mode: "driving" });
    expect(result.value.share).toEqual({ workplaceRating: true, departure: false, environment: false });
    expect(reflectionSummary(result.value)).toBe("4/5 overall · Left: A better offer · Might go back · 25 min · 12 mi · Driving");
    expect(commuteText({ minutes: 30, miles: null, mode: "remote" })).toBe("Worked from home");
  });

  it("refuses ratings off the scale, unknown reasons, and odd commutes", () => {
    expect(prepareReflection({ workplaceRating: 6 })).toEqual({ ok: false, error: "rating-invalid" });
    expect(prepareReflection({ ratings: { culture: 2.5 } })).toEqual({ ok: false, error: "rating-invalid" });
    expect(prepareReflection({ leaving: { reason: "boredom" } })).toEqual({ ok: false, error: "reason-invalid" });
    expect(prepareReflection({ commute: { minutes: -5 } })).toEqual({ ok: false, error: "commute-invalid" });
  });
});
