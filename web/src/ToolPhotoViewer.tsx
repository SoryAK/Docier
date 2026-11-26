import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ToolPhoto } from "@core/personal-tools";

/**
 * A tool's photos full size, as taken (framing is for cards). Previous / Next and
 * the arrow keys move between them; Escape or Close closes only this view.
 */
export function ToolPhotoViewer({ photos, start, onClose }: { photos: ToolPhoto[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(Math.min(Math.max(start, 0), photos.length - 1));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = photos.length > 1;
  const photo = photos[at];

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const move = (by: number) => setAt((current) => (current + by + photos.length) % photos.length);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // The panel underneath stays open.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (many && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Tab" && dialogRef.current) {
      // Tab goes round the view's own buttons, never to the page behind.
      const stops = [...dialogRef.current.querySelectorAll<HTMLElement>("button")];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  if (!photo) return null;
  // Rendered at the page's top level: the page's columns are layout containers, which would hold a fixed overlay inside them.
  return createPortal(
    <div className="tool-viewer-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="tool-viewer" role="dialog" aria-modal="true" aria-label="Photo" onKeyDown={onKeyDown}>
        <div className="tool-viewer-head">
          <span aria-live="polite">{many ? `Photo ${at + 1} of ${photos.length}` : "Photo"}</span>
          <button ref={closeRef} type="button" className="tool-viewer-btn" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <img src={photo.url} alt={`Photo ${at + 1}`} />
        {many ? (
          <>
            <button type="button" className="tool-viewer-btn is-prev" aria-label="Previous photo" onClick={() => move(-1)}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button type="button" className="tool-viewer-btn is-next" aria-label="Next photo" onClick={() => move(1)}>
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
