import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkMapRole } from "@core/work-map";
import { RolePeople } from "./RolePeople";
import { stubBrowser, useRealApp } from "./test/app-fetch";

let server: ReturnType<typeof useRealApp>;
beforeEach(() => {
  stubBrowser();
  window.confirm = () => true;
  server = useRealApp();
});
afterEach(() => {
  cleanup();
  server.close();
});

/** The Colleagues tab for one role, reloading the roles after each save as the role page does. */
function Harness({ roleId }: { roleId: string }) {
  const [roles, setRoles] = useState<WorkMapRole[] | null>(null);
  const load = () =>
    void fetch("/api/work-map")
      .then((response) => response.json())
      .then((body: { roles: WorkMapRole[] }) => setRoles(body.roles));
  useEffect(load, []);
  const role = roles?.find((item) => item.id === roleId);
  return role && roles ? <RolePeople role={role} roles={roles} onSaved={load} /> : null;
}

describe("a role's Colleagues", () => {
  it("finds someone added and taken off in this visit, without leaving the tab", async () => {
    const roleId = await server.addRole("Giants Direct");
    const user = userEvent.setup();
    render(<Harness roleId={roleId} />);
    const openSearch = async () => user.click(await screen.findByRole("button", { name: /^\+ Add the people you worked with/ }));
    await openSearch();
    await user.type(await screen.findByLabelText("Add someone by name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: /Add “Sam Rivera” as someone new/ }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Take Sam Rivera off this role" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Take Sam Rivera off this role" })).toBeNull());

    // Still in My Network, so the search finds them to link again.
    await openSearch();
    await user.type(await screen.findByLabelText("Add someone by name"), "Sam");
    const matches = await screen.findByRole("list");
    await waitFor(() => expect(within(matches).getByRole("button", { name: /^Sam Rivera/ })).toBeTruthy());
  });
});
