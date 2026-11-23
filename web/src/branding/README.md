# Docier branding

The Docier D mark, and the illustrations drawn to go with it.

| File | What it is | Used by |
|---|---|---|
| `docier-mark.svg` | The D with a manila gradient, on a clear background. | The top bar, beside the name (`HomeBar.tsx`). |
| `docier-mark-icon.svg` | The D in solid gold on a navy rounded square. | The browser tab icon (`web/index.html`), and the desktop app's icons in `web/src-tauri/icons/`, rendered from it at 512, 128, and 32px. |
| `docier-mark-small.svg` | The D in a single solid gold, on a clear background, for small sizes where a gradient blurs. | Not used yet. |
| `docier-banner.webp` | The painted desk scene with a clear middle and no mark or name, 1152×352, scaled down from `docs/assets/banner-source.jpg`. The card puts the real mark and name on top. | The welcome card's banner (`WelcomeTour.tsx`). |
| `docier-desk.svg` | A desk scene: laptop, briefcase, tools, folders, certificate, ID badge, a to-go coffee, and cables hanging from the top, around a clear middle. It animates on its own. | Not used since the painted banner replaced it; kept for its separate items. |

GitHub uses the same painted scene, kept in `docs/assets/`:

- `banner-source.jpg` (1832×560): the painted scene with a clear middle and no mark or name, the source the others are made from;
- `banner.png` (1280×392): the top of the README, the source with the real mark and name set in its middle, scaled down;
- `social-preview.png` (1280×640): the same, scaled to 640 tall and cropped to its middle, so the mark, name, cables, tools, folders, and certificate stay in. It is uploaded by hand in the repository's Settings → General → Social preview.

The mark and name are never painted into the scene: they are set on top from `docier-mark.svg` and the Geist font, following "The name" below, so they always match the real ones. At 1832 wide the mark is 134px and the name 110px. When the scene changes, replace the source and make the other files from it again.

Keep new marks and illustrations here, and add a row to this table when one is added or put to use. The desktop app's icons live in `web/src-tauri/icons/`.

## The name

Beside the mark, "Docier" is navy `#0d345e` (the folder in the D), weight 500, tracking −0.03em, with a thin gold underline in the mark's gradient (`#f3d59c` to `#cd9f5b`). Centre the name on the mark's height, with capitals at about 60% of it.

## Illustration style

The painted scene (`docs/assets/banner-source.jpg`) sets the style. Draw new illustrations to match it, so they belong together.

- **Colours:** the same few, with lighter and darker shades of each for light and shadow:
  - manila gold, `#f3d59c` → `#e2b672` → `#cd9f5b`, which also covers tan leather, kraft paper, and wooden handles;
  - navy, `#0d345e` and `#244f7e`;
  - steel, `#d3dae1` → `#97a4b2`;
  - warm paper, `#fff` and `#f8f4ec`, with soft beige edges `#e3d8c8`;
  - the cream background, about `#f8f2e6`, lighter behind the name.
- **Look:** soft and lightly painted, with gentle shading, soft shadows, and real materials: leather, brushed steel, wood, paper, plastic. Never dark outlines.
- **Text:** papers and screens show their writing as bars. Small details on a tool may show digits or key caps, such as a meter's reading or a keyboard, but never real words, names, or logos.
- **Things:** work from many trades, so anyone can see their own work in it. Folders and papers first, then the tools of a trade:
  - office: a laptop, a briefcase, folders, a resume, a certificate with a seal, an ID badge on a lanyard;
  - building and repair: a hammer, a wrench, a screwdriver, pliers, hex keys;
  - electrical and tech: a multimeter with its leads, cables hanging from the top edge with their plugs;
  - care: a stethoscope and a medical cross;
  - a to-go coffee with a sleeve and a little steam.
- **Composition:** items around the edges, slightly tilted and partly cut off by the frame, with a clear middle for the focus. In the banner the focus is the real mark and name, set on top of the scene.
- **Never:** another company's logo or mark, real people, or real names.
- **Motion,** for illustrations drawn for the app: gentle and once, such as items rising into place. A small ambient touch, such as steam, may loop. Everything stops when reduced motion is on.
- **In an SVG file:** prefix every id and class with the file's own prefix (`dd-` for the desk), so it can be placed inline in a page. Make each item its own group with an id, so it can be reused alone.

`docier-desk.svg` was drawn before this style: it is flat, and has no multimeter, hammer, hex keys, stethoscope, or cross. Bring it in line before reusing its items.
