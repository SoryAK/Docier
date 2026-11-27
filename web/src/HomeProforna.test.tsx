import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFloatingBox } from "./HomeProforna";

const realSize = { width: window.innerWidth, height: window.innerHeight };
const setWindow = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
};
afterEach(() => setWindow(realSize.width, realSize.height));

describe("the popped-out chat", () => {
  it("opens inside the window even if the window shrank while it was docked", () => {
    setWindow(1600, 900);
    const { result, rerender } = renderHook(({ active }) => useFloatingBox(active, null, null, () => {}, () => {}), {
      initialProps: { active: false },
    });
    // Resized while docked (no resize listener runs then), then popped out.
    setWindow(1000, 600);
    rerender({ active: true });
    const { left, top, width, height } = result.current.style;
    expect(left + width).toBeLessThanOrEqual(1000);
    expect(top + height).toBeLessThanOrEqual(600);
  });
});
