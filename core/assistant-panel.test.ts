import { describe, expect, it } from "vitest";
import {
  INITIAL_ASSISTANT,
  assistantReducer,
  chatInPanel,
  chatMenu,
  chatShowing,
  clampFloat,
  floatSize,
  readAssistantState,
  type AssistantAction,
  type AssistantState,
} from "./assistant-panel";

const run = (state: AssistantState, ...actions: AssistantAction[]) => actions.reduce(assistantReducer, state);

describe("assistant panel", () => {
  it("starts with chat closed and History in an open panel", () => {
    expect(INITIAL_ASSISTANT).toMatchObject({ chat: "closed", tab: "history", open: true });
    expect(chatShowing(INITIAL_ASSISTANT)).toBe(false);
  });

  it("opens chat in the panel the first time", () => {
    const state = run(INITIAL_ASSISTANT, "openChat");
    expect(state).toMatchObject({ chat: "docked", tab: "chat", open: true });
    expect(chatInPanel(state)).toBe(true);
  });

  it("opens the closed panel on Chat when chat is opened", () => {
    const state = run(INITIAL_ASSISTANT, "closePanel", "openChat");
    expect(state.open).toBe(true);
    expect(chatInPanel(state)).toBe(true);
  });

  it("reopens chat popped out when it was last popped out", () => {
    const state = run(INITIAL_ASSISTANT, "popOut", "closeChat");
    expect(state).toMatchObject({ chat: "closed", last: "floating" });
    expect(run(state, "openChat").chat).toBe("floating");
  });

  it("reopens chat docked when it was last docked", () => {
    const state = run(INITIAL_ASSISTANT, "openChat", "closeChat");
    expect(state).toMatchObject({ chat: "closed", last: "docked", tab: "history" });
    expect(chatInPanel(run(state, "openChat"))).toBe(true);
  });

  it("toggles chat with the chat icon", () => {
    const open = run(INITIAL_ASSISTANT, "toggleChat");
    expect(chatShowing(open)).toBe(true);
    expect(chatShowing(run(open, "toggleChat"))).toBe(false);
  });

  it("counts docked chat behind History as not showing, so the icon opens it", () => {
    const state = run(INITIAL_ASSISTANT, "openChat", "showHistory");
    expect(state.chat).toBe("docked");
    expect(chatShowing(state)).toBe(false);
    expect(chatInPanel(run(state, "toggleChat"))).toBe(true);
  });

  it("keeps popped-out chat open when the panel closes", () => {
    const state = run(INITIAL_ASSISTANT, "popOut", "closePanel");
    expect(state).toMatchObject({ chat: "floating", open: false });
    expect(chatShowing(state)).toBe(true);
  });

  it("puts History back in the panel when chat pops out", () => {
    const state = run(INITIAL_ASSISTANT, "openChat", "popOut");
    expect(state).toMatchObject({ chat: "floating", tab: "history" });
  });

  it("docks a popped-out chat into an open panel", () => {
    const state = run(INITIAL_ASSISTANT, "popOut", "closePanel", "dock");
    expect(state).toMatchObject({ chat: "docked", last: "docked", open: true, tab: "chat" });
  });

  it("offers only menu choices that change something", () => {
    expect(chatMenu(INITIAL_ASSISTANT).map((item) => item.action)).toEqual(["openChat", "popOut", "dock"]);
    expect(chatMenu(run(INITIAL_ASSISTANT, "openChat")).map((item) => item.action)).toEqual(["popOut", "closeChat"]);
    expect(chatMenu(run(INITIAL_ASSISTANT, "popOut")).map((item) => item.action)).toEqual(["dock", "closeChat"]);
    expect(chatMenu(run(INITIAL_ASSISTANT, "popOut", "closeChat"))[0].label).toBe("Open chat (popped out)");
  });

  it("reads a saved state and drops what doesn't fit", () => {
    expect(readAssistantState({ chat: "floating", last: "floating", tab: "chat", open: false, float: { x: 10, y: 20 } })).toEqual({
      chat: "floating",
      last: "floating",
      tab: "history",
      open: false,
      float: { x: 10, y: 20 },
      size: null,
      minimized: false,
    });
    expect(readAssistantState({ chat: "nope", float: { x: "a" } })).toEqual(INITIAL_ASSISTANT);
    expect(readAssistantState(null)).toEqual(INITIAL_ASSISTANT);
  });

  it("carries over the older open chat column", () => {
    expect(chatInPanel(readAssistantState(null, true))).toBe(true);
  });

  it("keeps a popped-out chat on screen", () => {
    const size = { width: 380, height: 520 };
    const screen = { width: 1000, height: 700 };
    expect(clampFloat({ x: 900, y: 600 }, size, screen)).toEqual({ x: 612, y: 172 });
    expect(clampFloat({ x: -50, y: -5 }, size, screen)).toEqual({ x: 8, y: 8 });
    expect(clampFloat({ x: 50, y: 50 }, size, { width: 300, height: 300 })).toEqual({ x: 8, y: 8 });
  });

  it("minimizes a popped-out chat and restores it with the chat icon", () => {
    const small = run(INITIAL_ASSISTANT, "popOut", "minimize");
    expect(small).toMatchObject({ chat: "floating", minimized: true });
    expect(chatShowing(small)).toBe(false);
    expect(chatMenu(small).map((item) => item.label)).toEqual(["Restore chat", "Open in the assistant panel", "Close chat"]);
    const back = run(small, "toggleChat");
    expect(back).toMatchObject({ chat: "floating", minimized: false });
  });

  it("only minimizes a popped-out chat, and docking or closing ends it", () => {
    expect(run(INITIAL_ASSISTANT, "openChat", "minimize").minimized).toBe(false);
    expect(run(INITIAL_ASSISTANT, "popOut", "minimize", "dock").minimized).toBe(false);
    const closed = run(INITIAL_ASSISTANT, "popOut", "minimize", "closeChat");
    expect(closed).toMatchObject({ chat: "closed", minimized: false });
    expect(run(INITIAL_ASSISTANT, "popOut", "minimize", "restore").minimized).toBe(false);
  });

  it("reads a saved size and a minimized chat", () => {
    const state = readAssistantState({ chat: "floating", minimized: true, size: { width: 400, height: 500 } });
    expect(state).toMatchObject({ minimized: true, size: { width: 400, height: 500 } });
    expect(readAssistantState({ chat: "docked", minimized: true, size: { width: -1, height: 5 } })).toMatchObject({ minimized: false, size: null });
  });

  it("sizes a popped-out chat to the window until it's resized", () => {
    expect(floatSize(null, { width: 1600, height: 900 })).toEqual({ width: 400, height: 594 });
    expect(floatSize(null, { width: 2560, height: 1440 })).toEqual({ width: 480, height: 760 });
    expect(floatSize(null, { width: 1000, height: 600 })).toEqual({ width: 320, height: 420 });
    expect(floatSize({ width: 600, height: 700 }, { width: 1600, height: 900 })).toEqual({ width: 600, height: 700 });
    expect(floatSize({ width: 100, height: 2000 }, { width: 1600, height: 900 })).toEqual({ width: 320, height: 884 });
    expect(floatSize(null, { width: 300, height: 300 })).toEqual({ width: 284, height: 284 });
  });
});
