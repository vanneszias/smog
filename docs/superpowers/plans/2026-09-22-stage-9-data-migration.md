# Stage 9: Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rerunnable, verifiable importer that moves production's catalogue — 27 categories and 496 gestures — from the Convex export into `apps/site`'s Payload database, drops what cannot be migrated with a counted reason, and proves the result by re-reading the target.

**Architecture:** A CLI under `apps/site/scripts/migrate-convex/` in three layers: a pure **reader/transformer** (export directory → validated import plan, unit-tested on synthetic fixtures), an **importer** that applies a plan through Payload's local API, idempotent on a new unique `legacyId` column, and a **verifier** that re-queries the target and compares it with the plan. Dry-run is the default; writing needs `--apply`, and production needs an explicit confirmation flag.

**Tech Stack:** Payload 3.89 local API on `@payloadcms/db-d1-sqlite`, Vitest (unit + `*.int.test.ts` against local miniflare D1), bun.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md` — sections "Decisions taken 2026-09-22" (big-bang cutover; import no consent; the export holds real user data and only aggregates may leave the sandbox) and "What the production export actually contains" (source shapes; favourites are orphans).

## What the export actually holds (measured 2026-09-22, aggregates only)

| Table | Rows | Plan |
|---|---|---|
| `categories` | 27 (all active, no duplicate or empty names, max 19 chars) | import |
| `gestures` | 496 (all active) | import 492; skip 4 (below) |
| `user_favorites` | 5 (all orphans) | drop, counted |
| `users`, `sponsorships`, `user_consents`, `adminLogs` | 0 | assert empty |

Gesture data quality, measured:
- **2 gestures have no category.** `Gestures.categories` is `required: true`.
- **2 gestures have an empty `playbackId`.** `Gestures.playbackId` is `required: true`. (Disjoint from the two above.)
- **1 gesture repeats a concept** inside its own `concept` array.
- 1 pair of gestures shares a name exactly but has different videos: two distinct signs, both imported.
- 483 gestures have an empty `info`; 234 have no concepts. Both are valid (optional fields).
- 0 dangling category references; 0 active gestures pointing at inactive categories.

Source shapes: see the spec. `concept` is an array of strings; `categoryIds` an array of Convex ids; `_creationTime` and `lastUpdated` are epoch milliseconds.

## Global Constraints

- **The export is real production data.** It lives outside the repository, at a path given on the command line. The CLI refuses any export path inside the git work tree. No test, fixture, log line or report committed to the repository may contain a row from it. Tests use **synthetic** fixtures written for this purpose. The importer may print gesture and category names in its local report (public catalogue content), but never anything from `users`, `user_favorites`, `user_consents`, `sponsorships` or `adminLogs` beyond a count.
- **No consent is imported**, ever (spec). The importer never touches `user-consents`.
- Gestures import into the **`nl`** locale only; `en`/`fr` fall back to Dutch (behaviour `Gestures.int.test.ts` already proves).
- **Idempotent and resumable:** there are no transactions on this adapter, so a run can fail halfway. A rerun must converge on the same result without duplicates. The key is `legacyId` (the Convex `_id`), backed by a UNIQUE index — the only atomic primitive here (see `20260922_100000_add_rate_limits.ts`).
- **The importer never updates or deletes a document it did not create** (identified by a non-null `legacyId`), so a rerun against a database an editor has already touched cannot overwrite their work. A document with a matching `legacyId` is left as it is and counted as `existing`.
- Dry-run by default. `--apply` writes. `--target=production` additionally requires `--i-have-a-maintenance-window`.
- D1 caps bound parameters at 100 per statement: no unbounded `payload.find`/`delete`; page every read at ≤ 100.
- Errors: `console.error("[migrate-convex] …", error)`; a failed document is recorded in the report and the run continues; the exit code is non-zero if anything failed.

## Rulings taken when writing this plan (a human can overturn any of them)

- **Skip the 4 gestures that cannot satisfy required fields, and list them by `legacyId` and name in the report as needing editorial action**, rather than inventing a placeholder category or relaxing `required`. Inventing a category would publish a category nobody chose; relaxing `required` would weaken the model for everyone to fit four rows. Cost if wrong: four gestures are missing at launch until an editor adds them in the admin, which the runbook makes a named post-cutover step.
- **Deduplicate concepts within a gesture, keeping first-occurrence order.** A repeated concept is a data-entry slip, and `concepts` is `hasMany` text where a duplicate renders twice. Cost if wrong: one concept shown once instead of twice.
- **Add `legacyId` to both collections** (text, unique, indexed, read-only and hidden in the admin). The alternatives, keying on names or `playbackId`, fail on this data: gesture names are not unique, and two gestures have no `playbackId`. Cost if wrong: one extra hidden column per collection.
- **Preserve `createdAt` from `_creationTime`** if Payload's local API accepts it on create; if it overwrites it, record that and do not fight it. `updatedAt` is not preserved. Cost if wrong: catalogue timestamps start at the migration date.
- **Refuse to run if any of `users`, `sponsorships`, `user_consents`, `adminLogs` is non-empty in the export**, or if `gesture_lists` appears. The plan was built for an export where they are empty; a different export needs a new plan, not a silent partial import.

## Review Focus

1. **A rerun after a mid-run failure.** Expected: no duplicate categories or gestures, category links intact, and the report shows `existing` for what the first run wrote. Pinned in Task 3.
2. **The real export path leaking into the repo.** Expected: the CLI refuses a path inside the work tree, and no committed file contains export rows (a test asserts the fixture directory is synthetic by construction). Pinned in Task 4.
3. **A gesture whose categories point at a category that failed to import.** Expected: that gesture is skipped with a reason, never created with fewer categories than the source had. Pinned in Task 3.
4. **Running against the wrong database.** Expected: dry-run by default; `--apply` needed to write; production needs the maintenance-window flag; the target and counts are printed before anything is written. Pinned in Task 4.
5. **An editor's changes after a first run.** Expected: a rerun leaves existing `legacyId` documents untouched. Pinned in Task 3.

---

## Task 1: `legacyId` on Categories and Gestures

**Files:**
- Modify: `apps/site/src/collections/Categories.ts`, `apps/site/src/collections/Gestures.ts`
- Create: `apps/site/src/migrations/<timestamp>_add_legacy_ids.ts` (follow the existing migrations' style and register it in `src/migrations/index.ts`)
- Modify: `apps/site/src/payload-types.ts` (regenerate: `CLOUDFLARE_ENV=staging PAYLOAD_SECRET=ignore bun -F site generate:types:payload`)
- Test: `apps/site/src/collections/Categories.test.ts`, `Gestures.test.ts` (config assertions), `src/migrations/migrations.test.ts` (follow its existing pattern for asserting a migration creates a UNIQUE index)

**Interfaces:** Produces a `legacyId` field on both collections: `{ name: "legacyId", type: "text", unique: true, index: true, admin: { readOnly: true, hidden: true } }` — not localized, not required.

- [ ] Step 1: Failing tests — each collection has `legacyId` unique + indexed + hidden + readOnly + not localized; the migration test asserts `categories_legacy_id_idx` and `gestures_legacy_id_idx` are UNIQUE after `up` and gone after `down` (match the naming Payload's d1 adapter actually generates — generate the migration with `payload migrate:create` first, read what it emits, then keep its index names).
- [ ] Step 2: Implement; regenerate types; `bun -F site test -- src/collections src/migrations`, `bun -F site check-types`, `bun check`, knip. Also confirm the CI types-drift and import-map-drift guards would pass (`generate:types:payload` / `generate:importmap` produce no diff).
- [ ] Step 3: Mutation — make the index non-unique in the migration → the migration test fails.
- [ ] Step 4: Commit `feat(site): a legacy id on categories and gestures, unique`.

## Task 2: Reader and transformer (pure)

**Files:**
- Create: `apps/site/scripts/migrate-convex/plan.ts`
- Create: `apps/site/scripts/migrate-convex/plan.test.ts`
- Create: `apps/site/scripts/migrate-convex/fixtures/` — a **synthetic** export (hand-written JSONL, invented names like "Testgebaar 1") covering every rule below

**Interfaces:**
```ts
export interface ExportCategory { _id: string; _creationTime: number; name: string; isActive: boolean }
export interface ExportGesture {
  _id: string; _creationTime: number; name: string; info: string; concept: string[];
  categoryIds: string[]; playbackId: string; lastUpdated: number; isActive: boolean;
}
export type SkipReason = "no-category" | "no-playback-id" | "unknown-category";
export interface ImportPlan {
  categories: Array<{ legacyId: string; name: string; isActive: boolean; createdAt: string }>;
  gestures: Array<{
    legacyId: string; name: string; info: string; concepts: string[];
    categoryLegacyIds: string[]; playbackId: string; isActive: boolean; createdAt: string;
  }>;
  skipped: Array<{ legacyId: string; name: string; reason: SkipReason }>;
  dropped: { favourites: number };
  counts: Record<"categories" | "gestures" | "user_favorites" | "users" | "sponsorships" | "user_consents" | "adminLogs", number>;
}
export function readExport(dir: string): Promise<{ categories: ExportCategory[]; gestures: ExportGesture[]; counts: ImportPlan["counts"]; tables: string[] }>;
export function buildPlan(input: Awaited<ReturnType<typeof readExport>>): ImportPlan; // throws on the refusal conditions
```

Rules `buildPlan` enforces, each with a test on the synthetic fixture: trims names; skips a gesture with zero `categoryIds` (`no-category`), with an empty/whitespace `playbackId` (`no-playback-id`), or referencing a category id absent from the export (`unknown-category`); dedupes concepts keeping order; converts `_creationTime` to ISO; carries `isActive`; counts favourites as dropped without reading their fields beyond counting lines; throws `[migrate-convex] Export has N users…` (etc.) if any of users/sponsorships/user_consents/adminLogs is non-empty or a `gesture_lists` table exists (`_tables/documents.jsonl` lists tables); throws on malformed JSON with the file and line number, not the line's content. `readExport` reads `<table>/documents.jsonl` line by line.

- [ ] TDD each rule; mutation: drop the `unknown-category` check → its test fails.
- [ ] Commit `feat(site): read and plan a Convex export import`.

## Task 3: Importer (idempotent, resumable)

**Files:**
- Create: `apps/site/scripts/migrate-convex/apply.ts`
- Create: `apps/site/scripts/migrate-convex/apply.int.test.ts` (local miniflare D1, like the other `*.int.test.ts`; synthetic plan objects built in the test)

**Interfaces:**
```ts
export interface ApplyResult {
  categories: { created: number; existing: number; failed: Array<{ legacyId: string; error: string }> };
  gestures: { created: number; existing: number; failed: Array<{ legacyId: string; error: string }>; skippedForFailedCategory: string[] };
}
export function applyPlan(payload: Payload, plan: ImportPlan, options: { log: (line: string) => void }): Promise<ApplyResult>;
```

Behaviour: categories first. For each, look up by `legacyId` (paged, `limit ≤ 100`), create if absent (`locale: "nl"`, `overrideAccess: true`, `createdAt` per the ruling), count `existing` otherwise, never update. A create that fails on the unique index (a concurrent or repeated run) is re-read and counted `existing`. Build `legacyId → id` for **all** categories now present (created or existing). Then gestures: if any `categoryLegacyIds` has no id (its category failed), skip into `skippedForFailedCategory`; else create or count existing, same rules. Per-document try/catch; the run continues.

Tests (Review Focus 1, 3, 5): first run creates everything; second run creates nothing and reports all `existing`; a run where one category create is forced to fail (inject via a payload wrapper) skips that category's gestures and a rerun without the fault completes them; a gesture edited after the first run (name changed via local API) is untouched by a rerun; `createdAt` preserved or the test documents that Payload overwrote it; no `user-consents` documents exist after a run. Clean up created documents in `afterAll` (unbounded deletes are forbidden — page them), and use unique synthetic legacy ids per test file so the shared persisted D1 cannot collide (`src/lib/gestureQuery.int.test.ts` lacking cleanup is the known anti-pattern).

- [ ] TDD; mutation: remove the `existing` lookup → rerun test fails with duplicates.
- [ ] Commit `feat(site): apply an import plan, idempotently`.

## Task 4: CLI, guards and verification report

**Files:**
- Create: `apps/site/scripts/migrate-convex/index.ts` (CLI), `verify.ts`, `report.ts`
- Create: `apps/site/scripts/migrate-convex/cli.test.ts`, `verify.int.test.ts`
- Modify: `apps/site/package.json` — script `"migrate:convex": "NODE_OPTIONS=--no-deprecation bun run scripts/migrate-convex/index.ts"`

**Behaviour:**
- Args: `--export <dir>` (required), `--report <file>` (required, must also be outside the work tree), `--target=local|staging|production` (default `local`), `--apply`, `--i-have-a-maintenance-window`.
- Guards (unit-tested): export and report paths inside `git rev-parse --show-toplevel` → refuse; `staging|production` require `CLOUDFLARE_ENV` equal to the target (reuse `deploy:guard`'s rule) and run with `NODE_ENV=production` the way `deploy:database` does so bindings are remote; `production` without the maintenance flag → refuse; without `--apply` → print the plan summary and exit 0 having written nothing.
- Before writing, print: target, database name from `wrangler.jsonc`, and planned counts.
- After applying, `verify(payload, plan)` re-reads the target (paged) and checks: every planned category/gesture exists by `legacyId`; each gesture's category set equals the plan's; per-category gesture counts equal the plan's; active counts equal; `user-consents` count unchanged by the run. Returns a list of mismatches.
- `report.ts` writes Markdown to `--report`: source counts, planned/created/existing/failed per collection, skipped gestures (legacyId, name, reason) under "Needs editorial action", dropped favourites (count and the reason from the spec, no ids), verification result. Exit code non-zero on any failure or mismatch.

Tests: guard refusals (Review Focus 2 and 4); dry-run writes nothing (int); an end-to-end int run on the synthetic fixture passes verification; a deliberately corrupted target (a link removed after apply) makes `verify` report a mismatch. Mutation: disable the in-repo path check → its test fails.

- [ ] TDD; commit `feat(site): a guarded CLI for the Convex import, with a verification report`.

## Task 5: Local rehearsal on the real export, and the runbook

- [x] **Controller-run, not an implementer:** run the CLI against the real export into **local** D1 (`--target=local --apply`) with the report written under the scratchpad, then rerun it and confirm the second run is all `existing`. Record **only aggregates** in the plan: planned/created/existing/skipped/failed counts, verification pass/fail, timings. The skipped gestures' ids and names stay in the scratch report and go to the user privately, not into the repo.
- [x] Write the Stage 10 import steps into `docs/deployment-checklist.md` (or a new `docs/cutover-runbook.md` if the checklist is the wrong home): staging rehearsal command, production command with the maintenance flag, where the report goes, what "verification failed" means and what to do, and the post-cutover editorial task for the skipped gestures. Staging and production runs are blocked on the Cloudflare token rotation; say so.
- [x] Record the exit in this plan; update `docs/superpowers/plans/README.md`.

## Stage 9 exit: measured

**Rehearsed locally, on the real production export, controller-run
(`--target=local`).** Staging and production not yet exercised — see below.

### Rehearsal aggregates (real export; only aggregates, never row content)

- **Dry run** (`--target=local`, no `--apply`): planned 27 categories, 492
  gestures, 4 skipped (needing editorial action: 2 with no category, 2 with
  no video), 5 favourites dropped. Exit 0; wrote nothing.
- **Run 1** (`--target=local --apply`, against a fresh, empty local D1):
  categories 27 created / 0 existing / 0 failed; gestures 492 created / 0
  existing / 0 failed. Verification: 0 incomplete, 0 mismatches.
  `user-consents` count 0 → 0. Exit 0; ~71 s.
- **Run 2** (same command, run again immediately after): categories 0
  created / 27 existing; gestures 0 created / 492 existing. Verification
  clean. Exit 0; ~12 s. **The import is idempotent on the real data** — a
  rerun creates nothing and reports everything as `existing`.

### Finding

`--target=local` must start from an **empty** local D1. With `NODE_ENV`
unset (how `local` runs), Payload dev-pushes its schema at init; pushing
that over a database already built by `payload migrate` fails with an
error like `index lists_items_order_idx already exists`. Staging and
production run with `NODE_ENV=production` (no push) after `deploy:database`
has migrated the schema first, so they are unaffected — this only bites a
local rehearsal. Recorded in `docs/cutover-runbook.md`'s local-rehearsal
note, with the move-`.wrangler`-aside workaround.

### Not yet exercised

Staging and production runs are **blocked on the Cloudflare API token
rotation** (`docs/deployment-checklist.md`, "Before you start", item 1),
which must happen before any remote command. Once it has, follow
`docs/cutover-runbook.md`'s staging and production sections. The remote
path — `loadPayloadFor`'s platform-proxy binding, and its fail-closed check
that Payload's D1 binding is the remote proxy's own — has so far only
fake-based tests (`cli.test.ts`'s `loadPayloadFor` describe block); it has
not been run against a real staging or production D1.

### Review Focus, pinned

1. **A rerun after a mid-run failure.** `apps/site/scripts/migrate-convex/apply.int.test.ts`,
   describe `"a category that fails to import"`: `"completes the skipped
   work on a rerun without the fault"` and `"leaves one document per legacy
   id across the faulted run and the rerun"`.
2. **The real export path leaking into the repo.**
   `apps/site/scripts/migrate-convex/cli.test.ts`, describe
   `"assertOutsideWorkTree"` (e.g. `"refuses a directory inside the work
   tree"`, `"refuses an existing report symlink that points into the work
   tree"`) and describe `"the fixture directory is synthetic by
   construction"`: `"holds only prefixed ids, pb_ playback ids and marker
   lines"`. Also `apps/site/scripts/migrate-convex/verify.int.test.ts`,
   describe `"the CLI, end to end on the synthetic fixture"`: `"leaves
   nothing of the export or report inside the work tree"`.
3. **A gesture whose categories point at a category that failed to
   import.** `apps/site/scripts/migrate-convex/apply.int.test.ts`, describe
   `"a category that fails to import"`: `"skips every gesture that names
   the failed category, even alongside a healthy one"`.
4. **Running against the wrong database.**
   `apps/site/scripts/migrate-convex/cli.test.ts`, describe `"runCli
   without --apply"`: `"prints the target, the database and the planned
   counts, loads no Payload, writes no report, and exits 0"`; describe
   `"runCli refusals"` (e.g. `"refuses a staging run under
   CLOUDFLARE_ENV=production"`, `"refuses production without the
   maintenance flag"`); describe `"assertTargetAllowed"`.
5. **An editor's changes after a first run.**
   `apps/site/scripts/migrate-convex/apply.int.test.ts`, describe `"a first
   run, then a rerun"`: `"leaves a gesture an editor changed after the
   first run untouched"`. `apps/site/scripts/migrate-convex/verify.int.test.ts`,
   describe `"an incomplete write, seen by a later run"`: `"does not report
   an editor's rename or re-categorisation as incomplete or as a failure"`
   and `"still shows those editorial changes, as differences from the
   export"`.

### Carried out of Stage 9

From the SDD ledger (`.superpowers/sdd/2026-09-22-stage-9-data-migration/progress.md`),
deferred rather than fixed in place:

- Task 1: the newest committed drizzle snapshot predates this stage, so
  every `payload migrate:create` re-derives several days of migrations and
  needs manual trimming down to the one actually intended.
- Task 2: a `Promise.all` over the aggregate tables (`users`,
  `sponsorships`, `user_consents`, `adminLogs`) reports only one of several
  simultaneously-missing tables, if more than one is missing at once.
- Task 3: `apply.int.test.ts`'s teardown loops forever if a bulk delete
  returns errors (e.g. a delete blocked by a hook like
  `blockDeleteWhenSponsored`) instead of throwing on errors or on zero
  progress.
- Task 3: the "failed create left document N" message in a test/log can
  misattribute a concurrent run's already-complete document to the wrong
  failure.
- Task 4: `workTreeRoot`'s git-missing code path is untested, and
  `O_NOFOLLOW` on the report write does not cover a parent directory
  swapped for a symlink between the guard's check and the open.

None of these block the import described in `docs/cutover-runbook.md`;
they are quality/coverage gaps to pick up opportunistically, not before
staging or production runs.

## Rulings made during execution

Copied from the SDD ledger when the branch review closed. Each reads: what was decided — why — what it costs if wrong.

- a missing <table>/documents.jsonl for any table the plan depends on (categories, gestures, user_favorites, users, sponsorships, user_consents, adminLogs, _tables) is an error naming the table — the plan's constraint is "a different export needs a new plan, not a silent partial import" — cost if wrong: an export with a legitimately absent empty table must be hand-fixed with an empty file.
- concepts are trimmed and empty ones dropped (then deduped), and categoryIds are deduped per gesture — consistent with names/playbackId trimming; measured data has no such cases so the import result is unchanged — cost if wrong: none.
- completeness checks live in Task 4's verify, not the importer — every imported doc must have a non-empty nl name, a category set equal to the plan's, concepts equal to the plan's, and exactly one search entry per gesture; failures are listed as "incomplete: delete and rerun"; verify runs on every --apply (reruns included) — Payload's D1 create is ~6 unatomic statements and the search plugin swallows its own errors — cost if wrong: a slower verification pass.
- fail closed unless payload.db.binding === the remote proxy's env.D1, and pass configPath (apps/site/wrangler.jsonc) to getPlatformProxy so the printed name and the binding come from the same file — cost if wrong: one extra assertion.
- the report path is lstat'ed and a symlink is refused outright (as is any path resolving into the work tree) — cost if wrong: an operator must pass a real path.
- replace the post-hoc user-consents count assertion with prevention — beforeChange/beforeDelete hooks on user-consents that throw during the importer's run — keeping the count in the report as information; this also removes the false alarm on a live staging run — cost if wrong: none.
- fix Important 1 — a gesture with zero search docs has never been saved by an editor, so it is the import's own: compare strictly to plan, any difference → "delete and rerun"; "re-save" only when fields match — restores the concepts check the completeness ruling named — cost if wrong: an editor-touched doc gets a delete remedy, but at cutover nobody edits.
- fix Important 2 — applyPlan never maps an existing category with a blank nl name; its gestures are skipped (skippedForFailedCategory) so cascade can never strip a link — cost if wrong: one extra delete-and-rerun cycle.
- fix Important 3 — remove every "reindex" remedy (runbook + report.ts); re-save only — plugin deleteIndexes breaks D1's 100-param cap and leaves the index empty (inferred, not executed) — cost if wrong: none, re-save is always safe.
- fix Important 4 — rewrite the runbook's pre-existing paragraph to match verify; during cutover any Differs row on a rerun is a failure.
- fix Important 5 — runbook orders freeze → fresh export → dry run; count drift from 27/492 is expected; gates are buildPlan refusals + re-reviewed skipped list.
- fix Minors 1-8 (report id column; CLOUDFLARE_ENV in rehearsal commands; banner matches real output; databaseNameFor refuses a remote target without remote:true; stale migration comment; store trimmed playbackId; buildPlan refuses duplicate _id; guard refuses any dir inside any git work tree) — all cheap and in the importer.
- fix Minor 9 as: count catalogue docs without legacyId, print in banner/report, and refuse --apply on production when nonzero — production is empty at a big-bang cutover — cost if wrong: operator deletes stray admin-created docs first.
- deferred task minors carried as the reviewer recommends (none must-fix).
- concern 1 (add_search migration comment recommends Reindex) — controller rewrote the comment only (no schema change) — same D1-unsafe action this wave removed — cost if wrong: none. Hiding the admin Reindex button is parked to Stage 10's device/admin checks.
- concern 2 (editor edits to playbackId/info/createdAt now show under Differs) — accept; Differs is informational, and during cutover the runbook treats any Differs on a rerun as a failure.
- concern 3 (git message match under LC_ALL=C) — accept; fails closed.
- re-review M1-M4 fixed by controller in one commit — M1 anchor git match at ^fatal: (fail-open corner; no test, since reproducing needs dubious-ownership git), M2 runbook staging caveat on the zero-search-doc premise, M3 Mismatches exception for Failed-category gestures, M4 doc drift — cost if wrong: wording only.
