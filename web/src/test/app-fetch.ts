import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../server/app";
import { openDatabase } from "../../../server/db";

/**
 * Web tests talk to the real app: `fetch` for `/api/…` goes straight into the
 * server with an in-memory database and a temporary uploads folder. A test can
 * make one kind of request fail (`failWhen`) to check what the screen says.
 */
export function useRealApp() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "docier-web-"));
  const app = createApp(db, { uploadsDir });
  const requests: Array<{ method: string; path: string }> = [];
  let failWhen: ((method: string, path: string) => boolean) | null = null;

  const fetchIntoApp = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    requests.push({ method, path });
    if (failWhen?.(method, path)) throw new TypeError("Failed to fetch");
    return app.request(path, init);
  };
  const previous = globalThis.fetch;
  globalThis.fetch = fetchIntoApp as typeof fetch;

  return {
    db,
    requests,
    /** Adds a role straight through the API, for linking. */
    async addRole(organization: string): Promise<string> {
      const response = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "job", title: "Technician", organization, startDate: "2024-06-01" }),
      });
      return ((await response.json()) as { role: { id: string } }).role.id;
    },
    async tools(): Promise<Array<{ id: string; name: string; photos: unknown[]; draft: boolean }>> {
      return ((await (await app.request("/api/tools")).json()) as { tools: [] }).tools;
    },
    failWhen(rule: ((method: string, path: string) => boolean) | null) {
      failWhen = rule;
    },
    close() {
      globalThis.fetch = previous;
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

/** What the test page doesn't have: scrolling an element into view, and media queries. */
export function stubBrowser() {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  let next = 0;
  URL.createObjectURL = () => `blob:docier-test/${(next += 1)}`;
  URL.revokeObjectURL = () => {};
}
