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
};

export type AssistantAction =
  | "openChat"
  | "closeChat"
  | "toggleChat"
  | "popOut"
  | "dock"
  | "showHistory"
  | "closePanel"
  | "togglePanel";

export const INITIAL_ASSISTANT: AssistantState = {
  chat: "closed",
  last: "docked",
  tab: "history",
  open: true,
  float: null,
};

/** Chat can be seen: popped out, or docked and showing in an open panel. */
export function chatShowing(state: AssistantState): boolean {
  return state.chat === "floating" || chatInPanel(state);
}

/** Chat is what the assistant panel shows right now. */
export function chatInPanel(state: AssistantState): boolean {
  return state.chat === "docked" && state.open && state.tab === "chat";
}

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action) {
    case "openChat":
      return state.last === "floating"
        ? { ...state, chat: "floating" }
        : { ...state, chat: "docked", open: true, tab: "chat" };
    case "closeChat":
      if (state.chat === "floating") return { ...state, chat: "closed", last: "floating" };
      if (state.chat === "docked") return { ...state, chat: "closed", last: "docked", tab: "history" };
      return state;
    case "toggleChat":
      return assistantReducer(state, chatShowing(state) ? "closeChat" : "openChat");
    case "popOut":
      return { ...state, chat: "floating", last: "floating", tab: "history" };
    case "dock":
      return { ...state, chat: "docked", last: "docked", open: true, tab: "chat" };
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
    items.push({ action: "openChat", label: state.last === "floating" ? "Open chat (popped out)" : "Open chat" });
  }
  if (state.chat !== "floating") items.push({ action: "popOut", label: "Pop out chat" });
  if (!chatInPanel(state)) items.push({ action: "dock", label: "Open in the assistant panel" });
  if (chatShowing(state)) items.push({ action: "closeChat", label: "Close chat" });
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
  return { chat, last, tab, open, float };
}

function readPoint(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
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
