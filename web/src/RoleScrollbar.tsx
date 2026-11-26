import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

type Bar = { left: number; top: number; height: number; thumbTop: number; thumbHeight: number };

const EDGE = 6; // space from the card's edges
const BELOW_BANNER = 10; // space under the banner before the bar starts
const MIN_THUMB = 32;

/**
 * A thin scroll bar for a role's card, drawn over it. It starts under the banner,
 * not beside it, rises as the banner scrolls away, shows while scrolling or when
 * the card is pointed at, and can be dragged. The card's own bar is hidden.
 */
export function RoleScrollbar({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const [bar, setBar] = useState<Bar | null>(null);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sleep = useRef<number | undefined>(undefined);
  // A drag keeps the scale it started with: the bar's length changes as the banner
  // scrolls away, and re-reading it mid-drag would move the page back while the
  // pointer moves on.
  const drag = useRef<{ startY: number; startScroll: number; room: number; travel: number } | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 801px)");

    const measure = () => {
      if (!wide.matches || el.scrollHeight <= el.clientHeight + 1) {
        setBar(null);
        return;
      }
      const box = el.getBoundingClientRect();
      const banner = el.querySelector<HTMLElement>(".role-view-banner")?.getBoundingClientRect();
      const top = Math.max(box.top + EDGE, banner ? banner.bottom + BELOW_BANNER : box.top + EDGE);
      const bottom = box.bottom - EDGE;
      const height = bottom - top;
      if (height < MIN_THUMB * 2) {
        setBar(null);
        return;
      }
      const thumbHeight = Math.max(MIN_THUMB, (el.clientHeight / el.scrollHeight) * height);
      const travel = el.scrollHeight - el.clientHeight;
      const thumbTop = top + (travel > 0 ? (el.scrollTop / travel) * (height - thumbHeight) : 0);
      setBar({ left: box.right - EDGE - 6, top, height, thumbTop, thumbHeight });
    };

    const wake = () => {
      setAwake(true);
      window.clearTimeout(sleep.current);
      sleep.current = window.setTimeout(() => setAwake(false), 900);
    };
    const onScroll = () => {
      measure();
      wake();
    };

    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerenter", wake);
    el.addEventListener("pointermove", wake);
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    if (el.firstElementChild) resized.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerenter", wake);
      el.removeEventListener("pointermove", wake);
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
      resized.disconnect();
      window.clearTimeout(sleep.current);
    };
  }, [scroller]);

  if (!bar) return null;

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const el = scroller.current;
    if (!el) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startY: event.clientY,
      startScroll: el.scrollTop,
      room: bar ? bar.height - bar.thumbHeight : 0,
      travel: el.scrollHeight - el.clientHeight,
    };
    setDragging(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const el = scroller.current;
    if (!el || !drag.current) return;
    const { room, travel, startScroll, startY } = drag.current;
    if (room <= 0) return;
    el.scrollTop = startScroll + ((event.clientY - startY) / room) * travel;
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  return createPortal(
    <div
      className={awake || dragging ? "role-scrollbar is-awake" : "role-scrollbar"}
      style={{ left: bar.left, top: bar.thumbTop, height: bar.thumbHeight }}
      aria-hidden="true"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => setAwake(true)}
    />,
    document.body,
  );
}
