# My Tools: small touches

Builds on the My Tools designs (phases 1–3). Three small things the earlier
inventory had, so everyday use takes fewer clicks.

## Quick change on the card

- Each card shows whose the tool is ("Mine", "Borrowed"…) and its condition
  ("Condition?" when not set). Both are small menus styled like the card's tags,
  in a row under the card's open area — never inside the open button — and save
  on choice.
- Saving uses `POST /api/tools/bulk` with one id, so only that field changes and
  a draft keeps "Needs details". A failure shows "Couldn't save. Try again." on
  that card and the menu goes back to the saved value.
- While choosing, the menus are hidden; cards only pick.

## Search highlight

- While searching, the text that matches is marked in the card's name, maker and
  model, and tags, ignoring case. These are the fields search already matches.
- The rule that finds the matching parts lives in `core/` next to the search
  rule: `matchParts(text, query)`.

## Keyboard shortcuts

- `/` moves to the search box; `n` opens a new tool.
- Never while typing in a field, with Ctrl, Cmd, or Alt held, or while a dialog
  (Adjust photo) is open. The app's only other shortcut is Ctrl/Cmd+K.
- Shown as a small `/` in the search box and "Add a tool (N)" as the button's
  tooltip.

## Approaches

- Card menus saving through the bulk route (chosen) versus the full tool save
  (`PUT /api/tools/:id`): the full save needs every field and clears a draft's
  mark, which a one-field change shouldn't do.
- Highlight computed in `core/` (chosen) versus in the page: it follows the
  search rule, which already lives in `core/`.

## Left to the builder

Exact styling of the menus and the `/` hint.
