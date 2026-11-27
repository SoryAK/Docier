import { describe, expect, it } from "vitest";
import { createRelayApp } from "./app";
import { openRelayDatabase } from "./db";

const projection = {
  id: "projection-1",
  slug: "systems",
  visibility: "public",
  targetRole: "Principal Systems Engineer",
  theme: "dark",
  profile: {
    displayName: "Sory Kaba",
    headline: "Systems leader",
    city: "Philadelphia",
    state: "PA",
    bio: "Evidence-backed systems leader.",
    links: { linkedin: "", github: "", portfolio: "" },
  },
  roles: [
    {
      id: "role-1",
      kind: "job",
      title: "Lead Systems Engineer",
      organization: "Acme",
      span: "2024 — Present",
      description: "",
      achievements: ["Cut recovery from 42 to 11 minutes."],
      locations: [
        {
          id: "location-1",
          label: "Plant",
          address: "",
          latitude: 39.95,
          longitude: -75.16,
          kind: "primary",
          isPublic: true,
        },
      ],
      media: [],
      milestones: [],
      events: [],
      techStack: ["PLC"],
      skills: [],
    },
  ],
  skills: ["Incident leadership"],
  sections: ["profile", "history", "map", "skills"],
  expiresAt: null,
  sourceFingerprint: "abc",
  createdAt: "2026-09-19T20:00:00.000Z",
};

describe("Linked Evidence on a publication", () => {
  it("shows sources under the achievement they support and keeps links safe", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    const publish = (slug: string, roles: unknown[]) =>
      app.request(`/relay/publications/${slug}`, {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection: { ...projection, slug, roles } }),
      });
    try {
      await publish("evidence", [
        {
          ...projection.roles[0],
          linkedEvidence: [
            {
              id: "review",
              url: "https://reviews.example/fold",
              title: "The crease is gone",
              outlet: "Reviews Weekly",
              publishedOn: "2026-08-14",
              kind: "review",
              contribution: "Designed the hinge fix.",
              credit: "names-me",
              quote: "",
              timestamp: "",
              pin: { kind: "achievement", statement: "Cut recovery from 42 to 11 minutes." },
              isPublic: true,
            },
            {
              id: "odd",
              url: "javascript:alert(1)",
              title: "<script>bad()</script>",
              outlet: "",
              publishedOn: "",
              kind: "talk",
              contribution: "",
              credit: "about-my-work",
              quote: "Thanks to the team.",
              timestamp: "14:32",
              pin: null,
              isPublic: true,
            },
          ],
        },
      ]);
      const html = await (await app.request("/r/evidence")).text();
      const achievement = html.indexOf("Cut recovery from 42 to 11 minutes.");
      const review = html.indexOf('href="https://reviews.example/fold"');
      expect(achievement).toBeGreaterThan(-1);
      expect(review).toBeGreaterThan(achievement);
      expect(html).toContain("Credited by name");
      expect(html).toContain("Covers work they contributed to");
      expect(html).toContain("at 14:32");
      expect(html).not.toContain("javascript:alert");
      expect(html).not.toContain("<script>bad()");

      await publish("older", [projection.roles[0]]);
      const older = await app.request("/r/older");
      expect(older.status).toBe(200);
      expect(await older.text()).toContain("Cut recovery from 42 to 11 minutes.");
    } finally {
      db.close();
    }
  });
});

describe("tools and photos on a publication", () => {
  const JPEG = "data:image/jpeg;base64,/9j/4AAQ";
  async function page(extra: Record<string, unknown>, roles: unknown[] = projection.roles) {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    await app.request("/relay/publications/tools", {
      method: "PUT",
      headers: { authorization: "Bearer owner-secret", "content-type": "application/json" },
      body: JSON.stringify({ projection: { ...projection, slug: "tools", roles, ...extra } }),
    });
    const html = await (await app.request("/r/tools")).text();
    db.close();
    return html;
  }

  it("shows the Tools section and each job's tools", async () => {
    const html = await page({
      sections: [...projection.sections, "tools"],
      tools: [
        { id: "t1", name: "Drill <b>", makerModel: "Makita · XFD131", facts: [{ label: "How well I use it", value: "4 of 5" }], roleIds: ["role-1"], photoUrl: JPEG },
      ],
    });
    expect(html).toContain("<h2>Tools</h2>");
    expect(html).toContain(`<img src="${JPEG}" alt="Drill &lt;b&gt;">`);
    expect(html).toContain("How well I use it");
    expect(html).toContain("Tools: Drill &lt;b&gt;");
    expect(html).not.toContain("Drill <b>");
  });

  it("draws only image data or web links, never another address", async () => {
    const role = projection.roles[0]!;
    const html = await page(
      {
        sections: [...projection.sections, "tools", "media"],
        tools: [{ id: "t1", name: "Drill", makerModel: "", facts: [], roleIds: [], photoUrl: "/api/tools/t1/photos/p1" }],
      },
      [
        {
          ...role,
          media: [
            { id: "m1", kind: "photo", title: "Local", url: "/api/work-map/media/m1", caption: "", isPublic: true },
            { id: "m2", kind: "photo", title: "Svg", url: "data:image/svg+xml;base64,PHN2Zz4=", caption: "", isPublic: true },
            { id: "m3", kind: "photo", title: "Linked", url: "https://example.com/a.jpg", caption: "", isPublic: true },
            { id: "m4", kind: "photo", title: "Data", url: JPEG, caption: "", isPublic: true },
          ],
        },
      ],
    );
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("svg+xml");
    expect(html).toContain('src="https://example.com/a.jpg"');
    expect(html).toContain(`src="${JPEG}"`);
  });

  it("gives an agent each photo once", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    const role = projection.roles[0]!;
    await app.request("/relay/publications/tools", {
      method: "PUT",
      headers: { authorization: "Bearer owner-secret", "content-type": "application/json" },
      body: JSON.stringify({
        projection: {
          ...projection,
          slug: "tools",
          sections: [...projection.sections, "tools", "media"],
          roles: [{ ...role, media: [{ id: "m1", kind: "photo", title: "Panel", url: JPEG, caption: "", isPublic: true }] }],
          tools: [{ id: "t1", name: "Drill", makerModel: "", facts: [], roleIds: [], photoUrl: JPEG }],
        },
      }),
    });
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_publication", arguments: { slug: "tools" } } };
    const modern = await (
      await mcp(
        app,
        { ...call, params: { ...modernMeta(), ...call.params } },
        { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "read_publication" },
      )
    ).text();
    expect(modern.split(JPEG).length - 1).toBe(2);
    const body = JSON.parse(modern) as { result: { content: Array<{ text: string }>; structuredContent: { tools: Array<{ photoUrl: string }> } } };
    expect(body.result.structuredContent.tools[0]?.photoUrl).toBe(JPEG);
    expect(body.result.content[0]?.text).toContain("Drill");
    // An agent on the older protocol has only the text, so its photos stay there.
    const legacy = await (await mcp(app, call)).text();
    expect(legacy.split(JPEG).length - 1).toBe(2);
    db.close();
  });

  it("an older page without tools still opens", async () => {
    const html = await page({});
    expect(html).toContain("Lead Systems Engineer");
    expect(html).not.toContain("<h2>Tools</h2>");
  });
});

describe("publishing relay", () => {
  it("lets an agent read the same snapshot a person opens", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      const published = {
        ...projection,
        profile: { ...projection.profile, bio: "Kept the line running through the night." },
      };
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection: published }),
      });

      const read = await mcp(app, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      expect(read.status).toBe(200);
      const body = (await read.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(body.result.isError).toBe(false);
      expect(body.result.content[0]?.text).toContain(
        "Kept the line running through the night.",
      );
      expect(body.result.content[0]?.text).toContain(
        "Cut recovery from 42 to 11 minutes.",
      );
      expect(body.result.content[0]?.text).not.toContain("occupantId");

      const analytics = await app.request("/relay/publications/systems/analytics", {
        headers: { authorization: "Bearer owner-secret" },
      });
      const stats = (await analytics.json()) as {
        events: Array<{ event_type: string }>;
      };
      expect(stats.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ event_type: "read" })]),
      );

      await app.request("/relay/publications/systems", {
        method: "DELETE",
        headers: { authorization: "Bearer owner-secret" },
      });
      const revoked = await mcp(app, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      const revokedBody = (await revoked.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(revokedBody.result.isError).toBe(true);
      expect(revokedBody.result.content[0]?.text).toBe(
        "This publication is not available.",
      );
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("refuses an expired publication to an agent and a person", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: { ...projection, expiresAt: "2000-01-01T00:00:00.000Z" },
        }),
      });
      const read = await mcp(app, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      const body = (await read.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0]?.text).toBe(
        "This publication is not available.",
      );
      expect(body.result.content[0]?.text).not.toContain("Cut recovery");
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("requires the same access token the page requires", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: {
            ...projection,
            visibility: "access-controlled",
            profile: { ...projection.profile, bio: "Shared with a token." },
          },
        }),
      });
      const refused = await mcp(app, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems" },
        },
      });
      const refusedBody = (await refused.json()) as {
        result: { content: Array<{ text: string }> };
      };
      expect(refusedBody.result.content[0]?.text).toBe(
        "This publication requires an access token.",
      );
      expect(refusedBody.result.content[0]?.text).not.toContain("Shared with a token.");

      await app.request("/relay/publications/systems/grants", {
        method: "POST",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "viewer-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      });
      const allowed = await mcp(app, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "read_publication",
          arguments: { slug: "systems", token: "viewer-token" },
        },
      });
      const allowedBody = (await allowed.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(allowedBody.result.isError).toBe(false);
      expect(allowedBody.result.content[0]?.text).toContain("Shared with a token.");
    } finally {
      db.close();
    }
  });

  it("answers a current agent on the publication endpoint", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      expect((await app.request("/mcp")).status).toBe(405);
      const foreign = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: modernMeta(),
        },
        {
          origin: "https://evil.example",
          host: "localhost",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
        },
      );
      expect(foreign.status).toBe(403);

      const discover = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "server/discover",
          params: modernMeta(),
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
        },
      );
      const discovered = (await discover.json()) as {
        result: { supportedVersions: string[]; capabilities: { tools: unknown } };
      };
      expect(discovered.result.supportedVersions).toContain("2026-07-28");
      expect(discovered.result.capabilities.tools).toEqual({});

      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection }),
      });
      const mismatch = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            ...modernMeta(),
            name: "read_publication",
            arguments: { slug: "systems" },
          },
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "other-tool",
        },
      );
      expect(mismatch.status).toBe(400);

      const read = await mcp(
        app,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            ...modernMeta(),
            name: "read_publication",
            arguments: { slug: "systems" },
          },
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "read_publication",
        },
      );
      const body = (await read.json()) as {
        result: {
          resultType: string;
          structuredContent: { roles: Array<{ achievements: string[] }> };
        };
      };
      expect(body.result.resultType).toBe("complete");
      expect(body.result.structuredContent.roles[0]?.achievements).toEqual([
        "Cut recovery from 42 to 11 minutes.",
      ]);
    } finally {
      db.close();
    }
  });

  it("publishes a minimized bundle and blocks access after revocation", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      const publish = await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection }),
      });
      expect(publish.status).toBe(201);

      const publicPage = await app.request("/r/systems?view=journey");
      expect(publicPage.status).toBe(200);
      expect(publicPage.headers.get("content-security-policy")).toBe(
        "frame-ancestors *",
      );
      expect(await publicPage.text()).toContain("Cut recovery");

      const embed = await app.request("/r/systems?embed=1");
      const embedHtml = await embed.text();
      expect(embedHtml).toContain('class="embed"');
      expect(embedHtml).toContain('href="?view=journey&embed=1"');

      const revoke = await app.request("/relay/publications/systems", {
        method: "DELETE",
        headers: { authorization: "Bearer owner-secret" },
      });
      expect(revoke.status).toBe(200);
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("offers an access request instead of exposing a protected map", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: { ...projection, visibility: "access-controlled" },
        }),
      });
      const page = await app.request("/r/systems");
      expect(page.status).toBe(403);
      expect(await page.text()).toContain("Request access");
      expect(
        (
          await app.request("/r/systems/requests", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "Recruiter",
              email: "recruiter@example.com",
            }),
          })
        ).status,
      ).toBe(201);
    } finally {
      db.close();
    }
  });
});

function modernMeta() {
  return {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  };
}

async function mcp(
  app: ReturnType<typeof createRelayApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("share links with an access token", () => {
  async function protectedRelay() {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    const owner = {
      authorization: "Bearer owner-secret",
      "content-type": "application/json",
    };
    await app.request("/relay/publications/systems", {
      method: "PUT",
      headers: owner,
      body: JSON.stringify({
        projection: {
          ...projection,
          visibility: "access-controlled",
          profile: { ...projection.profile, bio: "Shared with a token." },
        },
      }),
    });
    await app.request("/relay/publications/systems/grants", {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ token: "viewer-token", expiresAt: "2099-01-01T00:00:00.000Z" }),
    });
    return { db, app };
  }

  it("trades the token for a page cookie and drops it from the address", async () => {
    const { db, app } = await protectedRelay();
    try {
      const first = await app.request("https://relay.test/r/systems?token=viewer-token&view=journey");
      expect(first.status).toBe(303);
      expect(first.headers.get("location")).toBe("/r/systems?view=journey");
      expect(first.headers.get("referrer-policy")).toBe("no-referrer");
      const cookie = first.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/r/systems");

      const page = await app.request("https://relay.test/r/systems?view=journey", {
        headers: { cookie: cookie.split(";")[0] },
      });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Shared with a token.");
      expect(page.headers.get("cache-control")).toBe("private, no-store");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    } finally {
      db.close();
    }
  });

  it("counts an open from the page cookie, once per half hour", async () => {
    const { db, app } = await protectedRelay();
    try {
      const first = await app.request("https://relay.test/r/systems?token=viewer-token");
      const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
      const visit = () => app.request("https://relay.test/r/systems", { headers: { cookie } });
      expect((await visit()).status).toBe(200);
      expect((await visit()).status).toBe(200);
      const listed = await app.request("/relay/grants/opens", {
        headers: { authorization: "Bearer owner-secret" },
      });
      const { opens } = (await listed.json()) as { opens: { slug: string }[] };
      expect(opens).toHaveLength(1);
      expect(opens[0].slug).toBe("systems");
    } finally {
      db.close();
    }
  });

  it("sets the cookie Secure whatever the request claims, unless told not to", async () => {
    const { db, app } = await protectedRelay();
    try {
      const plain = await app.request("http://relay.test/r/systems?token=viewer-token", {
        headers: { "x-forwarded-proto": "http" },
      });
      expect(plain.headers.get("set-cookie") ?? "").toContain("Secure");
      const local = createRelayApp(db, "owner-secret", { insecureCookies: true });
      const lan = await local.request("http://192.168.1.20/r/systems?token=viewer-token");
      expect(lan.headers.get("set-cookie") ?? "").not.toContain("Secure");
    } finally {
      db.close();
    }
  });

  it("refuses the page without the cookie, and sets none for a wrong token", async () => {
    const { db, app } = await protectedRelay();
    try {
      expect((await app.request("/r/systems")).status).toBe(403);
      const wrong = await app.request("/r/systems?token=guess");
      expect(wrong.status).toBe(303);
      expect(wrong.headers.get("location")).toBe("/r/systems");
      expect(wrong.headers.get("set-cookie")).toBeNull();
      const forged = await app.request("/r/systems", {
        headers: { cookie: "proforna_access=guess" },
      });
      expect(forged.status).toBe(403);
    } finally {
      db.close();
    }
  });
});
