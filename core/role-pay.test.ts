import { describe, expect, it } from "vitest";
import { EMPTY_PAY, daysLeft, differentialText, formatPay, payEventText, paySummary, preparePayAndBenefits } from "./role-pay";

let n = 0;
const makeId = () => `id${++n}`;

describe("pay and benefits", () => {
  it("takes the rate, differentials, history, benefits, and time off", () => {
    const result = preparePayAndBenefits(
      {
        compensation: {
          currency: "usd",
          amount: "24.5",
          payType: "hourly",
          frequency: "biweekly",
          overtimeRate: 1.5,
          differentials: [{ label: "Nights", amount: 2, unit: "per-hour" }],
          bonusNotes: " Yearly, up to 5% ",
        },
        payHistory: [
          { date: "2023-01", kind: "raise", amount: 26 },
          { date: "2022-12", kind: "bonus", amount: 500, note: "Holiday" },
        ],
        benefits: ["Health", "health", "Dental", "  Boot allowance "],
        timeOff: [
          { year: 2022, kind: "pto", total: 10, used: 4 },
          { year: 2023, kind: "pto", total: 15, used: 2, carriedOver: 3 },
        ],
        paidTimeOff: "Accrues each pay period.",
      },
      { ...EMPTY_PAY, visibility: "public" },
      makeId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value;
    expect(value.compensation).toMatchObject({ currency: "USD", amount: 24.5, period: "hourly", payType: "hourly", frequency: "biweekly", overtimeRate: 1.5, bonusNotes: "Yearly, up to 5%" });
    // This form never changes whether pay is published.
    expect(value.compensation.visibility).toBe("public");
    expect(value.compensation.differentials).toEqual([{ id: expect.any(String), label: "Nights", amount: 2, unit: "per-hour" }]);
    expect(value.payHistory.map((event) => event.date)).toEqual(["2022-12", "2023-01"]);
    expect(value.benefits).toEqual(["Health", "Dental", "Boot allowance"]);
    expect(value.timeOff.map((item) => item.year)).toEqual([2023, 2022]);
  });

  it("puts salary per year and hourly per hour; a contract says which", () => {
    const period = (payType: string, given?: string) => {
      const result = preparePayAndBenefits({ compensation: { payType, period: given, amount: 10 } }, EMPTY_PAY, makeId);
      return result.ok ? result.value.compensation.period : null;
    };
    expect(period("salary", "hourly")).toBe("annual");
    expect(period("hourly", "annual")).toBe("hourly");
    expect(period("contract", "hourly")).toBe("hourly");
    expect(period("contract")).toBe("annual");
  });

  it("refuses what isn't a rate, a month, a kind, or a day count", () => {
    const bad: Array<[unknown, string]> = [
      [{ compensation: { currency: "dollars" } }, "currency-invalid"],
      [{ compensation: { amount: -1 } }, "amount-invalid"],
      [{ compensation: { payType: "tips" } }, "pay-type-invalid"],
      [{ compensation: { frequency: "daily" } }, "frequency-invalid"],
      [{ compensation: { overtimeRate: 9 } }, "overtime-invalid"],
      [{ compensation: { differentials: [{ label: "", amount: 2 }] } }, "differential-invalid"],
      [{ payHistory: [{ date: "2023", kind: "raise" }] }, "pay-event-date-invalid"],
      [{ payHistory: [{ date: "2023-01", kind: "gift" }] }, "pay-event-kind-invalid"],
      [{ timeOff: [{ year: 23, kind: "pto" }] }, "time-off-year-invalid"],
      [{ timeOff: [{ year: 2023, kind: "nap" }] }, "time-off-kind-invalid"],
      [{ timeOff: [{ year: 2023, kind: "pto", used: 400 }] }, "time-off-days-invalid"],
    ];
    for (const [input, error] of bad) {
      expect(preparePayAndBenefits(input as never, EMPTY_PAY, makeId)).toEqual({ ok: false, error });
    }
  });

  it("reads pay, events, and balances the way people say them", () => {
    expect(formatPay(24.5, "USD", "hourly")).toBe("$24.50/hr");
    expect(formatPay(62000, "USD", "annual")).toBe("$62,000/yr");
    const pay = { currency: "USD", period: "hourly" as const };
    expect(payEventText({ id: "a", date: "2023-01", kind: "raise", amount: 26, note: "" }, pay)).toBe("Raise to $26/hr");
    expect(payEventText({ id: "b", date: "2022-12", kind: "bonus", amount: 500, note: "Holiday" }, pay)).toBe("Bonus of $500 · Holiday");
    expect(daysLeft({ id: "t", year: 2023, kind: "pto", total: 15, used: 2, carriedOver: 3 })).toBe(16);
    expect(
      paySummary({
        compensation: { ...EMPTY_PAY, amount: 24.5, period: "hourly", frequency: "biweekly" },
        benefits: ["Health", "Dental"],
        timeOff: [{ id: "t", year: 2023, kind: "pto", total: 15, used: 2, carriedOver: 3 }],
      }),
    ).toBe("$24.50/hr · Every two weeks · 2 benefits · 16 PTO days left (2023)");
    expect(paySummary({ compensation: EMPTY_PAY, benefits: [], timeOff: [] })).toBe("");
  });
});

describe("a pay differential", () => {
  it("reads in the pay's own currency, or as a percent", () => {
    expect(differentialText({ id: "a", label: "Weekend", amount: 2, unit: "per-hour" }, "USD")).toBe("+$2/hr");
    expect(differentialText({ id: "b", label: "Nights", amount: 1.25, unit: "per-hour" }, "EUR")).toBe("+€1.25/hr");
    expect(differentialText({ id: "c", label: "Holiday", amount: 10, unit: "percent" }, "USD")).toBe("+10%");
  });
});
