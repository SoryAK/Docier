import { createPortal } from "react-dom";
import { useId, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { StackItem } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  AcademicCapIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BriefcaseIcon,
  ChartBarIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ClockIcon,
  DocumentTextIcon,
  EyeIcon,
  HashtagIcon,
  HeartIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { formatHistoryPlace } from "@core/career-history";
import {
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABEL,
  WORK_MODE_LABEL,
  shiftLabel,
  type WorkMode,
} from "@core/role-work-setup";
import type { WorkMapRole } from "@core/work-map";
import { PAY_ERROR, PAY_PANELS, PayPanels, payBody, payDraft, type PayPanel } from "./RoleSettingsPay";
import { SettingsCard, SettingsRow, SettingsStatus } from "./SettingsRows";

export type RoleSettingsPanel = "basics" | "about" | "achievements" | "schedule" | "shifts" | "team" | "growth" | PayPanel;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type PanelConfig = { id: RoleSettingsPanel; label: string; description: string; icon: IconComponent };

const CONTROL_WIDTH = 220;
const NARROW_VIEWPORT = "(max-width: 640px)";
const shellStyle = { height: "min(640px, calc(100dvh - 2rem))" };
const panelStyle = { containerType: "inline-size" as const, containerName: "home-settings-panel" };
const closeAnchorStyle = { position: "sticky" as const, insetBlockStart: 0, zIndex: 1, height: 0 };
const closeBackingStyle = { display: "flex", backgroundColor: "var(--color-background-surface)", borderRadius: "var(--radius-element)" };

function groupsFor(role: WorkMapRole): { label: string; panels: PanelConfig[] }[] {
  const school = role.kind === "school";
  const groups: { label: string; panels: PanelConfig[] }[] = [
    {
      label: school ? "School" : "Role",
      panels: [
        { id: "basics", label: "Basics", description: school ? "School, program, place, and dates." : "Company, title, place, and dates.", icon: school ? AcademicCapIcon : BriefcaseIcon },
        { id: "about", label: "About", description: "A few lines on what this was.", icon: DocumentTextIcon },
        { id: "achievements", label: "Achievements", description: "What you got done, one per line.", icon: TrophyIcon },
      ],
    },
  ];
  if (!school) {
    groups.push({
      label: "Work setup",
      panels: [
        { id: "schedule", label: "Schedule", description: "Type, hours, and where you worked.", icon: CalendarDaysIcon },
        { id: "shifts", label: "Shifts", description: "The shifts you worked, with their times.", icon: ClockIcon },
        { id: "team", label: "Team", description: "Who you reported to, the department, and the team.", icon: UserGroupIcon },
        { id: "growth", label: "Growth", description: "Skills, promotions, and what you learned.", icon: ArrowTrendingUpIcon },
      ],
    });
    groups.push({
      label: "Pay & benefits",
      panels: [
        { id: "pay", label: "Pay", description: "Your rate, how you were paid, and extras.", icon: BanknotesIcon },
        { id: "pay-history", label: "Pay history", description: "Raises, bonuses, and other changes.", icon: ChartBarIcon },
        { id: "benefits", label: "Benefits", description: "Health, retirement, and the rest.", icon: HeartIcon },
        { id: "time-off", label: "Time off", description: "Days off by year and kind.", icon: SunIcon },
      ],
    });
  }
  return groups;
}

/** Which panel holds the field a refusal is about. */
const ERROR_PANEL: Record<string, { panel: RoleSettingsPanel; message: string }> = {
  "schedule-type-invalid": { panel: "schedule", message: "Pick a schedule type from the list." },
  "days-on-site-invalid": { panel: "schedule", message: "Days on site run from 1 to 7." },
  "hours-invalid": { panel: "schedule", message: "Hours a week run from 1 to 168." },
  "shift-name-required": { panel: "shifts", message: "Give every shift a name." },
  "shift-time-invalid": { panel: "shifts", message: "Give every shift a start and an end time." },
  "team-size-invalid": { panel: "team", message: "Team size is a whole number, 1 or more." },
  "promotion-title-required": { panel: "growth", message: "Give every promotion its new title." },
  "promotion-date-invalid": { panel: "growth", message: "Give every promotion a month." },
};

type ShiftDraft = { key: string; id?: string; name: string; start: string; end: string };
type PromotionDraft = { key: string; id?: string; title: string; date: string };

function roleDraft(role: WorkMapRole) {
  // A pinned site is saved by its id; show its name, and keep the pin unless the place is changed.
  const pinned = /^\d+$/.test(role.locationLabel.trim());
  return {
    kind: role.kind,
    organization: role.organization,
    title: role.title,
    place: pinned ? formatHistoryPlace(role) : role.locationLabel,
    start: role.startDate.slice(0, 7),
    end: role.endDate.slice(0, 7),
    current: role.isCurrent,
    description: role.description,
    achievements: role.achievements.join("\n"),
  };
}

function setupDraft(role: WorkMapRole) {
  const d = role.details;
  return {
    type: d.schedule.type as string,
    workMode: d.schedule.workMode,
    daysOnSite: d.schedule.daysOnSite,
    hoursPerWeek: d.schedule.hoursPerWeek,
    notes: d.schedule.shift,
    shareSchedule: d.share.schedule,
    shifts: d.shifts.map((shift): ShiftDraft => ({ ...shift, key: shift.id })),
    reportsTo: d.team.reportsTo,
    department: d.team.department,
    size: d.team.size,
    shareTeam: d.share.team,
    skills: d.skills.join(", "),
    skillsGained: d.skillsGained.join(", "),
    promotions: d.promotions.map((item): PromotionDraft => ({ ...item, key: item.id })),
    growth: d.growth,
    shareGrowth: d.share.growth,
  };
}

let draftKey = 0;
const nextKey = () => `draft-${++draftKey}`;
const commas = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * A role's settings, laid out like Settings: a rail of panels for the role and
 * its work setup, one Save for everything changed.
 */
export function RoleSettings({
  role,
  panel: openPanel = "basics",
  onClose,
  onSaved,
}: {
  role: WorkMapRole;
  panel?: RoleSettingsPanel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const isNarrow = useMediaQuery(NARROW_VIEWPORT);
  const groups = groupsFor(role);
  const panels = groups.flatMap((group) => group.panels);
  const [panel, setPanel] = useState<RoleSettingsPanel>(panels.some((item) => item.id === openPanel) ? openPanel : "basics");
  const [initialRole] = useState(() => roleDraft(role));
  const [initialSetup] = useState(() => setupDraft(role));
  const [draft, setDraft] = useState(initialRole);
  const [setup, setSetup] = useState(initialSetup);
  const [initialPay] = useState(() => payDraft(role));
  const [pay, setPay] = useState(initialPay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = panels.find((item) => item.id === panel) ?? panels[0]!;
  const school = draft.kind === "school";
  const roleChanged = JSON.stringify(draft) !== JSON.stringify(initialRole);
  const setupChanged = JSON.stringify(setup) !== JSON.stringify(initialSetup);
  const payChanged = JSON.stringify(pay) !== JSON.stringify(initialPay);
  const people = [...new Set((role.people ?? []).map((person) => person.name))];

  const edit = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const editSetup = (patch: Partial<typeof setup>) => setSetup((current) => ({ ...current, ...patch }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (payChanged) {
        const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/pay`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payBody(pay)),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const known = PAY_ERROR[String(body.error)];
          if (known) setPanel(known.panel);
          setError(known?.message ?? "Pay and benefits could not be saved. Try again.");
          return;
        }
      }
      if (setupChanged) {
        const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}/work-setup`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schedule: {
              type: setup.type,
              workMode: setup.workMode,
              daysOnSite: setup.workMode === "hybrid" ? setup.daysOnSite : null,
              hoursPerWeek: setup.hoursPerWeek,
              shift: setup.notes,
            },
            shifts: setup.shifts.map(({ id, name, start, end }) => ({ id, name, start, end })),
            team: { reportsTo: setup.reportsTo, department: setup.department, size: setup.size },
            skills: commas(setup.skills),
            skillsGained: commas(setup.skillsGained),
            promotions: setup.promotions.map(({ id, title, date }) => ({ id, title, date })),
            growth: setup.growth,
            share: { schedule: setup.shareSchedule, team: setup.shareTeam, growth: setup.shareGrowth },
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const known = ERROR_PANEL[String(body.error)];
          if (known) setPanel(known.panel);
          setError(known?.message ?? "The work setup could not be saved. Try again.");
          if (payChanged) onSaved();
          return;
        }
      }
      if (roleChanged) {
        const pinned = /^\d+$/.test(role.locationLabel.trim());
        // A month field shows YYYY-MM; an unchanged date keeps what was saved.
        const keep = (value: string, saved: string) => (value === saved.slice(0, 7) ? saved : value);
        const response = await fetch(`/api/work-map/roles/${encodeURIComponent(role.id)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: draft.kind,
            title: draft.title.trim(),
            organization: draft.organization.trim(),
            locationLabel: pinned && draft.place.trim() === initialRole.place.trim() ? role.locationLabel : draft.place.trim(),
            startDate: keep(draft.start, role.startDate),
            endDate: draft.current ? "" : keep(draft.end, role.endDate),
            isCurrent: draft.current,
            description: draft.description.trim(),
            achievements: draft.achievements
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }),
        });
        if (!response.ok) {
          setPanel("basics");
          setError("The role could not be saved. Check the fields and try again.");
          if (setupChanged || payChanged) onSaved();
          return;
        }
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not reach Docier, so not everything was saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <VStack gap={2}>
      <SettingsStatus error={error} />
      <HStack gap={2}>
        <Button label="Cancel" variant="secondary" size="sm" isDisabled={busy} onClick={onClose} />
        <Button
          label={busy ? "Saving…" : "Save"}
          variant="primary"
          size="sm"
          isDisabled={busy || (!roleChanged && !setupChanged && !payChanged)}
          onClick={() => void save()}
        />
      </HStack>
    </VStack>
  );

  const fields = (
    <VStack gap={5}>
      {panel === "basics" ? (
        <SettingsCard>
          <SettingsRow
            title="Kind"
            icon={TagIcon}
            control={
              <Selector
                label="Kind"
                isLabelHidden
                size="sm"
                width={CONTROL_WIDTH}
                value={draft.kind}
                onChange={(value) => typeof value === "string" && edit({ kind: value as WorkMapRole["kind"] })}
                options={[
                  { value: "job", label: "Job" },
                  { value: "internship", label: "Internship" },
                  { value: "school", label: "School" },
                ]}
              />
            }
          />
          <SettingsRow
            title={school ? "School" : "Company"}
            icon={BuildingOffice2Icon}
            control={<TextInput label={school ? "School" : "Company"} isLabelHidden size="sm" width={CONTROL_WIDTH} value={draft.organization} onChange={(value) => edit({ organization: value })} />}
          />
          <SettingsRow
            title={school ? "Degree or program" : "Title"}
            icon={school ? AcademicCapIcon : BriefcaseIcon}
            control={<TextInput label="Title" isLabelHidden size="sm" width={CONTROL_WIDTH} value={draft.title} onChange={(value) => edit({ title: value })} />}
          />
          <SettingsRow
            title="Place"
            icon={MapPinIcon}
            description="City and state, or the site."
            control={<TextInput label="Place" isLabelHidden size="sm" width={CONTROL_WIDTH} value={draft.place} onChange={(value) => edit({ place: value })} />}
          />
          <SettingsRow
            title="Started"
            icon={CalendarDaysIcon}
            control={<MonthInput label="Started" value={draft.start} onChange={(value) => edit({ start: value })} />}
          />
          <SettingsRow
            title={school ? "I study here now" : "I work here now"}
            icon={ClockIcon}
            control={<Switch label="Current" isLabelHidden value={draft.current} onChange={(checked) => edit({ current: checked })} />}
          />
          {draft.current ? null : (
            <SettingsRow title="Ended" icon={CalendarDaysIcon} control={<MonthInput label="Ended" value={draft.end} onChange={(value) => edit({ end: value })} />} />
          )}
        </SettingsCard>
      ) : null}

      {panel === "about" ? (
        <SettingsCard>
          <SettingsRow
            title="Description"
            icon={PencilSquareIcon}
            description="Shown at the top of the role."
            detail={<TextArea label="Description" isLabelHidden size="sm" width="100%" rows={6} value={draft.description} onChange={(value) => edit({ description: value })} />}
          />
        </SettingsCard>
      ) : null}

      {panel === "achievements" ? (
        <SettingsCard>
          <SettingsRow
            title="Achievements"
            icon={TrophyIcon}
            description="One per line. Each keeps its title, date, evidence, and links when reworded."
            detail={<TextArea label="Achievements" isLabelHidden size="sm" width="100%" rows={12} value={draft.achievements} onChange={(value) => edit({ achievements: value })} />}
          />
        </SettingsCard>
      ) : null}

      {panel === "schedule" ? (
        <>
          <SettingsCard>
            <SettingsRow
              title="Type"
              icon={TagIcon}
              control={
                <Selector
                  label="Type"
                  isLabelHidden
                  size="sm"
                  width={CONTROL_WIDTH}
                  value={setup.type || "none"}
                  onChange={(value) => typeof value === "string" && editSetup({ type: value === "none" ? "" : value })}
                  options={[{ value: "none", label: "Not set" }, ...SCHEDULE_TYPES.map((type) => ({ value: type, label: SCHEDULE_TYPE_LABEL[type] }))]}
                />
              }
            />
            <SettingsRow
              title="Hours a week"
              icon={ClockIcon}
              control={
                <NumberInput label="Hours a week" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear min={1} max={168} value={setup.hoursPerWeek} onChange={(value) => editSetup({ hoursPerWeek: value })} />
              }
            />
            <SettingsRow
              title="Where"
              icon={MapPinIcon}
              control={
                <Selector
                  label="Where"
                  isLabelHidden
                  size="sm"
                  width={CONTROL_WIDTH}
                  value={setup.workMode}
                  onChange={(value) => typeof value === "string" && editSetup({ workMode: value as WorkMode })}
                  options={(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((mode) => ({ value: mode, label: WORK_MODE_LABEL[mode] }))}
                />
              }
            />
            {setup.workMode === "hybrid" ? (
              <SettingsRow
                title="Days on site a week"
                icon={BuildingOffice2Icon}
                control={
                  <NumberInput label="Days on site" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear isIntegerOnly min={1} max={7} value={setup.daysOnSite} onChange={(value) => editSetup({ daysOnSite: value })} />
                }
              />
            ) : null}
            <SettingsRow
              title="Schedule notes"
              icon={PencilSquareIcon}
              description="Anything else about the schedule."
              control={
                <TextInput label="Schedule notes" isLabelHidden size="sm" width={CONTROL_WIDTH} placeholder="e.g. Every other weekend" value={setup.notes} onChange={(value) => editSetup({ notes: value })} />
              }
            />
          </SettingsCard>
          <ShareCard title="Show my schedule on my page" description="The type, hours, and where you worked. Shifts stay private." value={setup.shareSchedule} onChange={(value) => editSetup({ shareSchedule: value })} />
        </>
      ) : null}

      {panel === "shifts" ? (
        <VStack gap={3}>
          {setup.shifts.length > 0 ? (
            <SettingsCard>
              {setup.shifts.map((shift, index) => {
                const change = (patch: Partial<ShiftDraft>) => editSetup({ shifts: setup.shifts.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
                return (
                  <SettingsRow
                    key={shift.key}
                    title={shift.name || "New shift"}
                    icon={ClockIcon}
                    description={shift.start && shift.end ? shiftLabel(shift) : "Set a start and an end."}
                    control={
                      <IconButton
                        label={`Remove ${shift.name || "this shift"}`}
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={TrashIcon} size="sm" />}
                        onClick={() => editSetup({ shifts: setup.shifts.filter((_, i) => i !== index) })}
                      />
                    }
                    detail={
                      <HStack gap={2} wrap="wrap">
                        <TextInput label="Name" size="sm" width={160} placeholder="Nights" value={shift.name} onChange={(value) => change({ name: value })} />
                        <TimeInput label="Starts" size="sm" width={130} hourFormat="12h" value={(shift.start || undefined) as never} onChange={(value) => change({ start: value ?? "" })} />
                        <TimeInput label="Ends" size="sm" width={130} hourFormat="12h" value={(shift.end || undefined) as never} onChange={(value) => change({ end: value ?? "" })} />
                      </HStack>
                    }
                  />
                );
              })}
            </SettingsCard>
          ) : (
            <Text type="supporting" color="secondary">
              Name the shifts you worked, like Days or Nights. An end before the start runs overnight.
            </Text>
          )}
          <HStack>
            <Button
              label="Add a shift"
              variant="secondary"
              size="sm"
              icon={<Icon icon={PlusIcon} size="sm" />}
              onClick={() => editSetup({ shifts: [...setup.shifts, { key: nextKey(), name: "", start: "", end: "" }] })}
            />
          </HStack>
        </VStack>
      ) : null}

      {panel === "team" ? (
        <>
          <SettingsCard>
            <SettingsRow
              title="Reported to"
              icon={UserIcon}
              description="Your manager or supervisor."
              control={<TextInput label="Reported to" isLabelHidden size="sm" width={CONTROL_WIDTH} value={setup.reportsTo} onChange={(value) => editSetup({ reportsTo: value })} />}
              detail={
                people.length > 0 ? (
                  <HStack gap={1} wrap="wrap" align="center">
                    <Text type="supporting" color="secondary">
                      From who you worked with:
                    </Text>
                    {people.slice(0, 6).map((person) => (
                      <Button key={person} label={person} variant={setup.reportsTo === person ? "secondary" : "ghost"} size="sm" onClick={() => editSetup({ reportsTo: person })} />
                    ))}
                  </HStack>
                ) : undefined
              }
            />
            <SettingsRow
              title="Department"
              icon={BuildingOffice2Icon}
              control={<TextInput label="Department" isLabelHidden size="sm" width={CONTROL_WIDTH} value={setup.department} onChange={(value) => editSetup({ department: value })} />}
            />
            <SettingsRow
              title="Team size"
              icon={HashtagIcon}
              control={<NumberInput label="Team size" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear isIntegerOnly min={1} value={setup.size} onChange={(value) => editSetup({ size: value })} />}
            />
          </SettingsCard>
          <ShareCard title="Show my team on my page" description="The department and team size. Never who you reported to." value={setup.shareTeam} onChange={(value) => editSetup({ shareTeam: value })} />
        </>
      ) : null}

      {panel === "growth" ? (
        <>
          <SettingsCard title="Skills">
            <SettingsRow
              title="Skills used"
              icon={SparklesIcon}
              description="Separate with commas."
              control={<TextInput label="Skills used" isLabelHidden size="sm" width={CONTROL_WIDTH} value={setup.skills} onChange={(value) => editSetup({ skills: value })} />}
            />
            <SettingsRow
              title="Skills gained"
              icon={ArrowTrendingUpIcon}
              description="What you learned here."
              control={<TextInput label="Skills gained" isLabelHidden size="sm" width={CONTROL_WIDTH} value={setup.skillsGained} onChange={(value) => editSetup({ skillsGained: value })} />}
            />
          </SettingsCard>
          <VStack gap={3}>
            {setup.promotions.length > 0 ? (
              <SettingsCard title="Promotions">
                {setup.promotions.map((item, index) => {
                  const change = (patch: Partial<PromotionDraft>) => editSetup({ promotions: setup.promotions.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
                  return (
                    <SettingsRow
                      key={item.key}
                      title={item.title ? `Promoted to ${item.title}` : "New promotion"}
                      icon={TrophyIcon}
                      description="Shows in the role's History in its month."
                      control={
                        <IconButton
                          label={`Remove ${item.title || "this promotion"}`}
                          variant="ghost"
                          size="sm"
                          icon={<Icon icon={TrashIcon} size="sm" />}
                          onClick={() => editSetup({ promotions: setup.promotions.filter((_, i) => i !== index) })}
                        />
                      }
                      detail={
                        <HStack gap={2} wrap="wrap" align="end">
                          <TextInput label="New title" size="sm" width={220} value={item.title} onChange={(value) => change({ title: value })} />
                          <MonthInput label="Month" value={item.date} onChange={(value) => change({ date: value })} labelShown />
                        </HStack>
                      }
                    />
                  );
                })}
              </SettingsCard>
            ) : (
              <Text type="supporting" weight="semibold" color="secondary">
                Promotions
              </Text>
            )}
            <HStack>
              <Button
                label="Add a promotion"
                variant="secondary"
                size="sm"
                icon={<Icon icon={PlusIcon} size="sm" />}
                onClick={() => editSetup({ promotions: [...setup.promotions, { key: nextKey(), title: "", date: "" }] })}
              />
            </HStack>
          </VStack>
          <SettingsCard title="Notes">
            <SettingsRow
              title="Growth notes"
              icon={PencilSquareIcon}
              detail={<TextArea label="Growth notes" isLabelHidden size="sm" width="100%" rows={3} value={setup.growth} onChange={(value) => editSetup({ growth: value })} />}
            />
          </SettingsCard>
          <ShareCard title="Show my growth on my page" description="Promotions, skills gained, and growth notes." value={setup.shareGrowth} onChange={(value) => editSetup({ shareGrowth: value })} />
        </>
      ) : null}
      {(PAY_PANELS as readonly string[]).includes(panel) ? (
        <PayPanels panel={panel as PayPanel} draft={pay} edit={(patch) => setPay((current) => ({ ...current, ...patch }))} />
      ) : null}
      {footer}
    </VStack>
  );

  const heading = (
    <VStack gap={0.5}>
      <Heading level={2}>{config.label}</Heading>
      <Text type="supporting" color="secondary">
        {config.description}
      </Text>
    </VStack>
  );
  const name = [role.organization, role.title].filter(Boolean).join(" · ");

  // Rendered at the page's root, so the role view's colors don't reach it.
  return createPortal(
    <Dialog
      className="home-settings-dialog role-settings-dialog"
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      purpose="form"
      width={880}
      maxHeight="min(640px, calc(100dvh - 2rem))"
      padding={0}
      aria-labelledby={titleId}
    >
      <VStack style={shellStyle}>
        {isNarrow ? (
          <VStack gap={0} height="100%">
            <HStack gap={2} align="center" paddingInline={3} paddingBlock={3}>
              <StackItem size="fill">
                <Text type="label" id={titleId}>
                  Role settings
                </Text>
              </StackItem>
              <IconButton label="Close" variant="ghost" size="sm" icon={<Icon icon="close" size="sm" />} onClick={onClose} />
            </HStack>
            <Divider />
            <HStack as="nav" aria-label="Role settings sections" gap={1} wrap="nowrap" isScrollable paddingInline={3} paddingBlock={2}>
              {panels.map((item) => (
                <Button key={item.id} label={item.label} icon={<Icon icon={item.icon} size="sm" />} variant={item.id === panel ? "secondary" : "ghost"} size="sm" onClick={() => setPanel(item.id)} />
              ))}
            </HStack>
            <Divider />
            <StackItem size="fill">
              <VStack gap={4} padding={4} isScrollable height="100%" style={panelStyle}>
                {heading}
                {fields}
              </VStack>
            </StackItem>
          </VStack>
        ) : (
          <Layout
            start={
              <SideNav
                aria-label="Role settings sections"
                style={{ flexShrink: 0 }}
                header={
                  <VStack gap={0} paddingInline={2} minHeight={32}>
                    <Heading level={4} id={titleId}>
                      Role settings
                    </Heading>
                    <Text type="supporting" color="secondary" maxLines={2}>
                      {name}
                    </Text>
                  </VStack>
                }
              >
                {groups.map((group) => (
                  <SideNavSection key={group.label} title={group.label} style={{ paddingBlock: "var(--spacing-2)" }}>
                    {group.panels.map((item) => (
                      <SideNavItem
                        key={item.id}
                        label={item.label}
                        icon={<Icon icon={item.icon} size="sm" color="primary" />}
                        isSelected={item.id === panel}
                        onClick={() => setPanel(item.id)}
                      />
                    ))}
                  </SideNavSection>
                ))}
              </SideNav>
            }
            content={
              <LayoutContent isScrollable padding={4}>
                <HStack width="100%" justify="end" style={closeAnchorStyle}>
                  <HStack style={closeBackingStyle}>
                    <IconButton label="Close" variant="ghost" size="sm" icon={<Icon icon="close" size="sm" />} onClick={onClose} />
                  </HStack>
                </HStack>
                <VStack gap={4} style={panelStyle}>
                  <HStack gap={2} align="start">
                    <StackItem size="fill">{heading}</StackItem>
                    <VStack aria-hidden="true" width={32} />
                  </HStack>
                  {fields}
                </VStack>
              </LayoutContent>
            }
          />
        )}
      </VStack>
    </Dialog>,
    document.body,
  );
}

function ShareCard({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <SettingsCard title="On my page">
      <SettingsRow title={title} icon={EyeIcon} description={description} control={<Switch label={title} isLabelHidden value={value} onChange={(checked) => onChange(checked)} />} />
    </SettingsCard>
  );
}

/** A month picker; the design system has none, so this is the native one, styled to match. */
function MonthInput({ label, value, onChange, labelShown = false }: { label: string; value: string; onChange: (value: string) => void; labelShown?: boolean }): ReactNode {
  const input = <input type="month" className="role-settings-month" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />;
  return labelShown ? (
    <label className="role-settings-month-label">
      {label}
      {input}
    </label>
  ) : (
    input
  );
}
