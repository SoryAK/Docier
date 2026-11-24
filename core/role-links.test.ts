import { describe, expect, it } from "vitest";
import { linkHost, prepareRoleLinks, roleLinkList } from "./role-links";

describe("a role's company links", () => {
  it("keeps full links, adds https:// to a bare address, and clears blanks", () => {
    const prepared = prepareRoleLinks({
      website: "giantdirect.com",
      linkedin: " https://www.linkedin.com/company/giant-direct ",
      instagram: "",
      youtube: "http://youtube.com/@giant",
    });
    expect(prepared).toEqual({
      ok: true,
      value: {
        website: "https://giantdirect.com",
        linkedin: "https://www.linkedin.com/company/giant-direct",
        instagram: "",
        facebook: "",
        x: "",
        youtube: "http://youtube.com/@giant",
      },
    });
  });

  it("refuses something that isn't a web link, and names the field", () => {
    expect(prepareRoleLinks({ facebook: "not a link" })).toEqual({ ok: false, error: "url-invalid", field: "facebook" });
    expect(prepareRoleLinks({ x: "javascript:alert(1)" })).toEqual({ ok: false, error: "url-invalid", field: "x" });
    expect(prepareRoleLinks({ website: "https://me:pw@site.com" })).toEqual({ ok: false, error: "url-invalid", field: "website" });
  });

  it("lists the links that are set, in order, with their labels", () => {
    const list = roleLinkList({ website: "https://www.giantdirect.com/about", linkedin: "", instagram: "https://instagram.com/giant", facebook: "", x: "https://x.com/giant", youtube: "" });
    expect(list.map((link) => [link.kind, link.label])).toEqual([
      ["website", "giantdirect.com"],
      ["instagram", "Instagram"],
      ["x", "X"],
    ]);
    expect(linkHost("nonsense")).toBe("nonsense");
  });
});
