# My Tools Share Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download or print a page of chosen tools for an employer or a crew.

**Architecture:** `core/tool-share.ts` decides what each audience sees and writes the page (escaped HTML). The page's `ToolShareDialog` gathers the tools, shrinks cover photos with a canvas, and downloads or prints the result.

**Spec:** `docs/superpowers/specs/2026-11-27-my-tools-share-page-design.md`

## Global Constraints

- Never in a share page: serial, paid, worth, keptAt, notes, draft tools.
- Every value from the occupant is HTML-escaped; photos only as `data:image/` URLs.
- File names: `my-tools-for-employers.html`, `my-tools-for-crew.html`.

## Review Focus

1. A tool name with `<script>` or quotes renders as text — core test.
2. A tool with a serial, prices, place and notes never leaks them — core test.
3. A photo that can't be read or shrunk still lets the page be made — web test (jsdom has no canvas).
4. Share with nothing shareable (only drafts) says so instead of making an empty page — web test.
5. A non-data or non-image photo URL is never written into the page — core test.

---

### Task 1: `core/tool-share.ts`
- `ShareAudience = "employer" | "crew"`; `SHARE_FILE_NAME`.
- `shareTools(tools, audience, { roleName, kitName }) : SharedTool[]` (drafts out; per-audience fields only).
- `toolShareHtml({ audience, tools: SharedTool[], photos: Record<string, string>, owner: { name, headline } | null, month }) : string`.
- Tests: fields per audience; never-list; drafts out; escaping; photo URL must start `data:image/`; owner omitted.

### Task 2: the Share dialog
- `web/src/ToolShareDialog.tsx`; Share button in `ToolsPage` head (shown tools, or picked while choosing).
- Tests: Employer download contains role names and skill, no serial; Crew contains condition; "Put my name on it" off leaves the name out; only drafts → "Nothing to share yet…" and no download.
