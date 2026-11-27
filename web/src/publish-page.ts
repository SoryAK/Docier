import { preparePublicPhotos } from "./photo-data";

/**
 * Publishes the career page as the vault has it now. The photos going out are
 * read from the preview, framed, shrunk and re-encoded here first, then sent
 * with the request; one that can't be prepared is left off the page.
 * Returns the server's answer (the preview's, when the page can't be made).
 */
export async function publishCareerPage(): Promise<Response> {
  const preview = await fetch("/api/work-map/preview");
  if (!preview.ok) return preview;
  const { snapshot } = (await preview.json()) as { snapshot: Parameters<typeof preparePublicPhotos>[0] };
  const photos = await preparePublicPhotos(snapshot);
  return fetch("/api/work-map/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ photos }),
  });
}
