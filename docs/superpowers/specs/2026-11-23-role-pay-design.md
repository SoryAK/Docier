# Role pay and benefits

Batch 2 of bringing back the role details the earlier app kept. It follows the
work setup (batch 1) and uses the same pattern: a section on the role's
Overview, changed in the role's settings.

## Decided

- Pay and benefits are private. Nothing here is published, and the form has
  no "Show on my page" switch. The published-pay switch on the older map panel
  is left as it was: this form keeps whatever it set.
- The paycheck estimator from the earlier app is left for later.

## What a role gains

Stored in the role's details (`work_history_details.details_json`). The rate,
currency, and period, the benefits list, and the time-off note already existed
and are reused.

| Panel | Fields |
|---|---|
| Pay | How you were paid (salary, hourly, contract), rate, currency, how often, overtime multiple, shift differentials (per hour or percent), bonus and equity notes |
| Pay history | Changes by month: a raise, bonus, adjustment, or cut, with an amount and a note |
| Benefits | A checklist of common benefits, any others by name, and notes |
| Time off | Balances by year and kind (PTO, vacation, sick, personal, floating holiday): days, used, and carried over; plus notes |

Salary is per year and hourly is per hour; a contract picks either.

## Where it shows

- **Overview:** a "Pay & benefits" section with a lock. When it's closed, it
  shows one line, e.g. "$24.50/hr · Every two weeks · 6 benefits · 16 PTO days
  left (2023)".
- **History:** raises, cuts, and bonuses appear in their month, e.g. "Raise to
  $26/hr". Adjustments don't.
- **Role settings:** a "Pay & benefits" group with Pay, Pay history,
  Benefits, and Time off.

Checking the inputs lives in `core/role-pay.ts`.
