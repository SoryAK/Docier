import { describe, expect, it } from "vitest";
import type { PersonalTool } from "./personal-tools";
import { SHARE_FILE_NAME, shareTools, toolShareHtml } from "./tool-share";

const tool = (fields: Partial<PersonalTool>): PersonalTool => ({
  id: "t1",
  name: "Drill",
  category: "tool",
  ownership: "mine",
  maker: "Makita",
  model: "XFD131",
  serial: "SN-SECRET-1",
  condition: "good",
  skill: 4,
  acquired: "2023-04",
  paid: 159,
  worth: 120,
  keptAt: "Garage shelf B",
  tags: [],
  notes: "Spare battery in the blue bag",
  draft: false,
  roleIds: ["r1"],
  kitIds: ["k1"],
  photos: [],
  createdAt: "",
  updatedAt: "",
  ...fields,
});
const names = { roleName: (id: string) => (id === "r1" ? "Giants Direct" : undefined), kitName: (id: string) => (id === "k1" ? "Truck toolbox" : undefined) };
const page = (audience: "employer" | "crew", tools: PersonalTool[], photos: Record<string, string> = {}) =>
  toolShareHtml({ audience, tools: shareTools(tools, audience, names), photos, owner: { name: "Sam Rivera", headline: "Robotics technician" }, month: "Nov 2026" });

describe("share pages", () => {
  it("shows an employer how well you use each tool and where", () => {
    const html = page("employer", [tool({})]);
    expect(html).toContain("Drill");
    expect(html).toContain("Makita · XFD131");
    expect(html).toContain("Giants Direct");
    expect(html).toContain("4 of 5");
    expect(html).not.toContain("Good");
    expect(html).not.toContain("Truck toolbox");
  });

  it("shows a crew the condition, whose it is, and the kits", () => {
    const html = page("crew", [tool({})]);
    expect(html).toContain("Good");
    expect(html).toContain("Mine");
    expect(html).toContain("Truck toolbox");
    expect(html).not.toContain("Giants Direct");
    expect(html).not.toContain("4 of 5");
  });

  it("never includes serials, prices, where it's kept, notes, or drafts", () => {
    for (const audience of ["employer", "crew"] as const) {
      const html = page(audience, [tool({}), tool({ id: "t2", name: "Mystery photo", draft: true })]);
      for (const secret of ["SN-SECRET-1", "159", "120", "Garage shelf B", "blue bag", "Mystery photo"]) expect(html).not.toContain(secret);
    }
  });

  it("writes text as text, never as markup", () => {
    const html = page("employer", [tool({ name: '<script>alert("x")</script>', maker: "A&B" })]);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B");
  });

  it("puts in only image data as photos", () => {
    const withPhoto = tool({ photos: [{ id: "p1", url: "/x", cover: true, framing: { rotation: 0, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 } }] });
    expect(page("crew", [withPhoto], { t1: "data:image/jpeg;base64,AAAA" })).toContain('src="data:image/jpeg;base64,AAAA"');
    const bad = page("crew", [withPhoto], { t1: 'javascript:alert(1)"' });
    expect(bad).not.toContain("javascript:");
  });

  it("leaves the name off when asked, and names the file by audience", () => {
    const html = toolShareHtml({ audience: "crew", tools: shareTools([tool({})], "crew", names), photos: {}, owner: null, month: "Nov 2026" });
    expect(html).not.toContain("Sam Rivera");
    expect(html).toContain("Nov 2026");
    expect(SHARE_FILE_NAME).toEqual({ employer: "my-tools-for-employers.html", crew: "my-tools-for-crew.html" });
  });
});
