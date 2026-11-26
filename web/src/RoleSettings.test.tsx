import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkMapRole } from "@core/work-map";
import { RoleSettings } from "./RoleSettings";
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

const roleOf = async (id: string) =>
  ((await (await fetch("/api/work-map")).json()) as { roles: WorkMapRole[] }).roles.find((item) => item.id === id)!;

/** The settings for one role, kept open, reloading the role after each save as the role page does. */
function Harness({ roleId, panel }: { roleId: string; panel: "about" | "basics" }) {
  const [role, setRole] = useState<WorkMapRole | null>(null);
  const load = () => void roleOf(roleId).then(setRole);
  useEffect(load, [roleId]);
  return role ? <RoleSettings role={role} panel={panel} onClose={() => {}} onSaved={load} /> : null;
}

describe("a role's settings", () => {
  it("a part that saved before another failed counts as saved, so changing it back saves again", async () => {
    const roleId = await server.addRole("Giants Direct");
    await fetch(`/api/work-map/roles/${roleId}/details`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: "Old" }) });
    const user = userEvent.setup();
    render(<Harness roleId={roleId} panel="about" />);
    const summary = await screen.findByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "New");
    // The links part fails after the summary saved.
    await user.click(screen.getByRole("button", { name: /Basics/ }));
    await user.type(screen.getByLabelText(/Website/), "giantdirect.com");
    server.failWhen((method, path) => method === "PUT" && path.endsWith("/links"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await roleOf(roleId)).details.summary).toBe("New"));

    server.failWhen(null);
    await user.click(screen.getByRole("button", { name: /About/ }));
    await user.clear(screen.getByLabelText("Summary"));
    await user.type(screen.getByLabelText("Summary"), "Old");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await roleOf(roleId)).details.summary).toBe("Old"));
  });
});
