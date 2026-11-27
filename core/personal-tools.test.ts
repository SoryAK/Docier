import { describe, expect, it } from "vitest";
import { draftToolName, filterTools, readToolInput, toolPhotoProblem, toolsForRole, toolSearchText, type PersonalTool } from "./personal-tools";

const roles = new Set(["r1", "r2"]);

function tool(over: Partial<PersonalTool> = {}): PersonalTool {
  return {
    id: "t",
    name: "Tool",
    category: "tool",
    ownership: "mine",
    maker: "",
    model: "",
    serial: "",
    condition: "",
    skill: null,
    acquired: "",
    paid: null,
    worth: null,
    keptAt: "",
    tags: [],
    notes: "",
    draft: false,
    roleIds: [],
    photos: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("reading a tool", () => {
  it("reads a full tool", () => {
    const read = readToolInput(
      {
        name: "  Fluke 87V multimeter ",
        category: "tool",
        ownership: "mine",
        maker: "Fluke",
        model: "87V",
        serial: "48210977",
        condition: "good",
        skill: "4",
        acquired: "2019-03",
        paid: "425.50",
        worth: 300,
        keptAt: "Truck toolbox",
        tags: " electrical, Meters ,electrical",
        notes: "True-RMS.",
        roleIds: ["r1", "r1"],
      },
      roles,
    );
    expect(read).toEqual({
      ok: true,
      value: {
        name: "Fluke 87V multimeter",
        category: "tool",
        ownership: "mine",
        maker: "Fluke",
        model: "87V",
        serial: "48210977",
        condition: "good",
        skill: 4,
        acquired: "2019-03",
        paid: 425.5,
        worth: 300,
        keptAt: "Truck toolbox",
        tags: ["electrical", "Meters"],
        notes: "True-RMS.",
        roleIds: ["r1"],
      },
    });
  });

  it("takes tags as a list too, and keeps at most 20", () => {
    const many = Array.from({ length: 25 }, (_, index) => `tag${index}`);
    const read = readToolInput({ name: "Drill", tags: many }, roles);
    expect(read.ok && read.value.tags).toHaveLength(20);
  });

  it("leaves blanks empty", () => {
    const read = readToolInput({ name: "Drill", skill: "", paid: " ", worth: null, acquired: "" }, roles);
    expect(read).toMatchObject({ ok: true, value: { skill: null, paid: null, worth: null, acquired: "" } });
  });

  it("needs a name", () => {
    expect(readToolInput({ name: "  " }, roles)).toEqual({ ok: false, error: "name-required" });
    expect(readToolInput(null, roles)).toEqual({ ok: false, error: "name-required" });
    const long = readToolInput({ name: "x".repeat(200) }, roles);
    expect(long.ok && long.value.name).toHaveLength(120);
  });

  it("refuses values outside the lists", () => {
    expect(readToolInput({ name: "A", category: "spaceship" }, roles)).toEqual({ ok: false, error: "category-invalid" });
    expect(readToolInput({ name: "A", ownership: "stolen" }, roles)).toEqual({ ok: false, error: "ownership-invalid" });
    expect(readToolInput({ name: "A", condition: "mint" }, roles)).toEqual({ ok: false, error: "condition-invalid" });
    expect(readToolInput({ name: "A", skill: 6 }, roles)).toEqual({ ok: false, error: "skill-invalid" });
    expect(readToolInput({ name: "A", skill: 2.5 }, roles)).toEqual({ ok: false, error: "skill-invalid" });
    expect(readToolInput({ name: "A", acquired: "2024-13" }, roles)).toEqual({ ok: false, error: "acquired-invalid" });
    expect(readToolInput({ name: "A", paid: -1 }, roles)).toEqual({ ok: false, error: "amount-invalid" });
    expect(readToolInput({ name: "A", worth: "lots" }, roles)).toEqual({ ok: false, error: "amount-invalid" });
  });

  it("fills in the usual choices", () => {
    expect(readToolInput({ name: "A" }, roles)).toMatchObject({
      ok: true,
      value: { category: "tool", ownership: "mine", condition: "", tags: [], roleIds: [] },
    });
  });

  it("refuses a role that isn't there", () => {
    expect(readToolInput({ name: "A", roleIds: ["nope"] }, roles)).toEqual({ ok: false, error: "role-missing" });
  });
});

describe("drafts from photos", () => {
  it("names a draft from its file", () => {
    expect(draftToolName("IMG_2041.jpg")).toBe("IMG_2041");
    expect(draftToolName("drill.photo.png")).toBe("drill.photo");
    expect(draftToolName(".jpg")).toBe("Untitled tool");
    expect(draftToolName("")).toBe("Untitled tool");
  });
});

describe("finding tools", () => {
  const tools = [
    tool({ id: "a", name: "Fluke 87V", maker: "Fluke", category: "tool", tags: ["electrical"], roleIds: ["r1"] }),
    tool({ id: "b", name: "Laptop", maker: "Dell", model: "Latitude", category: "computer", roleIds: ["r1", "r2"] }),
    tool({ id: "c", name: "IMG_1", draft: true }),
  ];

  it("filters by search, category, and drafts", () => {
    const ids = (filter: Parameters<typeof filterTools>[1]) => filterTools(tools, filter).map((item) => item.id);
    expect(ids({ query: "", category: "all", draftsOnly: false })).toEqual(["a", "b", "c"]);
    expect(ids({ query: "LATI", category: "all", draftsOnly: false })).toEqual(["b"]);
    expect(ids({ query: "electrical", category: "all", draftsOnly: false })).toEqual(["a"]);
    expect(ids({ query: "", category: "computer", draftsOnly: false })).toEqual(["b"]);
    expect(ids({ query: "", category: "all", draftsOnly: true })).toEqual(["c"]);
  });

  it("finds a role's tools, by name", () => {
    expect(toolsForRole(tools, "r1").map((item) => item.id)).toEqual(["a", "b"]);
    expect(toolsForRole(tools, "r9")).toEqual([]);
  });

  it("searches name, maker, model, and tags", () => {
    expect(toolSearchText(tools[0]!)).toBe("Fluke 87V Fluke electrical");
  });
});

describe("photos", () => {
  it("says why a file can't be a tool photo", () => {
    expect(toolPhotoProblem({ type: "image/jpeg", size: 3 * 1024 * 1024 })).toBeNull();
    expect(toolPhotoProblem({ type: "text/plain", size: 5 })).toBe("photo-type");
    expect(toolPhotoProblem({ type: "image/png", size: 0 })).toBe("photo-empty");
    expect(toolPhotoProblem({ type: "image/png", size: 6 * 1024 * 1024 })).toBe("photo-too-large");
  });
});
