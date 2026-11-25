import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

async function addToolThroughApi(name: string, fields: Record<string, unknown> = {}): Promise<string> {
  const response = await fetch("/api/tools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, ...fields }),
  });
  return ((await response.json()) as { tool: { id: string } }).tool.id;
}

async function addKitThroughApi(name: string): Promise<string> {
  const response = await fetch("/api/tools/kits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return ((await response.json()) as { kit: { id: string } }).kit.id;
}

const cardNames = () => screen.queryAllByRole("button", { name: /^Open / }).map((card) => card.getAttribute("aria-label"));

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

describe("kits, totals, and export", () => {
  it("makes a kit, puts a tool in it, and shows only its tools", async () => {
    await addToolThroughApi("Meter");
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("button", { name: "Open Meter" });

    await user.click(screen.getByRole("button", { name: "+ New kit" }));
    await user.type(screen.getByRole("textbox", { name: "Kit name" }), "Electrical{Enter}");
    expect(await screen.findByRole("button", { name: "Electrical 0" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Open Meter" }));
    await user.selectOptions(within(panel("Meter")).getByRole("combobox", { name: "Add to a kit" }), "Electrical");
    await user.click(within(panel("Meter")).getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("button", { name: "Electrical 1" }));
    expect(cardNames()).toEqual(["Open Meter"]);
    await user.click(screen.getByRole("button", { name: "All tools" }));
    expect(cardNames()).toEqual(["Open Drill", "Open Meter"]);
  });

  it("renames and deletes a kit, keeping its tools", async () => {
    const kit = await addKitThroughApi("Truck");
    await addToolThroughApi("Jack", { kitIds: [kit] });
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Truck 1" }));

    await user.click(screen.getByRole("button", { name: "Rename kit" }));
    const field = screen.getByRole("textbox", { name: "Kit name" });
    await user.clear(field);
    await user.type(field, "Truck toolbox{Enter}");
    expect(await screen.findByRole("button", { name: "Truck toolbox 1" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete kit" }));
    expect(screen.getByText("Delete Truck toolbox? Its tools stay.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Truck toolbox/ })).toBeNull());
    expect(cardNames()).toEqual(["Open Jack"]);
    expect((await server.tools()).map((tool) => tool.name)).toEqual(["Jack"]);
    // The tool no longer lists the deleted kit, so it saves cleanly.
    await user.click(screen.getByRole("button", { name: "Open Jack" }));
    expect(within(panel("Jack")).queryByText("A deleted kit")).toBeNull();
    await user.click(within(panel("Jack")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Jack" })).toBeNull());
  });

  it("adds up the tools shown", async () => {
    await addToolThroughApi("Meter", { paid: 425.5, worth: 300 });
    await addToolThroughApi("Drill", { paid: 100 });
    const user = userEvent.setup();
    render(<ToolsPage />);
    expect(await screen.findByText("2 tools · $525.50 paid · worth $300 now · 0 with photos")).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: "Search tools" }), "drill");
    expect(await screen.findByText("1 tool · $100 paid · 0 with photos")).toBeTruthy();
  });

  it("exports the tools shown as CSV", async () => {
    await addToolThroughApi("Meter", { maker: "Fluke" });
    await addToolThroughApi("Drill");
    const blobs: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return "blob:docier-test/csv";
    };
    let downloaded = "";
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      downloaded = this.download;
    };
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.type(await screen.findByRole("searchbox", { name: "Search tools" }), "fluke");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    HTMLAnchorElement.prototype.click = click;

    expect(downloaded).toBe("my-tools.csv");
    const text = await blobs[0]!.text();
    expect(text.split("\r\n")[0]).toMatch(/^Name,Category,Whose it is,Maker/);
    expect(text).toContain("Meter,Tool,Mine,Fluke");
    expect(text).not.toContain("Drill");
  });
});

describe("photo framing", () => {
  async function toolWithPhoto(name: string): Promise<string> {
    const id = await addToolThroughApi(name);
    const form = new FormData();
    form.append("photos", photo("a.png"));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    window.location.hash = `#/tools/${id}`;
    return id;
  }
  const framing = async () => (await server.tools())[0]!.photos[0] as { framing: Record<string, unknown> };

  it("rotates and zooms a photo and shows it framed on the card", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    await user.click(within(dialog).getByRole("button", { name: "Flip across" }));
    fireEvent.change(within(dialog).getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull());
    expect((await framing()).framing).toMatchObject({ rotation: 90, flipH: true, zoom: 2 });
    const cover = screen.getByRole("button", { name: "Open Meter" }).querySelector("img")!;
    expect(cover.style.transform).toBe("rotate(90deg) scaleX(-1) scale(2)");
  });

  it("moves what stays in view with the arrow keys", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    within(dialog).getByRole("group", { name: /What stays in view/ }).focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowDown}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await framing()).framing).toMatchObject({ focusX: 40, focusY: 55 }));
  });

  it("cancel leaves the photo as it was", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Meter" })).toBeTruthy();
    expect((await framing()).framing).toMatchObject({ rotation: 0 });
  });
});
