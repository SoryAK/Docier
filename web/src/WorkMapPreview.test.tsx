import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkMapPreview, WorkMapPreviewPage, type PublicWorkMapSnapshot } from "./WorkMapPreview";
import { stubBrowser, useRealApp } from "./test/app-fetch";
import { fakeCanvas } from "./test/canvas";

const JPEG = "data:image/jpeg;base64,U0hSVU5L";
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

let server: ReturnType<typeof useRealApp>;
let canvas: ReturnType<typeof fakeCanvas>;
beforeEach(() => {
  stubBrowser();
  server = useRealApp();
  canvas = fakeCanvas();
});
afterEach(() => {
  cleanup();
  canvas.restore();
  server.close();
});

const page: PublicWorkMapSnapshot = {
  id: "s1",
  slug: "sory",
  visibility: "unlisted",
  targetRole: "",
  theme: "dark",
  profile: { displayName: "Sory Kaba", headline: "", city: "", state: "", bio: "", links: { linkedin: "", github: "", portfolio: "" } },
  roles: [
    {
      id: "r1",
      kind: "job",
      title: "Electrician",
      organization: "Giants Direct",
      span: "Jan 2020 – Mar 2022",
      place: "",
      description: "",
      achievements: [],
      locations: [],
      media: [],
      linkedEvidence: [],
      milestones: [],
      events: [],
      techStack: [],
      skills: [],
    },
  ],
  skills: [],
  tools: [
    { id: "t1", name: "Drill", makerModel: "Makita · XFD131", facts: [{ label: "Used at", value: "Giants Direct" }], roleIds: ["r1"], photoUrl: JPEG },
  ],
  sections: ["history", "tools"],
  expiresAt: null,
  sourceFingerprint: "f",
  createdAt: "",
};

describe("previewing tools on the career page", () => {
  it("shows the Tools section, and the tools under the job they were used at", async () => {
    const user = userEvent.setup();
    render(<WorkMapPreview snapshot={page} publishable exactLocations={false} mapSettings={null} onClose={() => {}} />);
    const tools = screen.getByRole("region", { name: "Tools" });
    expect(within(tools).getByText("Drill")).toBeTruthy();
    expect(within(tools).getByText("Makita · XFD131")).toBeTruthy();
    expect(within(tools).getByRole("img", { name: "Drill" }).getAttribute("src")).toBe(JPEG);

    await user.click(screen.getByRole("button", { name: /Giants Direct/ }));
    expect(within(screen.getByRole("region", { name: "Electrician preview" })).getByText("Tools: Drill")).toBeTruthy();
  });

  it("previews prepared photos, as they'll publish", async () => {
    const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await fetch("/api/profile", json("PUT", { fullName: "Sory Kaba" }));
    const tool = (await (await fetch("/api/tools", json("POST", { name: "Drill", onCareerPage: true }))).json()) as { tool: { id: string } };
    const form = new FormData();
    form.append("photos", new File([PNG], "drill.png", { type: "image/png" }));
    await fetch(`/api/tools/${tool.tool.id}/photos`, { method: "POST", body: form });
    await fetch("/api/work-map/settings", json("PUT", { slug: "sory", visibility: "unlisted", sections: ["profile", "tools"] }));

    render(<WorkMapPreviewPage />);
    const tools = await screen.findByRole("region", { name: "Tools" });
    await waitFor(() => expect(within(tools).getByRole("img", { name: "Drill" }).getAttribute("src")).toBe(JPEG));
  });
});
