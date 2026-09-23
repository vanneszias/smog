# Catalogue cutover runbook

How to move production's catalogue (categories and gestures) out of the old
Convex export and into `apps/site`'s Payload database, using the Stage 9
importer (`apps/site/scripts/migrate-convex/`).

**Status: import steps only; Stage 10 extends this into the full cutover.**
The rest of cutover — DNS/origin switch, freezing and later unfreezing
writes on the old stack, the mobile release pointing at the new API, and
anything else Stage 10 finds — is not written yet.

## Import the catalogue

### Preconditions

- **The Cloudflare API token has been rotated** (`docs/deployment-checklist.md`,
  "Before you start", item 1). Nothing below is safe to run with the old
  token still valid.
- **`deploy:database` has already run for the target** (staging or
  production). The importer connects with `NODE_ENV=production` on those
  targets and expects a schema already migrated by `payload migrate`, not
  one it pushes itself — see the local-rehearsal note below for what
  happens if this is skipped.
- **The export lives on local disk, outside this repository** — and
  outside any other git repository too. The CLI refuses an export path
  inside this work tree or inside anything git recognises as a repository.
- **The report path is also outside every repository**, and is not a
  symlink. The report will contain public catalogue names — never user
  data — but still does not belong in git history.
- **Production only: a maintenance window, with writes to the old stack
  frozen.** The importer itself is safe to run at any time (dry run writes
  nothing; a rerun is idempotent), but the maintenance flag is a statement
  the operator makes before touching the production target at all, not
  just a write guard.
- **Production only: the target is empty.** Production has no catalogue
  before a big-bang cutover, so on `--target=production --apply` the CLI
  counts the categories and gestures already there without a legacy id
  (anything not written by this import) and refuses to write if that count
  is not zero.

### Order of operations at cutover

Always in this order, and never an older export:

1. **Freeze writes on the old stack.** (How is Stage 10's to write; the
   point here is only that it comes first.)
2. **Take a fresh Convex export**, after the freeze, so nothing an editor
   did on the old stack is missing from it.
3. **Dry run** that export against the target and check the banner.
4. **Apply** it.

The counts will almost certainly differ from the 2026-09-22 rehearsal (27
categories, 492 gestures, 4 skipped, 5 favourites dropped): editors kept
working on the old stack after it. That drift is expected and is not a
reason to stop. The gates are the ones that do not depend on old numbers:
the planner's refusals (it will not plan an export with users,
sponsorships, consents, admin logs, a `gesture_lists` table, duplicate
`_id`s or malformed rows), and re-reviewing the skipped-gestures list the
dry run's `skipped` count stands for, which the report names in full.

Credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_ENV`) are set up exactly as in
[`docs/deployment-checklist.md`](./deployment-checklist.md) — this runbook
does not repeat that.

### Staging rehearsal

Run from the repo root with `bun -F site` (absolute paths for `--export` and
`--report` — `bun -F site` runs the script from inside `apps/site`, so a
relative path resolves there, not from wherever you typed the command).
Dry run first:

```bash
CLOUDFLARE_ENV=staging bun -F site migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/staging-import-report.md \
  --target=staging
```

The banner is printed before anything connects. This is its exact shape
(the numbers are the fresh export's own):

```
Target:      staging
Database:    smog-staging (remote)
Mode:        dry run
Export:      /absolute/path/to/convex-export
Report:      /absolute/path/to/staging-import-report.md
Planned:
  categories  <n>
  gestures    <n>
  skipped     <n> (need editorial action)
  favourites  <n> dropped
Dry run: nothing was written. Rerun with --apply to import.
```

Check the target, the database (`(remote)`, and the right name) and the
paths. Do not compare the counts with the rehearsal's 27/492 — see
"Order of operations at cutover" above for why they drift and what the
real gates are. If the planner refused the export, it says why and
nothing ran; fix the export, not the importer.

On `--apply` the banner reads `Mode:        APPLY — this run writes`,
and after connecting the CLI adds two lines before it writes anything:

```
Already in the target: <n> of the categories, <n> of the gestures.
Already in the target without a legacy id: <n> categories, <n> gestures.
```

Once the dry run's banner looks right, apply it:

```bash
CLOUDFLARE_ENV=staging bun -F site migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/staging-import-report.md \
  --target=staging --apply
```

Timing: the local rehearsal on the real export took ~71 s for a full first
run (27 categories, 492 gestures) and ~12 s for an all-existing rerun.
Staging runs against the real remote D1 through a platform proxy, which
this project has not yet measured — expect it to be slower than local, and
budget accordingly rather than assuming the local number.

### Production

Same shape, with `--target=production` and the maintenance flag, which is
required whether or not `--apply` is present:

```bash
CLOUDFLARE_ENV=production bun -F site migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/production-import-report.md \
  --target=production --i-have-a-maintenance-window
```

Check the dry-run banner (target, database `smog-production (remote)`,
paths) exactly as for staging, then apply. The apply refuses to write if
the second "Already in the target" line is not zero on production:

```bash
CLOUDFLARE_ENV=production bun -F site migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/production-import-report.md \
  --target=production --apply --i-have-a-maintenance-window
```

### Reading the report

The report is Markdown, written to `--report` only on an `--apply` run.
Exit code is 0 when the run passed and non-zero when anything failed —
a failed category or gesture create, a gesture skipped because its
category failed, or verification not passing.

A category an earlier run left without its Dutch name (its create stopped
part-way) is listed under "Failed" on every rerun, with its document id
in the error, and every gesture that needs it is skipped rather than
linked to it. Delete that category by its id and rerun; the rerun creates
it and its gestures whole.

Under "## Verification":

- **"Incomplete — delete and rerun"**: a document in a state no legal save
  can produce — a create that stopped part-way, in this run or an earlier
  one. A gesture with no search entry at all has never been saved by an
  editor (the search plugin writes one on every save), so it is also
  compared with the export on every field the import writes, and any
  difference lands here. Each row carries the document's id and a Remedy:
  - **delete and rerun** — the importer never updates a document, so
    delete it in the admin by the id in the row and rerun the same
    command; the rerun creates it whole.
  - **re-save the gesture** — the gesture existed before this run and only
    its search entry is wrong (and, where it had none, every field still
    matches the export); open it in the admin and save it, which rebuilds
    that one entry and keeps any editor's work. Do not delete these.
- **"Mismatches"**: a planned document that is missing entirely, or one
  this run created whose name, categories, concepts, playback id, info,
  active flag or created date differ from the plan, or a count that
  disagrees. These fail the run and need investigation — they should not
  occur on a clean target.
- **"Differs from the export"**: the same comparison, but on documents that
  already existed before this run started. This does **not** fail the run.
  It belongs to the editors now — most likely someone changed it in the
  admin — the report just surfaces it so an operator can eyeball anything
  unfamiliar. **Except during the production cutover:** nobody edits then,
  so any "Differs" row on a production rerun is the import's own fault.
  Treat it as a failure: stop and investigate before going further.

**Never use the search collection's Reindex button on D1.** The search
plugin's reindex deletes every search entry in one unbounded statement,
which exceeds D1's cap of 100 bound parameters and leaves the search index
empty. Re-save the individual gesture instead.

**A rerun is always safe.** The importer looks every document up by
`legacyId` first and only creates what is missing; it never updates or
deletes a document it did not create. Re-running the exact same command
after a partial failure, a crash, or just to double-check, is the expected
way to converge — not something to avoid.

### If verification fails

- **Incomplete, "delete and rerun"**: delete that one document (by id, in
  the admin), then rerun the same `--apply` command. Do not delete
  anything else.
- **Incomplete, "re-save the gesture"**: open the gesture in the admin
  and save it. Do not delete it — it existed before this run and its
  fields match the export. Do not use the search collection's Reindex
  button (see above).
- **Mismatches**: stop and investigate before rerunning blind. A count
  disagreement or a missing planned document on an otherwise-clean run
  usually means the target was not what the banner said, or something
  else wrote to it concurrently.
- **Follow the Remedy column, including for documents from an earlier
  run.** A document a previous run left half-written is pre-existing on
  the rerun, and verification still reports it under "Incomplete" with
  "delete and rerun" — delete it by its id and rerun, exactly as for one
  this run created. The only pre-existing documents not to delete are the
  ones whose remedy is "re-save the gesture", and anything listed only
  under "Differs from the export".
- **"Differs from the export" on a production rerun**: nobody edits during
  the cutover, so the difference is the import's own. Stop and
  investigate; do not carry on as if it were an editor's change.

### After the import: the editorial task

The report's **"## Needs editorial action"** section lists, by legacy id
and name, every gesture the importer could not bring in because it fails
the new model's required fields — 4 rows in the 2026-09-22 rehearsal (2
with no category, 2 with no video/`playbackId`); the fresh export's list
may differ, so review it again rather than expecting those four.
Inventing a placeholder category or video was rejected when this was
planned; instead, after cutover, an editor opens each one in the admin and
adds what is missing (a category, or attaches a video) by hand. This is a
known, named post-cutover task, not a bug in the import.

### Local rehearsal note: local D1 must start empty

**Finding from the local rehearsal:** `--target=local` only works starting
from an **empty** local D1. With `NODE_ENV` unset (which is how `local`
runs), Payload dev-pushes its schema at init; pushing that over a database
already built by `payload migrate` fails with an error like
`index lists_items_order_idx already exists`. Staging and production run
with `NODE_ENV=production` (no push) after `deploy:database` has already
migrated the schema, so they are not affected by this — this only matters
for rehearsing locally.

To rehearse locally without disturbing an existing local database, move the
local D1 state aside, run, and restore it afterwards:

`--target=local` still needs `CLOUDFLARE_ENV=staging` — the only binding
set emulated on local disk — and `NODE_ENV` unset (or `development` /
`test`); the CLI refuses anything else.

```bash
cd apps/site
mv .wrangler .wrangler.rehearsal-backup   # only if .wrangler already exists
CLOUDFLARE_ENV=staging bun run migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/local-import-report.md --target=local
CLOUDFLARE_ENV=staging bun run migrate:convex \
  --export /absolute/path/to/convex-export \
  --report /absolute/path/to/local-import-report.md --target=local --apply
# ... inspect, rerun, whatever the rehearsal needs ...
rm -rf .wrangler
mv .wrangler.rehearsal-backup .wrangler   # restore what was there before
```

If there was no pre-existing `.wrangler` directory, skip the `mv` in and
just `rm -rf .wrangler` afterwards to leave a clean slate.
