import { publicPhotoJobs, type CareerPageTool } from "@core/career-page";
import { DEFAULT_FRAMING, type PhotoFraming } from "@core/personal-tools";
import type { WorkMapMedia } from "@core/work-map";

/** The widest a photo goes onto a share page or the career page, so the page stays small. */
const PHOTO_WIDTH = 640;

/** How long one photo may take to read before the page goes on without it. */
const PHOTO_WAIT_MS = 15000;
/** How many photos are decoded at once, so a big share can't exhaust memory. */
export const AT_ONCE = 3;

/**
 * A photo as image data for a page that leaves this computer: turned and flipped as framed, zoomed
 * in on its focal point, shrunk to card size, and re-encoded as JPEG on white.
 * Re-encoding drops what the file carried (like where it was taken). A photo
 * that can't be read or redrawn is left out: the original file is never sent.
 */
export async function photoData(url: string, framing: PhotoFraming): Promise<string | null> {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), PHOTO_WAIT_MS);
  let bitmap: ImageBitmap | null = null;
  try {
    const response = await fetch(url, { signal: stop.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return null;
    bitmap = await createImageBitmap(blob);
    const turned = framing.rotation === 90 || framing.rotation === 270;
    const fullWidth = turned ? bitmap.height : bitmap.width;
    const fullHeight = turned ? bitmap.width : bitmap.height;
    // Zoomed in: keep the part around the focal point, as the card shows it.
    const zoom = Math.max(1, framing.zoom || 1);
    const keepWidth = fullWidth / zoom;
    const keepHeight = fullHeight / zoom;
    const left = Math.min(Math.max((framing.focusX / 100) * fullWidth - keepWidth / 2, 0), fullWidth - keepWidth);
    const top = Math.min(Math.max((framing.focusY / 100) * fullHeight - keepHeight / 2, 0), fullHeight - keepHeight);
    const scale = Math.min(1, PHOTO_WIDTH / keepWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(keepWidth * scale));
    canvas.height = Math.max(1, Math.round(keepHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // White first, so a see-through photo isn't black once it's a JPEG.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.translate(fullWidth / 2 - left, fullHeight / 2 - top);
    // The same order as on the card: flips, then the turn.
    context.scale(framing.flipH ? -1 : 1, framing.flipV ? -1 : 1);
    context.rotate((framing.rotation * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    bitmap?.close();
  }
}

/** Runs the jobs a few at a time, in order. */
export async function fewAtATime<T>(jobs: Array<() => Promise<T>>, size: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const at = next;
      next += 1;
      results[at] = await jobs[at]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
  return results;
}

/**
 * The career page's photos, prepared for publishing: each role photo kept on
 * this computer and each shown tool's cover, by the key the server looks for.
 * A photo that can't be prepared is left out, so the page goes without it.
 */
export async function preparePublicPhotos(page: { roles: Array<{ media: WorkMapMedia[] }>; tools?: CareerPageTool[] }): Promise<Record<string, string>> {
  const jobs = publicPhotoJobs(page);
  const done = await fewAtATime(
    jobs.map((job) => async () => [job.key, await photoData(job.url, job.framing ?? DEFAULT_FRAMING)] as const),
    AT_ONCE,
  );
  return Object.fromEntries(done.filter((pair): pair is readonly [string, string] => pair[1] !== null));
}
