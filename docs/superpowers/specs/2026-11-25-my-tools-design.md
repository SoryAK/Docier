# My Tools

## Why

People in the trades and technical jobs bring their own tools, and those tools
say a lot about what they can do. A role's Setup already records the employer's
equipment (given to you, or worked on). This adds the other half: your own
tools, kept in one place with photos, and tied to the jobs you used them on.
The older app had this as a Personal Inventory page; this brings back its core.

## Scope

In this first version:

1. **Tools with their details and photos**, each one linkable to the roles where
   you used it.
2. **Add from photos:** pick or drop several photos at once; each becomes a draft
   tool that you fill in later.

Left for later: kits (named groups), share links, crop/rotate/flip of photos,
CSV export, totals and value tiles, and showing tools on your public page.

## What you see

- **Menu:** "My Tools" under Tools, with a wrench icon, and in the icon column
  when the left column is closed. The page covers tools and equipment alike;
  the short name matches My Network and My Docs.
- **The page:** a heading ("My Tools") with "Add a tool" and "Add from photos". Under it a
  search box, a category filter, and "Needs details" (drafts only). Tools show
  as a grid of cards: cover photo (or an icon), name, maker and model, whose it
  is (Mine, Shared, Borrowed, Rented), and the roles it's linked to. A draft
  says "Needs details".
- **A tool opens in a panel** with every field. The fields used to add a tool are
  the ones used to change it. It also has its photos (add, remove, choose the
  cover), the roles it was used on (add, remove), and Remove for the tool.
- **On a role:** Setup shows "Your own tools", the tools linked to that role,
  each opening the tool. Linking is changed from the tool.
- **Search** finds tools by name, maker, model, and tags, and opens the tool.

## The record

- Name; category (the same as a role's equipment: tool, machine, vehicle,
  computer, software, safety gear, other); whose it is (mine, shared, borrowed,
  rented); maker; model; serial; condition (new, good, fair, poor); how well you
  use it (1–5, optional); when you got it (month); what you paid; what it's
  worth now; where it's kept; tags; notes.
- Draft: set by "Add from photos", cleared the first time the tool is saved from
  its panel.
- Photos: several per tool, in order, one of them the cover. JPEG, PNG, WebP or
  GIF, with the same size limit as the profile photo.
- Roles: any number of the occupant's roles.
- Never published. Serials, prices, and where it's kept are private by nature,
  and the whole list stays off your page in this version.

## Rules

- Removing a tool removes its photos and its role links.
- Removing a role takes it off every tool; the tools stay.
- A draft made from a photo is named from the file (without the extension) so
  it can be told apart; you rename it when you fill it in.
- Backup export and restore include tools, their photos, and their links.

## Approaches

1. **Tables of their own** (chosen): `personal_tools`, `personal_tool_photos`,
   and `personal_tool_roles`, with photo files in uploads named
   `tool-<uuid>.<ext>`, the way contact photos are stored. Clear to query,
   back up, and search.
2. Store tools as role equipment with usage "mine". Simpler, but a tool would
   belong to one role and couldn't exist without one.
3. Store photos in My Docs. It reuses uploads, but fills My Docs with tool photos
   and ties removing a photo to removing a document.

## Where it lives

- `core/personal-tools.ts`: the record, its fields and labels, reading and
  checking input, drafts from file names, filtering and search (tested).
- `server/personal-tools.ts` and routes under `/api/tools`: storage, photos,
  role links (tested).
- `web/src/ToolsPage.tsx`: the page, the panel, and add from photos.
