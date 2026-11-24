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
- **Later (2026-11-24): the name under the banner, a line at a glance, six tabs for a job.** Work setup, Pay & benefits, Gear, and Looking back had stacked on Overview as four cards that each opened with "Show all"; they became tabs of their own instead, and their key facts went in one line under the name. Tried as pills and as plain text: plain text picked. Pay was weighed as hidden behind an eye, masked as dots, or off until a switch in the Pay tab turns it on: the switch picked. This revisits the "long row of tabs" anti-goal on purpose; on a narrow screen the row scrolls sideways.

## The design (as decided)

Three columns, as on Home.

**Left: the Career History list.** It stays a list when a role is open; the open role is highlighted, and clicking another role switches to it.

**Middle: the role.**
- **Banner:** the role's cover photo, or a cream band (`#fbf6ee` to `#f4ecdf`) when there is none. On it, in the top corner: a photos button that opens a gallery ("Add photos" when there are none), and Edit. Under it, on the card: the company (two lines at most) and the title. The company's links (website, LinkedIn, Instagram, Facebook, X, YouTube) sit on the line with the company's name, at its right: the website by its name with a globe, each network by its logo alone (its name on hover and read aloud), shown only when saved; the banner itself carries no links. They are set under Basics → Company links, saved together and recorded in Edits, and never go on your public page.
- **Under the banner:** place · dates and how long ("Present" says a role is current, so there is no separate tag; the commute stays in Looking back); on the right, a stack of faces for the people worked with, which opens their list.
- **At a glance:** for a job, one line of plain facts under the title, above the place and dates, each with a small icon and each opening its tab: work type and where ("Full-time, on site"), hours a week, who you reported to, pay (only when switched on), and the overall rating. A fact shows only when it is set; with none, the line is not there. Built by `roleGlance` in `core/role-glance.ts`.
- **Pay at a glance:** off by default. "Show pay under the name" at the top of the Pay & benefits tab turns it on for that role; it is saved in the role's details (`glance.pay`), recorded in Edits ("Showed pay under the name" / "Hid pay under the name"), can be undone, and never goes on your public page.
- **Tabs:** Overview and Achievements (with a count) for every role; a job adds Work setup, Pay & benefits (with a lock), Gear, and Looking back. Each of those shows all its details at once, with Edit, or what it holds and "+ Add" when empty.
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
   - **Asking someone to confirm you worked together** (a "Worked together" request, sent from a person on the role, never from the general composer):
     - The person's row offers "Ask to confirm": their email and a short message make a private Relay link to copy or email. Adding someone new can ask at once.
     - Their page shows the role (company, title, dates) and nothing else from the career, with Confirm or Decline, a note back, and their details asked up front.
     - Confirming marks them Confirmed on the role, quotes their note, fills blanks on their contact (nothing typed is replaced), and adds "… confirmed you worked together" to History. Declining leaves them linked, unconfirmed.
     - While waiting the row shows Request sent or Opened, and the request can be withdrawn. All of these also show in Requests.
     - Each answer records where it came from: the page, or (next) the recipient's own Docier.
   - **Confirmed both ways.** When the person also uses Docier, they paste the link into Requests → Received → "Answer a request". Their Docier reads the request from the sender's Relay (`/q/<token>/data`), suggests their role at the same company, and on Confirm sends the answer marked as from a Docier, then adds the sender to their network on the chosen role, confirmed. Both sides show "Confirmed both ways". The answer is sent before anything is recorded, so a failed send leaves nothing behind. Pasted links must be https (or http on this machine) with a `/q/<token>` path. The two vaults share nothing but the answer.
3. **Dates on achievements:** each achievement can carry the month it happened, so it lands in the right year.
   - The month is stored with the achievement's id, so rewording or reordering it in Edit keeps it.
   - In the Achievements tab each achievement has a small date button ("Apr 2025", or "+ When?"), opening a month field limited to the role's dates; it can be cleared.
   - Undated achievements (resume imports, until dated) sit in the role's first year in History with no month, so they read as not yet dated.
4. **Evidence on an achievement:** linked evidence names the achievement it backs; the proof tag counts it.
   - A pin records the achievement's id with its current statement. Reading a role refreshes the statement from the id, so rewording an achievement keeps its evidence, and the facts and published pages, which match by statement, stay right. Older statement-only pins get their id once, by matching; a pin to a removed achievement becomes the role's general evidence.
   - Each achievement's tag ("1 proof" / "+ proof") opens a panel listing its evidence with Change and Remove, and "+ Add evidence": a link with "Fill from link" (title, site, date, kind), whether it names you or is about your work, and your part. Saving keeps a copy of the page in the vault, as before.
   - **An achievement on its own.** Clicking an achievement, in the Achievements tab or in History, opens it alone in the middle ("← All achievements" goes back): its wording with Edit (saved with the role's achievements, so facts stay in step), its month, its evidence shown in place, and **Linked to**: people on the role, events and milestones, the role's places, and skills or tools (typed, with suggestions from the role and its other achievements). Links are stored with the achievement, so rewording keeps them; links to something removed from the role drop out. Only people, moments, and places on that role can be linked.
5. **Edits:** a record of changes to the role, shown under History's Edits filter, with undo.
   - Every save that changes something is recorded with a line saying what changed, e.g. "Changed the title to Lead technician" or "Added a note: Moved to nights". A save that changes nothing isn't recorded.
   - The role's own fields (including each achievement's wording, title, month, and links) and its details (notes, milestones, events, work setup, pay) keep what each change replaced, so it can be undone. People, places, photos, and evidence are logged without undo for now.
   - A change can be undone if nothing has changed the same thing since; otherwise it reads "Changed again since". Undoing is recorded as a change too ("Undid: …"), so it can be undone in turn, and the change it undid reads "Undone".
   - Edits appear only under the Edits filter, by when they were made, with the time and an Undo button. They are never published.
   - Undoing a change to the role's fields brings its facts back in step, as a save does.
6. **Adds in place** for photos, events, sites, and people, and the tablet and phone layouts.
   - Events: under Photos & events, "+ Add an event" opens a small form (month, what happened, optional details, show on my page). Each event can be changed or removed from its row. Saved with the role's details, so each change shows in Edits and can be undone.
   - Places: under Places, "+ Add a place" opens a form (name, kind: site, client site, or travel; an address with Find, which looks it up so it goes on the map; show on my page). Each place can be changed or removed from its row; these are logged in Edits.
   - Tablet, landscape (801 to 1180 px): the list narrows to 17rem, and the role's History moves under the role, in one column that scrolls.
   - Tablet, portrait, and phone (800 px and under): the list hides while a role is open, and "← Career history" at the top of the role goes back to it. History sits under the role.
   - Phone (560 px and under): a shorter banner, and the name, the glance line, and the place line keep a 16 px gutter. The tabs scroll sideways.

Achievements without a date sit in the year the role started.

## Left to the builder

- Spacing, type sizes, and class names (`role-view-*`, `role-history-*`).
- How the gallery steps through photos.
- The year labels' wording ("So far", "Year 2", "Started in June", "Left in September").
