import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { DEFAULT_FRAMING, framingStyle, type PersonalTool, type PhotoFraming, type ToolPhoto } from "@core/personal-tools";

const STEP = 5;
const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** A photo shown framed: turned, flipped, zoomed, with its focal point in view. */
export function FramedPhoto({ photo, alt = "" }: { photo: Pick<ToolPhoto, "url" | "framing">; alt?: string }) {
  const framing = photo.framing ?? DEFAULT_FRAMING;
  const style = framingStyle(framing);
  // Turned a quarter, the photo swaps its width and height so it still fills its frame.
  const turned = framing.rotation === 90 || framing.rotation === 270;
  return (
    <img
      className={turned ? "is-turned" : undefined}
      src={photo.url}
      alt={alt}
      loading="lazy"
      draggable={false}
      style={{ objectPosition: style.objectPosition, transformOrigin: style.transformOrigin, transform: style.transform }}
    />
  );
}

/**
 * Adjust how a photo shows: rotate, flip, zoom, and the point that stays in
 * view (drag on the photo, or arrow keys). The file itself never changes.
 */
export function ToolPhotoFrame({
  toolId,
  photo,
  onSaved,
  onClose,
}: {
  toolId: string;
  photo: ToolPhoto;
  onSaved: (tool: PersonalTool) => void;
  onClose: () => void;
}) {
  const [framing, setFraming] = useState<PhotoFraming>(photo.framing ?? DEFAULT_FRAMING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const change = (next: Partial<PhotoFraming>) => setFraming((current) => ({ ...current, ...next }));
  const turn = (by: 90 | -90) => change({ rotation: (((framing.rotation + by) % 360) + 360) % 360 as PhotoFraming["rotation"] });

  /** Tab and Shift-Tab go round the dialog's own controls, never to the page behind. */
  function keepFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const stops = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, [tabindex='0']")].filter(
      (element) => !(element as HTMLButtonElement).disabled,
    );
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function aim(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    change({
      focusX: clamp(((event.clientX - box.left) / box.width) * 100),
      focusY: clamp(((event.clientY - box.top) / box.height) * 100),
    });
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    change({ focusX: clamp(framing.focusX + move[0]), focusY: clamp(framing.focusY + move[1]) });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/tools/${encodeURIComponent(toolId)}/photos/${encodeURIComponent(photo.id)}/framing`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ framing }) },
      );
      if (!response.ok) throw new Error("framing");
      onSaved(((await response.json()) as { tool: PersonalTool }).tool);
      onClose();
    } catch {
      setError("The photo couldn't be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Rendered at the page's top level: the page's columns are layout containers, which would hold a fixed overlay inside them.
  return createPortal(
    <div className="tool-frame-backdrop">
      <div
        ref={dialogRef}
        className="tool-frame"
        role="dialog"
        aria-modal="true"
        aria-label="Adjust photo"
        onKeyDown={(event) => {
          keepFocus(event);
          if (event.key === "Escape") {
            // The panel underneath stays open.
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h3>Adjust photo</h3>
        <p className="tool-frame-hint">Point to what should stay in view. The card turns and zooms around it.</p>
        {/* The whole photo as taken: the point picked here is a point on the photo. */}
        <div className="tool-frame-pick">
          <div
            className="tool-frame-photo"
            role="group"
            tabIndex={0}
            aria-label={`What stays in view: ${framing.focusX}% across, ${framing.focusY}% down. Use the arrow keys, or drag on the photo.`}
            onKeyDown={nudge}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              aim(event);
            }}
            onPointerMove={(event) => {
              if (dragging.current) aim(event);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          >
            <img src={photo.url} alt="" draggable={false} />
            <span className="tool-frame-dot" style={{ left: `${framing.focusX}%`, top: `${framing.focusY}%` }} aria-hidden="true" />
          </div>
        </div>
        <div className="tool-frame-view">
          <FramedPhoto photo={{ url: photo.url, framing }} alt="How the card will show it" />
        </div>
        <div className="tool-frame-tools">
          <button ref={firstRef} type="button" className="tool-icon-btn" aria-label="Rotate left" title="Rotate left" onClick={() => turn(-90)}>
            <RotateCcw size={17} aria-hidden="true" />
          </button>
          <button type="button" className="tool-icon-btn" aria-label="Rotate right" title="Rotate right" onClick={() => turn(90)}>
            <RotateCw size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-icon-btn"
            aria-label="Flip across"
            title="Flip across"
            aria-pressed={framing.flipH}
            onClick={() => change({ flipH: !framing.flipH })}
          >
            <FlipHorizontal2 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-icon-btn"
            aria-label="Flip up-down"
            title="Flip up-down"
            aria-pressed={framing.flipV}
            onClick={() => change({ flipV: !framing.flipV })}
          >
            <FlipVertical2 size={17} aria-hidden="true" />
          </button>
          <label className="tool-frame-zoom">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={framing.zoom}
              onChange={(event) => change({ zoom: Number(event.target.value) })}
            />
          </label>
        </div>
        {error ? (
          <p className="tool-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="tool-panel-foot">
          <button type="button" className="tools-link" onClick={() => setFraming(DEFAULT_FRAMING)}>
            Reset
          </button>
          <span className="tool-spacer" />
          <button type="button" className="tools-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="tools-btn is-primary" disabled={busy} onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
