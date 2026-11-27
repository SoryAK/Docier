import type { WorkMapRole } from "@core/work-map";
import { EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory, type EquipmentItem } from "@core/role-gear";
import { SCHEDULE_TYPE_LABEL, shiftLabel, workModeText } from "@core/role-work-setup";
import { AppWindow, Cog, HardHat, Laptop, Package, Shirt, Truck, Wrench, type LucideIcon } from "lucide-react";
import type { RoleSettingsPanel } from "./RoleSettings";
import { GroupFacts, GroupTags, GroupTimeline, RoleGroup, RoleGroups, ShiftDay, ShiftScale, initials, monthYear } from "./RoleGroups";

const GEAR_ICON: Record<EquipmentCategory, LucideIcon> = {
  tool: Wrench,
  machine: Cog,
  vehicle: Truck,
  computer: Laptop,
  software: AppWindow,
  safety: HardHat,
  other: Package,
};

/**
 * How the work was set up, and the gear: the role's Setup tab. Each group
 * opens its own part of the role's settings.
 */
export function RoleWorkSetup({ role, onEdit }: { role: WorkMapRole; onEdit: (panel: RoleSettingsPanel) => void }) {
  const d = role.details;
  const { schedule, team } = d;
  const hasSchedule = Boolean(schedule.type || schedule.hoursPerWeek || schedule.workMode !== "onsite" || schedule.shift);
  const hasTeam = Boolean(team.reportsTo || team.department || team.size);
  const hasGrowth = d.promotions.length > 0 || d.growth !== "";
  const hasSkills = d.skills.length > 0 || d.skillsGained.length > 0;
  const hasGear = d.equipmentItems.length > 0 || d.equipment.length > 0;
  const hasUniform = d.uniformItems.length > 0 || d.uniform !== "";
  const shared = [
    d.share.schedule && "the schedule",
    d.share.team && "the team",
    d.share.growth && "growth",
    d.share.equipment && "equipment names",
    d.share.uniform && "the uniform",
  ].filter(Boolean) as string[];

  return (
    <section className="role-view-section" aria-label="Setup">
      <RoleGroups label="Setup">
        <RoleGroup title="Schedule" panel="schedule" onEdit={onEdit} empty={hasSchedule ? null : "Add the type, hours, and where you worked"} note={schedule.shift}>
          <GroupFacts
            rows={[
              ["Type", schedule.type ? `${SCHEDULE_TYPE_LABEL[schedule.type]}, ${workModeText(schedule).toLowerCase()}` : workModeText(schedule)],
              Boolean(schedule.hoursPerWeek) && ["Hours", `${schedule.hoursPerWeek} h/week`],
            ]}
          />
        </RoleGroup>

        <RoleGroup title="Shifts" panel="shifts" onEdit={onEdit} empty={d.shifts.length ? null : "Add the shifts you worked"}>
          <ul className="role-group-shifts">
            {d.shifts.map((shift) => (
              <li key={shift.id}>
                <span>
                  <b>{shift.name}</b> {shiftLabel(shift)}
                </span>
                <ShiftDay start={shift.start} end={shift.end} />
              </li>
            ))}
          </ul>
          <ShiftScale />
        </RoleGroup>

        <RoleGroup title="Team" panel="team" onEdit={onEdit} empty={hasTeam ? null : "Add who you reported to and your team"}>
          <GroupFacts
            rows={[
              Boolean(team.reportsTo) && [
                "Reported to",
                <span className="role-group-person">
                  <span className="role-view-avatar" aria-hidden="true">
                    {initials(team.reportsTo)}
                  </span>
                  {team.reportsTo}
                </span>,
              ],
              Boolean(team.department) && ["Department", team.department],
              Boolean(team.size) && ["Team size", String(team.size)],
            ]}
          />
        </RoleGroup>

        <RoleGroup title="Skills" panel="growth" onEdit={onEdit} empty={hasSkills ? null : "Add the skills you used and gained"}>
          {d.skills.length ? (
            <>
              <p className="role-group-label">Used</p>
              <GroupTags items={d.skills} />
            </>
          ) : null}
          {d.skillsGained.length ? (
            <>
              <p className="role-group-label">Gained</p>
              <GroupTags items={d.skillsGained} tone="new" />
            </>
          ) : null}
        </RoleGroup>

        <RoleGroup title="Growth" panel="growth" onEdit={onEdit} empty={hasGrowth ? null : "Add a promotion or what you grew into"} note={d.growth}>
          {d.promotions.length ? (
            <GroupTimeline items={d.promotions.map((item) => ({ id: item.id, when: monthYear(item.date), text: <b>{item.title}</b> }))} />
          ) : null}
        </RoleGroup>

        <RoleGroup title="Equipment" panel="equipment" onEdit={onEdit} wide empty={hasGear ? null : "Add the tools, machines, or vehicles you had or worked on"}>
          {d.equipmentItems.length ? (
            <ul className="role-group-rows">
              {d.equipmentItems.map((item) => (
                <GearRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <GroupTags items={d.equipment} />
          )}
        </RoleGroup>

        <RoleGroup title="Uniform" panel="uniform" onEdit={onEdit} wide empty={hasUniform ? null : "Add what you wore"} note={d.uniform}>
          {d.uniformItems.length ? (
            <ul className="role-group-rows">
              {d.uniformItems.map((item) => (
                <li key={item.id}>
                  <span className="role-group-icon" aria-hidden="true">
                    <Shirt size={16} />
                  </span>
                  <span className="role-group-row-text">
                    <b>{item.item}</b>
                    <small>{[item.color, item.providedBy === "employer" ? "provided" : item.providedBy === "me" ? "my own" : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </RoleGroup>
      </RoleGroups>
      <p className="role-group-share">On your page: {shared.length ? shared.join(", ") : "nothing here; only you see it"}.</p>
    </section>
  );
}

function GearRow({ item }: { item: EquipmentItem }) {
  const Icon = GEAR_ICON[item.category] ?? Package;
  const details = [
    EQUIPMENT_CATEGORY_LABEL[item.category],
    [item.maker, item.model].filter(Boolean).join(" "),
    item.serial ? `S/N ${item.serial}` : "",
    item.assetTag ? `Asset ${item.assetTag}` : "",
    item.from ? `since ${monthYear(item.from)}` : "",
  ].filter(Boolean);
  return (
    <li>
      <span className="role-group-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="role-group-row-text">
        <b>{item.name}</b>
        <small>{details.join(" · ")}</small>
      </span>
      <span className={item.usage === "assigned" ? "role-group-badge is-mine" : "role-group-badge"}>{item.usage === "assigned" ? "Given to me" : "Worked on"}</span>
    </li>
  );
}
