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

const addTool = async (name: string, roleIds: string[]) =>
  fetch("/api/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, roleIds }) });

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
});
