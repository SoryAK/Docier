import { describe, expect, it } from "vitest";
import {
  colleagueToContact,
  matchContacts,
  prepareRolePersonLink,
  suggestRolePeople,
  type RolePerson,
} from "./role-people";

const person = (over: Partial<RolePerson>): RolePerson => ({
  linkId: "l1",
  contactId: "c1",
  name: "Maria Reyes",
  role: "Robotics technician",
  organization: "Giants Direct",
  email: "",
  photoUrl: null,
  note: "",
  since: "",
  ...over,
});

describe("role people", () => {
  it("checks a link's note and month", () => {
    expect(prepareRolePersonLink({ note: "  trained me ", since: "2024-06" })).toEqual({
      ok: true,
      value: { note: "trained me", since: "2024-06" },
    });
    // A full date keeps its month; nothing given is fine.
    expect(prepareRolePersonLink({ since: "2024-06-15" })).toEqual({ ok: true, value: { note: "", since: "2024-06" } });
    expect(prepareRolePersonLink({})).toEqual({ ok: true, value: { note: "", since: "" } });
    expect(prepareRolePersonLink({ since: "June" })).toEqual({ ok: false, error: "since-invalid" });
    expect(prepareRolePersonLink({ since: "2024-13" })).toEqual({ ok: false, error: "since-invalid" });
    expect(prepareRolePersonLink({ note: "x".repeat(201) })).toEqual({ ok: false, error: "note-too-long" });
  });

  it("suggests people from other roles at the same company, once each, never already linked", () => {
    const roles = [
      { id: "now", organization: "Giants Direct", people: [person({ linkId: "a", contactId: "dan", name: "Dan Kim" })] },
      { id: "before", organization: " giants direct ", people: [person({ linkId: "b", contactId: "maria" }), person({ linkId: "c", contactId: "dan", name: "Dan Kim" })] },
      { id: "again", organization: "Giants Direct", people: [person({ linkId: "d", contactId: "maria" })] },
      { id: "other", organization: "Sharp Packaging", people: [person({ linkId: "e", contactId: "sam", name: "Sam" })] },
    ];
    expect(suggestRolePeople("now", roles).map((p) => p.contactId)).toEqual(["maria"]);
    expect(suggestRolePeople("other", roles)).toEqual([]);
    expect(suggestRolePeople("missing", roles)).toEqual([]);
  });

  it("matches My Network by name, best first, leaving out people already linked", () => {
    const contacts = [
      { id: "1", name: "Maria Reyes", organization: "Giants Direct", role: "" },
      { id: "2", name: "Dan Kim", organization: "Giants Direct", role: "" },
      { id: "3", name: "Amaria Stone", organization: "", role: "" },
      { id: "4", name: "Mario Ruiz", organization: "", role: "" },
    ];
    expect(matchContacts(contacts, "mari", []).map((c) => c.id)).toEqual(["1", "4", "3"]);
    expect(matchContacts(contacts, "mari", ["1"]).map((c) => c.id)).toEqual(["4", "3"]);
    expect(matchContacts(contacts, "  ", [])).toEqual([]);
  });

  it("turns an old 'worked with' entry into a contact for My Network", () => {
    expect(
      colleagueToContact({ name: " Maria ", title: "Technician", note: "trained me", url: "https://example.com/maria" }, "Giants Direct"),
    ).toEqual({
      contact: { name: "Maria", organization: "Giants Direct", role: "Technician", email: "", notes: "https://example.com/maria" },
      note: "trained me",
    });
    expect(colleagueToContact({ name: "  ", title: "", note: "", url: "" }, "X")).toBeNull();
  });
});
