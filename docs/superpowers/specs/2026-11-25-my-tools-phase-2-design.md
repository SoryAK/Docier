# My Tools, phase 2: kits, totals and export, photo framing

Builds on `2026-11-25-my-tools-design.md`. Everything here stays on the
occupant's computer. Share links have their own design.

## Kits

Named groups of tools, like "Electrical kit" or "Truck toolbox". A tool can be
in any number of kits; a kit can be empty.

- **On the page:** a row above the filters: "All tools", then each kit with its
  count, then "+ New kit". Picking a kit shows only its tools (search, category,
  and Needs details still apply).
- **Add, change, remove together:** "+ New kit" turns into a name field in
  place (Enter adds it). A kit's own chip, once picked, offers Rename (the same
  name field) and Delete ("Delete Electrical kit? Its tools stay.").
- **In a tool's panel:** "Kits", like "Used on": the kits it's in, each with
  take-off, and "+ Add to a kit".
- **Names:** trimmed, 1–60 characters, unique per occupant ignoring case.
- **Removing:** deleting a kit keeps its tools; removing a tool takes it out of
  its kits.
- **Backups** include kits and what's in them.

## Totals and CSV export

- **A summary line** under the heading, for the tools shown (it follows the
  kit, search, and filters): "12 tools · $2,340 paid · worth $1,800 now · 9
  with photos". Money parts only show when at least one tool has a value.
- **Export CSV** (beside Add from photos): downloads `my-tools.csv` of the
  tools shown. Columns: Name, Category, Whose it is, Maker, Model, Serial,
  Condition, How well you use it, When you got it, Paid, Worth now, Where it's
  kept, Tags, Used on, Kits, Notes, Needs details. Values are quoted the
  standard way (commas, quotes, line breaks), and a cell starting with `=`,
  `+`, `-`, or `@` gets a leading `'` so a spreadsheet won't run it.

## Photo framing (crop and rotate)

How a photo shows, without changing the file: rotate a quarter turn either
way, flip across or up-down, zoom (1× to 3×), and the point that stays in view
(the focal point). Cards, the panel, and a role's Setup all show it framed.

- **In the panel:** each photo gets "Adjust". It opens a dialog with the photo
  in a card-shaped frame, rotate left and right, flip across and up-down, a zoom
  slider, and drag (or arrow keys) to move the focal point; Reset, Cancel, Save.
- **Stored on the photo:** rotation (0, 90, 180, 270), flips, zoom, focal x and
  y (0–100). Bad values are refused.
- **Backups** carry the framing with the photo.

## Approaches

1. **Framing as numbers on the photo, applied when shown (chosen).** The
   original stays as taken, and changes can be undone any time.
2. Re-encode the file on save. Smaller to show, but every change loses quality
   and can't be undone.
3. A separate cropped copy per photo. Doubles storage for little gain.

For kits, their own tables (`tool_kits`, `tool_kit_items`) beside the tool
tables, the way role links are kept. Totals and the CSV are worked out from the
tools already loaded; no new endpoint.

## Where it lives

- `core/personal-tools.ts`: kit names, totals, the CSV, framing checks and the
  CSS for a framing (tested).
- `server/personal-tools.ts` and `/api/tools/kits…`: kits and framing storage
  (tested).
- `web/src/ToolsPage.tsx`, `ToolPanel.tsx`, a new `ToolPhotoFrame.tsx` for the
  dialog; web tests for each.
