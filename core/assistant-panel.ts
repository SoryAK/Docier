/**
 * The assistant panel and its chat.
 *
 * The assistant panel is the card at the right of the home screen. It switches
 * between History (Recent on the story) and Chat. Chat can also pop out into a
 * floating window that stays open whatever the page or the panel does, or be
 * closed; closing never loses the conversation.
 */

export type ChatPlace = "closed" | "docked" | "floating";
export type PanelTab = "history" | "chat";

export type AssistantState = {
  /** Where chat is: closed, docked in the assistant panel, or popped out. */
  chat: ChatPlace;
  /** How chat was last open, so reopening it brings it back the same way. */
  last: "docked" | "floating";
  /** What the assistant panel shows. Chat only shows there while it's docked. */
  tab: PanelTab;
  /** Whether the assistant panel is showing at all. */
  open: boolean;
  /** Where the popped-out chat sits; null puts it at the bottom right. */
  float: { x: number; y: number } | null;
  /** The popped-out chat's size once resized; null sizes it to the window. */
  size: { width: number; height: number } | null;
  /** The popped-out chat is down to a bar at the bottom right. */
  minimized: boolean;
};

export type AssistantAction =
  | "openChat"
  | "closeChat"
  | "toggleChat"
  | "popOut"
  | "dock"
  | "showHistory"
  | "closePanel"
  | "togglePanel"
  | "minimize"
  | "restore";

export const INITIAL_ASSISTANT: AssistantState = {
  chat: "closed",
  last: "docked",
  tab: "history",
  open: true,
  float: null,
  size: null,
  minimized: false,
};

/** Chat can be seen: popped out, or docked and showing in an open panel. */
export function chatShowing(state: AssistantState): boolean {
  return (state.chat === "floating" && !state.minimized) || chatInPanel(state);
}

/** Chat is what the assistant panel shows right now. */
export function chatInPanel(state: AssistantState): boolean {
  return state.chat === "docked" && state.open && state.tab === "chat";
}

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  const next = step(state, action);
  return next.minimized && next.chat !== "floating" ? { ...next, minimized: false } : next;
}

function step(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action) {
    case "openChat":
      return state.last === "floating" || state.chat === "floating"
        ? { ...state, chat: "floating", minimized: false }
        : { ...state, chat: "docked", open: true, tab: "chat" };
    case "closeChat":
      if (state.chat === "floating") return { ...state, chat: "closed", last: "floating", minimized: false };
      if (state.chat === "docked") return { ...state, chat: "closed", last: "docked", tab: "history" };
      return state;
    case "toggleChat":
      return assistantReducer(state, chatShowing(state) ? "closeChat" : "openChat");
    case "popOut":
      return { ...state, chat: "floating", last: "floating", tab: "history", minimized: false };
    case "dock":
      return { ...state, chat: "docked", last: "docked", open: true, tab: "chat", minimized: false };
    case "minimize":
      return state.chat === "floating" ? { ...state, minimized: true } : state;
    case "restore":
      return { ...state, minimized: false };
    case "showHistory":
      return { ...state, tab: "history" };
    case "closePanel":
      return { ...state, open: false };
    case "togglePanel":
      return { ...state, open: !state.open };
  }
}

export type ChatMenuItem = { action: AssistantAction; label: string };

/** The choices under the chat icon's menu, only those that would change something. */
export function chatMenu(state: AssistantState): ChatMenuItem[] {
  const items: ChatMenuItem[] = [];
  if (!chatShowing(state)) {
    const label = state.minimized
      ? "Restore chat"
      : state.last === "floating"
        ? "Open chat (popped out)"
        : "Open chat";
    items.push({ action: "openChat", label });
  }
  if (state.chat !== "floating") items.push({ action: "popOut", label: "Pop out chat" });
  if (!chatInPanel(state)) items.push({ action: "dock", label: "Open in the assistant panel" });
  if (chatShowing(state) || state.minimized) items.push({ action: "closeChat", label: "Close chat" });
  return items;
}

/**
 * Reads a saved state, keeping only what makes sense. `legacyChatOpen` is the
 * older saved choice of whether the chat column was open.
 */
export function readAssistantState(raw: unknown, legacyChatOpen = false): AssistantState {
  if (!raw || typeof raw !== "object") {
    return legacyChatOpen ? { ...INITIAL_ASSISTANT, chat: "docked", tab: "chat" } : INITIAL_ASSISTANT;
  }
  const value = raw as Record<string, unknown>;
  const chat: ChatPlace = value.chat === "docked" || value.chat === "floating" ? value.chat : "closed";
  const last = value.last === "floating" ? "floating" : "docked";
  const tab: PanelTab = value.tab === "chat" && chat === "docked" ? "chat" : "history";
  const open = value.open !== false;
  const float = readPoint(value.float);
  const size = readSize(value.size);
  const minimized = chat === "floating" && value.minimized === true;
  return { chat, last, tab, open, float, size, minimized };
}

function readPoint(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function readSize(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : null;
}

export const FLOAT_MIN = { width: 320, height: 360 };
const FLOAT_MAX = { width: 720, height: 960 };

/**
 * The popped-out chat's size: as it was resized, or a share of the window
 * (about a quarter of its width and two thirds of its height) when it hasn't
 * been. Either way it stays between a smallest and largest size and fits the window.
 */
export function floatSize(
  saved: { width: number; height: number } | null,
  screen: { width: number; height: number },
  margin = 8,
): { width: number; height: number } {
  const wanted = saved ?? {
    width: Math.min(480, Math.max(FLOAT_MIN.width, screen.width * 0.25)),
    height: Math.min(760, Math.max(FLOAT_MIN.height + 60, screen.height * 0.66)),
  };
  const fit = (value: number, min: number, max: number, room: number) =>
    Math.round(Math.min(room, Math.max(min, Math.min(max, value))));
  return {
    width: fit(wanted.width, FLOAT_MIN.width, FLOAT_MAX.width, screen.width - margin * 2),
    height: fit(wanted.height, FLOAT_MIN.height, FLOAT_MAX.height, screen.height - margin * 2),
  };
}

/** Keeps a popped-out chat of this size on screen, with a margin all round. */
export function clampFloat(
  point: { x: number; y: number },
  size: { width: number; height: number },
  screen: { width: number; height: number },
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, screen.width - size.width - margin);
  const maxY = Math.max(margin, screen.height - size.height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, point.x)),
    y: Math.min(maxY, Math.max(margin, point.y)),
  };
}
