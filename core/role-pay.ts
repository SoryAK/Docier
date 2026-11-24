/**
 * A role's pay and benefits: the rate and how it was paid, raises and bonuses
 * over time, benefits, and time off. Private: none of it is published from here.
 */

export const PAY_TYPES = ["salary", "hourly", "contract"] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const PAY_TYPE_LABEL: Record<PayType, string> = { salary: "Salary", hourly: "Hourly", contract: "Contract" };

export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];
export const PAY_FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export const PAY_EVENT_KINDS = ["raise", "bonus", "adjustment", "cut"] as const;
export type PayEventKind = (typeof PAY_EVENT_KINDS)[number];
export const PAY_EVENT_LABEL: Record<PayEventKind, string> = { raise: "Raise", bonus: "Bonus", adjustment: "Adjustment", cut: "Pay cut" };

export const TIME_OFF_KINDS = ["pto", "vacation", "sick", "personal", "holiday"] as const;
export type TimeOffKind = (typeof TIME_OFF_KINDS)[number];
export const TIME_OFF_LABEL: Record<TimeOffKind, string> = { pto: "PTO", vacation: "Vacation", sick: "Sick", personal: "Personal", holiday: "Floating holiday" };

/** Common benefits, offered as a checklist; anything else can be added by name. */
export const COMMON_BENEFITS = [
  "Health",
  "Dental",
  "Vision",
  "401(k)",
  "401(k) match",
  "Pension",
  "HSA",
  "FSA",
  "Life insurance",
  "Disability",
  "Tuition help",
  "Stock",
  "Gym",
  "Commuter",
  "Childcare",
  "Uniforms",
] as const;

/** Extra pay for a shift or condition: per hour on top, or a percent of the rate. */
export type PayDifferential = { id: string; label: string; amount: number; unit: "per-hour" | "percent" };

/** Everything about the rate. `period` is what `amount` is per: an hour or a year. */
export type RolePay = {
  currency: string;
  period: "hourly" | "annual";
  amount: number | null;
  visibility: "private" | "range" | "public";
  payType: PayType | "";
  frequency: PayFrequency | "";
  /** Overtime as a multiple of the rate, e.g. 1.5. */
  overtimeRate: number | null;
  differentials: PayDifferential[];
  bonusNotes: string;
  equityNotes: string;
};

/** A dated change: a raise or cut to a new rate, a one-time bonus, or an adjustment. */
export type PayEvent = { id: string; date: string; kind: PayEventKind; amount: number | null; note: string };

/** Time off for one year and kind, in days. */
export type TimeOffBalance = { id: string; year: number; kind: TimeOffKind; total: number | null; used: number | null; carriedOver: number | null };

export type PayAndBenefits = {
  compensation: RolePay;
  payHistory: PayEvent[];
  benefits: string[];
  benefitNotes: string;
  timeOff: TimeOffBalance[];
  /** Notes on time off, e.g. "Unlimited, two-week minimum". */
  paidTimeOff: string;
};

export type PayError =
  | "currency-invalid"
  | "amount-invalid"
  | "pay-type-invalid"
  | "frequency-invalid"
  | "overtime-invalid"
  | "differential-invalid"
  | "pay-event-date-invalid"
  | "pay-event-kind-invalid"
  | "pay-event-amount-invalid"
  | "time-off-year-invalid"
  | "time-off-kind-invalid"
  | "time-off-days-invalid";

export const EMPTY_PAY: RolePay = {
  currency: "USD",
  period: "annual",
  amount: null,
  visibility: "private",
  payType: "",
  frequency: "",
  overtimeRate: null,
  differentials: [],
  bonusNotes: "",
  equityNotes: "",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const LIST_MAX = 100;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, LIST_MAX).map(record) : [];
}

/** A number in range, null when blank, or false when it isn't one. */
function amountOf(value: unknown, min: number, max: number): number | null | false {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) return false;
  return Math.round(number * 100) / 100;
}

function idOr(value: unknown, makeId: () => string): string {
  const id = text(value, 80);
  return id || makeId();
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | "" | false {
  const raw = text(value, 40);
  if (!raw) return "";
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : false;
}

/**
 * Checks pay and benefits as the form sends them. `visibility` is kept from what
 * was saved: this form never publishes pay.
 */
export function preparePayAndBenefits(
  input: Partial<Record<keyof PayAndBenefits, unknown>>,
  saved: RolePay,
  makeId: () => string,
): { ok: true; value: PayAndBenefits } | { ok: false; error: PayError } {
  const pay = record(input.compensation);
  const currency = text(pay.currency, 40).toUpperCase() || "USD";
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "currency-invalid" };
  const amount = amountOf(pay.amount, 0, 100_000_000);
  if (amount === false) return { ok: false, error: "amount-invalid" };
  const payType = oneOf(pay.payType, PAY_TYPES);
  if (payType === false) return { ok: false, error: "pay-type-invalid" };
  const frequency = oneOf(pay.frequency, PAY_FREQUENCIES);
  if (frequency === false) return { ok: false, error: "frequency-invalid" };
  const overtimeRate = amountOf(pay.overtimeRate, 1, 5);
  if (overtimeRate === false) return { ok: false, error: "overtime-invalid" };
  // Salary is per year and hourly per hour; a contract says which.
  const period: RolePay["period"] =
    payType === "salary" ? "annual" : payType === "hourly" ? "hourly" : pay.period === "hourly" ? "hourly" : "annual";

  const differentials: PayDifferential[] = [];
  for (const item of list(pay.differentials)) {
    const label = text(item.label, 80);
    const value = amountOf(item.amount, 0, 1_000_000);
    const unit = item.unit === "percent" ? "percent" : "per-hour";
    if (!label || value === false || value === null) return { ok: false, error: "differential-invalid" };
    differentials.push({ id: idOr(item.id, makeId), label, amount: value, unit });
  }

  const payHistory: PayEvent[] = [];
  for (const item of list(input.payHistory)) {
    const date = text(item.date, 7);
    if (!MONTH.test(date)) return { ok: false, error: "pay-event-date-invalid" };
    const kind = oneOf(item.kind, PAY_EVENT_KINDS);
    if (!kind) return { ok: false, error: "pay-event-kind-invalid" };
    const value = amountOf(item.amount, 0, 100_000_000);
    if (value === false) return { ok: false, error: "pay-event-amount-invalid" };
    payHistory.push({ id: idOr(item.id, makeId), date, kind, amount: value, note: text(item.note, 200) });
  }
  payHistory.sort((a, b) => a.date.localeCompare(b.date));

  const benefits: string[] = [];
  for (const item of Array.isArray(input.benefits) ? input.benefits : []) {
    const name = text(item, 60).replace(/\s+/g, " ");
    if (name && !benefits.some((kept) => kept.toLowerCase() === name.toLowerCase())) benefits.push(name);
  }

  const timeOff: TimeOffBalance[] = [];
  for (const item of list(input.timeOff)) {
    const year = typeof item.year === "string" ? Number(item.year) : item.year;
    if (typeof year !== "number" || !Number.isInteger(year) || year < 1950 || year > 2100) return { ok: false, error: "time-off-year-invalid" };
    const kind = oneOf(item.kind, TIME_OFF_KINDS);
    if (!kind) return { ok: false, error: "time-off-kind-invalid" };
    const total = amountOf(item.total, 0, 366);
    const used = amountOf(item.used, 0, 366);
    const carriedOver = amountOf(item.carriedOver, 0, 366);
    if (total === false || used === false || carriedOver === false) return { ok: false, error: "time-off-days-invalid" };
    timeOff.push({ id: idOr(item.id, makeId), year, kind, total, used, carriedOver });
  }
  timeOff.sort((a, b) => b.year - a.year || a.kind.localeCompare(b.kind));

  return {
    ok: true,
    value: {
      compensation: {
        currency,
        period,
        amount,
        visibility: saved.visibility,
        payType,
        frequency,
        overtimeRate,
        differentials,
        bonusNotes: text(pay.bonusNotes),
        equityNotes: text(pay.equityNotes),
      },
      payHistory,
      benefits: benefits.slice(0, 50),
      benefitNotes: text(input.benefitNotes),
      timeOff,
      paidTimeOff: text(input.paidTimeOff),
    },
  };
}

/** "$24.50/hr" or "$62,000/yr"; "" with no amount. */
export function formatPay(amount: number | null, currency: string, period: RolePay["period"]): string {
  if (amount == null) return "";
  return `${formatMoney(amount, currency)}${period === "hourly" ? "/hr" : "/yr"}`;
}

/** "+$2/hr" or "+10%". */
export function differentialText(item: PayDifferential, currency: string): string {
  return item.unit === "percent" ? `+${item.amount}%` : `+${formatMoney(item.amount, currency)}/hr`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Days left in a balance: total plus carried over, less used. */
export function daysLeft(balance: TimeOffBalance): number | null {
  if (balance.total == null) return null;
  return Math.round(((balance.total ?? 0) + (balance.carriedOver ?? 0) - (balance.used ?? 0)) * 100) / 100;
}

/** How a pay event reads in the role's History, e.g. "Raise to $26/hr". */
export function payEventText(event: PayEvent, pay: Pick<RolePay, "currency" | "period">): string {
  const label = PAY_EVENT_LABEL[event.kind];
  if (event.amount == null) return event.note ? `${label}: ${event.note}` : label;
  const money =
    event.kind === "bonus" ? formatMoney(event.amount, pay.currency) : formatPay(event.amount, pay.currency, pay.period);
  const head = event.kind === "bonus" ? `Bonus of ${money}` : event.kind === "adjustment" ? `Pay adjusted to ${money}` : `${label} to ${money}`;
  return event.note ? `${head} · ${event.note}` : head;
}

/** One line for the closed section, or "" when nothing is set. */
export function paySummary(value: Pick<PayAndBenefits, "compensation" | "benefits" | "timeOff">): string {
  const { compensation: pay } = value;
  const parts: string[] = [];
  const rate = formatPay(pay.amount, pay.currency, pay.period);
  if (rate) parts.push(rate);
  else if (pay.payType) parts.push(PAY_TYPE_LABEL[pay.payType]);
  if (pay.frequency) parts.push(PAY_FREQUENCY_LABEL[pay.frequency]);
  if (value.benefits.length) parts.push(`${value.benefits.length} benefit${value.benefits.length === 1 ? "" : "s"}`);
  const latest = value.timeOff[0];
  if (latest) {
    const left = daysLeft(latest);
    if (left != null) parts.push(`${left} ${TIME_OFF_LABEL[latest.kind]} day${left === 1 ? "" : "s"} left (${latest.year})`);
  }
  return parts.join(" · ");
}
