# My Tools: duplicate, full-size photos, photo order, next draft

Builds on the My Tools designs. Four things that save typing and clicks.

## Duplicate a tool

- "Duplicate" in a tool's panel, beside Remove tool. It asks "Copy the photos
  too?" with "With photos" and "Without photos".
- The copy is named "<name> (copy)" and has every field, its roles, and its kits.
  With photos, each photo is a new file (so removing one tool never removes the
  other's photos) with the same framing, order, and cover. A copy of a draft is
  a draft. The copy opens in the panel.
- `POST /api/tools/:id/duplicate` with `{ photos: boolean }` → 201 `{ tool }`.

## Full-size photo view

- Clicking a photo in the panel ("View photo N") opens it whole, as taken,
  over the page. With several photos: Previous / Next buttons, the arrow keys,
  and "Photo 2 of 5". Escape or Close closes the view only; focus stays inside
  while it's open and returns to the photo after.

## Photo order

- Drag a photo onto another place in the panel's photo row, or use its "Move
  photo N left" / "Move photo N right" buttons. Saved at once; the cover stays
  the cover.
- `PUT /api/tools/:id/photos/order` with `{ photoIds }`, every photo of that tool
  exactly once; anything else is refused (`photo-order`) and nothing changes.

## Next draft

- While a draft is open and other drafts wait, the panel shows "Save and next
  draft (N left)" beside Save. It saves, then opens the next draft after this
  one in the grid's order (wrapping to the first).

## Approaches

- Duplicate on the server (chosen) vs. the page re-posting fields and
  re-uploading photos: the server copies files directly and keeps it one step.
- Order as the full id list (chosen) vs. "move one by n": a full list is easy to
  check and makes drag and the buttons the same call.
