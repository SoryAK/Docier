import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

async function setup() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "docier-resume-edits-"));
  const app = createApp(db, { uploadsDir });
  cleanup = () => {
    db.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  };
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const upload = async (name: string) => {
    const form = new FormData();
    form.append("file", new File([`%PDF-1.4 ${name}`], name, { type: "application/pdf" }));
    const response = await app.request("/api/resumes", { method: "POST", body: form });
    return ((await response.json()) as { resume: { id: string } }).resume.id;
  };
  const roles = async () => (await send("GET", "/api/work-map")).body.roles as any[];
  return { send, upload, roles };
}

const JOB = {
  company: "Acme",
  title: "Lead",
  location: "NYC",
  startDate: "2024-01-01",
  isCurrent: true,
  description: "Ran the shop.",
  achievements: ["Cut overtime"],
};

describe("changes a resume makes to a role", () => {
  it("records a role a resume adds, for the record only", async () => {
    const { send, upload, roles } = await setup();
    const resumeId = await upload("cv.pdf");
    await send("POST", "/api/history", { experience: [JOB], education: [], skills: [], roleIds: ["file-0-job-0"], resumeId });
    const [role] = await roles();
    expect(role.edits).toEqual([expect.objectContaining({ area: "role", summary: "Added from your resume", canUndo: false })]);
  });

  it("records what a resume saved again changed, and can undo it", async () => {
    const { send, upload, roles } = await setup();
    const resumeId = await upload("cv.pdf");
    await send("POST", "/api/history", { experience: [JOB], education: [], skills: [], roleIds: ["file-0-job-0"], resumeId });
    await send("POST", "/api/history", {
      experience: [{ ...JOB, title: "Director" }],
      education: [],
      skills: [],
      roleIds: ["file-0-job-0"],
      resumeId,
    });
    const [role] = await roles();
    const [edit] = role.edits;
    expect(edit.summary).toBe("From your resume: changed the title to Director");
    expect(edit.canUndo).toBe(true);
    await send("POST", `/api/work-map/roles/${role.id}/edits/${edit.id}/undo`);
    expect((await roles())[0].title).toBe("Lead");
  });

  it("records nothing when a resume saved again changes nothing", async () => {
    const { send, upload, roles } = await setup();
    const resumeId = await upload("cv.pdf");
    const body = { experience: [JOB], education: [], skills: [], roleIds: ["file-0-job-0"], resumeId };
    await send("POST", "/api/history", body);
    await send("POST", "/api/history", body);
    expect((await roles())[0].edits).toHaveLength(1);
  });

  it("records a change to only a school's field of study, and can undo it", async () => {
    const { send, upload, roles } = await setup();
    const resumeId = await upload("cv.pdf");
    const school = { institution: "City College", degree: "AAS", field: "Electronics", startDate: "2016-01-01", endDate: "2018-05-01" };
    const body = (field: string) => ({ experience: [], education: [{ ...school, field }], skills: [], educationRoleIds: ["file-0-school-0"], resumeId });
    await send("POST", "/api/history", body("Electronics"));
    // The same school saved again changes nothing, so nothing new is recorded.
    await send("POST", "/api/history", body("Electronics"));
    expect((await roles())[0].edits).toHaveLength(1);

    await send("POST", "/api/history", body("Mechatronics"));
    const [role] = await roles();
    const [edit] = role.edits;
    expect(edit.summary).toBe("From your resume: changed the field of study");
    expect(edit.canUndo).toBe(true);
    await send("POST", `/api/work-map/roles/${role.id}/edits/${edit.id}/undo`);
    const history = (await send("GET", "/api/history")).body as { schools: Array<{ field: string }> };
    expect(history.schools[0]!.field).toBe("Electronics");
  });

  it("records what applying a later resume changed", async () => {
    const { send, upload, roles } = await setup();
    const first = await upload("first.pdf");
    await send("POST", "/api/history", { resumeId: first, experience: [{ company: "Acme", title: "Engineer", achievements: ["Kept duty"] }], education: [], skills: [] });
    const id = (await roles())[0].id;
    const second = await upload("second.pdf");
    await send("POST", "/api/resumes/apply", {
      resumeId: second,
      updates: [
        {
          id,
          kind: "job",
          title: "Engineer",
          organization: "Acme",
          location: "",
          startDate: "",
          endDate: "",
          isCurrent: false,
          description: "",
          achievements: ["Kept duty", "Added duty"],
        },
      ],
      created: { experience: [], education: [], skills: [] },
      asides: [],
    });
    const [edit] = (await roles())[0].edits;
    expect(edit.summary).toBe("From your resume: added an achievement: Added duty");
    expect(edit.canUndo).toBe(true);
  });

  it("records a place a resume moves, for the record only", async () => {
    const { send, upload, roles } = await setup();
    const resumeId = await upload("cv.pdf");
    const site = { label: "New York", address: "New York, New York, United States", latitude: 40.7128, longitude: -74.006 };
    const body = { experience: [{ ...JOB, site }], education: [], skills: [], roleIds: ["file-0-job-0"], resumeId };
    await send("POST", "/api/history", body);
    await send("POST", "/api/history", body);
    expect((await roles())[0].edits).toHaveLength(1);
    await send("POST", "/api/history", { ...body, experience: [{ ...JOB, site: { label: "Boston", address: "Boston, Massachusetts, United States", latitude: 42.3601, longitude: -71.0589 } }] });
    const [edit] = (await roles())[0].edits;
    expect(edit).toEqual(expect.objectContaining({ area: "places", summary: "From your resume: moved a place to Boston", canUndo: false }));
  });
});
