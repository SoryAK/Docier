import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowUturnLeftIcon,
  BuildingOffice2Icon,
  EyeIcon,
  MapIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  StarIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_USAGE_LABEL,
  equipmentFromNames,
  uniformItemText,
  type EquipmentCategory,
  type EquipmentUsage,
  type UniformProvider,
} from "@core/role-gear";
import {
  COMMUTE_MODES,
  COMMUTE_MODE_LABEL,
  LEAVING_REASONS,
  LEAVING_REASON_LABEL,
  RATING_AREAS,
  RATING_AREA_LABEL,
  type CommuteMode,
  type LeavingReason,
  type RatingArea,
} from "@core/role-reflection";
import type { WorkMapRole } from "@core/work-map";
import { SettingsCard, SettingsRow } from "./SettingsRows";

const CONTROL_WIDTH = 220;

export const GEAR_PANELS = ["equipment", "uniform"] as const;
export const REFLECTION_PANELS = ["rating", "leaving", "commute"] as const;
export type GearPanel = (typeof GEAR_PANELS)[number];
export type ReflectionPanel = (typeof REFLECTION_PANELS)[number];

export const GEAR_ERROR: Record<string, { panel: GearPanel; message: string }> = {
  "equipment-name-required": { panel: "equipment", message: "Give every piece of equipment a name." },
  "equipment-month-invalid": { panel: "equipment", message: "Use a full month for when you had it." },
  "uniform-item-required": { panel: "uniform", message: "Name every uniform item." },
};

export const REFLECTION_ERROR: Record<string, { panel: ReflectionPanel; message: string }> = {
  "rating-invalid": { panel: "rating", message: "Ratings run from 1 to 5 stars." },
  "reason-invalid": { panel: "leaving", message: "Pick a reason from the list." },
  "commute-invalid": { panel: "commute", message: "The commute has to be a number, 0 or more." },
};

let draftKey = 0;
const nextKey = () => `more-${++draftKey}`;

export function gearDraft(role: WorkMapRole) {
  const d = role.details;
  // Equipment saved as names alone shows as items to fill in.
  const items = d.equipmentItems.length ? d.equipmentItems : equipmentFromNames(d.equipment, () => nextKey());
  return {
    equipmentItems: items.map((item) => ({ ...item, key: item.id, id: d.equipmentItems.length ? item.id : undefined })),
    uniformItems: d.uniformItems.map((item) => ({ ...item, key: item.id })),
    uniform: d.uniform,
    shareEquipment: d.share.equipment,
    shareUniform: d.share.uniform,
  };
}
export type GearDraft = ReturnType<typeof gearDraft>;

export function gearBody(draft: GearDraft) {
  return {
    equipmentItems: draft.equipmentItems.map(({ key: _key, ...item }) => item),
    uniformItems: draft.uniformItems.map(({ key: _key, ...item }) => item),
    uniform: draft.uniform,
    share: { equipment: draft.shareEquipment, uniform: draft.shareUniform },
  };
}

export function reflectionDraft(role: WorkMapRole) {
  const d = role.details;
  return {
    workplaceRating: d.workplaceRating,
    ratings: d.ratings,
    reason: d.leaving.reason as LeavingReason | "",
    wouldReturn: d.leaving.wouldReturn,
    departure: d.departure,
    minutes: d.commute.minutes,
    miles: d.commute.miles,
    mode: d.commute.mode as CommuteMode | "",
    environment: d.environment,
    shareRating: d.share.workplaceRating,
    shareDeparture: d.share.departure,
    shareEnvironment: d.share.environment,
  };
}
export type ReflectionDraft = ReturnType<typeof reflectionDraft>;

export function reflectionBody(draft: ReflectionDraft) {
  return {
    workplaceRating: draft.workplaceRating,
    ratings: draft.ratings,
    leaving: { reason: draft.reason, wouldReturn: draft.wouldReturn },
    departure: draft.departure,
    commute: { minutes: draft.minutes, miles: draft.miles, mode: draft.mode },
    environment: draft.environment,
    share: { workplaceRating: draft.shareRating, departure: draft.shareDeparture, environment: draft.shareEnvironment },
  };
}

function Share({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <SettingsCard title="On my page">
      <SettingsRow title={title} icon={EyeIcon} description={description} control={<Switch label={title} isLabelHidden value={value} onChange={(checked) => onChange(checked)} />} />
    </SettingsCard>
  );
}

/** Five stars, with the chosen one again to clear it. */
function Stars({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <span className="role-settings-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          className={value != null && n <= value ? "is-on" : undefined}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function month(label: string, value: string, onChange: (value: string) => void) {
  return (
    <label className="role-settings-month-label">
      {label}
      <input type="month" className="role-settings-month" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function GearPanels({ panel, draft, edit }: { panel: GearPanel; draft: GearDraft; edit: (patch: Partial<GearDraft>) => void }) {
  if (panel === "equipment") {
    type Item = GearDraft["equipmentItems"][number];
    const change = (index: number, patch: Partial<Item>) => edit({ equipmentItems: draft.equipmentItems.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
    return (
      <VStack gap={5}>
        <VStack gap={3}>
          {draft.equipmentItems.length > 0 ? (
            <SettingsCard>
              {draft.equipmentItems.map((item, index) => (
                <SettingsRow
                  key={item.key}
                  title={item.name || "New equipment"}
                  icon={WrenchScrewdriverIcon}
                  description={[EQUIPMENT_USAGE_LABEL[item.usage], EQUIPMENT_CATEGORY_LABEL[item.category], [item.maker, item.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                  control={<IconButton label={`Remove ${item.name || "this equipment"}`} variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => edit({ equipmentItems: draft.equipmentItems.filter((_, i) => i !== index) })} />}
                  detail={
                    <VStack gap={2}>
                      <HStack gap={2} wrap="wrap" align="end">
                        <TextInput label="Name" size="sm" width={200} placeholder="Fluke 87, Truck 427" value={item.name} onChange={(value) => change(index, { name: value })} />
                        <Selector
                          label="How"
                          size="sm"
                          width={140}
                          value={item.usage}
                          onChange={(value) => typeof value === "string" && change(index, { usage: value as EquipmentUsage })}
                          options={(Object.keys(EQUIPMENT_USAGE_LABEL) as EquipmentUsage[]).map((usage) => ({ value: usage, label: EQUIPMENT_USAGE_LABEL[usage] }))}
                        />
                        <Selector
                          label="Kind"
                          size="sm"
                          width={140}
                          value={item.category}
                          onChange={(value) => typeof value === "string" && change(index, { category: value as EquipmentCategory })}
                          options={EQUIPMENT_CATEGORIES.map((category) => ({ value: category, label: EQUIPMENT_CATEGORY_LABEL[category] }))}
                        />
                      </HStack>
                      <HStack gap={2} wrap="wrap" align="end">
                        <TextInput label="Maker" size="sm" width={140} value={item.maker} onChange={(value) => change(index, { maker: value })} />
                        <TextInput label="Model" size="sm" width={140} value={item.model} onChange={(value) => change(index, { model: value })} />
                        <TextInput label="Serial" size="sm" width={140} value={item.serial} onChange={(value) => change(index, { serial: value })} />
                        <TextInput label="Asset tag" size="sm" width={120} value={item.assetTag} onChange={(value) => change(index, { assetTag: value })} />
                      </HStack>
                      <HStack gap={2} wrap="wrap" align="end">
                        {month("From", item.from, (value) => change(index, { from: value }))}
                        {month("Until", item.to, (value) => change(index, { to: value }))}
                        <TextInput label="Notes" size="sm" width={240} value={item.notes} onChange={(value) => change(index, { notes: value })} />
                      </HStack>
                    </VStack>
                  }
                />
              ))}
            </SettingsCard>
          ) : (
            <Text type="supporting" color="secondary">
              Tools, machines, vehicles, and computers you were given or worked on.
            </Text>
          )}
          <HStack>
            <Button
              label="Add equipment"
              variant="secondary"
              size="sm"
              icon={<Icon icon={PlusIcon} size="sm" />}
              onClick={() =>
                edit({
                  equipmentItems: [
                    ...draft.equipmentItems,
                    { key: nextKey(), id: undefined, name: "", usage: "assigned", category: "tool", maker: "", model: "", serial: "", assetTag: "", from: "", to: "", notes: "" },
                  ],
                })
              }
            />
          </HStack>
        </VStack>
        <Share title="Show my equipment on my page" description="Names only. Serials, asset tags, and notes stay private." value={draft.shareEquipment} onChange={(value) => edit({ shareEquipment: value })} />
      </VStack>
    );
  }

  type Uniform = GearDraft["uniformItems"][number];
  const change = (index: number, patch: Partial<Uniform>) => edit({ uniformItems: draft.uniformItems.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <VStack gap={5}>
      <VStack gap={3}>
        {draft.uniformItems.length > 0 ? (
          <SettingsCard title="What you wore">
            {draft.uniformItems.map((item, index) => (
              <SettingsRow
                key={item.key}
                title={item.item ? uniformItemText(item) : "New item"}
                icon={ShieldCheckIcon}
                control={<IconButton label={`Remove ${item.item || "this item"}`} variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => edit({ uniformItems: draft.uniformItems.filter((_, i) => i !== index) })} />}
                detail={
                  <HStack gap={2} wrap="wrap" align="end">
                    <TextInput label="Item" size="sm" width={180} placeholder="Coveralls, steel toes" value={item.item} onChange={(value) => change(index, { item: value })} />
                    <TextInput label="Color" size="sm" width={110} value={item.color} onChange={(value) => change(index, { color: value })} />
                    <Selector
                      label="Provided by"
                      size="sm"
                      width={150}
                      value={item.providedBy || "none"}
                      onChange={(value) => typeof value === "string" && change(index, { providedBy: (value === "none" ? "" : value) as UniformProvider })}
                      options={[
                        { value: "none", label: "Not set" },
                        { value: "employer", label: "The employer" },
                        { value: "me", label: "Me" },
                      ]}
                    />
                  </HStack>
                }
              />
            ))}
          </SettingsCard>
        ) : (
          <Text type="supporting" color="secondary">
            What you wore for work: coveralls, scrubs, boots, safety gear.
          </Text>
        )}
        <HStack>
          <Button
            label="Add an item"
            variant="secondary"
            size="sm"
            icon={<Icon icon={PlusIcon} size="sm" />}
            onClick={() => edit({ uniformItems: [...draft.uniformItems, { key: nextKey(), id: "", item: "", color: "", providedBy: "" }] })}
          />
        </HStack>
      </VStack>
      <SettingsCard title="Notes">
        <SettingsRow title="Uniform notes" icon={PencilSquareIcon} detail={<TextArea label="Uniform notes" isLabelHidden size="sm" width="100%" rows={2} value={draft.uniform} onChange={(value) => edit({ uniform: value })} />} />
      </SettingsCard>
      <Share title="Show my uniform on my page" description="The items and the notes." value={draft.shareUniform} onChange={(value) => edit({ shareUniform: value })} />
    </VStack>
  );
}

export function ReflectionPanels({ panel, draft, edit }: { panel: ReflectionPanel; draft: ReflectionDraft; edit: (patch: Partial<ReflectionDraft>) => void }) {
  if (panel === "rating") {
    return (
      <VStack gap={5}>
        <SettingsCard>
          <SettingsRow title="Overall" icon={StarIcon} description="How it was, all told." control={<Stars label="Overall" value={draft.workplaceRating} onChange={(value) => edit({ workplaceRating: value })} />} />
          {RATING_AREAS.map((area: RatingArea) => (
            <SettingsRow
              key={area}
              title={RATING_AREA_LABEL[area]}
              icon={StarIcon}
              control={<Stars label={RATING_AREA_LABEL[area]} value={draft.ratings[area]} onChange={(value) => edit({ ratings: { ...draft.ratings, [area]: value } })} />}
            />
          ))}
        </SettingsCard>
        <Share title="Show my overall rating on my page" description="Only the overall stars. The rest stays private." value={draft.shareRating} onChange={(value) => edit({ shareRating: value })} />
      </VStack>
    );
  }

  if (panel === "leaving") {
    return (
      <VStack gap={5}>
        <SettingsCard>
          <SettingsRow
            title="Why you left"
            icon={ArrowUturnLeftIcon}
            control={
              <Selector
                label="Why you left"
                isLabelHidden
                size="sm"
                width={CONTROL_WIDTH}
                value={draft.reason || "none"}
                onChange={(value) => typeof value === "string" && edit({ reason: value === "none" ? "" : (value as LeavingReason) })}
                options={[{ value: "none", label: "Not set" }, ...LEAVING_REASONS.map((reason) => ({ value: reason, label: LEAVING_REASON_LABEL[reason] }))]}
              />
            }
          />
          <SettingsRow
            title="Would you go back?"
            icon={BuildingOffice2Icon}
            control={
              <HStack gap={1}>
                {(["yes", "maybe", "no"] as const).map((answer) => (
                  <Button key={answer} label={answer === "yes" ? "Yes" : answer === "no" ? "No" : "Maybe"} size="sm" variant={draft.wouldReturn === answer ? "secondary" : "ghost"} onClick={() => edit({ wouldReturn: draft.wouldReturn === answer ? "" : answer })} />
                ))}
              </HStack>
            }
          />
          <SettingsRow title="In your words" icon={PencilSquareIcon} detail={<TextArea label="Why you left, in your words" isLabelHidden size="sm" width="100%" rows={3} value={draft.departure} onChange={(value) => edit({ departure: value })} />} />
        </SettingsCard>
        <Share title="Show why I left on my page" description="Your words only. The reason and whether you'd go back stay private." value={draft.shareDeparture} onChange={(value) => edit({ shareDeparture: value })} />
      </VStack>
    );
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Commute">
        <SettingsRow
          title="How you got there"
          icon={MapIcon}
          control={
            <Selector
              label="How you got there"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={draft.mode || "none"}
              onChange={(value) => typeof value === "string" && edit({ mode: value === "none" ? "" : (value as CommuteMode) })}
              options={[{ value: "none", label: "Not set" }, ...COMMUTE_MODES.map((mode) => ({ value: mode, label: COMMUTE_MODE_LABEL[mode] }))]}
            />
          }
        />
        {draft.mode === "remote" ? null : (
          <>
            <SettingsRow title="Minutes, one way" icon={MapIcon} control={<NumberInput label="Minutes" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear min={0} max={600} value={draft.minutes} onChange={(value) => edit({ minutes: value })} />} />
            <SettingsRow title="Miles, one way" icon={MapIcon} control={<NumberInput label="Miles" isLabelHidden size="sm" width={CONTROL_WIDTH} hasClear min={0} max={1000} value={draft.miles} onChange={(value) => edit({ miles: value })} />} />
          </>
        )}
      </SettingsCard>
      <SettingsCard title="The place">
        <SettingsRow title="Work environment" icon={BuildingOffice2Icon} description="What it was like to work there." detail={<TextArea label="Work environment" isLabelHidden size="sm" width="100%" rows={3} value={draft.environment} onChange={(value) => edit({ environment: value })} />} />
      </SettingsCard>
      <Share title="Show the work environment on my page" description="The commute always stays private." value={draft.shareEnvironment} onChange={(value) => edit({ shareEnvironment: value })} />
    </VStack>
  );
}
