# My Tools Popout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side panel with the gallery-style popout from the approved mockup.

**Architecture:** `web/src/ToolPanel.tsx` becomes `web/src/ToolGallery.tsx` (same state and requests, new layout in an Astryx `Dialog`). `ToolsPage` renders it for `#/tools/<id>` and `#/tools/new`, passing the visible tools' ids for paging. `ToolPhotoViewer` is replaced by Astryx `Lightbox`.

**Tech Stack:** React, Astryx core components, Vitest + jsdom (dialog methods stood in by the test environment).

**Spec:** `docs/superpowers/specs/2026-11-25-my-tools-gallery-design.md`

## Global Constraints

- Copy: "Edit", "Make larger", "Make smaller", "Close", "Previous tool", "Next tool", "N of M", "Needs details", "Duplicate", "Remove tool", "Add photos", "Show photo N", "Make photo N the cover", "Adjust photo N", "Remove photo N", "View photo N full size", "Move photo N left", "Move photo N right", "New tool", "Add tool", "Save", "Cancel", "Save and next draft (N left)".
- The popout's accessible name is the tool's name ("New tool" when adding).
- localStorage read/write wrapped in try/catch, key `tools.gallery.large`.
- No server or core changes.

## Review Focus

1. Paging while editing with changes saves first; a failed save stays on the tool — web test.
2. ← → while typing in a field moves the caret, not the tool — web test.
3. Escape with the Lightbox or Adjust photo open closes only that — web test.
4. A new tool's picked photos still upload after "Add tool" — existing test, migrated.
5. Closing returns focus to the card — existing test, migrated.

---

### Task 1: The popout replaces the panel

- Test env: `web/src/test/jsdom-node.ts` stands in `show`, `showModal`, `close` on `HTMLDialogElement`.
- `git mv web/src/ToolPanel.tsx web/src/ToolGallery.tsx`; export `ToolGallery` with the panel's props plus `pageIds: string[]` (visible order). Read view / Edit view per spec; new tool opens in Edit. Pagination footer; ← → keys; paging in Edit saves first when changed (draftOf comparison, as Duplicate does). Expand toggle remembered.
- `ToolsPage`: render `ToolGallery` instead of the aside; drop the `has-panel` layout use.
- Tests: migrate every panel test (`complementary` → `dialog`, open Edit where a test changes a tool). New: "opens a tool to read, and edits it after Edit"; "moves between tools with the arrows and keys"; "keys type in a field, not change tools"; "paging while editing saves first"; "a failed save on paging stays"; "remembers the larger size".
- Commit "Open a tool in a popout: read it, edit it, and move between tools."

### Task 2: The photo side

- Hero (whole photo) with Make cover / Cover mark, Adjust, Remove, Full size (Lightbox), Move left/right; thumbnail strip with divider and the add tile at the right; drag to reorder; pending photos for a new tool.
- `ToolPhotoFrame` renders into the open popout dialog when there is one.
- Delete `ToolPhotoViewer.tsx` and its CSS; drop the panel-only CSS.
- Tests: migrate photo tests to the hero buttons and "Show photo N"; Lightbox opens and Escape closes only it; Adjust photo still works inside the popout.
- Commit "Show a tool's photos large, with a strip to pick, add, and order them."

### Task 3: Check and tidy

- Remove the throwaway mockup (`ToolGalleryMockup.tsx` and its two lines in `ToolsPage.tsx`).
- `pnpm -s typecheck && pnpm -s test && pnpm -s build`; browser check at 1440 and 986 with my own test tool; remove it.
