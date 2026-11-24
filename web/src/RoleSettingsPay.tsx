import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ClockIcon,
  CurrencyDollarIcon,
  GiftIcon,
  HeartIcon,
  LockClosedIcon,
  MoonIcon,
  PencilSquareIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  COMMON_BENEFITS,
  PAY_EVENT_KINDS,
  PAY_EVENT_LABEL,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABEL,
  PAY_TYPES,
  PAY_TYPE_LABEL,
  TIME_OFF_KINDS,
  TIME_OFF_LABEL,
  daysLeft,
  payEventText,
  type PayEventKind,
  type PayFrequency,
  type PayType,
  type TimeOffKind,
} from "@core/role-pay";
import type { WorkMapRole } from "@core/work-map";
import { SettingsCard, SettingsRow } from "./SettingsRows";

const CONTROL_WIDTH = 220;

export const PAY_PANELS = ["pay", "pay-history", "benefits", "time-off"] as const;
export type PayPanel = (typeof PAY_PANELS)[number];

/** Which panel holds the field a refusal is about, and what to say. */
export const PAY_ERROR: Record<string, { panel: PayPanel; message: string }> = {
  "currency-invalid": { panel: "pay", message: "Use a three-letter currency code, like USD." },
  "amount-invalid": { panel: "pay", message: "The rate has to be a number, 0 or more." },
  "pay-type-invalid": { panel: "pay", message: "Pick how you were paid from the list." },
  "frequency-invalid": { panel: "pay", message: "Pick how often you were paid from the list." },
  "overtime-invalid": { panel: "pay", message: "Overtime runs from 1× to 5× the rate." },
  "differential-invalid": { panel: "pay", message: "Give every differential a name and an amount." },
  "pay-event-date-invalid": { panel: "pay-history", message: "Give every change a month." },
  "pay-event-kind-invalid": { panel: "pay-history", message: "Pick what kind of change each one was." },
  "pay-event-amount-invalid": { panel: "pay-history", message: "Amounts have to be numbers, 0 or more." },
  "time-off-year-invalid": { panel: "time-off", message: "Give every balance a year." },
  "time-off-kind-invalid": { panel: "time-off", message: "Pick a kind for every balance." },
  "time-off-days-invalid": { panel: "time-off", message: "Days run from 0 to 366." },
};

type DifferentialDraft = { key: string; id?: string; label: string; amount: number | null; unit: "per-hour" | "percent" };
type EventDraft = { key: string; id?: string; date: string; kind: PayEventKind; amount: number | null; note: string };
type BalanceDraft = { key: string; id?: string; year: number | null; kind: TimeOffKind; total: number | null; used: number | null; carriedOver: number | null };

let draftKey = 0;
const nextKey = () => `pay-${++draftKey}`;

export function payDraft(role: WorkMapRole) {
  const d = role.details;
  const pay = d.compensation;
  return {
    payType: pay.payType as PayType | "",
    amount: pay.amount,
    period: pay.period,
    currency: pay.currency,
    frequency: pay.frequency as PayFrequency | "",
    overtimeRate: pay.overtimeRate,
    differentials: pay.differentials.map((item): DifferentialDraft => ({ ...item, key: item.id })),
    bonusNotes: pay.bonusNotes,
    equityNotes: pay.equityNotes,
    payHistory: d.payHistory.map((item): EventDraft => ({ ...item, key: item.id })),
    benefits: d.benefits,
    customBenefit: "",
    benefitNotes: d.benefitNotes,
    timeOff: d.timeOff.map((item): BalanceDraft => ({ ...item, key: item.id })),
    paidTimeOff: d.paidTimeOff,
  };
}

export type PayDraft = ReturnType<typeof payDraft>;

/** What the pay route takes. */
export function payBody(draft: PayDraft) {
  const benefits = draft.customBenefit.trim() ? [...draft.benefits, draft.customBenefit.trim()] : draft.benefits;
  return {
    compensation: {
      payType: draft.payType,
      amount: draft.amount,
      period: draft.period,
      currency: draft.currency,
      frequency: draft.frequency,
      overtimeRate: draft.overtimeRate,
      differentials: draft.differentials.map(({ id, label, amount, unit }) => ({ id, label, amount, unit })),
      bonusNotes: draft.bonusNotes,
      equityNotes: draft.equityNotes,
    },
    payHistory: draft.payHistory.map(({ id, date, kind, amount, note }) => ({ id, date, kind, amount, note })),
    benefits,
    benefitNotes: draft.benefitNotes,
    timeOff: draft.timeOff.map(({ id, year, kind, total, used, carriedOver }) => ({ id, year, kind, total, used, carriedOver })),
    paidTimeOff: draft.paidTimeOff,
  };
}

/** The pay panels of a role's settings. Nothing here is ever published. */
export function PayPanels({ panel, draft, edit }: { panel: PayPanel; draft: PayDraft; edit: (patch: Partial<PayDraft>) => void }) {
  const privateNote = (
    <HStack gap={1} align="center">
      <Icon icon={LockClosedIcon} size="sm" color="secondary" />
      <Text type="supporting" color="secondary">
        Only you see this. Pay and benefits never go on your page.
      </Text>
    </HStack>
  );

  if (panel === "pay") {
    const perHour = draft.period === "hourly";
    return (
      <VStack gap={5}>
        {privateNote}
        <SettingsCard title="Rate">
          <SettingsRow
            title="How you were paid"
            icon={BanknotesIcon}
            control={
              <Selector
                label="How you were paid"
                isLabelHidden
                size="sm"
                width={CONTROL_WIDTH}
                value={draft.payType || "none"}
                onChange={(value) => {
                  if (typeof value !== "string") return;
                  const payType = value === "none" ? "" : (value as PayType);
                  edit({ payType, period: payType === "salary" ? "annual" : payType === "hourly" ? "hourly" : draft.period });
                }}
                options={[{ value: "none", label: "Not set" }, ...PAY_TYPES.map((type) => ({ value: type, label: PAY_TYPE_LABEL[type] }))]}
              />
            }
          />
          <SettingsRow
            title={perHour ? "Rate per hour" : "Rate per year"}
            icon={CurrencyDollarIcon}
            description={draft.payType === "contract" ? undefined : "What you were paid when you started, or now."}
            control={
              <NumberInput label="Rate" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear min={0} step={perHour ? 0.25 : 1000} units={draft.currency} value={draft.amount} onChange={(value) => edit({ amount: value })} />
            }
            detail={
              draft.payType === "contract" ? (
                <HStack gap={2}>
                  <Button label="Per hour" size="sm" variant={perHour ? "secondary" : "ghost"} onClick={() => edit({ period: "hourly" })} />
                  <Button label="Per year" size="sm" variant={perHour ? "ghost" : "secondary"} onClick={() => edit({ period: "annual" })} />
                </HStack>
              ) : undefined
            }
          />
          <SettingsRow
            title="Currency"
            icon={CurrencyDollarIcon}
            control={<TextInput label="Currency" isLabelHidden size="sm" width={CONTROL_WIDTH} value={draft.currency} onChange={(value) => edit({ currency: value.toUpperCase() })} placeholder="USD" />}
          />
          <SettingsRow
            title="Paid"
            icon={CalendarDaysIcon}
            control={
              <Selector
                label="How often you were paid"
                isLabelHidden
                size="sm"
                width={CONTROL_WIDTH}
                value={draft.frequency || "none"}
                onChange={(value) => typeof value === "string" && edit({ frequency: value === "none" ? "" : (value as PayFrequency) })}
                options={[{ value: "none", label: "Not set" }, ...PAY_FREQUENCIES.map((item) => ({ value: item, label: PAY_FREQUENCY_LABEL[item] }))]}
              />
            }
          />
          <SettingsRow
            title="Overtime"
            icon={ClockIcon}
            description="As a multiple of the rate, e.g. 1.5."
            control={<NumberInput label="Overtime" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear min={1} max={5} step={0.25} units="×" value={draft.overtimeRate} onChange={(value) => edit({ overtimeRate: value })} />}
          />
        </SettingsCard>

        <VStack gap={3}>
          {draft.differentials.length > 0 ? (
            <SettingsCard title="Shift differentials">
              {draft.differentials.map((item, index) => {
                const change = (patch: Partial<DifferentialDraft>) => edit({ differentials: draft.differentials.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
                return (
                  <SettingsRow
                    key={item.key}
                    title={item.label || "New differential"}
                    icon={MoonIcon}
                    description={item.amount != null ? (item.unit === "percent" ? `+${item.amount}% of the rate` : `+${item.amount} ${draft.currency} an hour`) : "Extra pay for a shift or condition."}
                    control={<IconButton label={`Remove ${item.label || "this differential"}`} variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => edit({ differentials: draft.differentials.filter((_, i) => i !== index) })} />}
                    detail={
                      <HStack gap={2} wrap="wrap" align="end">
                        <TextInput label="For" size="sm" width={170} placeholder="Nights" value={item.label} onChange={(value) => change({ label: value })} />
                        <NumberInput label="Amount" size="sm" width={110} hasClear min={0} value={item.amount} onChange={(value) => change({ amount: value })} />
                        <Selector
                          label="As"
                          size="sm"
                          width={140}
                          value={item.unit}
                          onChange={(value) => typeof value === "string" && change({ unit: value as DifferentialDraft["unit"] })}
                          options={[
                            { value: "per-hour", label: "Per hour" },
                            { value: "percent", label: "Percent" },
                          ]}
                        />
                      </HStack>
                    }
                  />
                );
              })}
            </SettingsCard>
          ) : (
            <Text type="supporting" weight="semibold" color="secondary">
              Shift differentials
            </Text>
          )}
          <HStack>
            <Button label="Add a differential" variant="secondary" size="sm" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => edit({ differentials: [...draft.differentials, { key: nextKey(), label: "", amount: null, unit: "per-hour" }] })} />
          </HStack>
        </VStack>

        <SettingsCard title="Extras">
          <SettingsRow title="Bonus" icon={GiftIcon} description="How bonuses worked here." detail={<TextArea label="Bonus" isLabelHidden size="sm" width="100%" rows={2} value={draft.bonusNotes} onChange={(value) => edit({ bonusNotes: value })} />} />
          <SettingsRow title="Equity" icon={ArrowTrendingUpIcon} description="Stock, options, or RSUs." detail={<TextArea label="Equity" isLabelHidden size="sm" width="100%" rows={2} value={draft.equityNotes} onChange={(value) => edit({ equityNotes: value })} />} />
        </SettingsCard>
      </VStack>
    );
  }

  if (panel === "pay-history") {
    return (
      <VStack gap={3}>
        {privateNote}
        {draft.payHistory.length > 0 ? (
          <SettingsCard>
            {draft.payHistory.map((item, index) => {
              const change = (patch: Partial<EventDraft>) => edit({ payHistory: draft.payHistory.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
              return (
                <SettingsRow
                  key={item.key}
                  title={payEventText({ ...item, id: item.key }, { currency: draft.currency, period: draft.period })}
                  icon={item.kind === "bonus" ? GiftIcon : ArrowTrendingUpIcon}
                  description={item.kind === "raise" ? "Raises and bonuses show in the role's History." : undefined}
                  control={<IconButton label="Remove this change" variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => edit({ payHistory: draft.payHistory.filter((_, i) => i !== index) })} />}
                  detail={
                    <HStack gap={2} wrap="wrap" align="end">
                      <Selector
                        label="What"
                        size="sm"
                        width={140}
                        value={item.kind}
                        onChange={(value) => typeof value === "string" && change({ kind: value as PayEventKind })}
                        options={PAY_EVENT_KINDS.map((kind) => ({ value: kind, label: PAY_EVENT_LABEL[kind] }))}
                      />
                      <label className="role-settings-month-label">
                        Month
                        <input type="month" className="role-settings-month" value={item.date} onChange={(event) => change({ date: event.target.value })} />
                      </label>
                      <NumberInput label={item.kind === "bonus" ? "Amount" : "New rate"} size="sm" width={120} hasClear min={0} value={item.amount} onChange={(value) => change({ amount: value })} />
                      <TextInput label="Note" size="sm" width={180} value={item.note} onChange={(value) => change({ note: value })} />
                    </HStack>
                  }
                />
              );
            })}
          </SettingsCard>
        ) : (
          <Text type="supporting" color="secondary">
            Raises, bonuses, and other changes to your pay, by month.
          </Text>
        )}
        <HStack>
          <Button label="Add a change" variant="secondary" size="sm" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => edit({ payHistory: [...draft.payHistory, { key: nextKey(), date: "", kind: "raise", amount: null, note: "" }] })} />
        </HStack>
      </VStack>
    );
  }

  if (panel === "benefits") {
    const has = (name: string) => draft.benefits.some((item) => item.toLowerCase() === name.toLowerCase());
    const toggle = (name: string, on: boolean) => edit({ benefits: on ? [...draft.benefits, name] : draft.benefits.filter((item) => item.toLowerCase() !== name.toLowerCase()) });
    const custom = draft.benefits.filter((item) => !COMMON_BENEFITS.some((common) => common.toLowerCase() === item.toLowerCase()));
    return (
      <VStack gap={5}>
        {privateNote}
        <SettingsCard title="What you had">
          <SettingsRow
            title="Benefits"
            icon={HeartIcon}
            description={`${draft.benefits.length} picked.`}
            detail={
              <div className="role-settings-checks">
                {COMMON_BENEFITS.map((name) => (
                  <CheckboxInput key={name} label={name} value={has(name)} onChange={(checked: boolean) => toggle(name, checked)} />
                ))}
                {custom.map((name) => (
                  <CheckboxInput key={name} label={name} value onChange={(checked: boolean) => toggle(name, checked)} />
                ))}
              </div>
            }
          />
          <SettingsRow
            title="Something else"
            icon={PlusIcon}
            control={
              <HStack gap={1}>
                <TextInput label="Another benefit" isLabelHidden size="sm" width={160} placeholder="Boot allowance" value={draft.customBenefit} onChange={(value) => edit({ customBenefit: value })} />
                <Button
                  label="Add"
                  size="sm"
                  variant="secondary"
                  isDisabled={!draft.customBenefit.trim()}
                  onClick={() => edit({ benefits: has(draft.customBenefit.trim()) ? draft.benefits : [...draft.benefits, draft.customBenefit.trim()], customBenefit: "" })}
                />
              </HStack>
            }
          />
        </SettingsCard>
        <SettingsCard title="Notes">
          <SettingsRow title="Benefit notes" icon={PencilSquareIcon} description="Matches, waiting periods, costs." detail={<TextArea label="Benefit notes" isLabelHidden size="sm" width="100%" rows={3} value={draft.benefitNotes} onChange={(value) => edit({ benefitNotes: value })} />} />
        </SettingsCard>
      </VStack>
    );
  }

  return (
    <VStack gap={5}>
      {privateNote}
      <VStack gap={3}>
        {draft.timeOff.length > 0 ? (
          <SettingsCard title="Balances">
            {draft.timeOff.map((item, index) => {
              const change = (patch: Partial<BalanceDraft>) => edit({ timeOff: draft.timeOff.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
              const left = item.year != null ? daysLeft({ ...item, id: item.key, year: item.year }) : null;
              return (
                <SettingsRow
                  key={item.key}
                  title={`${TIME_OFF_LABEL[item.kind]}${item.year ? `, ${item.year}` : ""}`}
                  icon={SunIcon}
                  description={left != null ? `${left} day${left === 1 ? "" : "s"} left` : "Add the days you had."}
                  control={<IconButton label="Remove this balance" variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => edit({ timeOff: draft.timeOff.filter((_, i) => i !== index) })} />}
                  detail={
                    <HStack gap={2} wrap="wrap" align="end">
                      <NumberInput label="Year" size="sm" width={90} isIntegerOnly min={1950} max={2100} value={item.year} onChange={(value) => change({ year: value })} />
                      <Selector
                        label="Kind"
                        size="sm"
                        width={150}
                        value={item.kind}
                        onChange={(value) => typeof value === "string" && change({ kind: value as TimeOffKind })}
                        options={TIME_OFF_KINDS.map((kind) => ({ value: kind, label: TIME_OFF_LABEL[kind] }))}
                      />
                      <NumberInput label="Days" size="sm" width={80} hasClear min={0} max={366} value={item.total} onChange={(value) => change({ total: value })} />
                      <NumberInput label="Used" size="sm" width={80} hasClear min={0} max={366} value={item.used} onChange={(value) => change({ used: value })} />
                      <NumberInput label="Carried over" size="sm" width={110} hasClear min={0} max={366} value={item.carriedOver} onChange={(value) => change({ carriedOver: value })} />
                    </HStack>
                  }
                />
              );
            })}
          </SettingsCard>
        ) : (
          <Text type="supporting" color="secondary">
            Days off you had each year: PTO, vacation, sick, and personal.
          </Text>
        )}
        <HStack>
          <Button
            label="Add a balance"
            variant="secondary"
            size="sm"
            icon={<Icon icon={PlusIcon} size="sm" />}
            onClick={() => edit({ timeOff: [{ key: nextKey(), year: new Date().getFullYear(), kind: "pto", total: null, used: null, carriedOver: null }, ...draft.timeOff] })}
          />
        </HStack>
      </VStack>
      <SettingsCard title="Notes">
        <SettingsRow title="Time off notes" icon={PencilSquareIcon} description="e.g. Unlimited, or accrues each pay period." detail={<TextArea label="Time off notes" isLabelHidden size="sm" width="100%" rows={2} value={draft.paidTimeOff} onChange={(value) => edit({ paidTimeOff: value })} />} />
      </SettingsCard>
    </VStack>
  );
}
