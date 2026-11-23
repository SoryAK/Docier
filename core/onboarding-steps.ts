/** The steps of first-run onboarding, in order. */
export type OnboardingStepId = "name" | "model" | "file" | "check";

/**
 * The steps of onboarding. Verify is always there: with a model it checks what
 * was read, and without one it is where jobs and schools are added by hand.
 * Accounts are connected later, from Settings, not during onboarding.
 */
export function onboardingSteps(): OnboardingStepId[] {
  return ["name", "model", "file", "check"];
}

/** The step after `current`, or `current` when it is the last. */
export function nextOnboardingStep(steps: OnboardingStepId[], current: OnboardingStepId): OnboardingStepId {
  const index = steps.indexOf(current);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : current;
}

/** The step before `current`, or `current` when it is the first. */
export function previousOnboardingStep(steps: OnboardingStepId[], current: OnboardingStepId): OnboardingStepId {
  const index = steps.indexOf(current);
  return index > 0 ? steps[index - 1] : current;
}
