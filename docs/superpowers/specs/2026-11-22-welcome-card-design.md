# Welcome card redesign

Issue: SoryAK/Docier#203 (tour development). Builds on PR #205, which added the welcome card and tour.

## Why

The first welcome card read as a plain box placed over Home. It should feel like a welcome to Docier and set up the tour as the way people learn to bring their work experience in.

## Goals

- Feel welcoming and part of Docier, not a dialog dropped on Home.
- Preview what the tour covers, so "Show me around" has a clear promise.
- Say the tour is short and can be taken later.
- Show a separate version for someone who has not added a job or school yet.
- Start an illustration style that belongs to Docier's branding and can be reused.

Non-goals: changing when the card shows (still once, after onboarding), the checklist, or the tour's look.

Anti-goals:
- A card so tall it needs scrolling on a laptop screen.
- A banner that copies Home's layout and has to be redrawn whenever Home changes.

## Approaches considered

- **A · Arrival:** a centred card with a glowing logo, a welcome line, three preview tiles and one main button.
- **B · Your story so far:** a split card with a gold panel celebrating the saved count and three numbered steps.
- **C · A peek at the tour:** a sketch of Home with numbered pins for the tour's stops.

Picked: A's styling at C's width (36rem). C's Home sketch was tried as the banner and dropped, because it would have to follow every change to Home. A path, a watermark and a timeline banner were also tried and rejected. The banner is now an illustrated desk scene (below).

## The design (as decided)

**Banner: a desk scene.** A cream band, 176px tall, with work things scattered around a clear centre:
- top left, a laptop, tilted;
- bottom left, a briefcase, with a crossed wrench and screwdriver beside it;
- under the name, a pair of closed folders (manila on navy);
- top right, a certificate with a gold seal;
- right edge, an ID badge slung from the top on a short lanyard, ending about halfway down;
- bottom right of centre, an open folder with resume pages;
- bottom right corner, a to-go coffee cup with a lid, a cardboard sleeve and steam. It is plain, with no logo.

A soft cream clearing sits behind the logo and name so they stay the focus. The band's bottom fades into the card's white.

**Logo and name.** Centred in the banner. The name is navy (#0d345e, the folder in the logo) with a thin gold underline in the logo's gradient (#f3d59c to #cd9f5b). It is centred on the logo's height, with capitals at about 60% of the logo's height. Weight is medium (500), tracking −0.03em, logo 42px.

**Motion.** When the card opens, the items rise into place one after another, the resume pages slide out of the open folder, and the badge swings and settles. Steam curls up from the cup on a slow loop. The three tiles then light up in turn. With reduced motion, the finished scene shows, the steam is still and faint, and nothing else moves.

**Text.** "Welcome, *{first name}*." with the name in gold, as in onboarding's headings. With no first name saved, it reads "Welcome."

**Has jobs or schools:**
- Line: "Everything you've done, in one place you control."
- Tiles: 1 Add your history, 2 Build your network, 3 Share it.

**Nothing added yet:**
- Line: "Let's build your career here, one job at a time."
- Tiles: 1 Add your first job, 2 Build your history, 3 Build your network.

The tiles are numbered in the tour's order and are a preview only: clicking one does nothing.

**Buttons.** One row, side by side, never stacked:
- Left: "I'll explore on my own" closes the card. Escape does the same.
- Right: "Show me around · 1 min" starts the tour.
- A centred line underneath, in the same grey as the line under the heading: "You can take the tour anytime from your menu."

The saved count line ("Saved: 10 jobs · 1 school") is removed.

**Top bar.** Home's top bar shows "Docier" the same way as the card: navy, with the gold underline.

**Tour change.** The My Network stop replaces Search in both tours, so the tour matches the tiles:
- Full tour: overview → Career History and the map → My Network → Publish.
- Short tour: Start your story → Career History → My Network (still ending on "Add your first job").

**Choosing the version.** The card waits until Home has loaded the career before it opens, so it never shows the wrong version first. "Nothing added yet" shows when there are no jobs and no schools, the same signal the tour uses for its short version.

## Branding: the illustration style

The desk scene becomes part of Docier's branding.

> **Update, 2026-11-23:** the style rules below were replaced. A painted banner (`docs/assets/banner-source.jpg`) now sets the style: soft shading and real materials instead of flat shapes, and tools from more trades (a multimeter, a hammer, hex keys, a stethoscope, a medical cross). The current rules are in `web/src/branding/README.md`. The welcome card now shows that painted scene (`web/src/branding/docier-banner.webp`) with the real mark and name on top, and no longer uses `docier-desk.svg`, so its motion is gone.

- **One source.** The scene lives in `web/src/branding/docier-desk.svg`. The welcome card loads that file, so there is one copy. Each item is its own labelled group, so later screens can reuse single items (for example, the open folder on an empty page).
- **Style rules,** written into `web/src/branding/README.md`:
  - Colours: manila gold (#f3d59c → #cd9f5b), navy (#0d345e, #244f7e), steel (#d3dae1 → #97a4b2), warm paper (#fff, #f8f4ec) with soft beige edges (#e3d8c8). Nothing else.
  - Shapes: flat and rounded, with soft beige edges, never dark outlines. Text is drawn as bars, never real words.
  - Composition: items slightly tilted and scattered, with clear space kept around the focus.
  - No other company's logos or marks, and no real people.
  - Motion is gentle, plays once (except a small ambient touch such as steam), and is off with reduced motion.

## Calls made by the builder (check these)

- **Resources group:** My Network sits inside the sidebar's Resources group, which can be collapsed. The tour opens Resources for the My Network stop and closes it again afterwards if it was closed.
- **Phone width:** the tiles stack into one column. The sidebar stops (Career History, My Network) point at the menu button instead, so the phone tour still covers every tile.
- **Accessibility:** the scene is hidden from screen readers. They hear the heading, the tiles and the two buttons.
- **Testing:** the real first visit (card once, both buttons and Escape mark it seen, finishing the tour marks it done) is tested against a copy of the database, not the occupant's real profile.
- **Prototype:** `web/prototypes/welcome-card/index.html` is the reference for spacing and motion. It is not shipped.

## Where it lands

- `core/first-run.ts`: tour steps (Search → My Network) and the card's text and tiles for each version.
- `web/src/branding/docier-desk.svg` and `web/src/branding/README.md`: the scene and the style rules.
- `web/src/WelcomeTour.tsx` and `welcome-tour.css`: the new card, the wait for Home, and the phone fallbacks.
- `web/src/HomeNav.tsx`: a `network` tour anchor on My Network, and a way for the tour to open Resources.
- `web/src/HomeBar.tsx` and `home.css`: the name in navy with the gold underline.
- Tests in `core/first-run.test.ts` for the steps and both card versions.
