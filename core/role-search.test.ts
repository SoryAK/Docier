import { describe, expect, it } from "vitest";
import { roleSearchEntries } from "./role-search";
import { normalizeWorkMapDetails, type WorkMapRole } from "./work-map";

function role(over: Partial<WorkMapRole> = {}, details: Record<string, unknown> = {}): WorkMapRole {
  return {
    id: "r1",
    kind: "job",
    title: "Technician",
    organization: "Giants Direct",
    locationLabel: "",
    startDate: "2024-06",
    endDate: "",
    isCurrent: true,
    description: "",
    achievements: [],
    factId: null,
    factVersion: null,
    evidenceIds: [],
    claims: [],
    locations: [],
    media: [],
    linkedEvidence: [],
    details: normalizeWorkMapDetails(details),
    ...over,
  } as WorkMapRole;
}

describe("role search entries", () => {
  it("finds a role's skills and opens them on Setup", () => {
    const entries = roleSearchEntries(role({}, { skills: ["Swisslog AutoStore"], skillsGained: ["Robot calibration"] }));
    expect(entries.map((entry) => [entry.group, entry.label, entry.detail])).toEqual([
      ["Skills", "Swisslog AutoStore", "Used at Giants Direct"],
      ["Skills", "Robot calibration", "Gained at Giants Direct"],
    ]);
    expect(entries[0]!.target).toEqual({ tab: "setup" });
  });

  it("lists a skill once when it is both used and gained", () => {
    const entries = roleSearchEntries(role({}, { skills: ["PLCs"], skillsGained: ["plcs"] }));
    expect(entries).toHaveLength(1);
  });

  it("finds achievements by their title, or their statement, and opens that achievement", () => {
    const entries = roleSearchEntries(
      role({ achievements: ["Cut downtime 20%", "Trained new hires"], achievementIds: ["a1", "a2"], achievementTitles: ["Uptime", ""] }),
    );
    expect(entries.map((entry) => entry.label)).toEqual(["Uptime", "Trained new hires"]);
    expect(entries[0]!.target).toEqual({ achievement: "a1" });
  });

  it("finds colleagues and documents kept with the role", () => {
    const entries = roleSearchEntries(
      role({
        people: [{ linkId: "p1", contactId: "c1", name: "Mike Reyes", role: "Manager" } as never],
        documents: [{ linkId: "d1", documentId: "f1", name: "Handbook.pdf" } as never],
      }),
    );
    expect(entries.map((entry) => [entry.group, entry.label, entry.detail])).toEqual([
      ["Colleagues", "Mike Reyes", "Manager · Giants Direct"],
      ["Documents", "Handbook.pdf", "Kept with Giants Direct"],
    ]);
    expect(entries[0]!.target).toEqual({ person: "p1" });
  });

  it("leaves pay and private notes out", () => {
    const entries = roleSearchEntries(role({}, { benefitNotes: "401k", departure: "Moved away" }));
    expect(entries).toEqual([]);
  });
});
