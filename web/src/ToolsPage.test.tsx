import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowser, useRealApp } from "./test/app-fetch";
import { ToolsPage } from "./ToolsPage";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const photo = (name: string, bytes = PNG.byteLength) => {
  const data = new Uint8Array(bytes);
  data.set(PNG);
  return new File([data], name, { type: "image/png" });
};

let server: ReturnType<typeof useRealApp>;
beforeEach(() => {
  stubBrowser();
  window.location.hash = "#/tools";
  server = useRealApp();
});
afterEach(() => {
  cleanup();
  server.close();
});

async function addToolThroughApi(name: string): Promise<string> {
  const response = await fetch("/api/tools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return ((await response.json()) as { tool: { id: string } }).tool.id;
}

const panel = (name: string | RegExp) => screen.getByRole("complementary", { name });
const pageFiles = (container: HTMLElement) => container.querySelector<HTMLInputElement>(".tools-head input[type=file]")!;
const panelFiles = (name: string | RegExp) => panel(name).querySelector<HTMLInputElement>("input[type=file]")!;

describe("My Tools", () => {
  it("adds a tool from the panel and shows it on the grid", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Fluke 87V");
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));

    expect(await screen.findByRole("button", { name: /Fluke 87V/ })).toBeTruthy();
    expect((await server.tools()).map((tool) => tool.name)).toEqual(["Fluke 87V"]);
  });

  it("keeps a saved tool, and says so, when its photos can't be added", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.upload(panelFiles("New tool"), photo("drill.png"));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    server.failWhen((method, path) => method === "POST" && path.endsWith("/photos"));
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));

    // The panel stays on the saved tool and keeps the message.
    expect(await within(panel("Drill")).findByText(/The tool is saved, but its photos weren't added/)).toBeTruthy();
    expect(within(panel("Drill")).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByText(/couldn't be saved/)).toBeNull();
    expect((await server.tools()).map((tool) => [tool.name, tool.photos.length])).toEqual([["Drill", 0]]);
  });

  it("names a photo over 5 MB and never sends it", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("complementary", { name: "Drill" });
    await user.upload(panelFiles("Drill"), photo("huge.png", 6 * 1024 * 1024));

    expect(await within(panel("Drill")).findByText("Not added: huge.png is over 5 MB.")).toBeTruthy();
    expect(server.requests.some((request) => request.method === "POST" && request.path.endsWith("/photos"))).toBe(false);
  });

  it("opens an empty panel for the next tool after one is added", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));
    await screen.findByRole("complementary", { name: "Drill" });

    await user.click(screen.getByRole("button", { name: "Add a tool" }));
    const fresh = await screen.findByRole("complementary", { name: "New tool" });
    expect((within(fresh).getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  it("moves focus into the panel, and back to the card when it closes", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    const card = await screen.findByRole("button", { name: /Drill/ });
    await user.click(card);
    await waitFor(() => expect(document.activeElement).toBe(within(panel("Drill")).getByRole("heading", { name: "Drill" })));

    await user.click(within(panel("Drill")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /Drill/ })));
  });

  it("adds drafts from photos without closing a tool you're still typing", async () => {
    // A dropped file isn't filtered by the picker's accept list, so the page checks it.
    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Half typed");
    await user.upload(pageFiles(container), [photo("IMG_1.png"), new File(["hi"], "notes.txt", { type: "text/plain" })]);

    expect(await screen.findByRole("button", { name: /IMG_1/ })).toBeTruthy();
    expect(screen.getByText("notes.txt isn't a photo.")).toBeTruthy();
    expect((within(panel("New tool")).getByLabelText("Name") as HTMLInputElement).value).toBe("Half typed");
    expect((await server.tools()).map((tool) => [tool.name, tool.draft])).toEqual([["IMG_1", true]]);
  });
});

/** A tool's card on the grid, found by its title. */
const cardFor = (name: string) =>
  waitFor(() => {
    const card = [...document.querySelectorAll<HTMLElement>(".tools-card")].find((item) => item.querySelector("strong")?.textContent === name);
    if (!card) throw new Error(`no card for ${name}`);
    return card;
  });
const draftsChip = () => screen.getAllByRole("button", { name: /Needs details/ }).find((button) => button.hasAttribute("aria-pressed"))!;

describe("review fixes", () => {
  it("keeps the Needs details filter's button while it's on, even with no drafts left", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), photo("saw.png"));
    await screen.findByRole("complementary", { name: "saw" });
    await user.click(draftsChip());
    await user.click(within(panel("saw")).getByRole("button", { name: "Save" }));
    // No drafts left, but the filter is still on: its button stays, to turn it off.
    await waitFor(() => expect(draftsChip()).toBeTruthy());
    await user.click(draftsChip());
    expect(await cardFor("saw")).toBeTruthy();
  });

  it("doesn't swap a new tool you're typing for drafts that finish adding", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    // Start adding from photos, then open a new tool before it finishes.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/from-photos")) await held;
      return realFetch(input, init);
    }) as typeof fetch;
    const upload = user.upload(pageFiles(container), photo("saw.png"));
    await user.click(screen.getByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    release();
    await upload;
    await cardFor("saw");
    expect((within(panel("New tool")).getByLabelText("Name") as HTMLInputElement).value).toBe("Drill");
    globalThis.fetch = realFetch;
  });

  it("a save that finishes after you open another tool doesn't close that one", async () => {
    const drill = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("complementary", { name: "Drill" });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    await user.click(await cardFor("Saw"));
    await screen.findByRole("complementary", { name: "Saw" });
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("complementary", { name: "Saw" })).toBeTruthy();
    globalThis.fetch = realFetch;
  });

  it("keeps a tool added before the list first loads", async () => {
    let releaseList: () => void = () => {};
    const listHeld = new Promise<void>((resolve) => (releaseList = resolve));
    const realFetch = globalThis.fetch;
    let first = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tools" && (init?.method ?? "GET") === "GET" && first) {
        first = false;
        const response = await realFetch(input, init);
        await listHeld;
        return response;
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));
    await cardFor("Drill");
    releaseList();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await cardFor("Drill")).toBeTruthy();
    globalThis.fetch = realFetch;
  });
});
