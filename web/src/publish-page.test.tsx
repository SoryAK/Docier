import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishCareerPage } from "./publish-page";
import { stubBrowser, useRealApp } from "./test/app-fetch";
import { fakeCanvas } from "./test/canvas";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

let server: ReturnType<typeof useRealApp>;
let canvas: ReturnType<typeof fakeCanvas>;
beforeEach(() => {
  stubBrowser();
  server = useRealApp();
  canvas = fakeCanvas();
});
afterEach(() => {
  canvas.restore();
  server.close();
});

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("publishing the career page", () => {
  it("prepares the tool's cover and sends it, never its address", async () => {
    await fetch("/api/profile", json("PUT", { fullName: "Sory Kaba" }));
    const tool = (await (await fetch("/api/tools", json("POST", { name: "Drill", onCareerPage: true }))).json()) as { tool: { id: string } };
    const form = new FormData();
    form.append("photos", new File([PNG], "drill.png", { type: "image/png" }));
    await fetch(`/api/tools/${tool.tool.id}/photos`, { method: "POST", body: form });
    await fetch("/api/work-map/settings", json("PUT", { slug: "sory", visibility: "unlisted", sections: ["profile", "tools"] }));

    const response = await publishCareerPage();
    expect(response.status).toBe(201);
    const row = server.db.prepare("SELECT projection_json FROM interactive_projections").get() as { projection_json: string };
    const page = JSON.parse(row.projection_json) as { tools: Array<{ photoUrl: string }> };
    expect(page.tools[0]?.photoUrl).toBe("data:image/jpeg;base64,U0hSVU5L");
    expect(row.projection_json).not.toContain("/api/");
  });

  it("passes on why the page can't be made", async () => {
    await fetch("/api/work-map/settings", json("PUT", { slug: "sory", sections: [] }));
    const response = await publishCareerPage();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "sections-required" });
  });
});
