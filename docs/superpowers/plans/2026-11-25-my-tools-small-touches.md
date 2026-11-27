# My Tools Small Touches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quick whose/condition menus on cards, search highlight, and `/` and `n` shortcuts on My Tools.

**Architecture:** `matchParts` in `core/personal-tools.ts`; the page reuses `POST /api/tools/bulk` for one-tool changes; shortcuts are one document listener in `ToolsPage`.

**Tech Stack:** TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-my-tools-small-touches-design.md`

## Global Constraints

- Copy: "Condition?" (unset), "Couldn't save. Try again.", tooltip "Add a tool (N)".
- Shortcuts never fire while typing in an input/textarea/select/contenteditable, with Ctrl/Cmd/Alt, or while a `[role=dialog]` is open.
- Card menus never inside the card's open button; hidden while choosing.

## Review Focus

1. A query with regex characters ("1/2\" (13mm)") must highlight literally, never throw — core test "treats the query as plain text".
2. A draft changed from the card keeps "Needs details" — web test "changes whose it is from the card and keeps the draft mark".
3. `n` typed into the search box types an n, not a new tool — web test "shortcuts don't fire while typing".
4. A failed card change shows the saved value again — web test "a failed card change goes back".
5. Overlapping or repeated matches ("aa" in "aaaa") mark each non-overlapping match once — core test.

---

### Task 1: matchParts in core

**Files:** Modify `core/personal-tools.ts`; Test `core/personal-tools.test.ts`.

**Produces:** `export function matchParts(text: string, query: string): Array<{ text: string; match: boolean }>` — query trimmed; empty query → `[{ text, match: false }]` (or `[]` for empty text); case-insensitive, literal, non-overlapping, left to right; parts joined equal `text`.

- [ ] Tests: `matchParts("Fluke 87V", "flu")` → `[{text:"Flu",match:true},{text:"ke 87V",match:false}]`; `"aaaa","aa"` → two matches; `"1/2\" (13mm) bit", "(13mm)"` → middle part matched; `"Drill", "  "` → one unmatched part; `"Drill","saw"` → one unmatched part.
- [ ] Run `npx vitest run core/personal-tools.test.ts` → FAIL; implement; → PASS; commit "Find the matching parts of a tool's text."

### Task 2: The page

**Files:** Modify `web/src/ToolsPage.tsx`, `web/src/tools.css`; Test `web/src/ToolsPage.test.tsx`.

**Consumes:** `matchParts`; `POST /api/tools/bulk` → `{ tools }`.

- Card: the existing `<li>` holds the open button and, when not choosing, a `.tools-card-quick` row with `<select aria-label="Whose <name> is">` (TOOL_OWNERSHIPS) and `<select aria-label="Condition of <name>">` (first option value "" label "Condition?" when unset, else "Not set"). The ownership tag inside the button goes (the menu replaces it); the category tag stays.
- Highlight: name, maker·model line, and tags render through a `Highlight` helper using `<mark>`.
- Shortcuts per Global Constraints; `/` focuses the search input (preventDefault), `n` does what "Add a tool" does.

- [ ] Tests (useRealApp): "changes whose it is from the card and keeps the draft mark" (draft from photos; select Borrowed; server tool ownership borrowed, draft true); "changes condition from the card"; "a failed card change goes back" (failWhen bulk → select shows "mine" again, card shows "Couldn't save. Try again."); "hides the card menus while choosing"; "marks what matches the search" (search "flu" → `mark` text "Flu" in the Fluke card; tag match marked); "slash goes to search and n opens a new tool"; "shortcuts don't fire while typing" (typing "n" in search leaves hash `#/tools`, value "n").
- [ ] Run `npx vitest run web/src/ToolsPage.test.tsx` → FAIL; implement; → PASS; `pnpm -s typecheck && pnpm -s test && pnpm -s build` → pass.
- [ ] Browser check 1440 and 986 on my own test tool; remove it. Commit "Change whose a tool is and its condition from its card, mark search matches, and add / and n shortcuts."
