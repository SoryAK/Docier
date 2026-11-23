# Role view: opening a role in Career History

## Why

Career History is where people will spend most of their time, and clicking a role there does almost nothing today: the left panel shrinks to four lines and the main area keeps showing Home's overview. A role holds a lot (story, achievements, photos, places, people, moments, conditions), but the only page that shows it is an old one nothing links to. Opening a role should show that role, and make it easy to add to as the job goes on.

## Goals

- Clicking a role shows that role across the page, using the room on the right instead of squeezing it into the left panel.
- The role reads as a page about the job, with its photo, and its parts come in the form that suits each: buttons for photos and links, a face stack for people, two short tabs, sections for photos and places.
- The right panel tells the role's story over time, year by year, and takes new notes and milestones as they happen.
- Everything shown can be added to where it appears, and the role's main fields change in one Edit, the same fields used to add it.

Non-goals: the canvas, the old Work Map page, Home's own overview.

Anti-goals: a long row of tabs; boxes and pills crammed into narrow space; achievements stuck on the card; a grey empty banner.

## Approaches

- **Card in the left panel, links open elsewhere:** tried first; the card was squeezed and the left panel lost the list.
- **Banner and tabs, header and tiles, story and side boxes, one long page:** tried; tiles and long tab rows felt busy.
- **D · banner with buttons, two tabs, History on the right.** **Picked.** Prototype: `web/prototypes/role-card/index.html` (kept on the developer's machine).

## The design (as decided)

Three columns, as on Home.

**Left: the Career History list.** It stays a list when a role is open; the open role is highlighted, and clicking another role switches to it.

**Middle: the role.**
- **Banner:** the role's cover photo, or a cream band (`#fbf6ee` to `#f4ecdf`) when there is none. On it: the company (two lines at most), the title, a photos button that opens a gallery ("Add photos" when there are none), and Edit. Website and LinkedIn are small round icons in the banner's corner, shown only when saved.
- **Under the banner:** place · dates, a "current" tag and how long; on the right, a stack of faces for the people worked with, which opens their list.
- **Two tabs:** Overview and Achievements (with a count).
  - Overview: the summary and description in words, a few quiet facts, then a **Photos & events** section (thumbnails, then events) and a **Places** section (the main site, client sites, travel).
  - Achievements: the list, each with a small proof tag for the evidence behind it.
- **Adding in place:** small "+" adds where each thing appears; empty spots say what to add.
- **Edit** opens the role's main fields (kind, title, organization, place, dates, current, description, achievements) in the middle.

**Right: History for this role.**
- A header: a small square of the cover (or a cream square with the company's first letter), "History", and the role with its span.
- One row: a search box, a filter (All, Notes, Milestones, Events, Achievements, and later Edits), and a sort (Newest, Oldest).
- The years of the role, newest first, each opening to what happened that year with its month and kind.
- At the bottom, a box to add a note or a milestone to this role.

**Address:** each role has its own, `#/history/<role id>`, so the back button and links from Home's timeline and map land on it.

## Delivered in steps

1. **First live slice:** the three columns with the data a role already has: banner, links, gallery, face stack (from the role's saved colleagues), two tabs, Photos & events and Places sections, History by year from the role's start, end, milestones, events, notes, and achievements, and adding a note or milestone. Edit for the main fields. The role's address.
2. **People shared with My Network:** "Worked with" lists My Network people linked to the role; adding someone adds or links them there.
   - A person is one My Network contact. The link to a role (`role_contacts`) carries what belongs to that job: a short note ("trained me") and the month you started working together (blank means the role's start).
   - In the role view: the face stack opens the list; type a name to link someone from My Network or add someone new (name, their role, company filled from the role, email, the note, since). Change uses the same fields. "Take off this role" only unlinks; deleting a person stays on My Network.
   - People linked to other roles at the same company are offered as one-click suggestions; nothing is linked automatically.
   - History shows "Started working with …" in the year you started working together.
   - My Network shows the roles each person is linked to; each opens that role.
   - The role's old "worked with" list is retired: any entries move into My Network once, linked to their role.
3. **Dates on achievements:** each achievement gets a date (default: the role's start), so it lands in the right year.
4. **Evidence on an achievement:** linked evidence names the achievement it backs; the proof tag counts it.
5. **Edits:** a record of changes to the role, shown under History's Edits filter, with undo for recent ones.
6. **Adds in place** for photos, events, sites, and people, and the tablet and phone layouts.

Until step 3, achievements sit in the year the role started.

## Left to the builder

- Spacing, type sizes, and class names (`role-view-*`, `role-history-*`).
- How the gallery steps through photos.
- The year labels' wording ("So far", "Year 2", "Started in June", "Left in September").
