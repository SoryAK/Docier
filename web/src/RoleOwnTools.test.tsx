import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoleOwnTools } from "./RoleOwnTools";
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

const addTool = async (name: string, roleIds: string[], fields: Record<string, unknown> = {}) =>
  fetch("/api/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, roleIds, ...fields }) });

describe("a role's own tools", () => {
  it("says when the tools couldn't be read, and reads them again on Try again", async () => {
    const roleId = await server.addRole("Giants Direct");
    await addTool("Drill", [roleId]);
    server.failWhen((method, path) => method === "GET" && path === "/api/tools");
    const user = userEvent.setup();
    render(<RoleOwnTools roleId={roleId} />);
    expect(await screen.findByText("Your tools couldn't be read.")).toBeTruthy();
    expect(screen.queryByText(/None linked yet/)).toBeNull();
    server.failWhen(null);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Drill")).toBeTruthy();
  });

  it("doesn't show the last role's tools while a new role's are read", async () => {
    const first = await server.addRole("Giants Direct");
    const second = await server.addRole("Acme");
    await addTool("Drill", [first]);
    const { rerender } = render(<RoleOwnTools roleId={first} />);
    expect(await screen.findByText("Drill")).toBeTruthy();
    server.failWhen((method, path) => method === "GET" && path === "/api/tools");
    rerender(<RoleOwnTools roleId={second} />);
    expect(screen.queryByText("Drill")).toBeNull();
  });

  it("marks the tools this job shows on your career page", async () => {
    const roleId = await server.addRole("Giants Direct");
    await addTool("Drill", [roleId], { onCareerPage: true });
    await addTool("Saw", [roleId]);
    await addTool("Level", [roleId], { onCareerPage: true });
    // Drafts come from photos; this one is made a draft directly.
    server.db.prepare("UPDATE personal_tools SET draft = 1 WHERE name = 'Level'").run();
    render(<RoleOwnTools roleId={roleId} />);
    const item = (name: string) => screen.getByText(name).closest("li")!;
    expect(await screen.findByText("Drill")).toBeTruthy();
    expect(item("Drill").textContent).toContain("On your career page");
    expect(item("Saw").textContent).not.toContain("On your career page");
    // A draft never goes on the page, even switched on.
    expect(item("Level").textContent).not.toContain("On your career page");
  });

  it("opens My Tools showing only this job's tools", async () => {
    const roleId = await server.addRole("Giants Direct");
    for (const name of ["Drill", "Saw", "Level", "Meter"]) await addTool(name, [roleId]);
    render(<RoleOwnTools roleId={roleId} />);
    const more = await screen.findByRole("link", { name: "+ 1 more" });
    const job = `#/tools?job=${encodeURIComponent(roleId)}`;
    expect(more.getAttribute("href")).toBe(job);
    expect(screen.getByRole("link", { name: "Open My Tools" }).getAttribute("href")).toBe(job);
  });
});
