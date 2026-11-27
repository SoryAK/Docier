/**
 * Tools and photos on the published career page. A tool shows only when it's
 * switched on and isn't a draft, with what an employer sees. Photos go out
 * only as image data the browser framed, shrank and re-encoded: an address
 * pointing back at this computer, or an original file, never does.
 */
import type { PersonalTool, PhotoFraming } from "./personal-tools";
import { shareTools } from "./tool-share";
import type { WorkMapMedia } from "./work-map";

/** One tool as the career page shows it. */
export type CareerPageTool = {
  id: string;
  name: string;
  makerModel: string;
  facts: Array<{ label: string; value: string }>;
  /** The page's jobs it was used on. */
  roleIds: string[];
  /** Its cover photo: a local address until published, then image data, or "". */
  photoUrl: string;
  /** How the cover is framed, for preparing it. Gone once it's published. */
  photoFraming?: PhotoFraming;
};

/** The longest one photo's image data may be. */
export const PUBLIC_PHOTO_MAX = 400_000;
/** The most image data one page may carry (the relay takes 10 MB in all). */
export const PUBLIC_PHOTOS_TOTAL_MAX = 8_000_000;

const JPEG_DATA = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const WEB_LINK = /^https?:\/\//i;

/** The chosen tools, as the page shows them, tied to the page's own jobs (so a redacted page names them as redacted). */
export function careerPageTools(
  tools: PersonalTool[],
  roles: ReadonlyArray<{ id: string; organization: string; title: string }>,
): CareerPageTool[] {
  const shown = tools.filter((tool) => tool.onCareerPage && !tool.draft);
  const byId = new Map(roles.map((role) => [role.id, role]));
  const facts = new Map(
    shareTools(shown, "employer", {
      roleName: (id) => {
        const role = byId.get(id);
        return role ? role.organization || role.title || undefined : undefined;
      },
      kitName: () => undefined,
    }).map((item) => [item.id, item]),
  );
  return shown.map((tool) => {
    const shared = facts.get(tool.id)!;
    const cover = tool.photos.find((photo) => photo.cover) ?? tool.photos[0];
    return {
      id: tool.id,
      name: shared.name,
      makerModel: shared.makerModel,
      facts: shared.facts,
      roleIds: tool.roleIds.filter((id) => byId.has(id)),
      photoUrl: cover?.url ?? "",
      ...(cover ? { photoFraming: cover.framing } : {}),
    };
  });
}

type PhotoPage = {
  roles: Array<{ media: WorkMapMedia[] }>;
  tools?: CareerPageTool[];
};

/** The photos the browser prepares before publishing: role photos kept here, and tool covers. */
export function publicPhotoJobs(page: PhotoPage): Array<{ key: string; url: string; framing: PhotoFraming | null }> {
  const jobs: Array<{ key: string; url: string; framing: PhotoFraming | null }> = [];
  for (const role of page.roles) {
    for (const item of role.media) {
      if (item.kind === "photo" && item.url && !WEB_LINK.test(item.url)) jobs.push({ key: `media:${item.id}`, url: item.url, framing: null });
    }
  }
  for (const tool of page.tools ?? []) {
    if (tool.photoUrl) jobs.push({ key: `tool:${tool.id}`, url: tool.photoUrl, framing: tool.photoFraming ?? null });
  }
  return jobs;
}

export type EmbedError = "photos-invalid" | "photos-too-large";

/**
 * The page with prepared photos built in. Web links stay as they are; every
 * other address is replaced by its prepared photo or left off. A photo is
 * used only for an item already on the page, and only as JPEG data.
 */
export function embedPublicPhotos<T extends PhotoPage>(page: T, raw: unknown): { ok: true; value: T } | { ok: false; error: EmbedError } {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) return { ok: false, error: "photos-invalid" };
  const sent = (raw ?? {}) as Record<string, unknown>;
  if (Object.values(sent).some((value) => typeof value !== "string")) return { ok: false, error: "photos-invalid" };
  let total = 0;
  const photo = (key: string): string | null => {
    const value = Object.hasOwn(sent, key) ? (sent[key] as string) : "";
    if (value.length > PUBLIC_PHOTO_MAX || !JPEG_DATA.test(value)) return null;
    total += value.length;
    return value;
  };
  const roles = page.roles.map((role) => ({
    ...role,
    media: role.media.flatMap((item) => {
      if (WEB_LINK.test(item.url)) return [item];
      if (item.kind !== "photo") return [];
      const data = photo(`media:${item.id}`);
      return data ? [{ ...item, url: data }] : [];
    }),
  }));
  const tools = page.tools?.map(({ photoFraming: _framing, ...tool }) => ({
    ...tool,
    photoUrl: tool.photoUrl ? (photo(`tool:${tool.id}`) ?? "") : "",
  }));
  if (total > PUBLIC_PHOTOS_TOTAL_MAX) return { ok: false, error: "photos-too-large" };
  return { ok: true, value: { ...page, roles, ...(tools ? { tools } : {}) } };
}
