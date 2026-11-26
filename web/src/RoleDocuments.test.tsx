import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkMapRole } from "@core/work-map";
import { RoleDocuments } from "./RoleDocuments";
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

const pdf = (name: string) => new File([`%PDF-1.4 ${name}`], name, { type: "application/pdf" });

/** The Documents tab for one role, reloading the role after each save as the role page does. */
function Harness({ roleId }: { roleId: string }) {
  const [role, setRole] = useState<WorkMapRole | null>(null);
  const load = () =>
    void fetch("/api/work-map")
      .then((response) => response.json())
      .then((body: { roles: WorkMapRole[] }) => setRole(body.roles.find((item) => item.id === roleId) ?? null));
  useEffect(load, [roleId]);
  return role ? <RoleDocuments role={role} onSaved={load} /> : null;
}

async function addToVault(name: string) {
  const form = new FormData();
  form.append("file", pdf(name));
  form.append("category", "handbook");
  const response = await fetch("/api/documents", { method: "POST", body: form });
  expect(response.ok).toBe(true);
}

describe("a role's Documents", () => {
  it("offers every file already in Documents, not just the first few", async () => {
    const roleId = await server.addRole("Giants Direct");
    for (let i = 1; i <= 9; i += 1) await addToVault(`handbook-${i}.pdf`);
    const user = userEvent.setup();
    render(<Harness roleId={roleId} />);
    await user.click(await screen.findByRole("button", { name: /^\+ Add a benefits package/ }));
    const pick = (await screen.findByText("Or add one already in Documents")).closest("div")!;
    await waitFor(() => expect(within(pick).getAllByRole("button")).toHaveLength(9));
  });

  it("keeps the files not yet added when one upload fails", async () => {
    const roleId = await server.addRole("Giants Direct");
    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(<Harness roleId={roleId} />);
    await user.click(await screen.findByRole("button", { name: /^\+ Add a benefits package/ }));
    let posts = 0;
    server.failWhen((method, path) => method === "POST" && path.endsWith("/documents") && path.includes("/roles/") && (posts += 1) === 2);
    await user.upload(container.querySelector<HTMLInputElement>("input[type=file]")!, [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
    // a went in; b failed; the form stays open and says which are left.
    expect(await screen.findByText(/b\.pdf and c\.pdf weren't added/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();

    server.failWhen(null);
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(async () => {
      const roles = (await (await fetch("/api/work-map")).json()) as { roles: WorkMapRole[] };
      const names = (roles.roles.find((item) => item.id === roleId)!.documents ?? []).map((item) => item.name).sort();
      expect(names).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    });
  });
});
