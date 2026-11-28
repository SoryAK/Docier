import { describe, expect, it } from "vitest";
import { isHiddenArea } from "./release-areas";

describe("areas left out of this release", () => {
  it("hides Opportunities and Resume Studio, and nothing else", () => {
    expect(isHiddenArea("opportunities")).toBe(true);
    expect(isHiddenArea("resumes")).toBe(true);
    for (const shown of ["home", "history", "network", "documents", "tools"]) expect(isHiddenArea(shown)).toBe(false);
  });
});
