# Release checklist

Run through this before every release. The merge gate ([ci.md](ci.md)) checks each pull request; this list covers what only makes sense across a whole release.

## 1. Merge gate on `main`

`pnpm test`, `pnpm typecheck`, and `pnpm build` pass on the commit being released.

## 2. Review the tour and the welcome card (required)

The tour points at parts of Home, and the welcome card promises what the tour covers. Features added or changed since the last release can leave either one out of date, so review both every time, even when no one touched them.

Run the app in development and walk:

- `#welcome`, then **Show me around**, through every stop, with a career that has jobs saved (the first stop points at Home's overview, which an empty career doesn't have);
- `#welcome?empty`, then the short tour to **Add your first job**, with an empty career (Home shows the saved career whatever the preview says). Start the app on a new database for this, such as `DATABASE_PATH=data/tour-review.sqlite pnpm dev`, and delete the file afterwards;
- at desktop width, with the sidebar open and with it closed (the network and history stops then point at the menu button);
- at phone width.

For each stop, check:

- the outline lands on the right part of Home, and nothing is missing or highlighted by mistake;
- the title and text still describe what is there, and promise nothing that is no longer true;
- every part of Home people need to know about has a stop, and every stop still earns its place.

For the card, check that its three tiles still match the tour's stops, in the same order.

`core/tour-anchors.test.ts` runs in the merge gate and fails when a stop points at something no longer on Home, when Home carries a `data-tour` name no stop uses, or when the card's tiles stop matching the stops. It catches broken wiring, not stale words, so the walk above is still required.

Where things live:

- the stops, their text, and the card's tiles: `core/first-run.ts`;
- the anchors the stops point at: `data-tour="…"` on Home's elements (`HomeCenter.tsx`, `HomeNav.tsx`, `HomeBar.tsx`);
- the card and the tour: `web/src/WelcomeTour.tsx`.

If anything changes, update it before the release, and add a note to the tour issue (SoryAK/Docier#203). Record the review in the release notes either way: "Tour reviewed: no changes" or what changed.
