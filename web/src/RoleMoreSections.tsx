import type { ReactNode } from "react";
import { EQUIPMENT_CATEGORY_LABEL, EQUIPMENT_USAGE_LABEL, gearSummary, uniformItemText } from "@core/role-gear";
import { LEAVING_REASON_LABEL, RATING_AREAS, RATING_AREA_LABEL, commuteText, reflectionSummary } from "@core/role-reflection";
import type { WorkMapRole } from "@core/work-map";
import type { RoleSettingsPanel } from "./RoleSettings";

function Section({
  role,
  id,
  title,
  empty,
  edit,
  onEdit,
  children,
}: {
  role: WorkMapRole;
  id: string;
  title: string;
  empty: string | null;
  edit: RoleSettingsPanel;
  onEdit: (panel: RoleSettingsPanel) => void;
  children: ReactNode;
}) {
  return (
    <section className="role-view-section role-setup" aria-labelledby={`${role.id}-${id}`}>
      <div className="role-view-section-head">
        <h2 id={`${role.id}-${id}`}>{title}</h2>
        <span className="role-setup-actions">
          <button type="button" className="role-view-text" onClick={() => onEdit(edit)}>
            {empty ? "+ Add" : "Edit"}
          </button>
        </span>
      </div>
      {empty ? <p className="role-view-empty">{empty}</p> : <dl className="role-view-facts role-setup-facts">{children}</dl>}
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

function monthYear(date: string): string {
  const [year, month] = date.split("-");
  if (!year || !month) return date;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Equipment and uniform: the role's Gear tab. */
export function RoleGearSection({ role, onEdit }: { role: WorkMapRole; onEdit: (panel: RoleSettingsPanel) => void }) {
  const d = role.details;
  const items = d.equipmentItems.length ? d.equipmentItems : null;
  const summary = items ? gearSummary(d) : [d.equipment.length ? `${d.equipment.length} piece${d.equipment.length === 1 ? "" : "s"} of equipment` : "", gearSummary({ ...d, equipmentItems: [] })].filter(Boolean).join(" · ");
  const empty = !summary ? "Tools, machines, and vehicles you had or worked on, and what you wore." : null;
  return (
    <Section role={role} id="gear" title="Equipment & gear" empty={empty} edit="equipment" onEdit={onEdit}>
      {items ? (
        <Fact label="Equipment">
          <ul className="role-setup-list">
            {items.map((item) => (
              <li key={item.id}>
                <b>{item.name}</b> {[EQUIPMENT_USAGE_LABEL[item.usage], EQUIPMENT_CATEGORY_LABEL[item.category], [item.maker, item.model].filter(Boolean).join(" "), item.serial ? `S/N ${item.serial}` : "", item.from ? `from ${monthYear(item.from)}` : ""].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </Fact>
      ) : d.equipment.length ? (
        <Fact label="Equipment">{d.equipment.join(", ")}</Fact>
      ) : null}
      {d.uniformItems.length ? <Fact label="Uniform">{d.uniformItems.map(uniformItemText).join(", ")}</Fact> : null}
      {d.uniform ? <Fact label="Uniform notes">{d.uniform}</Fact> : null}
      <Fact label="On my page">{[d.share.equipment && "equipment names", d.share.uniform && "the uniform"].filter(Boolean).join(" and ") || "Nothing; only you see this"}</Fact>
    </Section>
  );
}

/** Ratings, leaving, commute, and the place: the role's Looking back tab. */
export function RoleReflectionSection({ role, onEdit }: { role: WorkMapRole; onEdit: (panel: RoleSettingsPanel) => void }) {
  const d = role.details;
  const summary = reflectionSummary(d);
  const rated = RATING_AREAS.filter((area) => d.ratings[area]);
  const has = summary || rated.length || d.departure || d.environment;
  const empty = has ? null : "How it rated, why you left, the commute, and what the place was like.";
  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
  return (
    <Section role={role} id="looking-back" title="Looking back" empty={empty} edit="rating" onEdit={onEdit}>
      {d.workplaceRating ? <Fact label="Overall">{stars(d.workplaceRating)}</Fact> : null}
      {rated.map((area) => (
        <Fact key={area} label={RATING_AREA_LABEL[area]}>
          {stars(d.ratings[area]!)}
        </Fact>
      ))}
      {d.leaving.reason ? <Fact label="Why you left">{LEAVING_REASON_LABEL[d.leaving.reason]}</Fact> : null}
      {d.leaving.wouldReturn ? <Fact label="Go back?">{d.leaving.wouldReturn === "yes" ? "Yes" : d.leaving.wouldReturn === "no" ? "No" : "Maybe"}</Fact> : null}
      {d.departure ? <Fact label="In your words">{d.departure}</Fact> : null}
      {commuteText(d.commute) ? <Fact label="Commute">{commuteText(d.commute)}</Fact> : null}
      {d.environment ? <Fact label="The place">{d.environment}</Fact> : null}
      <Fact label="On my page">
        {[d.share.workplaceRating && "the overall rating", d.share.departure && "why you left, in your words", d.share.environment && "the work environment"].filter(Boolean).join(", ") || "Nothing; only you see this"}
      </Fact>
    </Section>
  );
}
