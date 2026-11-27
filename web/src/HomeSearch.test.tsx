import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeSearch } from "./HomeSearch";
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

describe("search", () => {
  it("ignores a list of tools from an earlier opening that arrives late", async () => {
    await fetch("/api/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Old drill" }) });
    const realFetch = globalThis.fetch;
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tools" && (init?.method ?? "GET") === "GET" && (calls += 1) === 1) {
        const response = await realFetch(input, init);
        await firstHeld;
        return response;
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const props = { onOpenChange: () => {}, onPlace: () => {}, onRole: () => {}, onUpdate: () => {}, onTool: () => {} };
    const { rerender } = render(<HomeSearch open {...props} />);
    rerender(<HomeSearch open={false} {...props} />);
    // The tool is deleted, and search opens again and reads the list without it.
    const tools = (await (await realFetch("/api/tools")).json()) as { tools: Array<{ id: string }> };
    await realFetch(`/api/tools/${tools.tools[0]!.id}`, { method: "DELETE" });
    rerender(<HomeSearch open {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "drill");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText("Old drill")).toBeNull();
    globalThis.fetch = realFetch;
  });
});
