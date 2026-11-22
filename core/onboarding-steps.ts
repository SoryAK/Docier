/** The steps of first-run onboarding, in order. */
export type OnboardingStepId = "name" | "model" | "integrations" | "file" | "check";

/**
 * The steps this occupant will actually see. Integrations shows only when at
 * least one account can be signed into; a step with nothing to do is left out
 * of the progress bar and skipped.
 */
export function onboardingSteps(input: { canConnect: boolean }): OnboardingStepId[] {
  return ["name", "model", ...(input.canConnect ? (["integrations"] as const) : []), "file", "check"];
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
