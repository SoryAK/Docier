import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Download, Printer, X } from "lucide-react";
import { DEFAULT_FRAMING, type PersonalTool, type PhotoFraming, type ToolKit } from "@core/personal-tools";
import { SHARE_AUDIENCE_LABEL, SHARE_FILE_NAME, shareTools, toolShareHtml, type ShareAudience } from "@core/tool-share";
import type { ToolRoleChoice } from "./ToolGallery";

/** The widest a photo goes into a share page, so the file stays small. */
const PHOTO_WIDTH = 640;

/** How long one photo may take to read before the page goes on without it. */
const PHOTO_WAIT_MS = 15000;
/** How many photos are decoded at once, so a big share can't exhaust memory. */
const AT_ONCE = 3;

/**
 * A photo as image data for a share page: turned and flipped as framed, zoomed
 * in on its focal point, shrunk to card size, and re-encoded as JPEG on white.
 * Re-encoding drops what the file carried (like where it was taken). A photo
 * that can't be read or redrawn is left out: the original file is never sent.
 */
async function photoData(url: string, framing: PhotoFraming): Promise<string | null> {
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
async function fewAtATime<T>(jobs: Array<() => Promise<T>>, size: number): Promise<T[]> {
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
 * Share the tools shown (or picked) as a page to send someone: for an employer
 * or recruiter, or for a crew. It's a file you download or print; nothing is
 * put online.
 */
export function ToolShareDialog({
  tools,
  roles,
  kits,
  onClose,
}: {
  tools: PersonalTool[];
  roles: ToolRoleChoice[];
  kits: ToolKit[];
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<ShareAudience>("employer");
  const [named, setNamed] = useState(true);
  const [owner, setOwner] = useState<{ name: string; headline: string } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string> | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const shared = useMemo(
    () =>
      shareTools(tools, audience, {
        roleName: (id) => roles.find((role) => role.id === id)?.name,
        kitName: (id) => kits.find((kit) => kit.id === id)?.name,
      }),
    [tools, audience, roles, kits],
  );

  useEffect(() => {
    void fetch("/api/me")
      .then(async (response) => (response.ok ? ((await response.json()) as { profile?: { fullName?: string; headline?: string } }) : {}))
      .then((body) => setOwner({ name: body.profile?.fullName?.trim() ?? "", headline: body.profile?.headline?.trim() ?? "" }))
      .catch(() => setOwner({ name: "", headline: "" }));
  }, []);

  // Cover photos, read once and shrunk to card size.
  useEffect(() => {
    let live = true;
    void fewAtATime(
      tools
        .filter((tool) => !tool.draft && tool.photos.length)
        .map((tool) => async () => {
          const cover = tool.photos.find((photo) => photo.cover) ?? tool.photos[0]!;
          return [tool.id, await photoData(cover.url, cover.framing ?? DEFAULT_FRAMING)] as const;
        }),
      AT_ONCE,
    ).then((pairs) => {
      if (live) setPhotos(Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== null)));
    });
    return () => {
      live = false;
    };
  }, [tools]);

  const ready = photos !== null && owner !== null;
  const month = new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
  const html = useMemo(
    () =>
      ready
        ? toolShareHtml({ audience, tools: shared, photos: photos ?? {}, owner: named && (owner?.name || owner?.headline) ? owner : null, month })
        : "",
    [ready, audience, shared, photos, named, owner, month],
  );

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = SHARE_FILE_NAME[audience];
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Dialog
      isOpen
      className="tool-share"
      aria-label="Share your tools"
      purpose="form"
      width="min(56rem, calc(100vw - 2rem))"
      maxHeight="min(88dvh, 46rem)"
      padding={0}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="tool-share-body">
        <div className="tool-share-head">
          <h2>Share your tools</h2>
          <button type="button" className="tool-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <p className="tool-share-note">
          A page you download or print to send someone. Serial numbers, prices, where things are kept, notes, and drafts never go
          on it.
        </p>
        <fieldset className="tool-share-who">
          <legend>Who it's for</legend>
          {(Object.keys(SHARE_AUDIENCE_LABEL) as ShareAudience[]).map((key) => (
            <label key={key}>
              <input type="radio" name="share-audience" value={key} checked={audience === key} onChange={() => setAudience(key)} />
              {SHARE_AUDIENCE_LABEL[key]}
              <small>{key === "employer" ? "What you use, how well, and the jobs you used it on." : "What you have, its condition, and its kits."}</small>
            </label>
          ))}
        </fieldset>
        <label className="tool-share-named">
          <input type="checkbox" checked={named} onChange={(event) => setNamed(event.target.checked)} />
          Put my name on it
        </label>
        {shared.length === 0 ? (
          <p className="tools-empty">Nothing to share yet. Tools still needing details stay off share pages; fill them in first.</p>
        ) : !ready ? (
          <p className="tools-empty" role="status">
            Getting the page ready…
          </p>
        ) : (
          <>
            {/*
              A preview with no scripts: the page is only text and image data. Same-origin
              is what lets Print reach it. Never add allow-scripts here: with same-origin,
              a script in the page would have this app's full access.
            */}
            <iframe ref={frameRef} className="tool-share-preview" title="Share page preview" sandbox="allow-same-origin allow-modals" srcDoc={html} />
            <div className="tool-share-actions">
              <span className="tools-muted">{shared.length === 1 ? "1 tool" : `${shared.length} tools`}</span>
              <span className="tool-spacer" />
              <button type="button" className="tools-btn" onClick={() => frameRef.current?.contentWindow?.print()}>
                <Printer size={15} aria-hidden="true" />
                Print or save as PDF
              </button>
              <button type="button" className="tools-btn is-primary" onClick={download}>
                <Download size={15} aria-hidden="true" />
                Download page
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
