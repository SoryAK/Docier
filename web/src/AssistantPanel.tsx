import { useEffect, useId, useRef, useState } from "react";
import {
  chatMenu,
  chatShowing,
  type AssistantAction,
  type AssistantState,
} from "@core/assistant-panel";
import { ChevronDown, PanelRight, PictureInPicture2, X } from "lucide-react";
import { Icon } from "./HomeNav";
import "./assistant-panel.css";

/**
 * The top bar's chat icon, with its menu, and the assistant panel button. The
 * chat icon is shaded while chat is open and closes or reopens it the way it was
 * last used; the menu has the other choices.
 */
export function AssistantTools({
  state,
  onAssist,
}: {
  state: AssistantState;
  onAssist: (action: AssistantAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const open = chatShowing(state);
  const panelOpen = state.open;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <span className="assistant-tools">
      <span className={open ? "assistant-chat-tool is-current" : "assistant-chat-tool"} ref={wrap}>
        <button
          type="button"
          className="home-notice-btn assistant-chat-btn"
          aria-label={open ? "Close chat" : "Open chat"}
          title={open ? "Close chat" : "Open chat"}
          aria-pressed={open}
          onClick={() => {
            setMenuOpen(false);
            onAssist("toggleChat");
          }}
        >
          <Icon name="chat" />
        </button>
        <button
          type="button"
          className="home-notice-btn assistant-chat-caret"
          aria-label="Chat options"
          title="Chat options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {menuOpen ? (
          <span className="assistant-menu" role="menu" id={menuId} aria-label="Chat options">
            {chatMenu(state).map((item) => (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onAssist(item.action);
                }}
              >
                {item.label}
              </button>
            ))}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className={panelOpen ? "home-notice-btn home-proforna-toggle is-current" : "home-notice-btn home-proforna-toggle"}
        aria-label={panelOpen ? "Close the assistant panel" : "Open the assistant panel"}
        title={panelOpen ? "Close the assistant panel" : "Open the assistant panel"}
        aria-pressed={panelOpen}
        onClick={() => onAssist("togglePanel")}
      >
        <Icon name={panelOpen ? "panel" : "panelOff"} />
      </button>
    </span>
  );
}

/**
 * The top of the assistant panel: a History | Chat switch, a pop-out button while
 * chat is showing, and a button that closes the panel.
 */
export function AssistantPanelHead({
  tab,
  historyLabel,
  chatPopped,
  onAssist,
}: {
  tab: "history" | "chat";
  /** "History" beside a role, "Updates" beside the story. */
  historyLabel: string;
  chatPopped: boolean;
  onAssist: (action: AssistantAction) => void;
}) {
  return (
    <div className="assistant-head">
      <span className="assistant-switch" role="group" aria-label="Assistant panel">
        <button type="button" aria-pressed={tab === "history"} onClick={() => onAssist("showHistory")}>
          {historyLabel}
        </button>
        <button
          type="button"
          aria-pressed={tab === "chat"}
          title={chatPopped ? "Bring chat back here" : undefined}
          onClick={() => onAssist("dock")}
        >
          Chat
        </button>
      </span>
      <span className="assistant-head-icons">
        {chatPopped ? <span className="assistant-hint">Chat is popped out</span> : null}
        {tab === "chat" ? (
          <button type="button" className="assistant-icon" title="Pop out chat" aria-label="Pop out chat" onClick={() => onAssist("popOut")}>
            <PictureInPicture2 size={16} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="assistant-icon"
          title="Close the assistant panel"
          aria-label="Close the assistant panel"
          onClick={() => onAssist("closePanel")}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

/** The popped-out chat's own top: its name, a dock button, and close. */
export function FloatingChatHead({
  onAssist,
  onGrab,
}: {
  onAssist: (action: AssistantAction) => void;
  onGrab: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="assistant-float-head" onPointerDown={onGrab}>
      <span className="assistant-float-title">
        <span className="assistant-float-dot" aria-hidden="true" />
        Chat
      </span>
      <span className="assistant-head-icons">
        <button type="button" className="assistant-icon" title="Dock in the assistant panel" aria-label="Dock in the assistant panel" onClick={() => onAssist("dock")}>
          <PanelRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="assistant-icon" title="Close chat" aria-label="Close chat" onClick={() => onAssist("closeChat")}>
          <X size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
