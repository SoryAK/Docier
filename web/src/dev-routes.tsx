// Prototypes stay on each developer's machine and are never imported by the app.

function hashPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

/** In development, `#onboarding` reopens the real onboarding for review. */
export function readReviewOnboarding(): boolean {
  if (!import.meta.env.DEV) return false;
  return hashPath() === "onboarding";
}

/**
 * In development, `#welcome` shows the welcome card, `#tour` starts the tour,
 * and `?empty` (as in `#tour?empty`) shows the short version for little data.
 * Nothing is saved from a preview, so it never changes the real first run.
 */
export function readTourPreview(): { mode: "welcome" | "tour"; empty: boolean } | null {
  if (!import.meta.env.DEV) return null;
  const path = hashPath();
  if (path !== "welcome" && path !== "tour") return null;
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  return { mode: path, empty: query.has("empty") };
}
