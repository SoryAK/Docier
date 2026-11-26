# My Tools Duplicate / View / Order / Next Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duplicate tools, view photos full size, reorder photos, and work through drafts in a row.

**Architecture:** Rules in `core/personal-tools.ts` (`duplicateToolName`, `readPhotoOrder`); storage in `server/personal-tools.ts` (`duplicateTool`, `setPhotoOrder`) behind two routes; the panel gains Duplicate, the viewer (`web/src/ToolPhotoViewer.tsx`), order controls, and "Save and next draft".

**Tech Stack:** TypeScript, Hono, node:sqlite, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-my-tools-copy-view-order-design.md`

## Global Constraints

- Copy text exactly: "Duplicate", "Copy the photos too?", "With photos", "Without photos", "<name> (copy)", "View photo N", "Photo N of M", "Previous photo", "Next photo", "Close", "Move photo N left", "Move photo N right", "Save and next draft (N left)".
- Duplicated photo files are new `tool-<uuid>.<ext>` files via `uploadPath`.
- Logic in `core/`; commits as Sory Kaba with Co-Authored-By.

## Review Focus

1. Removing the original after duplicating with photos leaves the copy's photos served — server test.
2. An order list missing, repeating, or foreign ids changes nothing — core + server tests.
3. A name at the 120-character limit still gets " (copy)" within the limit — core test.
4. Escape in the viewer closes only the viewer — web test.
5. "Save and next draft" with a save error stays on this tool — web test.

---

### Task 1: Core rules
- `duplicateToolName(name: string): string` → `${name} (copy)`, cutting the name so the result is ≤ 120 chars.
- `readPhotoOrder(raw: unknown, current: string[]): { ok: true; ids: string[] } | { ok: false; error: "photo-order" }`.
- Tests: plain name; 120-char name → 120 chars ending " (copy)"; order ok; missing, extra, repeated, non-array → error. Commit "Duplicate names and photo order: the rules."

### Task 2: Storage and routes
- `duplicateTool(db, occupantId, uploadsDir, toolId, raw: unknown): PersonalTool` (raw `{ photos?: boolean }`), in a transaction; files copied before commit, removed if it rolls back.
- `setPhotoOrder(db, occupantId, toolId, raw): PersonalTool`; `ToolErrorCode` gains `photo-order`.
- Routes: `POST /api/tools/:id/duplicate` (201), `PUT /api/tools/:id/photos/order`.
- Tests: copy has fields, roles, kits, draft flag, " (copy)"; with photos → new stored names, same framing/cover/order, original removed → copy's photo still served; without photos → none; unknown tool 404; order saves and keeps cover; bad order 400 and unchanged. Commit "Duplicate tools and set photo order."

### Task 3: Duplicate and next draft in the panel
- ToolPanel props gain `nextDraft: { id: string; left: number } | null` and `onOpen(id: string)`. Page computes `nextDraft` from `visible` drafts after the current one (wrapping), `left` = drafts other than this one.
- Tests: duplicate with photos → panel "Drill (copy)" with 1 photo and the grid has both; without photos → 0 photos; "Save and next draft (1 left)" saves (draft false) and opens the next draft; hidden when no other draft; on a failed save stays on this tool. Commit "Duplicate a tool and work through drafts in a row."

### Task 4: Viewer and photo order
- `ToolPhotoViewer({ photos, start, onClose })` dialog (`role="dialog"`, `aria-label="Photo"`), focus kept inside, Escape preventDefault + close, arrows move, returns focus to the opener.
- Panel: each photo's image becomes a button "View photo N"; "Move photo N left/right" buttons (first has no left, last no right); drag with HTML drag events calling the same order request.
- Tests: viewer opens with "Photo 1 of 2", Next → "Photo 2 of 2", ArrowLeft back, Escape closes viewer and the panel stays; Move photo 2 left → server order swapped, cover unchanged; drag photo 2 onto photo 1 (fireEvent dragStart/dragOver/drop) → same. Commit "View tool photos full size and put them in order."
