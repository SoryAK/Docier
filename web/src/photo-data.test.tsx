import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FRAMING } from "@core/personal-tools";
import { photoData } from "./photo-data";
import { stubBrowser, useRealApp } from "./test/app-fetch";
import { fakeCanvas } from "./test/canvas";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
let server: ReturnType<typeof useRealApp>;
beforeEach(() => {
  stubBrowser();
  server = useRealApp();
});
afterEach(() => server.close());

async function toolPhotoUrl(): Promise<string> {
  const tool = (await (
    await fetch("/api/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ladder" }) })
  ).json()) as { tool: { id: string } };
  const form = new FormData();
  form.append("photos", new File([PNG], "ladder.png", { type: "image/png" }));
  const added = (await (await fetch(`/api/tools/${tool.tool.id}/photos`, { method: "POST", body: form })).json()) as {
    tool: { photos: Array<{ url: string }> };
  };
  return added.tool.photos[0]!.url;
}

describe("preparing a photo", () => {
  it("keeps a tall photo within the height limit too", async () => {
    const canvas = fakeCanvas({ width: 600, height: 4000 });
    try {
      expect(await photoData(await toolPhotoUrl(), DEFAULT_FRAMING)).toMatch(/^data:image\/jpeg/);
      expect(canvas.sizes[0]).toEqual({ width: 144, height: 960 });
    } finally {
      canvas.restore();
    }
  });

  it("shrinks a wide photo to 640 across", async () => {
    const canvas = fakeCanvas({ width: 3200, height: 1600 });
    try {
      await photoData(await toolPhotoUrl(), DEFAULT_FRAMING);
      expect(canvas.sizes[0]).toEqual({ width: 640, height: 320 });
    } finally {
      canvas.restore();
    }
  });
});
