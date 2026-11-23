import { describe, expect, it } from "vitest";
import { nextOnboardingStep, onboardingSteps, previousOnboardingStep } from "./onboarding-steps";

describe("onboarding steps", () => {
  it("shows Profile, Model, Resume, and Verify, with or without a model", () => {
    expect(onboardingSteps()).toEqual(["name", "model", "file", "check"]);
  });

  it("moves between the steps that are shown", () => {
    const steps = onboardingSteps();
    expect(nextOnboardingStep(steps, "model")).toBe("file");
    expect(previousOnboardingStep(steps, "file")).toBe("model");
    expect(previousOnboardingStep(steps, "name")).toBe("name");
    expect(nextOnboardingStep(steps, "check")).toBe("check");
  });
});
