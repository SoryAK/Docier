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

const panel = (name: string | RegExp) => screen.getByRole("dialog", { name });
const pageFiles = (container: HTMLElement) => container.querySelector<HTMLInputElement>(".tools-head input[type=file]")!;
/** Opens a tool's fields from its popout's read view. */
async function startEditing(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(await screen.findByRole("dialog", { name })).getByRole("button", { name: "Edit" }));
}
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

    // The popout stays on the saved tool, now to read, and keeps the message.
    expect(await within(panel("Drill")).findByText(/The tool is saved, but its photos weren't added/)).toBeTruthy();
    expect(within(panel("Drill")).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByText(/couldn't be saved/)).toBeNull();
    expect((await server.tools()).map((tool) => [tool.name, tool.photos.length])).toEqual([["Drill", 0]]);
  });

  it("names a photo over 5 MB and never sends it", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("dialog", { name: "Drill" });
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
    await screen.findByRole("dialog", { name: "Drill" });

    await user.click(screen.getByRole("button", { name: "Add a tool" }));
    const fresh = await screen.findByRole("dialog", { name: "New tool" });
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
    await startEditing(user, "Meter");
    await user.click(within(panel("Meter")).getByRole("button", { name: "More details" }));
    await user.selectOptions(within(panel("Meter")).getByRole("combobox", { name: "Add to a kit" }), "Electrical");
    await user.click(within(panel("Meter")).getByRole("button", { name: "Save" }));
    expect(await within(panel("Meter")).findByText("Electrical")).toBeTruthy();
    await user.click(within(panel("Meter")).getByRole("button", { name: "Close" }));

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
    await startEditing(user, "Jack");
    expect(within(panel("Jack")).queryByText("A deleted kit")).toBeNull();
    await user.click(within(panel("Jack")).getByRole("button", { name: "Save" }));
    expect(await within(panel("Jack")).findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(panel("Jack")).queryByRole("alert")).toBeNull();
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
    // A byte-order mark first, so spreadsheets read accented names as UTF-8.
    expect([...new Uint8Array(await blobs[0]!.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = (await blobs[0]!.text()).replace(/^\uFEFF/, "");
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
    await user.click(await within(await screen.findByRole("dialog", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    await user.click(within(dialog).getByRole("button", { name: "Flip across" }));
    fireEvent.change(within(dialog).getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull());
    expect((await framing()).framing).toMatchObject({ rotation: 90, flipH: true, zoom: 2 });
    const cover = screen.getByRole("button", { name: "Open Meter" }).querySelector("img")!;
    expect(cover.style.transform).toBe("scaleX(-1) rotate(90deg) scale(2)");
  });

  it("moves what stays in view with the arrow keys", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("dialog", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    within(dialog).getByRole("group", { name: /What stays in view/ }).focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowDown}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await framing()).framing).toMatchObject({ focusX: 40, focusY: 55 }));
  });

  it("keeps keyboard focus inside the dialog, and Escape closes only the dialog", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("dialog", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    within(dialog).getByRole("button", { name: "Save" }).focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Save" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Meter" })).toBeTruthy();
  });

  it("shows the framing in a card-shaped preview while you adjust", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("dialog", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    const preview = within(dialog).getByRole("img", { name: "How the card will show it" });
    expect(preview.style.transform).toBe("rotate(90deg)");
  });

  it("cancel leaves the photo as it was", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("dialog", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Meter" })).toBeTruthy();
    expect((await framing()).framing).toMatchObject({ rotation: 0 });
  });
});

describe("changing many tools at once", () => {
  const bar = () => screen.getByRole("toolbar", { name: "Picked tools" });
  const status = () => within(bar()).getByRole("status");

  async function choose(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
    await user.click(await screen.findByRole("button", { name: "Select" }));
    for (const name of names) await user.click(screen.getByRole("button", { name: `Pick ${name}` }));
  }

  it("picks tools and sets whose it is", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    await addToolThroughApi("Ladder");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill", "Saw");
    expect(within(bar()).getByText("2 picked")).toBeTruthy();

    await user.selectOptions(within(bar()).getByLabelText("Set whose it is"), "borrowed");
    await waitFor(() => expect(status().textContent).toBe("2 tools changed."));
    const byName = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.ownership]));
    expect(byName).toEqual({ Drill: "borrowed", Saw: "borrowed", Ladder: "mine" });
    // The picks stay for a second change.
    expect(within(bar()).getByText("2 picked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pick Drill" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a click picks instead of opening while choosing", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    expect(window.location.hash).toBe("#/tools");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes an open tool when choosing starts", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("dialog", { name: "Drill" });
    await user.click(screen.getByRole("button", { name: "Select" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the picked tools on the career page", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    await user.selectOptions(within(bar()).getByLabelText("Set career page"), "show");
    await waitFor(() => expect(status().textContent).toBe("1 tool changed."));
    const byName = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.onCareerPage]));
    expect(byName).toEqual({ Drill: true, Saw: false });
  });

  it("hidden picks are counted and changed", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill", "Saw");
    await user.type(screen.getByRole("searchbox"), "Drill");
    expect(within(bar()).getByText("2 picked, 1 not shown")).toBeTruthy();

    await user.selectOptions(within(bar()).getByLabelText("Set condition"), "good");
    await waitFor(() => expect(status().textContent).toBe("2 tools changed."));
    expect((await server.tools()).map((tool) => tool.condition)).toEqual(["good", "good"]);
  });

  it("picks all shown, and clears", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user);
    await user.click(within(bar()).getByRole("button", { name: "Pick all shown (2)" }));
    expect(within(bar()).getByText("2 picked")).toBeTruthy();
    await user.click(within(bar()).getByRole("button", { name: "Clear" }));
    expect(within(bar()).getByText("0 picked")).toBeTruthy();
  });

  it("adds and removes tags", async () => {
    await addToolThroughApi("Drill", { tags: ["Shop"] });
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill", "Saw");
    await user.type(within(bar()).getByLabelText("Tags to add"), "Truck, Van");
    await user.click(within(bar()).getByRole("button", { name: "Add tags" }));
    await waitFor(() => expect(status().textContent).toBe("2 tools changed."));
    expect((await server.tools()).map((tool) => [tool.name, tool.tags])).toEqual([
      ["Saw", ["Truck", "Van"]],
      ["Drill", ["Shop", "Truck", "Van"]],
    ]);

    await user.selectOptions(within(bar()).getByLabelText("Remove a tag"), "Truck");
    await waitFor(async () => expect((await server.tools()).map((tool) => tool.tags)).toEqual([["Van"], ["Shop", "Van"]]));
  });

  it("adds the picked tools to a new kit, and takes them out", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill", "Saw");
    await user.selectOptions(within(bar()).getByLabelText("Add to a kit"), "new");
    await user.type(within(bar()).getByLabelText("New kit name"), "Truck toolbox{Enter}");
    await waitFor(() => expect(status().textContent).toBe("2 tools moved to Truck toolbox."));
    expect(screen.getByRole("button", { name: /Truck toolbox\s*2/ })).toBeTruthy();

    await user.selectOptions(within(bar()).getByLabelText("Take out of a kit"), "Truck toolbox");
    await waitFor(() => expect(status().textContent).toBe("2 tools taken out of Truck toolbox."));
    expect((await server.tools()).every((tool) => tool.kitIds.length === 0)).toBe(true);
  });

  it("deletes after asking", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    await addToolThroughApi("Ladder");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill", "Saw");
    await user.click(within(bar()).getByRole("button", { name: "Delete" }));
    expect(within(bar()).getByText("Delete 2 tools? Their photos go too.")).toBeTruthy();
    await user.click(within(bar()).getByRole("button", { name: "Keep" }));
    expect((await server.tools())).toHaveLength(3);

    await user.click(within(bar()).getByRole("button", { name: "Delete" }));
    await user.click(within(bar()).getByRole("button", { name: "Delete 2 tools" }));
    await waitFor(() => expect(status().textContent).toBe("2 tools deleted."));
    expect((await server.tools()).map((tool) => tool.name)).toEqual(["Ladder"]);
    expect(within(bar()).getByText("0 picked")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pick Drill" })).toBeNull();
  });

  it("a failed change says nothing changed", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    server.failWhen((method, path) => method === "POST" && path === "/api/tools/bulk");
    await user.selectOptions(within(bar()).getByLabelText("Set category"), "safety");
    expect((await within(bar()).findByRole("alert")).textContent).toBe("The change couldn't be saved. Nothing was changed.");
    expect(within(bar()).getByText("1 picked")).toBeTruthy();
  });

  it("going back to an open tool ends choosing", async () => {
    const id = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("dialog", { name: "Drill" });
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Pick Drill" }));
    // Browser Back returns to the tool's address.
    window.location.hash = `#/tools/${id}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await screen.findByRole("dialog", { name: "Drill" });
    expect(screen.queryByRole("toolbar", { name: "Picked tools" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("Escape backs out of the delete question and keeps the picks", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    await user.click(within(bar()).getByRole("button", { name: "Delete" }));
    await user.keyboard("{Escape}");
    expect(within(bar()).queryByText("Delete 1 tool? Their photos go too.")).toBeNull();
    expect(within(bar()).getByText("1 picked")).toBeTruthy();
  });

  it("Escape in a field of the bar keeps the picks", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    await user.type(within(bar()).getByLabelText("Tags to add"), "Truck{Escape}");
    expect((within(bar()).getByLabelText("Tags to add") as HTMLInputElement).value).toBe("");
    await user.selectOptions(within(bar()).getByLabelText("Add to a kit"), "new");
    await user.type(within(bar()).getByLabelText("New kit name"), "Van{Escape}");
    expect(within(bar()).queryByLabelText("New kit name")).toBeNull();
    expect(within(bar()).getByText("1 picked")).toBeTruthy();
  });

  it("says when a new kit's name is taken", async () => {
    await addToolThroughApi("Drill");
    await addKitThroughApi("Truck toolbox");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    await user.selectOptions(within(bar()).getByLabelText("Add to a kit"), "new");
    await user.type(within(bar()).getByLabelText("New kit name"), "truck toolbox{Enter}");
    expect((await within(bar()).findByRole("alert")).textContent).toBe(
      "There's already a kit called that. Pick it from Add to a kit. Nothing was changed.",
    );
  });

  it("Escape stops choosing", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await choose(user, "Drill");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "Picked tools" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Open Drill" })).toBeTruthy();
  });
});

describe("small touches", () => {
  it("changes whose it is from the card and keeps the draft mark", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), photo("saw.png"));
    await screen.findByRole("dialog", { name: "saw" });
    window.location.hash = "#/tools";
    await user.selectOptions(await screen.findByLabelText("Whose saw is"), "borrowed");
    await waitFor(async () => expect((await server.tools())[0]).toMatchObject({ ownership: "borrowed", draft: true }));
    expect(screen.getByText("Needs details", { selector: ".tools-draft" })).toBeTruthy();
  });

  it("changes condition from the card", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    const menu = (await screen.findByLabelText("Condition of Drill")) as HTMLSelectElement;
    expect(menu.selectedOptions[0]!.textContent).toBe("Condition?");
    await user.selectOptions(menu, "fair");
    await waitFor(async () => expect((await server.tools())[0]!.condition).toBe("fair"));
    expect(menu.value).toBe("fair");
  });

  it("a failed card change goes back", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    const menu = (await screen.findByLabelText("Whose Drill is")) as HTMLSelectElement;
    server.failWhen((method, path) => method === "POST" && path === "/api/tools/bulk");
    await user.selectOptions(menu, "rented");
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save. Try again.");
    expect(menu.value).toBe("mine");
    expect((await server.tools())[0]!.ownership).toBe("mine");
  });

  it("hides the card menus while choosing", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByLabelText("Whose Drill is");
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByLabelText("Whose Drill is")).toBeNull();
    expect(screen.queryByLabelText("Condition of Drill")).toBeNull();
  });

  it("marks what matches the search", async () => {
    await addToolThroughApi("Fluke 87V", { maker: "Fluke", tags: ["fluid"] });
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.type(await screen.findByRole("searchbox"), "flu");
    const card = screen.getByRole("button", { name: "Open Fluke 87V" });
    expect([...card.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["Flu", "Flu", "flu"]);
  });

  it("slash goes to search and n opens a new tool", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByLabelText("Whose Drill is");
    await user.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("n");
    await screen.findByRole("dialog", { name: "New tool" });
    expect(screen.getByRole("button", { name: "Add a tool" }).getAttribute("title")).toBe("Add a tool (N)");
  });

  it("shortcuts don't fire while typing", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.type(await screen.findByRole("searchbox"), "n/");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("n/");
    expect(window.location.hash).toBe("#/tools");
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}n{/Control}");
    expect(window.location.hash).toBe("#/tools");
  });

  it("shortcuts leave an open tool's panel alone", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const name = within(screen.getByRole("dialog", { name: "Drill" })).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Drill press");
    within(panel("Drill")).getByRole("button", { name: "Save" }).focus();
    await user.keyboard("n/");
    expect(window.location.hash).toBe(`#/tools/${id}`);
    expect((within(panel("Drill")).getByLabelText("Name") as HTMLInputElement).value).toBe("Drill press");
  });

  it("shortcuts wait while one of the app's dialogs is open", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByLabelText("Whose Drill is");
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    button.focus();
    await user.keyboard("n");
    expect(window.location.hash).toBe("#/tools");
    dialog.remove();
  });

  it("n doesn't drop the picks while choosing", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Pick Drill" }));
    await user.keyboard("n");
    expect(window.location.hash).toBe("#/tools");
    expect(within(screen.getByRole("toolbar", { name: "Picked tools" })).getByText("1 picked")).toBeTruthy();
    // Search still works, to narrow what's shown.
    await user.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("the open tool's card has no quick menus, so the panel's save can't undo them", async () => {
    const id = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${id}`;
    render(<ToolsPage />);
    await screen.findByRole("dialog", { name: "Drill" });
    expect(screen.queryByLabelText("Whose Drill is")).toBeNull();
    expect(screen.getByLabelText("Whose Saw is")).toBeTruthy();
  });

  it("says where a tool was used only when it's linked to a role", async () => {
    const roleId = await server.addRole("Technician");
    await addToolThroughApi("Drill", { roleIds: [roleId] });
    await addToolThroughApi("Saw");
    render(<ToolsPage />);
    const drill = await screen.findByRole("button", { name: "Open Drill" });
    await waitFor(() => expect(drill.textContent).toMatch(/Used at /));
    expect(screen.getByRole("button", { name: "Open Saw" }).textContent).not.toMatch(/Used at|Not linked/);
  });

  it("shows maker and model only when there are some", async () => {
    await addToolThroughApi("Drill", { maker: "Makita" });
    await addToolThroughApi("Saw");
    render(<ToolsPage />);
    expect((await screen.findByRole("button", { name: "Open Drill" })).textContent).toMatch(/Makita/);
    expect(screen.getByRole("button", { name: "Open Saw" }).textContent).not.toMatch(/No maker or model/);
  });

  it("shows the category only when it isn't Tool", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Hard hat", { category: "safety" });
    render(<ToolsPage />);
    const drill = await screen.findByRole("button", { name: "Open Drill" });
    expect(drill.querySelector(".tools-tags")?.textContent ?? "").not.toMatch(/Tool/);
    expect(screen.getByRole("button", { name: "Open Hard hat" }).querySelector(".tools-tags")?.textContent).toMatch(/Safety/);
  });

  it("counts photos only when there's more than one", async () => {
    const one = await addToolThroughApi("Drill");
    const two = await addToolThroughApi("Saw");
    const send = (id: string, names: string[]) => {
      const form = new FormData();
      for (const name of names) form.append("photos", photo(name));
      return fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    };
    await send(one, ["a.png"]);
    await send(two, ["b.png", "c.png"]);
    render(<ToolsPage />);
    expect((await screen.findByRole("button", { name: "Open Drill" })).textContent).not.toMatch(/1 photo/);
    expect(screen.getByRole("button", { name: "Open Saw" }).textContent).toMatch(/2 photos/);
  });

  it("keeps the kits row out of the way until there's a kit", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("button", { name: "Open Drill" });
    expect(screen.queryByRole("group", { name: "Kits" })).toBeNull();
    expect(screen.queryByRole("button", { name: "All tools" })).toBeNull();

    // + New kit sits with the page's buttons, and opens the name field.
    await user.click(screen.getByRole("button", { name: "+ New kit" }));
    const field = screen.getByRole("textbox", { name: "Kit name" });
    expect(document.activeElement).toBe(field);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Kit name" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "+ New kit" }));
    await user.type(screen.getByRole("textbox", { name: "Kit name" }), "Van{Enter}");
    expect(await screen.findByRole("group", { name: "Kits" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All tools" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "+ New kit" })).toHaveLength(1);
  });
});

describe("the career page", () => {
  it("switches a tool onto the career page, and an unrelated edit keeps it there", async () => {
    await addToolThroughApi("Drill");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Open Drill" }));
    await startEditing(user, "Drill");
    await user.click(within(panel("Drill")).getByRole("checkbox", { name: /Show on my career page/ }));
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await server.tools())[0].onCareerPage).toBe(true));
    expect(await within(panel("Drill")).findByText("On your career page")).toBeTruthy();

    await startEditing(user, "Drill");
    const maker = within(panel("Drill")).getByLabelText("Maker");
    await user.type(maker, "Makita");
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await server.tools())[0].maker).toBe("Makita"));
    expect((await server.tools())[0].onCareerPage).toBe(true);
  });
});

describe("duplicating and drafts in a row", () => {
  async function addPhotoThroughApi(id: string, name: string) {
    const form = new FormData();
    form.append("photos", photo(name));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
  }

  it("duplicates a tool with its photos and opens the copy", async () => {
    const id = await addToolThroughApi("Drill", { maker: "Makita" });
    await addPhotoThroughApi(id, "drill.png");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(within(await screen.findByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Duplicate" }));
    expect(within(panel("Drill")).getByText("Copy the photos too?")).toBeTruthy();
    await user.click(within(panel("Drill")).getByRole("button", { name: "With photos" }));

    const copy = await screen.findByRole("dialog", { name: "Drill (copy)" });
    expect(within(copy).getByText("Makita")).toBeTruthy();
    expect(within(copy).getByRole("button", { name: "View photo 1 full size" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Drill (copy)" })).toBeTruthy();
    const byName = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.photos.length]));
    expect(byName).toEqual({ Drill: 1, "Drill (copy)": 1 });
  });

  it("duplicates what was just saved, and only from reading it", async () => {
    const id = await addToolThroughApi("Drill", { maker: "Makita" });
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const drill = screen.getByRole("dialog", { name: "Drill" });
    // While changing it, there's nothing to duplicate from: no half-saved copies.
    expect(within(drill).queryByRole("button", { name: "Duplicate" })).toBeNull();
    await user.clear(within(drill).getByLabelText("Maker"));
    await user.type(within(drill).getByLabelText("Maker"), "Bosch");
    await user.click(within(drill).getByRole("button", { name: "Save" }));
    await user.click(await within(drill).findByRole("button", { name: "Duplicate" }));
    await user.click(within(panel("Drill")).getByRole("button", { name: "Without photos" }));
    await screen.findByRole("dialog", { name: "Drill (copy)" });
    const makers = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.maker]));
    expect(makers).toEqual({ Drill: "Bosch", "Drill (copy)": "Bosch" });
  });

  it("duplicates without photos", async () => {
    const id = await addToolThroughApi("Drill");
    await addPhotoThroughApi(id, "drill.png");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(within(await screen.findByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Duplicate" }));
    await user.click(within(panel("Drill")).getByRole("button", { name: "Without photos" }));
    const copy = await screen.findByRole("dialog", { name: "Drill (copy)" });
    expect(within(copy).queryAllByRole("button", { name: /^Remove photo/ })).toHaveLength(0);
  });

  it("saves a draft and opens the next one", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), [photo("saw.png"), photo("drill.png")]);
    const first = await screen.findByRole("dialog", { name: /^(saw|drill)$/ });
    const firstName = first.getAttribute("aria-label")!;
    const other = firstName === "saw" ? "drill" : "saw";

    await user.click(within(first).getByRole("button", { name: "Save and next draft (1 left)" }));
    const next = await screen.findByRole("dialog", { name: other });
    expect(within(next).queryByRole("button", { name: /Save and next draft/ })).toBeNull();
    const byName = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.draft]));
    expect(byName).toEqual({ [firstName]: false, [other]: true });
  });

  it("stays on the draft when saving fails", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), [photo("saw.png"), photo("drill.png")]);
    const first = await screen.findByRole("dialog", { name: /^(saw|drill)$/ });
    const name = first.getAttribute("aria-label")!;
    server.failWhen((method, path) => method === "PUT" && path.startsWith("/api/tools/"));
    await user.click(within(first).getByRole("button", { name: "Save and next draft (1 left)" }));
    expect(await within(panel(name)).findByText("The tool couldn't be saved. Try again.")).toBeTruthy();
  });
});

describe("viewing and ordering photos", () => {
  async function toolWithPhotos(names: string[]) {
    const id = await addToolThroughApi("Drill");
    const form = new FormData();
    for (const name of names) form.append("photos", photo(name));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    window.location.hash = `#/tools/${id}`;
    return id;
  }
  const order = async () => (await server.tools())[0]!.photos.map((item: any) => item.url as string);

  it("shows a photo large, picks another from the strip, and opens it full size", async () => {
    await toolWithPhotos(["a.png", "b.png"]);
    const user = userEvent.setup();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    expect(within(drill).getByRole("img", { name: "Drill, photo 1" })).toBeTruthy();
    await user.click(within(drill).getByRole("checkbox", { name: "Show photo 2" }));
    expect(within(drill).getByRole("img", { name: "Drill, photo 2" })).toBeTruthy();

    await user.click(within(drill).getByRole("button", { name: "View photo 2 full size" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    // Escape closes the full-size photo only; the tool stays open.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(panel("Drill")).toBeTruthy();
  });

  it("moves a photo left with its button and keeps the cover", async () => {
    await toolWithPhotos(["a.png", "b.png"]);
    const before = await order();
    const user = userEvent.setup();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    // The buttons act on the photo shown: the first can't go further left.
    expect(within(drill).queryByRole("button", { name: "Move photo 1 left" })).toBeNull();
    expect(within(drill).getByRole("button", { name: "Move photo 1 right" })).toBeTruthy();
    await user.click(within(drill).getByRole("checkbox", { name: "Show photo 2" }));
    expect(within(drill).queryByRole("button", { name: "Move photo 2 right" })).toBeNull();
    await user.click(within(drill).getByRole("button", { name: "Move photo 2 left" }));
    await waitFor(async () => expect(await order()).toEqual([before[1], before[0]]));
    expect((await server.tools())[0]!.photos.map((item: any) => item.cover)).toEqual([false, true]);
  });

  it("moves a photo by dragging it", async () => {
    await toolWithPhotos(["a.png", "b.png", "c.png"]);
    const before = await order();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    const tiles = drill.querySelectorAll<HTMLElement>(".tool-gallery-thumb[draggable='true']");
    // What a browser attaches to a drag of a photo within the page.
    const dataTransfer = { types: ["text/plain"], setData: () => {}, getData: () => "", effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(tiles[2]!, { dataTransfer });
    fireEvent.dragOver(tiles[0]!, { dataTransfer });
    fireEvent.drop(tiles[0]!, { dataTransfer });
    await waitFor(async () => expect(await order()).toEqual([before[2], before[0], before[1]]));
  });

  it("keeps focus on the moved photo", async () => {
    await toolWithPhotos(["a.png", "b.png"]);
    const user = userEvent.setup();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    await user.click(within(drill).getByRole("checkbox", { name: "Show photo 2" }));
    await user.click(within(drill).getByRole("button", { name: "Move photo 2 left" }));
    // The moved photo is now first, is the one shown, and has the focus in the strip.
    await waitFor(() => expect(document.activeElement).toBe(within(panel("Drill")).getByRole("checkbox", { name: "Show photo 1" })));
    expect(within(drill).getByRole("img", { name: "Drill, photo 1" })).toBeTruthy();
  });

  it("dragging a photo doesn't offer to add photos", async () => {
    await toolWithPhotos(["a.png", "b.png"]);
    const { container } = render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    const tiles = drill.querySelectorAll<HTMLElement>(".tool-gallery-thumb[draggable='true']");
    // Some browsers list an image drag as files too.
    const types: string[] = [];
    const dataTransfer = { types, setData: (type: string) => types.push(type), getData: () => "", effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(tiles[1]!, { dataTransfer });
    types.push("Files");
    fireEvent.dragOver(container.querySelector(".tools-grid")!, { dataTransfer });
    expect(container.querySelector(".tools-drop")).toBeNull();
    expect(drill.querySelector(".tool-gallery-thumb img")?.getAttribute("draggable")).toBe("false");
    expect(drill.querySelector(".tool-gallery-hero img")?.getAttribute("draggable")).toBe("false");
  });
});

describe("the tool popout", () => {
  it("opens a tool to read, and changes it after Edit", async () => {
    const id = await addToolThroughApi("Drill", { maker: "Makita", keptAt: "Garage shelf", paid: 159 });
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    expect(within(drill).getByRole("heading", { name: "Drill", level: 2 })).toBeTruthy();
    expect(within(drill).getByText("Garage shelf")).toBeTruthy();
    expect(within(drill).getByText("$159")).toBeTruthy();
    expect(within(drill).queryByLabelText("Name")).toBeNull();

    await startEditing(user, "Drill");
    await user.clear(within(drill).getByLabelText("Where it's kept"));
    await user.type(within(drill).getByLabelText("Where it's kept"), "Van");
    await user.click(within(drill).getByRole("button", { name: "Save" }));
    expect(await within(drill).findByText("Van")).toBeTruthy();
    expect((await server.tools())[0]!.keptAt).toBe("Van");
  });

  it("Cancel in Edit goes back to reading it, unchanged", async () => {
    const id = await addToolThroughApi("Drill", { maker: "Makita" });
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const drill = screen.getByRole("dialog", { name: "Drill" });
    await user.clear(within(drill).getByLabelText("Maker"));
    await user.click(within(drill).getByRole("button", { name: "Cancel" }));
    expect(within(drill).getByText("Makita")).toBeTruthy();
    expect((await server.tools())[0]!.maker).toBe("Makita");
  });

  it("moves between the tools shown with the buttons and the arrow keys", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const ladder = await addToolThroughApi("Ladder");
    window.location.hash = `#/tools/${ladder}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    // Newest first, as on the grid: Ladder, Saw, Drill.
    const first = await screen.findByRole("dialog", { name: "Ladder" });
    expect(within(first).getByText("1 of 3")).toBeTruthy();
    await user.click(within(first).getByRole("button", { name: "Next tool" }));
    const saw = await screen.findByRole("dialog", { name: "Saw" });
    expect(within(saw).getByText("2 of 3")).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "Drill" })).toBeTruthy();
    // It wraps round.
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "Ladder" })).toBeTruthy();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("dialog", { name: "Drill" })).toBeTruthy();
  });

  it("arrow keys type in a field instead of changing tools", async () => {
    const drill = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const name = within(screen.getByRole("dialog", { name: "Drill" })).getByLabelText("Name") as HTMLInputElement;
    await user.click(name);
    await user.keyboard("{ArrowLeft}");
    // Moving would change the address, which lands a moment later: give it that moment.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.location.hash).toBe(`#/tools/${drill}`);
    expect(screen.getByRole("dialog", { name: "Drill" })).toBeTruthy();
  });

  it("paging while changing a tool saves the change first", async () => {
    const drill = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const popout = screen.getByRole("dialog", { name: "Drill" });
    await user.type(within(popout).getByLabelText("Maker"), "Makita");
    await user.click(within(popout).getByRole("button", { name: "Next tool" }));
    expect(await screen.findByRole("dialog", { name: "Saw" })).toBeTruthy();
    const makers = Object.fromEntries((await server.tools()).map((tool) => [tool.name, tool.maker]));
    expect(makers).toEqual({ Drill: "Makita", Saw: "" });
  });

  it("stays on the tool when that save fails", async () => {
    const drill = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    const popout = screen.getByRole("dialog", { name: "Drill" });
    await user.type(within(popout).getByLabelText("Maker"), "Makita");
    server.failWhen((method, path) => method === "PUT" && path.startsWith("/api/tools/"));
    await user.click(within(popout).getByRole("button", { name: "Next tool" }));
    expect(await within(popout).findByText("The tool couldn't be saved. Try again.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Drill" })).toBeTruthy();
    expect((within(popout).getByLabelText("Maker") as HTMLInputElement).value).toBe("Makita");
  });

  it("remembers the larger size", async () => {
    window.localStorage.removeItem("tools.gallery.large");
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    const first = render(<ToolsPage />);
    await user.click(within(await screen.findByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Make larger" }));
    expect(screen.getByRole("button", { name: "Make smaller" })).toBeTruthy();
    first.unmount();

    render(<ToolsPage />);
    expect(within(await screen.findByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Make smaller" })).toBeTruthy();
    window.localStorage.removeItem("tools.gallery.large");
  });

  it("a draft opens ready to fill in, with its photo shown large", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), photo("saw.png"));
    const saw = await screen.findByRole("dialog", { name: "saw" });
    expect(within(saw).getByRole("heading", { name: "Fill in this draft" })).toBeTruthy();
    expect(within(saw).getByLabelText("Name")).toBeTruthy();
    expect(within(saw).getByRole("img", { name: "saw, photo 1" })).toBeTruthy();
  });
});

describe("basic fields first", () => {
  it("shows the basic fields, with the rest behind More details", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    const popout = screen.getByRole("dialog", { name: "New tool" });
    for (const label of ["Name", "Whose it is", "Maker", "Model", "Condition"]) expect(within(popout).getByLabelText(label)).toBeTruthy();
    expect(within(popout).queryByLabelText("Serial")).toBeNull();
    expect(within(popout).queryByLabelText("Notes")).toBeNull();
    const more = within(popout).getByRole("button", { name: "More details" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    await user.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    for (const label of ["Category", "Serial", "What you paid", "Worth now", "Where it's kept", "Tags", "Notes"]) {
      expect(within(popout).getByLabelText(label)).toBeTruthy();
    }
  });

  it("opens More details by itself when the tool has some", async () => {
    const id = await addToolThroughApi("Drill", { keptAt: "Van" });
    const bare = await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    expect((within(screen.getByRole("dialog", { name: "Drill" })).getByLabelText("Where it's kept") as HTMLInputElement).value).toBe("Van");

    await user.click(within(screen.getByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Cancel" }));
    await user.click(within(screen.getByRole("dialog", { name: "Drill" })).getByRole("button", { name: "Next tool" }));
    await startEditing(user, "Saw");
    expect(within(screen.getByRole("dialog", { name: "Saw" })).queryByLabelText("Where it's kept")).toBeNull();
    expect(bare).toBeTruthy();
  });

  it("opens More details when one of its fields is refused", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    const popout = screen.getByRole("dialog", { name: "New tool" });
    await user.type(within(popout).getByLabelText("Name"), "Drill");
    await user.click(within(popout).getByRole("button", { name: "More details" }));
    await user.type(within(popout).getByLabelText("What you paid"), "lots");
    await user.click(within(popout).getByRole("button", { name: "More details" }));
    expect(within(popout).queryByLabelText("What you paid")).toBeNull();
    await user.click(within(popout).getByRole("button", { name: "Add tool" }));
    expect(await within(popout).findByText("Use a number, like 425 or 425.50.")).toBeTruthy();
    // The field is back in view, with what's wrong beside it (the message is part of its label).
    expect((within(popout).getByLabelText(/^What you paid/) as HTMLInputElement).value).toBe("lots");
  });
});

describe("the popout keeps its place", () => {
  it("keeps focus inside after Save and Cancel, so the arrow keys still work", async () => {
    const drill = await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    await user.type(within(panel("Drill")).getByLabelText("Maker"), "Makita");
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(document.activeElement).toBe(within(panel("Drill")).getByRole("heading", { name: "Drill" })));

    await startEditing(user, "Drill");
    await user.click(within(panel("Drill")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(within(panel("Drill")).getByRole("heading", { name: "Drill" })));
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("dialog", { name: "Saw" })).toBeTruthy();
  });

  it("keeps focus inside after making a photo the cover", async () => {
    const id = await addToolThroughApi("Drill");
    const form = new FormData();
    form.append("photos", photo("a.png"));
    form.append("photos", photo("b.png"));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    const drill = await screen.findByRole("dialog", { name: "Drill" });
    await user.click(within(drill).getByRole("checkbox", { name: "Show photo 2" }));
    await user.click(within(drill).getByRole("button", { name: "Make photo 2 the cover" }));
    await waitFor(() => expect(within(drill).queryByRole("button", { name: "Make photo 2 the cover" })).toBeNull());
    await waitFor(() => expect(drill.contains(document.activeElement)).toBe(true));
  });

  it("doesn't leave a history step for the new tool once it's added, or for each tool paged", async () => {
    const saw = await addToolThroughApi("Saw");
    await addToolThroughApi("Ladder");
    const user = userEvent.setup();
    render(<ToolsPage />);
    const before = window.history.length;
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));
    await screen.findByRole("dialog", { name: "Drill" });
    // One step for opening, replaced by the added tool: Back can't reopen "New tool".
    expect(window.history.length).toBe(before + 1);
    await user.click(within(panel("Drill")).getByRole("button", { name: "Next tool" }));
    await screen.findByRole("dialog", { name: "Ladder" });
    await user.click(within(panel("Ladder")).getByRole("button", { name: "Next tool" }));
    await screen.findByRole("dialog", { name: "Saw" });
    expect(window.location.hash).toBe(`#/tools/${saw}`);
    expect(window.history.length).toBe(before + 1);
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
    await screen.findByRole("dialog", { name: "saw" });
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
    await startEditing(user, "Drill");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await user.type(within(panel("Drill")).getByLabelText("Maker"), "Makita");
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    await user.click(await cardFor("Saw"));
    await screen.findByRole("dialog", { name: "Saw" });
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("dialog", { name: "Saw" })).toBeTruthy();
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

describe("saves that finish late", () => {
  it("doesn't reopen the popout when Add tool finishes after it was closed", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input) === "/api/tools") await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await user.click(within(panel("New tool")).getByRole("button", { name: "Add tool" }));
    // Closing while the save runs: it's already saving, so the popout just closes.
    await user.click(within(panel("New tool")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    release();
    await cardFor("Drill");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/tools");
    globalThis.fetch = realFetch;
  });
});

describe("closing with unsaved changes", () => {
  it("asks before throwing changes away, and can keep editing, discard, or save", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    await user.type(within(panel("Drill")).getByLabelText("Maker"), "Makita");

    await user.keyboard("{Escape}");
    const ask = await within(panel("Drill")).findByRole("alertdialog", { name: "Save your changes?" });
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect((within(panel("Drill")).getByLabelText("Maker") as HTMLInputElement).value).toBe("Makita");

    await user.click(within(panel("Drill")).getByRole("button", { name: "Close" }));
    await user.click(within(await within(panel("Drill")).findByRole("alertdialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await server.tools())[0]!.maker).toBe("Makita");
  });

  it("discards when asked to, and closes at once when nothing changed", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    await user.type(within(panel("Drill")).getByLabelText("Maker"), "Makita");
    await user.keyboard("{Escape}");
    await user.click(within(await within(panel("Drill")).findByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await server.tools())[0]!.maker).toBe("");

    // Nothing changed: no question.
    await user.click(screen.getByRole("button", { name: "Open Drill" }));
    await startEditing(user, "Drill");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks about a new tool you've started filling in", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Add a tool" }));
    await user.type(within(panel("New tool")).getByLabelText("Name"), "Drill");
    await user.keyboard("{Escape}");
    expect(await within(panel("New tool")).findByRole("alertdialog", { name: "Save your changes?" })).toBeTruthy();
  });
});

describe("paging without rebuilding the popout", () => {
  it("keeps the same popout and focus on Next tool while paging", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const ladder = await addToolThroughApi("Ladder");
    window.location.hash = `#/tools/${ladder}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    const popout = await screen.findByRole("dialog", { name: "Ladder" });
    await user.click(within(popout).getByRole("button", { name: "Next tool" }));
    const saw = await screen.findByRole("dialog", { name: "Saw" });
    expect(saw).toBe(popout);
    expect(document.activeElement).toBe(within(saw).getByRole("button", { name: "Next tool" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Drill" })).toBe(popout);
  });

  it("a save that finishes after paging away doesn't change the tool shown now", async () => {
    const drill = await addToolThroughApi("Drill");
    const saw = await addToolThroughApi("Saw");
    window.location.hash = `#/tools/${drill}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await startEditing(user, "Drill");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") await held;
      return realFetch(input, init);
    }) as typeof fetch;
    await user.type(within(panel("Drill")).getByLabelText("Maker"), "Makita");
    await user.click(within(panel("Drill")).getByRole("button", { name: "Save" }));
    globalThis.fetch = realFetch;
    // The address moves to Saw (Back or Forward) while Drill saves: the same popout now shows Saw.
    window.location.hash = `#/tools/${saw}`;
    await startEditing(user, "Saw");
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Saw is still being edited, untouched by Drill's late save.
    expect(within(panel("Saw")).getByLabelText("Name")).toBeTruthy();
    expect((within(panel("Saw")).getByLabelText("Maker") as HTMLInputElement).value).toBe("");
  });
});

/** A stand-in canvas: the test page has none. It records each photo's turn and flips. */
function fakeCanvas() {
  const drawn: Array<{ rotate: number; scale: [number, number] }> = [];
  const realBitmap = globalThis.createImageBitmap;
  const realContext = HTMLCanvasElement.prototype.getContext;
  const realData = HTMLCanvasElement.prototype.toDataURL;
  let closed = 0;
  globalThis.createImageBitmap = (async () => ({ width: 1200, height: 800, close: () => (closed += 1) })) as never;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const step = { rotate: 0, scale: [1, 1] as [number, number] };
    return {
      fillStyle: "",
      fillRect() {},
      translate() {},
      rotate(angle: number) {
        step.rotate = Math.round((angle * 180) / Math.PI);
      },
      scale(x: number, y: number) {
        step.scale = [x, y];
      },
      drawImage() {
        drawn.push({ ...step });
      },
    } as never;
  } as never;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,U0hSVU5L";
  return {
    drawn,
    closed: () => closed,
    restore() {
      globalThis.createImageBitmap = realBitmap;
      HTMLCanvasElement.prototype.getContext = realContext;
      HTMLCanvasElement.prototype.toDataURL = realData;
    },
  };
}

describe("share pages", () => {
  /** The page the Share dialog downloads, read back as text. */
  async function downloaded(user: ReturnType<typeof userEvent.setup>) {
    let blob: Blob | null = null;
    const real = URL.createObjectURL;
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob;
      return "blob:docier-test/share";
    };
    await user.click(await within(screen.getByRole("dialog", { name: "Share your tools" })).findByRole("button", { name: "Download page" }));
    URL.createObjectURL = real;
    expect(blob).not.toBeNull();
    return (blob as unknown as Blob).text();
  }

  it("downloads a page for an employer: how well you use each tool and where, never the private parts", async () => {
    const roleId = await server.addRole("Giants Direct");
    const id = await addToolThroughApi("Drill", { maker: "Makita", skill: 4, roleIds: [roleId], serial: "SN-SECRET-1", paid: 159, keptAt: "Garage shelf B" });
    const form = new FormData();
    form.append("photos", photo("drill.png"));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    const canvas = fakeCanvas();
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const html = await downloaded(user);
    canvas.restore();
    expect(html).toContain("Drill");
    expect(html).toContain("Giants Direct");
    expect(html).toContain("4 of 5");
    // The photo goes in shrunk and re-encoded (which drops its location data), never as the original file.
    expect(html).toContain("data:image/jpeg;base64,U0hSVU5L");
    expect(html).not.toContain("data:image/png");
    expect(canvas.closed()).toBe(1);
    for (const secret of ["SN-SECRET-1", "159", "Garage shelf B"]) expect(html).not.toContain(secret);
  });

  it("downloads a page for a crew, and can leave your name off", async () => {
    await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: "Sam", lastName: "Rivera" }) });
    await addToolThroughApi("Drill", { condition: "good" });
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const share = screen.getByRole("dialog", { name: "Share your tools" });
    await user.click(within(share).getByRole("radio", { name: /crew/i }));
    const named = await downloaded(user);
    expect(named).toContain("Good");
    expect(named).toContain("Sam Rivera");
    await user.click(within(share).getByRole("checkbox", { name: "Put my name on it" }));
    const unnamed = await downloaded(user);
    expect(unnamed).not.toContain("Rivera");
  });

  it("says there's nothing to share when only drafts are shown", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolsPage />);
    await screen.findByRole("button", { name: "Add a tool" });
    await user.upload(pageFiles(container), photo("saw.png"));
    await user.click(within(await screen.findByRole("dialog", { name: "saw" })).getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const share = screen.getByRole("dialog", { name: "Share your tools" });
    expect(await within(share).findByText(/Nothing to share yet/)).toBeTruthy();
    expect(within(share).queryByRole("button", { name: "Download page" })).toBeNull();
  });

  it("leaves out a photo it can't shrink, rather than sending the original file", async () => {
    const id = await addToolThroughApi("Drill");
    const form = new FormData();
    form.append("photos", photo("drill.png"));
    await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form });
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const html = await downloaded(user);
    expect(html).toContain("Drill");
    expect(html).not.toContain("data:image");
  });

  it("turns and flips a photo the way it was framed", async () => {
    const id = await addToolThroughApi("Drill");
    const form = new FormData();
    form.append("photos", photo("drill.png"));
    const tool = ((await (await fetch(`/api/tools/${id}/photos`, { method: "POST", body: form })).json()) as { tool: { photos: Array<{ id: string }> } }).tool;
    await fetch(`/api/tools/${id}/photos/${tool.photos[0]!.id}/framing`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ framing: { rotation: 90, flipH: true, flipV: false, zoom: 1, focusX: 50, focusY: 50 } }),
    });
    const canvas = fakeCanvas();
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    await downloaded(user);
    canvas.restore();
    expect(canvas.drawn.at(-1)).toEqual({ rotate: 90, scale: [-1, 1] });
  });

  it("shares only the picked tools while picking, and needs something picked", async () => {
    await addToolThroughApi("Drill");
    await addToolThroughApi("Saw");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await screen.findByRole("button", { name: "Select" }));
    expect(screen.getByRole("button", { name: "Share" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Pick Saw" }));
    await user.click(screen.getByRole("button", { name: "Share" }));
    const html = await downloaded(user);
    expect(html).toContain("Saw");
    expect(html).not.toContain("Drill");
  });
});
