import { LEAVING_REASON_LABEL, RATING_AREAS, RATING_AREA_LABEL, commuteText } from "@core/role-reflection";
import type { WorkMapRole } from "@core/work-map";
import type { RoleSettingsPanel } from "./RoleSettings";
import { GroupFacts, GroupMeter, RoleGroup, RoleGroups } from "./RoleGroups";

const WOULD_RETURN: Record<"yes" | "no" | "maybe", string> = { yes: "Yes", no: "No", maybe: "Maybe" };

/** Ratings, leaving, commute, and the place: Looking back, on the role's Overview. */
export function RoleReflectionSection({ role, onEdit }: { role: WorkMapRole; onEdit: (panel: RoleSettingsPanel) => void }) {
  const d = role.details;
  const rated = RATING_AREAS.filter((area) => d.ratings[area]);
  const commute = commuteText(d.commute);
  const hasLeaving = Boolean(d.leaving.reason || d.leaving.wouldReturn || d.departure);
  const shared = [d.share.workplaceRating && "the overall rating", d.share.departure && "why you left, in your words", d.share.environment && "the work environment"].filter(Boolean) as string[];

  return (
    <section className="role-view-section" aria-labelledby={`${role.id}-looking-back`}>
      <div className="role-view-section-head">
        <h2 id={`${role.id}-looking-back`}>Looking back</h2>
      </div>
      <RoleGroups label="Looking back">
        <RoleGroup title="Ratings" panel="rating" onEdit={onEdit} empty={d.workplaceRating || rated.length ? null : "Rate the job overall and by area"}>
          {d.workplaceRating ? <GroupMeter label="Overall" value={d.workplaceRating} max={5} text={`${d.workplaceRating}/5`} /> : null}
          {rated.map((area) => (
            <GroupMeter key={area} label={RATING_AREA_LABEL[area]} value={d.ratings[area]!} max={5} text={`${d.ratings[area]}/5`} />
          ))}
        </RoleGroup>

        <RoleGroup title="The place" panel="commute" onEdit={onEdit} empty={commute || d.environment ? null : "Add the commute and what the place was like"} note={d.environment}>
          <GroupFacts rows={[Boolean(commute) && ["Commute", commute]]} />
        </RoleGroup>

        <RoleGroup title="Leaving" panel="leaving" onEdit={onEdit} wide empty={hasLeaving ? null : "Add why you left and whether you'd go back"} note={d.departure}>
          <GroupFacts
            rows={[
              Boolean(d.leaving.reason) && ["Why you left", d.leaving.reason ? LEAVING_REASON_LABEL[d.leaving.reason] : ""],
              Boolean(d.leaving.wouldReturn) && ["Go back?", d.leaving.wouldReturn ? WOULD_RETURN[d.leaving.wouldReturn] : ""],
            ]}
          />
        </RoleGroup>
      </RoleGroups>
      <p className="role-group-share">On your page: {shared.length ? shared.join(", ") : "nothing here; only you see it"}.</p>
    </section>
  );
}
