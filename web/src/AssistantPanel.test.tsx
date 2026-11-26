import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { INITIAL_ASSISTANT } from "@core/assistant-panel";
import { AssistantTools } from "./AssistantPanel";

afterEach(cleanup);

describe("the Chat options menu", () => {
  it("returns focus to its button when Escape closes it", async () => {
    const user = userEvent.setup();
    render(<AssistantTools state={INITIAL_ASSISTANT} onAssist={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    const item = screen.getAllByRole("menuitem")[0]!;
    item.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chat options" }));
  });
});
