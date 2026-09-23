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
- **The export lives on local disk, outside this repository.** The CLI
  refuses an export path inside the git work tree.
- **The report path is also outside this repository**, and is not a
  symlink. The report will contain public catalogue names — never user
  data — but still does not belong in git history.
- **Production only: a maintenance window, with writes to the old stack
  frozen.** The importer itself is safe to run at any time (dry run writes
  nothing; a rerun is idempotent), but the maintenance flag is a statement
  the operator makes before touching the production target at all, not
  just a write guard.

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

The banner (printed before anything connects) must read:

```
Target:      staging
Database:    smog-staging
Mode:        dry run
Planned:
  categories  27
  gestures    492
```

— plus 4 gestures skipped (needing editorial action) and 5 favourites
dropped, both shown further down in the same summary. If any of those
numbers differ from what the plan expects, stop and find out why before
adding `--apply` — a different export needs a new plan, not a silent
partial import.

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

Check the dry-run banner (target, database `smog-production`, planned
counts) exactly as for staging, then apply:

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

Under "## Verification":

- **"Incomplete — delete and rerun"**: a document in a state no legal save
  can produce — a create that stopped part-way. Each row carries a Remedy:
  - **delete and rerun** — the importer never updates a document, so
    delete it in the admin (or by id) and rerun the same command; the
    rerun creates it whole.
  - **re-save or reindex the gesture** — the gesture existed before this
    run and only its search entry is wrong; saving it in the admin (or the
    search collection's Reindex) rebuilds that one entry and keeps any
    editor's work. Do not delete these.
- **"Mismatches"**: a planned document that is missing entirely, or one
  this run created whose name, categories, concepts or active flag differ
  from the plan, or a count that disagrees. These fail the run and need
  investigation — they should not occur on a clean target.
- **"Differs from the export"**: the same comparison, but on documents that
  already existed before this run started. This does **not** fail the run.
  It belongs to the editors now — most likely someone changed it in the
  admin — the report just surfaces it so an operator can eyeball anything
  unfamiliar.

**A rerun is always safe.** The importer looks every document up by
`legacyId` first and only creates what is missing; it never updates or
deletes a document it did not create. Re-running the exact same command
after a partial failure, a crash, or just to double-check, is the expected
way to converge — not something to avoid.

### If verification fails

- **Incomplete, "delete and rerun"**: delete that one document (by id, in
  the admin), then rerun the same `--apply` command. Do not delete
  anything else.
- **Incomplete, "re-save or reindex the gesture"**: open the gesture in the
  admin and save it (or use the search collection's Reindex action). Do not
  delete it — it existed before this run.
- **Mismatches**: stop and investigate before rerunning blind. A count
  disagreement or a missing planned document on an otherwise-clean run
  usually means the target was not what the banner said, or something
  else wrote to it concurrently.
- **Never delete a document that pre-existed this run** unless the report
  explicitly says to (it will not — pre-existing documents only ever show
  up under "Differs from the export", never under "Incomplete"). If in
  doubt, check whether the legacy id in question appears anywhere in the
  "Differs from the export" table first.

### After the import: the editorial task

The report's **"## Needs editorial action"** section lists, by legacy id
and name, every gesture the importer could not bring in because it fails
the new model's required fields — expected to be 4 rows (2 with no
category, 2 with no video/`playbackId`). Inventing a placeholder category
or video was rejected when this was planned; instead, after cutover, an
editor opens each one in the admin and adds what is missing (a category, or
attaches a video) by hand. This is a known, named post-cutover task, not a
bug in the import.

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

```bash
cd apps/site
mv .wrangler .wrangler.rehearsal-backup   # only if .wrangler already exists
bun -F site migrate:convex --export /absolute/path/to/convex-export \
  --report /absolute/path/to/local-import-report.md --target=local
bun -F site migrate:convex --export /absolute/path/to/convex-export \
  --report /absolute/path/to/local-import-report.md --target=local --apply
# ... inspect, rerun, whatever the rehearsal needs ...
rm -rf .wrangler
mv .wrangler.rehearsal-backup .wrangler   # restore what was there before
```

If there was no pre-existing `.wrangler` directory, skip the `mv` in and
just `rm -rf .wrangler` afterwards to leave a clean slate.
