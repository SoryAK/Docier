/**
 * A role at a glance: the few facts that show in one line under its name, each
 * opening the tab it comes from. Pay stays out unless the occupant asks for it.
 */
import { formatPay } from "./role-pay";
import { SCHEDULE_TYPE_LABEL, workModeText } from "./role-work-setup";
import type { WorkMapRoleDetails } from "./work-map";

/** What shows at a glance by choice. Only pay is a choice; the rest shows when it is set. */
export type RoleGlanceChoice = { pay: boolean };

export const EMPTY_GLANCE: RoleGlanceChoice = { pay: false };

export type GlanceTab = "setup" | "pay";
export type GlanceKind = "work" | "hours" | "manager" | "pay";
export type GlanceItem = { kind: GlanceKind; tab: GlanceTab; text: string };

type GlanceDetails = Pick<WorkMapRoleDetails, "schedule" | "team" | "compensation" | "glance">;

export function roleGlance(details: GlanceDetails): GlanceItem[] {
  const { schedule, team, compensation } = details;
  const items: GlanceItem[] = [];

  const mode = workModeText(schedule);
  // On site is the default, so alone it says nothing.
  if (schedule.type) items.push({ kind: "work", tab: "setup", text: `${SCHEDULE_TYPE_LABEL[schedule.type]}, ${mode.toLowerCase()}` });
  else if (schedule.workMode !== "onsite") items.push({ kind: "work", tab: "setup", text: mode });
  if (schedule.hoursPerWeek) items.push({ kind: "hours", tab: "setup", text: `${schedule.hoursPerWeek} h/week` });
  if (team.reportsTo) items.push({ kind: "manager", tab: "setup", text: `Reports to ${team.reportsTo}` });

  const pay = formatPay(compensation.amount, compensation.currency, compensation.period);
  if (details.glance?.pay && pay) items.push({ kind: "pay", tab: "pay", text: pay });

  return items;
}

export function prepareRoleGlance(
  input: Record<string, unknown>,
): { ok: true; value: { glance: RoleGlanceChoice } } | { ok: false; error: "glance-invalid" } {
  if (typeof input.pay !== "boolean") return { ok: false, error: "glance-invalid" };
  return { ok: true, value: { glance: { pay: input.pay } } };
}
