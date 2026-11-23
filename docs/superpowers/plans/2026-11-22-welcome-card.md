# Welcome Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain welcome card with the desk-scene card, swap the tour's Search stop for My Network, and make the desk scene part of the branding.

**Architecture:** Card copy, tiles and tour anchor choice live in `core/first-run.ts` (pure, tested). The desk scene is one SVG file in `web/src/branding/`, inlined by the card through Vite's `?raw` import so its own `<style>` drives the motion. `WelcomeTour.tsx` renders the card and the tour; HomeNav and HomeBar gain tour anchors and a reveal hook.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, lucide-react. pnpm.

**Spec:** `docs/superpowers/specs/2026-11-22-welcome-card-design.md`

## Global Constraints

- Logic in `core/`, not in React screens (AGENTS.md).
- Name: navy `#0d345e`, gold underline `#f3d59c → #cd9f5b`, weight 500, tracking −0.03em.
- Card width `min(36rem, 100vw − 2rem)`; banner 176px.
- Copy, verbatim: "Welcome, {first name}." / "Welcome."; "Everything you've done, in one place you control."; "Let's build your career here, one job at a time."; "I'll explore on my own"; "Show me around · 1 min"; "You can take the tour anytime from your menu."
- Tiles (has career): Add your history / Jobs, schools, and proof of your work · Build your network / People you've worked with and trust · Share it / Publish a page when you're ready.
- Tiles (empty): Add your first job / Start with the role you have now · Build your history / Every job and school in one place · Build your network / Add the people you've worked with.
- SVG ids and classes in the scene are prefixed `dd-` so the inlined file can't collide with the page.
- Reduced motion: no movement; steam still and faint.
- Never name another product or company in code, copy or docs.

## Review Focus

- Career still loading when Home first renders (App starts with an empty career): the card must not open until the career has loaded, or it shows "Nothing added yet" to someone with jobs. Test: `WelcomeTour` gets `ready`; App sets it after `/api/history` answers (success or error).
- Resources group collapsed: the My Network stop must still appear and point at the row. Test in core: `pickAnchors` keeps a `reveal` step when the reveal host is on screen.
- Phone width (sidebar hidden): the Career History and My Network stops fall back to the menu button. Test in core: `pickAnchors` returns the fallback when no anchor or reveal host is on screen.
- No first name: heading reads "Welcome." Test in core: `welcomeHeading("")`.
- Preview routes (`#welcome?empty`) must show the empty card and save nothing. Covered by the existing preview guard; check in the browser.

---

### Task 1: Core: card content, tour steps, anchor choice

**Files:**
- Modify: `core/first-run.ts`, `core/first-run.test.ts`, `core/index.ts` (exports)

**Interfaces:**
- Produces:
  - `TourAnchor` gains `"network" | "resources" | "menu"`.
  - `TourStep` gains `reveal?: "resources"` and `fallback?: TourAnchor[]`.
  - `pickAnchors(step: TourStep, onScreen: ReadonlySet<TourAnchor>): TourAnchor[] | null`: the step's anchors that are on screen; else, if `reveal` is set and `"resources"` is on screen, the step's anchors (they appear once revealed); else the fallback anchors on screen; else `null`.
  - `WelcomeTile = { icon: "history" | "network" | "share" | "add"; title: string; body: string }`.
  - `welcomeCard(input: { empty: boolean }): { lede: string; tiles: WelcomeTile[] }`.
  - `welcomeHeading(firstName: string): { lead: string; name: string | null }`: `{ lead: "Welcome", name: "Sory" }` or `{ lead: "Welcome", name: null }`.
  - Removed: `welcomeSavedLine`.

- [ ] **Step 1: Tests.** In `first-run.test.ts`: full tour ids `["overview","history","network","share"]`; short tour ids `["start","history","network"]`, last `finish: "add-job"`; the network step has `anchors: ["network"]`, `reveal: "resources"`, `fallback: ["menu"]`; history step `fallback: ["menu"]`. `pickAnchors` cases: anchors on screen → those; only `"resources"` on screen with a reveal step → `["network"]`; only `"menu"` → `["menu"]`; nothing → `null`. `welcomeCard` returns the exact copy above for both versions. `welcomeHeading("  Sory ")` → name `"Sory"`; `welcomeHeading("")` → name `null`. Drop the `welcomeSavedLine` test.
- [ ] **Step 2:** `pnpm vitest run core/first-run.test.ts` fails.
- [ ] **Step 3:** Implement. Network step copy: title "Build your network", body "My Network keeps the people you've worked with and your conversations with them. Add someone to start." Short-tour network step keeps `finish: "add-job"`.
- [ ] **Step 4:** Tests pass.

### Task 2: Branding: the desk scene and the style rules

**Files:**
- Create: `web/src/branding/docier-desk.svg` (from the prototype's scene; ids `dd-manila`, `dd-manila-front`, `dd-steel`, `dd-focus`; classes `dd-item dd-i1…dd-i8`, `dd-papers`, `dd-badge`, `dd-steam`; its own `<style>` with the rise, papers, swing and steam animations and the reduced-motion rule; each item a `<g>` with an `id` such as `dd-laptop`, `dd-briefcase`, `dd-tools`, `dd-folders`, `dd-certificate`, `dd-open-folder`, `dd-badge`, `dd-coffee`).
- Modify: `web/src/branding/README.md` (table row for the file; "Illustration style" section with the rules from the spec).

- [ ] **Step 1:** Write the file; open it directly in the browser to see it animate on its own.

### Task 3: The card

**Files:**
- Modify: `web/src/WelcomeTour.tsx`, `web/src/welcome-tour.css`, `web/src/App.tsx`, `web/src/Home.tsx`

**Interfaces:**
- Consumes: Task 1's `welcomeCard`, `welcomeHeading`; Task 2's SVG via `import desk from "./branding/docier-desk.svg?raw"`.
- Produces: `WelcomeTour` prop `ready: boolean` (card and auto-welcome wait for it); `Home` prop `careerReady: boolean`; App state `careerReady`, false until the first `/api/history` answer, reset to false before the post-onboarding reload.

- [ ] **Step 1:** App: `careerReady` state, set true in `loadCareer`'s success and error paths; reset before the reload in `onFinished`. Pass to Home, Home to WelcomeTour.
- [ ] **Step 2:** WelcomeTour: the welcome phase renders only when `ready` (previews too). Empty version = preview's `empty` when previewing, else `counts.jobs + counts.schools === 0`.
- [ ] **Step 3:** WelcomeCard: native `<dialog>` with `showModal()`; banner = scene inlined (`aria-hidden`), brand (mark + "Docier") centred over it; heading, lede, three tiles (lucide `History`, `Users`, `Share`, `Plus`), actions row, hint line. Tiles light in turn with CSS delays (1.4s, 2.3s, 3.2s). Escape = explore.
- [ ] **Step 4:** CSS from the prototype, rewritten under `.welcome-card` (old card rules removed).
- [ ] **Step 5:** `pnpm typecheck` passes; `#welcome` and `#welcome?empty` look like the prototype.

### Task 4: Tour: My Network stop, Resources reveal, phone fallback, top bar name

**Files:**
- Modify: `web/src/WelcomeTour.tsx` (Tour), `web/src/HomeNav.tsx`, `web/src/HomeBar.tsx`, `web/src/home.css`

**Interfaces:**
- Consumes: Task 1's `pickAnchors`, `reveal`, `fallback`.
- Produces: window event `"docier:tour-reveal"` with `detail: { target: "resources"; open: boolean }`; anchors `data-tour="network"` (both My Network rows), `data-tour="resources"` (Resources toggle), `data-tour="menu"` (menu button).

- [ ] **Step 1:** HomeNav: anchors; listen for the event, open Resources on `open: true` and restore the earlier state on `open: false`.
- [ ] **Step 2:** Tour: steps kept when `pickAnchors` returns anchors; per step, dispatch reveal open/close around it and measure the chosen anchors after the reveal renders.
- [ ] **Step 3:** HomeBar: `data-tour="menu"` on the menu button. home.css: `.home-bar-brand` navy, weight 500, tracking −0.03em, gold underline.
- [ ] **Step 4:** Browser: `#tour` with Resources collapsed shows 4 stops and opens then closes Resources; phone width points the stops at the menu button.

### Task 5: Verify, commit, push

- [ ] **Step 1:** `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- [ ] **Step 2:** Real first visit against a copy of the database (a second server on a temp data dir): card shows once; "I'll explore on my own", Escape and "Show me around" each set `welcomeSeenAt`; finishing the tour sets `tourCompletedAt`.
- [ ] **Step 3:** Commit (spec, plan, code), push `feat/welcome-tour`, update PR #205's description.
