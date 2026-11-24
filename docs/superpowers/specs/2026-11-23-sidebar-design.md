# Sidebar: everyday navigation

## Why

The sidebar on Home is how people get around Docier every day. Today the pages they use are split between three top rows and a Resources group that starts closed, the middle of the panel is empty, and four of the five Customizations do nothing when clicked. My Network, which the welcome card and the tour send people to, sits inside the closed group.

## Goals

- Every everyday page one click away, with nothing to open first.
- A clear split between your career and the tools that work with it.
- No dead ends: nothing in the panel that does nothing when clicked.
- One look: one icon set at one size, one heading style.

Non-goals: Career History's own panel (the list that replaces the sidebar on that page) is unchanged. The top bar is unchanged.

Anti-goals: headings or groups that fold, so a page can be hidden by accident.

## Approaches

- **A · One flat list with a divider.** Quickest to scan; no words to tell the two kinds of page apart.
- **B · Two headed sections, always open.** Headings name the split; costs a little height. **Picked.**
- **C · Keep Resources, open by default and remembered.** Smallest change; keeps a fold and leaves My Network one level down.

Prototype: `web/prototypes/sidebar/index.html` (kept on the developer's machine).

## The design (as decided)

```
YOUR CAREER
  Home
  Career History
  My Network
TOOLS
  Opportunities
  Resume Studio
  My Docs
  Gallery
        (space)
─────────────
  Canvas
```

- **Your career:** Home, Career History, My Network.
- **Tools:** Opportunities, Resume Studio, My Docs, Gallery. Gallery keeps its current behaviour (its covers open under it).
- **Headings** are always open and do not fold. They use the current Resources heading style: small, grey, capitals.
- **Canvas** is a single row at the bottom, above a thin line, and toggles the canvas as it does now.
- **Customizations are hidden:** Overview, Plugins, Extensions, and Tools are not shown. Their entries stay in the code, so each can come back when it is built.
- **Icons:** the app's own 20px line icons for every row, Canvas included. Opportunities gets its own mark, a compass, so it no longer looks like search.
- **Icons only** (the narrow sidebar): the same rows in the same order; the headings become a thin divider.
- **Phone:** the same list in the sliding menu.

## The tour

My Network is no longer inside a closed group, so the tour no longer needs to open Resources to reach it. The network stop drops its `reveal: "resources"`, the `resources` anchor and the code that opens the group for the tour go, and `core/tour-anchors.test.ts` keeps the tour and the panel in step. The release review walk (`docs/release.md`) covers the rest.

## Left to the builder

- The compass's exact drawing, in the same stroke style as the other icons.
- Spacing between the sections, kept close to today's.
- Names for any new classes, following `home-nav-*`.
