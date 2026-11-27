import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Download, Printer, X } from "lucide-react";
import type { PersonalTool, ToolKit } from "@core/personal-tools";
import { SHARE_AUDIENCE_LABEL, SHARE_FILE_NAME, shareTools, toolShareHtml, type ShareAudience } from "@core/tool-share";
import type { ToolRoleChoice } from "./ToolGallery";

/** The widest a photo goes into a share page, so the file stays small. */
const PHOTO_WIDTH = 640;

/** A photo as image data, shrunk to card size; as it is when it can't be shrunk; null when it can't be read. */
async function photoData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return null;
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, PHOTO_WIDTH / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch {
      // Can't be shrunk here: it goes in as it is.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      return `data:${blob.type};base64,${btoa(binary)}`;
    }
  } catch {
    return null;
  }
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
    void Promise.all(
      tools
        .filter((tool) => !tool.draft && tool.photos.length)
        .map(async (tool) => {
          const cover = tool.photos.find((photo) => photo.cover) ?? tool.photos[0]!;
          return [tool.id, await photoData(cover.url)] as const;
        }),
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
        ? toolShareHtml({ audience, tools: shared, photos: photos ?? {}, owner: named && owner?.name ? owner : null, month })
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
          <p className="tools-empty">Getting the page ready…</p>
        ) : (
          <>
            {/* A preview with no scripts: the page is only text and image data. */}
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
