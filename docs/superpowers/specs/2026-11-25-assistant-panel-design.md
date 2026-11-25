# The assistant panel and pop-out chat

## Why

The right side of the home screen held either History (Recent on the story) or
a separate chat column, and a single "Show chat" button switched between them.
Chat couldn't stay open while you looked at a role's History, and closing the
panel closed chat too. The pop-out chat lets you keep a conversation open over
whatever page you're on, the way a site's help chat floats in the corner.

## Names

- **Assistant panel:** the card on the right. It switches between History
  (Updates beside the story) and Chat.
- **Chat:** the conversation. It can sit in the assistant panel, pop out, or be
  closed. "Docier" is only ever the app's name.

## The design (as decided, from the clickable mockup)

- **Top bar:** a chat icon (a speech bubble with a small spark) is shaded while
  chat is open. Clicking it closes chat, or reopens it the way it was last used
  (docked or popped out). A ▾ beside it lists only the choices that change
  something: Open chat, Pop out chat, Open in the assistant panel, Close chat.
  Next to it, a panel button opens and closes the assistant panel.
- **Assistant panel:** its top has a History | Chat switch (Updates | Chat on the
  story) and ✕ to close the panel. While Chat is showing there's also a pop-out
  button. While chat is popped out, the panel says "Chat is popped out", and its
  Chat tab brings chat back.
- **Popped out:** a window at the bottom right at first, dragged by its top and
  kept on screen. It starts sized to the window: a quarter of its width (320 to
  480 px) and two thirds of its height (420 to 760 px). Dragging any edge or
  corner resizes it (320 × 360 at the smallest, 720 × 960 at the largest), and
  the opposite edge stays put. It has minimize, dock, and ✕. ✕ closes chat but
  keeps the conversation. It stays open when the panel closes or the page
  changes. On phones it fills the screen.
- **Minimized:** chat shrinks to a small "Chat" bar at the bottom right. Clicking
  the bar, its restore button, or the chat icon brings it back as it was. The ▾
  menu offers "Restore chat".
- **Closed panel:** the main card takes its width.
- Switching between History and Chat moves nothing else. On screens wider than
  800 px, docked chat lies over History's own place, which stays laid out
  underneath and hidden. Chat follows that place's position and size, and is
  cut off at the center card's edges when History sits below the main content
  and scrolls. On phones, docked chat takes a row of its own as before.
- The last state (where chat is, how it was last open, the panel's tab, whether
  the panel is open, whether chat is minimized, and the popped-out position and
  size) is remembered in the browser.
  The older "chat column open" choice carries over once.

## Approaches

1. **Keep the chat mounted in one place and move it with CSS** (chosen). The
   chat component never remounts, so the conversation, draft, and scroll
   survive every move. History stays where it was in the center layout.
2. Render chat into the panel or the floating window through portals. This
   remounts the thread on each move, and History would have to move out of the
   center to share the panel.
3. Lift all chat state into Home. This is a large refactor for the same result.

## Where it lives

- `core/assistant-panel.ts`: the state, its actions, the menu's choices, reading
  saved state, and keeping the window on screen (tested).
- `web/src/AssistantPanel.tsx` and `assistant-panel.css`: the top-bar tools, the
  panel's top, and the popped-out chat's top.
- `HomeProforna` takes `place` (closed, docked, or floating) in place of `open`.
