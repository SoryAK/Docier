# My Tools Phase 3 (Bulk Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick many tools on My Tools and change or delete them in one all-or-nothing step.

**Architecture:** `core/personal-tools.ts` reads a bulk request and applies one change to a tool's shared fields. `server/personal-tools.ts` runs the change for every picked tool inside one SQLite transaction behind `POST /api/tools/bulk`. The page gets a choosing mode and a bar (`web/src/ToolBulkBar.tsx`).

**Tech Stack:** TypeScript, Hono, node:sqlite, React, Vitest (projects `core-server` and `web`).

**Spec:** `docs/superpowers/specs/2026-11-25-my-tools-phase-3-design.md`

## Global Constraints

- Management logic lives in `core/`, not in routes or React screens.
- A change is exactly one of: `category`, `ownership`, `condition`, `addTags`, `removeTags`, `addKit`, `removeKit`, `delete`.
- Ids must all be the occupant's own tools; one unknown id refuses the whole change. At most 500 tools per change.
- Tags follow the existing tag rules (trimmed, 40 chars, deduplicated ignoring case, 20 per tool).
- A tool that "Needs details" keeps that mark.
- Delete confirm copy: "Delete 6 tools? Their photos go too." with Delete / Keep.
- Never name another product in commits or docs. pnpm. Commit as Sory Kaba with the Co-Authored-By line.

## Review Focus

1. A failure part-way (e.g. the last id unknown) must leave every tool unchanged — server test "unknown id changes nothing".
2. Picks hidden by a filter still get the change, and the count says so — web test "hidden picks are counted and changed".
3. Add tags past the 20-tag cap keeps the first 20, never errors — core test "add tags stops at twenty".
4. Delete removes photo files only after the transaction commits — server test "delete removes rows and files".
5. Remove tags ignores case ("Truck" removes "truck") — core test "remove tags ignores case".

---

### Task 1: Bulk rules in core

**Files:**
- Modify: `core/personal-tools.ts`
- Test: `core/personal-tools.test.ts`

**Interfaces:**
- Produces:
  - `export const BULK_TOOLS_MAX = 500;`
  - `export type BulkChange = { kind: "category"; category: EquipmentCategory } | { kind: "ownership"; ownership: ToolOwnership } | { kind: "condition"; condition: ToolCondition } | { kind: "addTags"; tags: string[] } | { kind: "removeTags"; tags: string[] } | { kind: "addKit"; kitId: string } | { kind: "addKit"; newKitName: string } | { kind: "removeKit"; kitId: string } | { kind: "delete" };`
  - `export type BulkError = "bulk-ids" | "bulk-too-many" | "bulk-change" | "not-found" | "kit-missing" | "kit-name-required" | "kit-name-taken";`
  - `export function readBulkRequest(raw: unknown, known: { toolIds: Set<string>; kits: ToolKit[] }): { ok: true; ids: string[]; change: BulkChange } | { ok: false; error: BulkError }` — body shape `{ ids: string[], change: { kind, ...value } }`; ids deduplicated, order kept; `addKit` takes `kitId` (must exist, else `kit-missing`) or `newKitName` (read with `readKitName`).
  - `export type BulkFields = Pick<PersonalTool, "category" | "ownership" | "condition" | "tags" | "kitIds">;`
  - `export function applyBulkChange(fields: BulkFields, change: Exclude<BulkChange, { kind: "delete" }>, newKitId?: string): BulkFields` — for `addKit` with `newKitName`, the server passes the id of the kit it just made as `newKitId`.

- [ ] **Step 1: Write the failing tests** in a `describe("bulk changes")`:
  - `readBulkRequest` refuses `{ ids: [] }` → `bulk-ids`; 501 ids → `bulk-too-many`; `{ kind: "name" }` → `bulk-change`; `{ kind: "category", category: "spaceship" }` → `bulk-change`; an id not in `toolIds` → `not-found`; `addKit` with unknown `kitId` → `kit-missing`; `addKit` with `newKitName` equal to an existing kit's name in other case → `kit-name-taken`; `{ ids: ["a","a","b"] }` reads as `["a","b"]`.
  - "add tags stops at twenty": a tool with 19 tags plus `addTags ["x","y"]` → 20 tags ending in `"x"`.
  - "add tags skips ones it has": `["Truck"]` + `addTags ["truck"," new "]` → `["Truck","new"]`.
  - "remove tags ignores case": `["Truck","Shop"]` − `removeTags ["truck"]` → `["Shop"]`.
  - `addKit` already in the kit keeps one entry; `removeKit` drops it; `category`/`ownership`/`condition` set the value and leave the rest equal.

- [ ] **Step 2: Run** `npx vitest run core/personal-tools.test.ts` — Expected: FAIL, `readBulkRequest is not a function`.
- [ ] **Step 3: Implement** the produces list. Reuse `readTags` for add (existing tags first, then new, through `readTags` so the cap and dedup apply) and for reading the request's tags; reuse `EQUIPMENT_CATEGORIES`, `TOOL_OWNERSHIPS`, `TOOL_CONDITIONS` to check values. Empty tag lists are `bulk-change`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add core/personal-tools.ts core/personal-tools.test.ts` — "Bulk changes to tools: the rules."

### Task 2: Storage and route

**Files:**
- Modify: `server/personal-tools.ts`, `server/app.ts` (route beside the kit routes)
- Test: `server/personal-tools.test.ts` (and one route test in the same file's app section, following its existing pattern)

**Interfaces:**
- Consumes: Task 1's `readBulkRequest`, `applyBulkChange`, `BulkError`.
- Produces:
  - `ToolErrorCode` gains `"bulk-ids" | "bulk-too-many" | "bulk-change"`.
  - `export function bulkChangeTools(db: DatabaseSync, occupantId: string, uploadsDir: string, raw: unknown): { tools: PersonalTool[]; deleted: string[]; kit: ToolKit | null }` — `tools` are the changed tools after the change (empty for delete); `deleted` the removed ids; `kit` the kit made by `newKitName`, else null.
  - `POST /api/tools/bulk` → 200 with that object; errors as `{ error: code }` with 404 for `not-found`, else 400 (existing `toolFailure`).

- [ ] **Step 1: Write the failing tests:**
  - "sets ownership on every picked tool and keeps drafts": two tools, one a draft from photos; `ownership: "borrowed"` → both borrowed, the draft still `draft: true`, a third unpicked tool unchanged.
  - "unknown id changes nothing": ids `[a, "nope"]` with `category` → throws `ToolError("not-found")`, `a` unchanged.
  - "add to a new kit makes it once": `newKitName: "Truck toolbox"` → `kit.name === "Truck toolbox"`, both tools' `kitIds` contain it, `listKits` has one such kit.
  - "delete removes rows and files": a tool with a photo → `deleted` lists it, `listTools` lacks it, its photo file no longer exists in `uploadsDir`, no `tool_kit_items` or `personal_tool_roles` rows remain for it.
  - Route: `POST /api/tools/bulk` with `{ ids: [], change: { kind: "delete" } }` → 400 `{ error: "bulk-ids" }`.
- [ ] **Step 2: Run** `npx vitest run server/personal-tools.test.ts` — Expected: FAIL, `bulkChangeTools is not a function`.
- [ ] **Step 3: Implement.** Read with `readBulkRequest(raw, { toolIds: new Set(listTools(...).map(id)), kits: listKits(...) })`. `db.exec("BEGIN")`, then per tool: for delete, the same row deletes as `removeTool` (collect photo stored names); otherwise `applyBulkChange` and write only `category, ownership, condition, tags, updated_at` plus a rewrite of that tool's `tool_kit_items` — never touch `draft`. `COMMIT`; on any throw `ROLLBACK` and rethrow. Delete photo files with `deleteFile` only after `COMMIT`. Extract the row deletes in `removeTool` into a shared helper rather than copying them.
- [ ] **Step 4: Run** the same command, then `pnpm -s typecheck` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git add server/personal-tools.ts server/app.ts server/personal-tools.test.ts` — "Change or delete many tools in one step."

### Task 3: Choosing and the bulk bar

**Files:**
- Create: `web/src/ToolBulkBar.tsx`
- Modify: `web/src/ToolsPage.tsx`, `web/src/tools.css`
- Test: `web/src/ToolsPage.test.tsx`

**Interfaces:**
- Consumes: `POST /api/tools/bulk` and its response; `BulkChange` type from `@core/personal-tools`.
- Produces: `ToolBulkBar({ picked: string[]; shownIds: string[]; kits: ToolKit[]; tools: PersonalTool[]; onPick(ids: string[]): void; onDone(result: { tools: PersonalTool[]; deleted: string[]; kit: ToolKit | null }, message: string): void })`.

Page behaviour (copy fixed by the spec):
- A "Select" button in the head (`aria-pressed`). While on, cards keep their button but its `aria-label` is `Pick <name>` with `aria-pressed`, and a click toggles the pick instead of opening. Starting closes an open panel (`openTool(null)`). Turning off or Escape clears picks.
- Bar (`role="toolbar"`, `aria-label="Picked tools"`): "N picked" (or "N picked, K not shown"), "Pick all shown (M)" / "Clear", then menus Category, Whose it is, Condition, Add tags, Remove tags (offers the picked tools' tags), Add to a kit (kits plus a "New kit" name field), Take out of a kit, Delete.
- Delete confirms "Delete N tools? Their photos go too." with Delete / Keep. After it, picks clear.
- After any other action, picks stay; a `role="status"` line shows the result: "N tools changed." for fields and tags, "N tools moved to <kit>." for add to a kit, "N tools taken out of <kit>." for take out, "N tools deleted." for delete (1 → "1 tool …").
- A failed request shows "The change couldn't be saved. Nothing was changed." and keeps picks.
- The page merges returned tools into its list, removes deleted ids, and adds a returned kit to `kits`.

- [ ] **Step 1: Write the failing tests** (using `useRealApp`):
  - "picks tools and sets whose it is": three tools; Select; pick two; Whose it is → Borrowed; status "2 tools changed."; `app.tools()` shows those two borrowed, the third mine; picks still 2.
  - "a click picks instead of opening while choosing": no `#/tools/` in `location.hash` after clicking a card.
  - "hidden picks are counted and changed": pick two, search hides one → "2 picked, 1 not shown"; set Condition → Good changes both.
  - "adds the picked tools to a new kit": New kit "Truck toolbox" → status "2 tools moved to Truck toolbox."; kit chip "Truck toolbox" appears with count 2.
  - "deletes after asking": Delete → dialog text "Delete 2 tools? Their photos go too."; Keep leaves them; Delete removes them, status "2 tools deleted.", picks cleared.
  - "a failed change says nothing changed": `failWhen` on `/api/tools/bulk` → alert "The change couldn't be saved. Nothing was changed."
  - "Escape stops choosing": picks cleared, Select not pressed.
- [ ] **Step 2: Run** `npx vitest run web/src/ToolsPage.test.tsx` — Expected: FAIL, no "Select" button.
- [ ] **Step 3: Implement** the bar and page changes; styles for the bar, the picked card (outline and a check mark in the cover corner), and wrapping at narrow widths.
- [ ] **Step 4: Run** the same command, then `pnpm -s typecheck && pnpm -s test && pnpm -s build` — Expected: all pass.
- [ ] **Step 5: Check in the browser** at 1440px and 986px: choose, change, delete my own test tools, then remove every test record I added.
- [ ] **Step 6: Commit** `git add web/src/ToolBulkBar.tsx web/src/ToolsPage.tsx web/src/tools.css web/src/ToolsPage.test.tsx` — "Pick many tools and change or delete them together."
