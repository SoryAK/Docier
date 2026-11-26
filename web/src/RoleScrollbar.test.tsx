import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoleScrollbar } from "./RoleScrollbar";

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as never;
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as never;
  Element.prototype.setPointerCapture ??= function setPointerCapture() {};
});
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** A 600px card over 1800px of content, with a banner whose bottom starts 200px down and scrolls away. */
function Card() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={(el) => {
          (ref as { current: HTMLDivElement | null }).current = el;
          if (!el) return;
          Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
          Object.defineProperty(el, "scrollHeight", { value: 1800, configurable: true });
          el.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 400, width: 400, height: 600 }) as DOMRect;
        }}
        data-testid="card"
      >
        <div
          className="role-view-banner"
          ref={(banner) => {
            if (!banner) return;
            banner.getBoundingClientRect = () => {
              const scrolled = banner.parentElement!.scrollTop;
              return { top: -scrolled, bottom: 200 - scrolled, left: 0, right: 400, width: 400, height: 200 } as DOMRect;
            };
          }}
        />
      </div>
      <RoleScrollbar scroller={ref} />
    </>
  );
}

describe("the role card's scroll bar", () => {
  it("keeps scrolling down while dragged down, as the banner moves away", () => {
    const { getByTestId } = render(<Card />);
    const card = getByTestId("card");
    const thumb = document.querySelector<HTMLElement>(".role-scrollbar")!;
    expect(thumb).toBeTruthy();
    fireEvent.pointerDown(thumb, { button: 0, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(thumb, { clientY: 428, pointerId: 1 });
    const first = card.scrollTop;
    expect(first).toBe(600);
    // The page scrolled, so the bar measures again with the banner gone.
    fireEvent.scroll(card);
    fireEvent.pointerMove(document.querySelector<HTMLElement>(".role-scrollbar")!, { clientY: 440, pointerId: 1 });
    expect(card.scrollTop).toBeGreaterThan(first);
  });
});
