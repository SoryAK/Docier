# My Tools Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kits, totals with a CSV export, and photo framing (rotate, flip, zoom, focal point) on My Tools.

**Architecture:** Rules in `core/personal-tools.ts`; kits in two new tables and `/api/tools/kits` routes; framing as columns on `personal_tool_photos`, applied with CSS when a photo shows. Totals and CSV are computed in the browser from loaded tools.

**Tech Stack:** TypeScript, node:sqlite, Hono, React, vitest (core/server projects and the `web` jsdom project).

**Spec:** `docs/superpowers/specs/2026-11-25-my-tools-phase-2-design.md` (and the phase 1 spec it builds on).

## Global Constraints

- Everything stays on the occupant's computer; nothing is published.
- Kit names: trimmed, 1–60 characters, unique per occupant ignoring case.
- Deleting a kit keeps its tools; removing a tool takes it out of its kits.
- CSV file name `my-tools.csv`; columns in the spec's order; cells starting `=`, `+`, `-`, `@` get a leading `'`.
- Framing: rotation 0/90/180/270, flipH, flipV, zoom 1–3, focusX/focusY 0–100; the photo file never changes.
- Backups carry kits, kit items, and framing.
- Same commit identity and trailer as phase 1. Web tests use `useRealApp()` and `stubBrowser()`.

## Review Focus

1. A kit renamed to another kit's name in different case is refused (`kit-name-taken`), and renaming a kit to its own name in new case is allowed. (Task 2 test `renames a kit, and refuses another kit's name`.)
2. A tool saved with a kit that was deleted meanwhile is refused (`kit-missing`), not saved half-linked. (Task 1 test `refuses a kit that isn't there`.)
3. A CSV cell with a comma, a quote, and a line break comes out as one cell; a cell starting `=` is defused. (Task 1 test `writes a CSV a spreadsheet reads safely`.)
4. Totals with no prices show no money parts, and mix of priced/unpriced tools sums only the priced. (Task 1 test `adds up what's shown`.)
5. A framing with rotation 45 or zoom 9 is refused and the photo keeps its framing. (Task 2 test `refuses a bad framing`.)

---

### Task 1: Rules in core

**Files:** Modify `core/personal-tools.ts`; Test `core/personal-tools.test.ts`.

**Produces:**
- `type ToolKit = { id: string; name: string; createdAt: string }`
- `PersonalTool.kitIds: string[]`; `ToolInput` gains `kitIds`.
- `readToolInput(raw, roleIds, kitIds: ReadonlySet<string> = new Set())`; new error `"kit-missing"`.
- `readKitName(raw: unknown, kits: ToolKit[], selfId?: string): { ok: true; name: string } | { ok: false; error: "kit-name-required" | "kit-name-taken" }`
- `toolTotals(tools: PersonalTool[]): { count: number; paid: number | null; worth: number | null; withPhotos: number }` (null when no tool has that value)
- `toolsCsv(tools: PersonalTool[], names: { role: (id: string) => string | undefined; kit: (id: string) => string | undefined }): string` (header row first, `\r\n` lines)
- `type PhotoFraming = { rotation: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean; zoom: number; focusX: number; focusY: number }`; `DEFAULT_FRAMING`
- `readPhotoFraming(raw: unknown): { ok: true; value: PhotoFraming } | { ok: false; error: "framing-invalid" }`
- `framingStyle(f: PhotoFraming): { objectPosition: string; transform: string | undefined }` (`transform` undefined for the default)
- `ToolPhoto.framing: PhotoFraming`

- [ ] Tests: `refuses a kit that isn't there`; `names a kit` (trim, 60 max, required, taken ignoring case, own name allowed); `adds up what's shown`; `writes a CSV a spreadsheet reads safely` (quoting, defusing, roles and kits by name, header row); `reads a framing` (good values; 45° / zoom 9 / focus 120 refused); `turns a framing into CSS` (default → `50% 50%` and no transform; 90° + flipH + zoom 2 → `rotate(90deg) scaleX(-1) scale(2)` in that order).
- [ ] Run, watch fail; implement; run, pass; commit "Kits, totals, a safe CSV, and photo framing: the rules."

### Task 2: Storage and routes

**Files:** Modify `server/db.ts` (tables `tool_kits (id, occupant_id, name, created_at)`, `tool_kit_items (id, occupant_id, kit_id, tool_id, created_at, UNIQUE (occupant_id, kit_id, tool_id))`; columns on `personal_tool_photos` via `addColumnIfMissing`: `rotation INTEGER NOT NULL DEFAULT 0`, `flip_h INTEGER NOT NULL DEFAULT 0`, `flip_v INTEGER NOT NULL DEFAULT 0`, `zoom REAL NOT NULL DEFAULT 1`, `focus_x REAL NOT NULL DEFAULT 50`, `focus_y REAL NOT NULL DEFAULT 50`), `server/personal-tools.ts`, `server/app.ts`, `server/portability.ts`; Test `server/personal-tools.test.ts`.

**Produces (HTTP):** `GET /api/tools/kits` → `{ kits }`; `POST /api/tools/kits` `{ name }` → 201 `{ kit }`; `PUT /api/tools/kits/:id` `{ name }` → `{ kit }`; `DELETE /api/tools/kits/:id` → `{ ok }`; `PUT /api/tools/:id/photos/:photoId/framing` `{ framing }` → `{ tool }`. Tools carry `kitIds`; POST/PUT tool take `kitIds`. Errors: `kit-name-required`/`kit-name-taken`/`framing-invalid`/`kit-missing` 400, unknown kit 404.

- [ ] Tests: `adds, renames, and deletes kits, and keeps their tools`; `renames a kit, and refuses another kit's name`; `puts a tool in kits and takes it out`; `removing a tool takes it out of its kits`; `frames a photo`; `refuses a bad framing`; extend `backups carry tools and their photos` to carry a kit and a framing.
- [ ] Run, watch fail; implement; full suite + typecheck; commit "Keep kits and photo framing, and carry them in backups."

### Task 3: Kits, totals, and export on the page

**Files:** Modify `web/src/ToolsPage.tsx`, `web/src/ToolPanel.tsx`, `web/src/tools.css`; Test `web/src/ToolsPage.test.tsx`.

- [ ] Kits row (All tools / each kit with count / + New kit; picked kit offers Rename and Delete with "Delete <name>? Its tools stay."), kit filter, panel "Kits" field, summary line, "Export CSV" (Blob download named `my-tools.csv`).
- [ ] Web tests: `makes a kit, puts a tool in it, and shows only its tools`; `renames and deletes a kit, keeping its tools`; `adds up the tools shown`; `exports the tools shown as CSV` (capture the Blob passed to `URL.createObjectURL`).
- [ ] Each test fails with its feature removed; typecheck; browser check at 1440 and 986; commit "Add kits, totals, and CSV export to My Tools."

### Task 4: Photo framing

**Files:** Create `web/src/ToolPhotoFrame.tsx`; Modify `ToolPanel.tsx`, `ToolsPage.tsx`, `RoleOwnTools.tsx`, `tools.css`; Test `web/src/ToolsPage.test.tsx`.

- [ ] "Adjust" on each panel photo opens a dialog (`role="dialog"`, labelled "Adjust photo"): rotate left/right, flip across/up-down, zoom slider (1–3), focal point by drag or arrow keys (5% steps), Reset, Cancel, Save. Cards, panel thumbnails, and a role's Setup apply `framingStyle`.
- [ ] Web tests: `rotates and zooms a photo and shows it framed on the card`; `cancel leaves the photo as it was`.
- [ ] Each test fails with its feature removed; typecheck; browser check; commit "Frame tool photos: rotate, flip, zoom, and choose what stays in view."
