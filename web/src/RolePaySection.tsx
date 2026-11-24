import { useState } from "react";
import { PAY_FREQUENCY_LABEL, PAY_TYPE_LABEL, TIME_OFF_LABEL, daysLeft, differentialText, formatPay, payEventText } from "@core/role-pay";
import type { WorkMapRole } from "@core/work-map";
import { FileText } from "lucide-react";
import type { RoleSettingsPanel } from "./RoleSettings";
import { GroupFacts, GroupMeter, GroupTags, GroupTimeline, RoleGroup, RoleGroups, monthYear } from "./RoleGroups";

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
  const amount = formatPay(pay.amount, pay.currency, pay.period);
  const hasPay = Boolean(amount || pay.payType || pay.frequency || pay.overtimeRate != null || pay.differentials.length || pay.bonusNotes || pay.equityNotes);
  const shown = d.glance.pay;
  // Benefits packages kept in the role's Documents, linked where the benefits are.
  const packages = (role.documents ?? []).filter((item) => item.kind === "benefits");

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
    <section className="role-view-section" aria-label="Pay and benefits">
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

      <RoleGroups label="Pay and benefits">
        <RoleGroup title="Pay" panel="pay" onEdit={onEdit} empty={hasPay ? null : "Add your pay and how it was paid"}>
          <GroupFacts
            rows={[
              Boolean(amount || pay.payType) && [
                "Rate",
                <>
                  {amount ? <b className="role-group-big">{amount}</b> : null}{" "}
                  {/* "/hr" and "/yr" already say hourly and salary; other kinds of pay are named. */}
                  {pay.payType && !(amount && (pay.payType === "hourly" || pay.payType === "salary")) ? (
                    <span className="role-group-muted">{PAY_TYPE_LABEL[pay.payType].toLowerCase()}</span>
                  ) : null}
                </>,
              ],
              Boolean(pay.frequency) && ["Paid", pay.frequency ? PAY_FREQUENCY_LABEL[pay.frequency] : ""],
              pay.overtimeRate != null && ["Overtime", `${pay.overtimeRate}× the rate`],
              ...pay.differentials.map((item) => [/differential/i.test(item.label) ? item.label : `${item.label} differential`, differentialText(item, pay.currency)] as [string, string]),
              Boolean(pay.bonusNotes) && ["Bonus", pay.bonusNotes],
              Boolean(pay.equityNotes) && ["Equity", pay.equityNotes],
            ]}
          />
        </RoleGroup>

        <RoleGroup title="Changes" panel="pay-history" onEdit={onEdit} empty={d.payHistory.length ? null : "Add a raise, a bonus, or a change in pay"}>
          <GroupTimeline items={d.payHistory.map((item) => ({ id: item.id, when: monthYear(item.date), text: payEventText(item, pay) }))} />
        </RoleGroup>

        <RoleGroup title="Benefits" panel="benefits" onEdit={onEdit} empty={d.benefits.length || d.benefitNotes || packages.length ? null : "Add the benefits you had"} note={d.benefitNotes}>
          {d.benefits.length ? <GroupTags items={d.benefits} /> : null}
          {packages.length ? (
            <ul className="role-group-files">
              {packages.map((item) => (
                <li key={item.linkId}>
                  <a href={`/api/documents/${encodeURIComponent(item.documentId)}?inline=1`} target="_blank" rel="noreferrer">
                    <FileText size={14} aria-hidden="true" />
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </RoleGroup>

        <RoleGroup title="Time off" panel="time-off" onEdit={onEdit} empty={d.timeOff.length || d.paidTimeOff ? null : "Add the time off you had each year"} note={d.paidTimeOff}>
          {d.timeOff.map((item) => {
            const total = (item.total ?? 0) + (item.carriedOver ?? 0);
            const used = item.used ?? 0;
            const left = daysLeft(item);
            return (
              <GroupMeter
                key={item.id}
                label={`${item.year} ${TIME_OFF_LABEL[item.kind]}`}
                value={used}
                max={total}
                text={left != null ? `${left} left` : `${used} used`}
              />
            );
          })}
        </RoleGroup>
      </RoleGroups>
    </section>
  );
}
