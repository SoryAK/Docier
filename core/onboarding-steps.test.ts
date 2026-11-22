import { describe, expect, it } from "vitest";
import { nextOnboardingStep, onboardingSteps, previousOnboardingStep } from "./onboarding-steps";

describe("onboarding steps", () => {
  it("leaves Integrations out when no account can be connected", () => {
    expect(onboardingSteps({ canConnect: false })).toEqual(["name", "model", "file", "check"]);
    expect(onboardingSteps({ canConnect: true })).toEqual(["name", "model", "integrations", "file", "check"]);
  });

  it("moves between the steps that are shown", () => {
    const steps = onboardingSteps({ canConnect: false });
    expect(nextOnboardingStep(steps, "model")).toBe("file");
    expect(previousOnboardingStep(steps, "file")).toBe("model");
    expect(previousOnboardingStep(steps, "name")).toBe("name");
    expect(nextOnboardingStep(steps, "check")).toBe("check");
  });
});
