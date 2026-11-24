import { describe, expect, it } from "vitest";
import { roleHistory } from "../core/role-history";
import { createApp } from "./app";
import { openDatabase } from "./db";

async function setup() {
  const app = createApp(openDatabase(":memory:"));
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const id = (
    await send("POST", "/api/work-map/roles", { kind: "job", title: "Technician", organization: "Giants Direct", startDate: "2022-03-01", isCurrent: true })
  ).body.role.id as string;
  const role = async () => ((await send("GET", "/api/work-map")).body.roles as any[]).find((item) => item.id === id)!;
  return { send, id, role };
}

const PAY = {
  compensation: { currency: "USD", amount: 24.5, payType: "hourly", frequency: "biweekly", overtimeRate: 1.5, differentials: [{ label: "Nights", amount: 2, unit: "per-hour" }] },
  payHistory: [{ date: "2023-01", kind: "raise", amount: 26 }],
  benefits: ["Health", "401(k) match"],
  benefitNotes: "Match up to 4%",
  timeOff: [{ year: 2023, kind: "pto", total: 15, used: 2 }],
  paidTimeOff: "Accrues each pay period.",
};

describe("a role's pay and benefits", () => {
  it("saves, reads back, and changes them", async () => {
    const { send, id, role } = await setup();
    expect((await send("PUT", `/api/work-map/roles/${id}/pay`, PAY)).status).toBe(200);
    const details = (await role()).details;
    expect(details.compensation).toMatchObject({ amount: 24.5, period: "hourly", payType: "hourly", frequency: "biweekly", visibility: "private" });
    expect(details.payHistory).toEqual([{ id: expect.any(String), date: "2023-01", kind: "raise", amount: 26, note: "" }]);
    expect(details.benefits).toEqual(["Health", "401(k) match"]);
    expect(details.timeOff[0]).toMatchObject({ year: 2023, kind: "pto", total: 15, used: 2 });

    const eventId = details.payHistory[0].id;
    await send("PUT", `/api/work-map/roles/${id}/pay`, { ...PAY, payHistory: [{ id: eventId, date: "2023-02", kind: "raise", amount: 27 }], timeOff: [] });
    const after = (await role()).details;
    expect(after.payHistory).toEqual([{ id: eventId, date: "2023-02", kind: "raise", amount: 27, note: "" }]);
    expect(after.timeOff).toEqual([]);
  });

  it("refuses bad pay and a role that isn't there", async () => {
    const { send, id } = await setup();
    expect(await send("PUT", `/api/work-map/roles/${id}/pay`, { ...PAY, payHistory: [{ date: "soon", kind: "raise" }] })).toEqual({
      status: 400,
      body: { error: "pay-event-date-invalid" },
    });
    expect((await send("PUT", "/api/work-map/roles/nope/pay", PAY)).status).toBe(404);
  });

  it("keeps the newer pay fields when the older details form saves", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/pay`, PAY);
    await send("PUT", `/api/work-map/roles/${id}/details`, { compensation: { amount: 25, currency: "USD", period: "hourly", visibility: "private" } });
    const details = (await role()).details;
    expect(details.compensation).toMatchObject({ amount: 25, frequency: "biweekly", overtimeRate: 1.5 });
    expect(details.compensation.differentials).toHaveLength(1);
    expect(details.payHistory).toHaveLength(1);
  });

  it("puts raises and bonuses in the role's history", async () => {
    const { send, id, role } = await setup();
    await send("PUT", `/api/work-map/roles/${id}/pay`, { ...PAY, payHistory: [...PAY.payHistory, { date: "2022-12", kind: "bonus", amount: 500 }] });
    const years = roleHistory(await role(), { filter: "all", query: "", order: "oldest", now: new Date("2026-11-23") } as never);
    const texts = years.flatMap((year) => year.items.map((item) => `${item.date} ${item.text}`));
    expect(texts).toEqual(expect.arrayContaining(["2023-01 Raise to $26/hr", "2022-12 Bonus of $500"]));
  });

  it("never publishes what this form adds", async () => {
    const { send, id } = await setup();
    await send("PUT", "/api/work-map/settings", { slug: "tech", visibility: "public", sections: ["profile", "history"] });
    await send("PUT", `/api/work-map/roles/${id}/pay`, PAY);
    const shared = JSON.stringify((await send("GET", "/api/work-map/preview")).body.snapshot.roles[0]);
    for (const secret of ["24.5", "biweekly", "Nights", "401(k)", "Accrues", "2023-01"]) expect(shared).not.toContain(secret);
  });
});
