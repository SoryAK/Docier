import { useState, type ReactNode } from "react";
import {
  PAY_FREQUENCY_LABEL,
  PAY_TYPE_LABEL,
  TIME_OFF_LABEL,
  daysLeft,
  differentialText,
  formatPay,
  payEventText,
  paySummary,
} from "@core/role-pay";
import type { WorkMapRole } from "@core/work-map";
import { Lock } from "lucide-react";
import type { RoleSettingsPanel } from "./RoleSettings";

function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Pay and benefits: the role's Pay tab, and whether pay shows under the role's name. Only the occupant sees it. */
export function RolePaySection({
  role,
  onEdit,
  onSaved,
}: {
  role: WorkMapRole;
  onEdit: (panel: RoleSettingsPanel) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const d = role.details;
  const pay = d.compensation;
  const summary = paySummary({ compensation: pay, benefits: d.benefits, timeOff: d.timeOff });
  const hasAny =
    summary !== "" ||
    pay.overtimeRate != null ||
    pay.differentials.length > 0 ||
    pay.bonusNotes !== "" ||
    pay.equityNotes !== "" ||
    d.payHistory.length > 0 ||
    d.benefitNotes !== "" ||
    d.paidTimeOff !== "";

  const shown = d.glance.pay;
  const amount = formatPay(pay.amount, pay.currency, pay.period);

  async function setShown(next: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/glance`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pay: next }),
      });
      if (!response.ok) setMessage("That didn't save. Try again.");
      else onSaved();
    } catch {
      setMessage("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="role-view-section role-setup" aria-labelledby={`${role.id}-pay`}>
      <div className="role-view-section-head">
        <h2 id={`${role.id}-pay`}>
          Pay &amp; benefits <Lock size={12} aria-label="Only you see this" className="role-pay-lock" />
        </h2>
        <span className="role-setup-actions">
          <button type="button" className="role-view-text" onClick={() => onEdit("pay")}>
            {hasAny ? "Edit" : "+ Add"}
          </button>
        </span>
      </div>
      {!hasAny ? (
        <p className="role-view-empty">Your pay, raises, benefits, and time off. Only you see it; it never goes on your page.</p>
      ) : null}
      {amount ? (
        <div className="role-pay-glance">
          <div>
            <b id={`${role.id}-pay-glance`}>Show pay under the name</b>
            <span>Only you see it. It never goes on your page.</span>
          </div>
          <button
            type="button"
            role="switch"
            className="role-switch"
            aria-checked={shown}
            aria-labelledby={`${role.id}-pay-glance`}
            disabled={busy}
            onClick={() => void setShown(!shown)}
          />
        </div>
      ) : null}
      {message ? <p className="role-view-error" role="alert">{message}</p> : null}
      {hasAny ? (
        <dl className="role-view-facts role-setup-facts">
          {pay.payType || pay.amount != null ? (
            <Fact label="Pay">{[pay.payType ? PAY_TYPE_LABEL[pay.payType] : "", formatPay(pay.amount, pay.currency, pay.period)].filter(Boolean).join(", ")}</Fact>
          ) : null}
          {pay.frequency ? <Fact label="Paid">{PAY_FREQUENCY_LABEL[pay.frequency]}</Fact> : null}
          {pay.overtimeRate != null ? <Fact label="Overtime">{pay.overtimeRate}× the rate</Fact> : null}
          {pay.differentials.length > 0 ? (
            <Fact label="Differentials">
              <ul className="role-setup-list">
                {pay.differentials.map((item) => (
                  <li key={item.id}>
                    <b>{item.label}</b> {differentialText(item, pay.currency)}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {d.payHistory.length > 0 ? (
            <Fact label="Changes">
              <ul className="role-setup-list">
                {d.payHistory.map((item) => (
                  <li key={item.id}>
                    <b>{monthYear(item.date)}</b> {payEventText(item, pay)}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {pay.bonusNotes ? <Fact label="Bonus">{pay.bonusNotes}</Fact> : null}
          {pay.equityNotes ? <Fact label="Equity">{pay.equityNotes}</Fact> : null}
          {d.benefits.length > 0 ? <Fact label="Benefits">{d.benefits.join(", ")}</Fact> : null}
          {d.benefitNotes ? <Fact label="Benefit notes">{d.benefitNotes}</Fact> : null}
          {d.timeOff.length > 0 ? (
            <Fact label="Time off">
              <ul className="role-setup-list">
                {d.timeOff.map((item) => {
                  const left = daysLeft(item);
                  return (
                    <li key={item.id}>
                      <b>{item.year}</b> {TIME_OFF_LABEL[item.kind]}: {item.used ?? 0} of {(item.total ?? 0) + (item.carriedOver ?? 0)} used{left != null ? `, ${left} left` : ""}
                    </li>
                  );
                })}
              </ul>
            </Fact>
          ) : null}
          {d.paidTimeOff ? <Fact label="Time off notes">{d.paidTimeOff}</Fact> : null}
        </dl>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
