# CI — GitHub Actions merge gate

The public gate is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
It runs on every **pull request** and every **push to `main`**.

The check name GitHub should require is **`test`**.

## What a run does today

1. **Required files** — README, LICENSE, SECURITY, CONTRIBUTING, Code of Conduct
2. **`pnpm install --frozen-lockfile`** then **`pnpm test`** (Vitest at `core/` and `server/` HTTP seams, and web screens in `web/src/**/*.test.tsx`)
3. **`pnpm typecheck`** (`tsc --noEmit`) — no type errors get in
4. **`pnpm build`** — the production web build must succeed from a clean clone
5. **If Prisma exists** — `npx prisma generate` (legacy; this rebuild does not use it)
6. **Deploy (main only)** — no-op until hosting exists

## What is not in the gate yet

- Hosting (Vercel or otherwise) is not wired
- The standards-and-spec review. That review reads the issue and judges the
  diff. A test job cannot do it, so it stays on the pull request.

## Review

Push the branch, then open the pull request. The review happens there, before
the pull request is ready to merge:

- **Standards.** The diff follows the repo's documented standards.
- **Spec.** The diff does what the linked issue asks.

Write both on the pull request. `test` still has to pass. It does not stand in
for that review.

## Releases

Releases have their own checklist, [release.md](release.md). It includes a required review of the tour and the welcome card.

## Local parity

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Prototypes stay on each developer's machine. The app must not import them, and
the type check skips their folders (`web/prototypes`, `web/src/prototype`), so a
local prototype can't fail it.

## Web tests

Screens are tested in `web/src/**/*.test.tsx` with Testing Library, in a
browser-like page (`web/src/test/jsdom-node.ts`). They talk to the real server
code, not stand-ins: `useRealApp()` from `web/src/test/app-fetch.ts` sends the
page's `/api` requests into the app with an in-memory database and a temporary
uploads folder, and can make one kind of request fail to check what the screen
says. Call `stubBrowser()` first for the browser features the test page lacks.
Layout (CSS) isn't checked there; look at it in a browser.

## Ruleset (manual, once)

Repository **Settings → Rules → Protect main**:

- Pull request required
- Required status check: `test`
- No force-push, no deleting `main`

An approving review is not required yet. The repository has one maintainer,
and GitHub does not count that person's approval of their own pull request.
Turn on one required approval when a second reviewer can give it.
