# Tools and photos on the career page: plan

**Spec:** docs/superpowers/specs/2026-11-27-career-page-tools-design.md

**Goal:** chosen tools and uploaded role photos on the published career page.

## Tasks

1. **Tool field.** `onCareerPage: boolean` on `PersonalTool` and `ToolInput`
   (`readToolInput`: `value.onCareerPage === true`), column
   `on_career_page INTEGER NOT NULL DEFAULT 0`, saved by create and update,
   copied by duplicate. Bulk change `{ kind: "careerPage", on: boolean }`.
   Tests: core/personal-tools.test.ts, server tool routes.
2. **Snapshot.** `"tools"` publish section (labels, allowed list, defaults).
   `CareerPageTool { id, name, makerModel, facts, roleIds, photoUrl,
   photoFraming? }`; `buildWorkMapSnapshot({ tools })` fills `tools` when the
   section is on, from shown non-draft tools, with the employer facts and
   "Used at" from the page's roles. `limitProjection` empties `tools` when a
   link doesn't open them. Fingerprint and `describeRelayChanges` count them.
3. **Embedding.** core `embedPublicPhotos(snapshot, photos)`: keys
   `media:<id>` and `tool:<id>`; JPEG data only; 400,000 / 8,000,000 caps
   (`photos-too-large`); local addresses replaced or dropped; framing
   stripped. `POST /api/work-map/publish` takes `{ photos }`, embeds into the
   projection only; body limit 9 MB for that route.
4. **Browser.** `web/src/photo-data.ts` (moved `photoData`, `fewAtATime`)
   plus `preparePublicPhotos(snapshot)`. Publish sends them; preview embeds
   them and shows the Tools section and per-job tools. Tool popout switch,
   bulk bar choice, Tools in publish settings.
5. **Relay.** Draws the Tools section and per-job tool names; images only
   from `data:image/jpeg` or http(s).

## Review focus

- A local `/api/...` address reaching the relay by any path.
- A grant without Tools still showing tools or their photos.
- Old projections without `tools` on the relay and in Access.
- A huge or non-JPEG data string in the publish body.
- Drafts switched on.
