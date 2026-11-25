# My Tools, phase 3: changing many tools at once

Builds on `2026-11-25-my-tools-design.md` and
`2026-11-25-my-tools-phase-2-design.md`. Brings back the bulk actions the
earlier inventory had, for the fields My Tools has today.

## Why

Someone with forty tools moves a truck's worth into a kit, marks a batch as
borrowed, or clears out what they sold, without opening each tool.

## Choosing tools

- **Select** in the page head turns on choosing. Each card shows a checkbox
  and a click picks the card instead of opening it. Turning choosing off, or
  pressing Escape, clears what's picked.
- **A bar above the grid** while choosing: "N picked", "Pick all shown (M)" /
  "Clear", then the actions. "Shown" follows the kit, search and filters.
- Picks that a new filter hides stay picked; the count says "N picked, K not
  shown" so nothing changes out of sight unnoticed.
- Changing the filter or kit doesn't open a tool panel; an open panel closes
  when choosing starts.

## The actions

Each acts on every picked tool, in one step that either all saves or none does.

- **Category**, **Whose it is**, **Condition**: pick one value, set on all.
- **Add tags** / **Remove tags**: tags typed or picked from the tags the picked
  tools already have.
- **Add to a kit** (an existing kit, or a new name, which makes the kit) and
  **Take out of a kit**.
- **Delete**: "Delete 6 tools? Their photos go too." with Delete / Keep.

A tool that "Needs details" keeps that mark: a bulk change doesn't fill in
its details. Fields not in this list (name, maker, serial, prices, where it's
kept, notes, roles, photo framing) are changed one tool at a time, because
one value rarely fits many tools.

After an action: the tools stay picked (so a second action can follow), and a
line says what happened ("6 tools moved to Truck toolbox."). After Delete the
picks clear.

## Approaches

1. **One server call for the whole change (chosen).** `POST /api/tools/bulk`
   with the picked ids and one change. The rules (what a change may hold, how
   it applies to a tool) live in `core/`; the server applies it to all tools in
   one transaction. All-or-nothing, one request, testable without the page.
2. **The page sends one save per tool.** No new route, but forty requests,
   a half-applied change when one fails, and the change logic ends up in the
   page, against the project's rule that it lives in `core/`.
3. **A general "patch many" endpoint taking any fields.** Flexible, but lets a
   bulk change set fields that shouldn't be shared (serials, names) and needs
   its own checks for each.

## Rules (core)

- A change is exactly one of: `category`, `ownership`, `condition`,
  `addTags`, `removeTags`, `addKit`, `removeKit`, `delete`. Anything else, an
  unknown value, an unknown kit, or an empty list of ids is refused.
- Ids must all be the occupant's own tools; one unknown id refuses the whole
  change.
- Tags follow the existing tag rules (trimmed, deduplicated ignoring case).
- At most 500 tools per change.

## Left to the builder

The exact bar layout at narrow widths (it wraps; phone layout waits for its
own design pass), and the wording of the result lines.
