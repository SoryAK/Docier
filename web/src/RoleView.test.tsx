import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkMapRole } from "@core/work-map";
import { RoleView } from "./RoleView";
import { stubBrowser, useRealApp } from "./test/app-fetch";

let server: ReturnType<typeof useRealApp>;
beforeEach(() => {
  stubBrowser();
  server = useRealApp();
});
afterEach(() => {
  cleanup();
  server.close();
});

describe("a role's tabs", () => {
  it("move with the arrow keys, Home, and End, and name the panel they show", async () => {
    const roleId = await server.addRole("Giants Direct");
    const roles = ((await (await fetch("/api/work-map")).json()) as { roles: WorkMapRole[] }).roles;
    const user = userEvent.setup();
    render(<RoleView role={roles.find((item) => item.id === roleId)!} roles={roles} onSaved={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(2);
    // Only the selected tab is in the Tab order.
    expect(tabs.map((tab) => tab.tabIndex)).toEqual(tabs.map((_, index) => (index === 0 ? 0 : -1)));

    tabs[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[0]);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tabs[0]);

    const panel = screen.getByRole("tabpanel");
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id);
  });
});
