# Docier branding

The Docier D mark, and the illustrations drawn to go with it.

| File | What it is | Used by |
|---|---|---|
| `docier-mark.svg` | The D with a manila gradient, on a clear background. | The top bar, beside the name (`HomeBar.tsx`). |
| `docier-mark-icon.svg` | The D in solid gold on a navy rounded square. | The browser tab icon (`web/index.html`). |
| `docier-mark-small.svg` | The D in a single solid gold, on a clear background, for small sizes where a gradient blurs. | Not used yet. |
| `docier-desk.svg` | A desk scene: laptop, briefcase, tools, folders, certificate, ID badge, a to-go coffee, and cables hanging from the top, around a clear middle. It animates on its own. | The welcome card's banner (`WelcomeTour.tsx`). |

Keep new marks and illustrations here, and add a row to this table when one is added or put to use. The desktop app's icons live in `web/src-tauri/icons/`.

## The name

Beside the mark, "Docier" is navy `#0d345e` (the folder in the D), weight 500, tracking −0.03em, with a thin gold underline in the mark's gradient (`#f3d59c` to `#cd9f5b`). Centre the name on the mark's height, with capitals at about 60% of it.

## Illustration style

Draw new illustrations the way `docier-desk.svg` is drawn, so they belong together.

- **Colours, and nothing else:**
  - manila gold, `#f3d59c` → `#e2b672` → `#cd9f5b`;
  - navy, `#0d345e` and `#244f7e`;
  - steel, `#d3dae1` → `#97a4b2`;
  - warm paper, `#fff` and `#f8f4ec`, with soft beige edges `#e3d8c8`;
  - the cream band behind a scene, `#fbf6ee` → `#f4ecdf`.
- **Shapes:** flat and rounded, with soft beige edges, never dark outlines. Text is drawn as bars, never real words.
- **Things:** work things. Folders and papers first, then tools of any trade, such as a laptop, a wrench, a badge, a certificate, or a coffee.
- **Composition:** items slightly tilted and scattered, with clear space kept around whatever is the focus.
- **Never:** another company's logo or mark, real people, or real names.
- **Motion:** gentle and once, such as items rising into place. A small ambient touch, such as steam, may loop. Everything stops when reduced motion is on.
- **In the file:** prefix every id and class with the file's own prefix (`dd-` for the desk), so it can be placed inline in a page. Make each item its own group with an id, so it can be reused alone.
