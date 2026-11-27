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
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
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
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
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
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    within(dialog).getByRole("button", { name: "Save" }).focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Save" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Adjust photo" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Meter" })).toBeTruthy();
  });

  it("shows the framing in a card-shaped preview while you adjust", async () => {
    await toolWithPhoto("Meter");
    const user = userEvent.setup();
    render(<ToolsPage />);
    await user.click(await within(await screen.findByRole("complementary", { name: "Meter" })).findByRole("button", { name: "Adjust photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Adjust photo" });
    await user.click(within(dialog).getByRole("button", { name: "Rotate right" }));
    const preview = within(dialog).getByRole("img", { name: "How the card will show it" });
    expect(preview.style.transform).toBe("rotate(90deg)");
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
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("closes an open tool when choosing starts", async () => {
    const id = await addToolThroughApi("Drill");
    window.location.hash = `#/tools/${id}`;
    const user = userEvent.setup();
    render(<ToolsPage />);
    await screen.findByRole("complementary", { name: "Drill" });
    await user.click(screen.getByRole("button", { name: "Select" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
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
    await screen.findByRole("complementary", { name: "Drill" });
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Pick Drill" }));
    // Browser Back returns to the tool's address.
    window.location.hash = `#/tools/${id}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await screen.findByRole("complementary", { name: "Drill" });
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
