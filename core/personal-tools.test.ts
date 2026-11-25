import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAMING,
  draftToolName,
  filterTools,
  framingStyle,
  readKitName,
  readPhotoFraming,
  readToolInput,
  toolPhotoProblem,
  toolsCsv,
  toolsForRole,
  toolSearchText,
  toolTotals,
  type PersonalTool,
  type ToolKit,
} from "./personal-tools";

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
    kitIds: [],
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
        kitIds: [],
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

describe("kits", () => {
  const kits: ToolKit[] = [
    { id: "k1", name: "Electrical kit", createdAt: "" },
    { id: "k2", name: "Truck toolbox", createdAt: "" },
  ];

  it("refuses a kit that isn't there", () => {
    expect(readToolInput({ name: "A", kitIds: ["k9"] }, roles, new Set(["k1"]))).toEqual({ ok: false, error: "kit-missing" });
    expect(readToolInput({ name: "A", kitIds: ["k1", "k1"] }, roles, new Set(["k1"]))).toMatchObject({ ok: true, value: { kitIds: ["k1"] } });
  });

  it("names a kit", () => {
    expect(readKitName("  Plumbing  ", kits)).toEqual({ ok: true, name: "Plumbing" });
    expect(readKitName(" ", kits)).toEqual({ ok: false, error: "kit-name-required" });
    expect(readKitName("x".repeat(80), kits)).toEqual({ ok: true, name: "x".repeat(60) });
    expect(readKitName("electrical KIT", kits)).toEqual({ ok: false, error: "kit-name-taken" });
    expect(readKitName("electrical KIT", kits, "k1")).toEqual({ ok: true, name: "electrical KIT" });
  });
});

describe("totals and export", () => {
  it("adds up what's shown", () => {
    expect(toolTotals([tool(), tool()])).toEqual({ count: 2, paid: null, worth: null, withPhotos: 0 });
    expect(
      toolTotals([
        tool({ paid: 425.5, worth: 300, photos: [{ id: "p", url: "", cover: true, framing: DEFAULT_FRAMING }] }),
        tool({ paid: 100 }),
        tool(),
      ]),
    ).toEqual({ count: 3, paid: 525.5, worth: 300, withPhotos: 1 });
  });

  it("writes a CSV a spreadsheet reads safely", () => {
    const csv = toolsCsv(
      [
        tool({
          name: 'Meter, "87V"',
          notes: "line one\nline two",
          maker: "=HYPERLINK(1)",
          tags: ["a", "b"],
          roleIds: ["r1"],
          kitIds: ["k1"],
          paid: 425.5,
          skill: 4,
          draft: true,
        }),
      ],
      { role: (id) => (id === "r1" ? "Giants Direct" : undefined), kit: (id) => (id === "k1" ? "Electrical kit" : undefined) },
    );
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "Name,Category,Whose it is,Maker,Model,Serial,Condition,How well you use it,When you got it,Paid,Worth now,Where it's kept,Tags,Used on,Kits,Notes,Needs details",
    );
    // The line break inside the notes stays inside its quoted cell.
    expect(row).toBe('"Meter, ""87V""",Tool,Mine,\'=HYPERLINK(1),,,,4,,425.5,,,a; b,Giants Direct,Electrical kit,"line one\nline two",Yes');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("photo framing", () => {
  it("reads a framing", () => {
    const good = { rotation: 90, flipH: true, flipV: false, zoom: 2, focusX: 30, focusY: 70 };
    expect(readPhotoFraming(good)).toEqual({ ok: true, value: good });
    expect(readPhotoFraming({ ...good, rotation: 45 })).toEqual({ ok: false, error: "framing-invalid" });
    expect(readPhotoFraming({ ...good, zoom: 9 })).toEqual({ ok: false, error: "framing-invalid" });
    expect(readPhotoFraming({ ...good, focusX: 120 })).toEqual({ ok: false, error: "framing-invalid" });
    expect(readPhotoFraming(null)).toEqual({ ok: false, error: "framing-invalid" });
  });

  it("turns a framing into CSS", () => {
    expect(framingStyle(DEFAULT_FRAMING)).toEqual({ objectPosition: "50% 50%", transform: undefined });
    expect(framingStyle({ rotation: 90, flipH: true, flipV: false, zoom: 2, focusX: 30, focusY: 70 })).toEqual({
      objectPosition: "30% 70%",
      transform: "rotate(90deg) scaleX(-1) scale(2)",
    });
  });
});
