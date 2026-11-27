import { describe, expect, it } from "vitest";
import { limitProjection } from "./access";
import { PUBLIC_PHOTO_MAX, PUBLIC_PHOTOS_TOTAL_MAX, careerPageTools, embedPublicPhotos, publicPhotoJobs } from "./career-page";
import type { PersonalTool } from "./personal-tools";
import { describeRelayChanges } from "./projection";
import { EMPTY_WORK_MAP_DETAILS, buildWorkMapSnapshot, type WorkMapPublishSection, type WorkMapRole } from "./work-map";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

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
  tags: ["secret-tag"],
  notes: "Spare battery in the blue bag",
  draft: false,
  roleIds: ["r1"],
  kitIds: ["k1"],
  onCareerPage: true,
  photos: [
    { id: "p1", url: "/api/tools/t1/photos/p1", cover: false, framing: { rotation: 0, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 } },
    { id: "p2", url: "/api/tools/t1/photos/p2", cover: true, framing: { rotation: 90, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 } },
  ],
  createdAt: "",
  updatedAt: "",
  ...fields,
});

const role = (fields: Partial<WorkMapRole> = {}): WorkMapRole => ({
  id: "r1",
  kind: "job",
  title: "Electrician",
  organization: "Giants Direct",
  locationLabel: "",
  startDate: "2020-01",
  endDate: "",
  isCurrent: false,
  description: "",
  achievements: [],
  factId: null,
  factVersion: null,
  evidenceIds: [],
  claims: [],
  locations: [],
  media: [
    { id: "m1", kind: "photo", title: "Panel", url: "/api/work-map/media/m1", caption: "", isPublic: true },
    { id: "m2", kind: "photo", title: "Linked", url: "https://example.com/a.jpg", caption: "", isPublic: true },
    { id: "m3", kind: "attachment", title: "Local file", url: "/api/work-map/media/m3", caption: "", isPublic: true },
    { id: "m4", kind: "photo", title: "Private", url: "/api/work-map/media/m4", caption: "", isPublic: false },
  ],
  linkedEvidence: [],
  details: structuredClone(EMPTY_WORK_MAP_DETAILS),
  ...fields,
});

function snapshot(options: { sections?: WorkMapPublishSection[]; tools?: PersonalTool[]; visibility?: "unlisted" | "anonymous" } = {}) {
  return buildWorkMapSnapshot({
    id: "s1",
    occupantId: "local",
    profile: { fullName: "Sory Kaba", headline: "", city: "", state: "", bio: "", linkedinUrl: "", githubUrl: "", portfolioUrl: "" },
    roles: [role()],
    skills: [],
    tools: options.tools ?? [tool({})],
    settings: {
      slug: "sory",
      targetRole: "",
      theme: "dark",
      visibility: options.visibility ?? "unlisted",
      sections: options.sections ?? ["history", "media", "tools"],
      hideCurrentEmployer: false,
      showExactLocations: false,
      expiresAt: null,
    },
    sourceFingerprint: "f",
    createdAt: "2026-11-27T00:00:00.000Z",
  });
}

describe("tools on the career page", () => {
  it("shows chosen tools with only what an employer sees", () => {
    const page = snapshot();
    expect(page.tools).toEqual([
      {
        id: "t1",
        name: "Drill",
        makerModel: "Makita · XFD131",
        facts: [
          { label: "How well I use it", value: "4 of 5" },
          { label: "Used at", value: "Giants Direct" },
        ],
        roleIds: ["r1"],
        photoUrl: "/api/tools/t1/photos/p2",
        photoFraming: { rotation: 90, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 },
      },
    ]);
    const text = JSON.stringify(page.tools);
    for (const secret of ["SN-SECRET-1", "159", "120", "Garage shelf B", "secret-tag", "blue bag", "k1", "2023-04"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("leaves out tools not switched on, drafts, and every tool when the section is off", () => {
    expect(snapshot({ tools: [tool({ onCareerPage: false }), tool({ id: "t2", draft: true })] }).tools).toEqual([]);
    expect(snapshot({ sections: ["history", "media"] }).tools).toEqual([]);
  });

  it("names where it was used as the page names the job", () => {
    expect(snapshot({ visibility: "anonymous" }).tools?.[0]?.facts).toContainEqual({ label: "Used at", value: "Verified organization" });
    // Without career history on the page, a tool isn't tied to jobs.
    const noHistory = snapshot({ sections: ["tools"] }).tools?.[0];
    expect(noHistory?.roleIds).toEqual([]);
    expect(noHistory?.facts.some((fact) => fact.label === "Used at")).toBe(false);
  });

  it("a link that doesn't open Tools shows none", () => {
    const page = snapshot();
    expect(limitProjection(page, ["history"]).tools).toEqual([]);
    expect(limitProjection(page, ["history", "tools"]).tools).toHaveLength(1);
    expect(limitProjection({ ...page, tools: undefined }, ["tools"]).tools).toEqual([]);
  });

  it("notes when the shown tools change", () => {
    const before = snapshot();
    const after = snapshot({ tools: [tool({ name: "Hammer drill" })] });
    expect(describeRelayChanges(before, after)).toContain("Tools updated");
    expect(describeRelayChanges(before, snapshot())).not.toContain("Tools updated");
    expect(describeRelayChanges({ ...before, tools: undefined }, { ...before, tools: [] })).not.toContain("Tools updated");
  });

  it("careerPageTools reads covers, or the first photo", () => {
    const [shown] = careerPageTools([tool({ photos: [{ ...tool({}).photos[0]!, cover: false }] })], []);
    expect(shown?.photoUrl).toBe("/api/tools/t1/photos/p1");
    expect(careerPageTools([tool({ photos: [] })], [])[0]?.photoUrl).toBe("");
  });
});

describe("embedding photos", () => {
  it("lists the photos the browser should prepare: local role photos and tool covers", () => {
    expect(publicPhotoJobs(snapshot())).toEqual([
      { key: "media:m1", url: "/api/work-map/media/m1", framing: null },
      { key: "tool:t1", url: "/api/tools/t1/photos/p2", framing: { rotation: 90, flipH: false, flipV: false, zoom: 1, focusX: 50, focusY: 50 } },
    ]);
  });

  it("puts prepared photos in, keeps web links, and drops every local address", () => {
    const done = embedPublicPhotos(snapshot(), { "media:m1": JPEG, "tool:t1": JPEG, "media:nope": JPEG });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const media = done.value.roles[0]!.media;
    expect(media.map((item) => [item.id, item.url])).toEqual([
      ["m1", JPEG],
      ["m2", "https://example.com/a.jpg"],
    ]);
    expect(done.value.tools?.[0]?.photoUrl).toBe(JPEG);
    expect(done.value.tools?.[0]).not.toHaveProperty("photoFraming");
    expect(JSON.stringify(done.value)).not.toContain("/api/");
  });

  it("leaves off a photo that wasn't prepared, or isn't JPEG data", () => {
    const done = embedPublicPhotos(snapshot(), {
      "media:m1": "data:image/svg+xml;base64,PHN2Zz4=",
      "tool:t1": `${JPEG}"><script>`,
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.roles[0]!.media.map((item) => item.id)).toEqual(["m2"]);
    expect(done.value.tools?.[0]?.photoUrl).toBe("");
    expect(embedPublicPhotos(snapshot(), undefined).ok).toBe(true);
  });

  it("leaves off a photo that's too big, and refuses too much in all", () => {
    const big = `data:image/jpeg;base64,${"A".repeat(PUBLIC_PHOTO_MAX)}`;
    const one = embedPublicPhotos(snapshot(), { "media:m1": big });
    expect(one.ok && one.value.roles[0]!.media.map((item) => item.id)).toEqual(["m2"]);

    const tools = Array.from({ length: 30 }, (_, i) => tool({ id: `t${i}` }));
    const near = `data:image/jpeg;base64,${"A".repeat(PUBLIC_PHOTO_MAX - 40)}`;
    const photos = Object.fromEntries(tools.map((item) => [`tool:${item.id}`, near]));
    expect(30 * near.length).toBeGreaterThan(PUBLIC_PHOTOS_TOTAL_MAX);
    expect(embedPublicPhotos(snapshot({ tools }), photos)).toEqual({ ok: false, error: "photos-too-large" });
  });

  it("refuses photos that aren't a list of names and images", () => {
    expect(embedPublicPhotos(snapshot(), ["x"])).toEqual({ ok: false, error: "photos-invalid" });
    expect(embedPublicPhotos(snapshot(), { "media:m1": 5 })).toEqual({ ok: false, error: "photos-invalid" });
  });
});
