# Release checklist

Run through this before every release. The merge gate ([ci.md](ci.md)) checks each pull request; this list covers what only makes sense across a whole release.

## 1. Merge gate on `main`

`pnpm test`, `pnpm typecheck`, and `pnpm build` pass on the commit being released.

## 2. Review the tour and the welcome card (required)

The tour points at parts of Home, and the welcome card promises what the tour covers. Features added or changed since the last release can leave either one out of date, so review both every time, even when no one touched them.

Run the app in development and walk:

- `#welcome`, then **Show me around**, through every stop;
- `#welcome?empty`, then the short tour to **Add your first job**;
- at desktop width, with the sidebar collapsed and the Resources group closed;
- at phone width.

For each stop, check:

- the outline lands on the right part of Home, and nothing is missing or highlighted by mistake;
- the title and text still describe what is there, and promise nothing that is no longer true;
- every part of Home people need to know about has a stop, and every stop still earns its place.

For the card, check that its three tiles still match the tour's stops, in the same order.

Where things live:

- the stops, their text, and the card's tiles: `core/first-run.ts`;
- the anchors the stops point at: `data-tour="…"` on Home's elements (`HomeCenter.tsx`, `HomeNav.tsx`, `HomeBar.tsx`);
- the card and the tour: `web/src/WelcomeTour.tsx`.

If anything changes, update it before the release, and add a note to the tour issue (SoryAK/Docier#203). Record the review in the release notes either way: "Tour reviewed: no changes" or what changed.
