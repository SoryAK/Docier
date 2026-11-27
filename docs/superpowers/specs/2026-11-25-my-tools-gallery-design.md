# My Tools: the tool popout

Replaces the side panel. Approved by mockup (Astryx components, real photos):
clicking a card opens the tool in a popout over the page, like a gallery.

## Layout

- An Astryx `Dialog` over a dimmed page. Default size at most 52rem wide and
  38rem (or 76% of the window) tall, with room around it; an expand button
  (⤢ "Make larger" / ⤡ "Make smaller") switches to nearly the whole window, where
  the photo side takes about 3/5 of the width. The choice is remembered in this
  browser.
- Two sides. The photo side has a muted background, edge to edge; the info
  side is white.
- The bottom row holds only the pagination, centred: ‹ "3 of 12" ›.

## Photo side

- The photo shown, whole (not cropped), 4:3. On it: Make cover (or a "Cover"
  mark), Adjust photo, Remove photo, Full size (opens Astryx `Lightbox`, with
  zoom and paging through this tool's photos), and Move earlier / Move later.
- Under it, one row: every photo's thumbnail (the one shown is marked), which
  scroll sideways and slide under a divider, then the dashed "Add photos" tile,
  always at the right.
  A thumbnail can be dragged to a new place. With one photo or none, only the
  tile shows.

## Info side

- Read view: the name as a large heading (marked level 2), maker · model,
  then Edit, expand, close on the same line. A draft shows a "Needs details"
  warning banner. The filled-in fields as an Astryx `MetadataList` in two
  columns (only what's set; category only when not Tool), tags as badges, the
  notes, then a divider and Duplicate, Remove tool.
- Edit view: the basic fields first (Name, Whose it is, Condition, Maker,
  Model, Used on), the rest behind "More details", which opens by itself when
  the tool has any of them filled in or one is refused. Then Cancel, Save, and (for a draft
  with others waiting) "Save and next draft (N left)" at the bottom of this side.
- Adding a tool opens the popout straight in Edit, titled "New tool", with "Add
  tool" in place of Save; photos picked before saving are uploaded after.

## Moving between tools

- ‹ › and the ← → keys (not while typing, not in Edit, not while a photo dialog
  is open) move through the tools in the grid's order and filters, wrapping.
- Paging while editing saves first when something changed; a failed save stays.
- The tool shown stays in the address (`#/tools/<id>`). Paging, a duplicate, and
  a just-added tool replace the address rather than add history, so Back
  returns to the grid. Escape or close returns to the grid with focus on that
  tool's card. After Save, Cancel, or a photo action, focus stays in the popout.

## Kept as they are

Duplicate, Remove, framing, photo order and cover, drafts in a row, choosing
and bulk changes, card quick menus, shortcuts (blocked while the popout is
open, since it's a dialog).

## Approaches

- Popout from Astryx parts (chosen): `Dialog`, `MetadataList`, `Banner`,
  `Badge`, `IconButton`, `SelectableCard`, `AspectRatio`, `Lightbox`. The
  `product-detail` template gives the photo-beside-details shape.
- Astryx `Lightbox` alone: a photo viewer with no details side.
- Keep the side panel and add a viewer: two places to look at a tool.

## Calls made while building

- The form keeps today's native fields and styles, so adding and changing stay
  exactly the same fields and behaviour; only where they sit changes.
- Photo overlays inside the popout (Adjust photo) render inside it, since a
  modal dialog makes everything outside it unreachable.
