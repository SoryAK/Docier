import { describe, expect, it } from "vitest";
import { describeModelFailure } from "./model-failure";

describe("describing a model failure", () => {
  it.each([
    ["Cannot connect to API: other side closed", "stopped"],
    ["socket hang up", "stopped"],
    ["fetch failed: connect ECONNREFUSED 127.0.0.1:11434", "unreachable"],
    ['model "big:27b" not found, try pulling it first', "model-missing"],
    ["401 Unauthorized: invalid api key", "key-refused"],
    ["timeout", "too-slow"],
    ["something else entirely", "failed"],
  ])("reads %j as %s", (raw, kind) => {
    expect(describeModelFailure(new Error(raw)).kind).toBe(kind);
  });

  it("says what to do, not what the server said", () => {
    const failure = describeModelFailure(new Error("Cannot connect to API: other side closed"));
    expect(failure.message).not.toContain("other side closed");
    expect(failure.message).toContain("memory");
  });
});
