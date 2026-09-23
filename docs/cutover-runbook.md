# Cutover runbook

The one-way switch from the legacy stack (`apps/server`, `apps/web`,
`apps/native`, Convex) to the Payload stack (`apps/site` on Cloudflare
Workers, `apps/mobile`). Big-bang, inside a maintenance window: the old stack
is frozen, the catalogue is imported, traffic moves, and the old stack stays
frozen.

**How to use this document.** Work top to bottom. Sections 1–2 happen days
before the window; section 3 is the window itself, in order; section 4 is the
only way back and says when it stops being one; section 5 is afterwards. The
catalogue import is its own section further down (**Import the catalogue**) and
is referenced from section 3 rather than repeated. Everything about secrets,
bindings and the first deploy lives in
[`docs/deployment-checklist.md`](./deployment-checklist.md); this runbook
assumes it has been completed for **staging and production**.

**Credentials are never pasted into chat, commits, files or shell history.**
Set them exactly as the checklist's "Before you start" says.

## What moves, and what does not

Read this before scheduling anything; it is what users will notice.

- **The catalogue moves** (categories and gestures, Dutch names, concepts,
  videos by Mux playback id), through the Stage 9 importer.
- **Nothing else moves.** The importer refuses an export that contains any
  `users`, `sponsorships`, `user_consents` or `adminLogs` rows, or a
  `gesture_lists` table (`apps/site/scripts/migrate-convex/plan.ts`). The
  2026-09-22 production export had none of those, which is why this is
  possible at all. **If the fresh export on the day has any, the import stops
  and the window is aborted** (section 3, step 3): there is no path for
  accounts, lists or sponsorships from Convex to Payload, by design.
- **Favourites** in Convex belong to users that no longer exist (5 rows in the
  rehearsal); they are dropped and counted in the report.
- **Consent is not imported** (decided 2026-09-22): every visitor sees the
  consent banner once on the new site.
- **Sign-in changes.** The legacy stack signs in through WorkOS; `apps/site`
  has its own accounts (email and password, optionally Google). Nobody carries
  a session across.

## 1. Decisions that must be made before a date is set

None of these is in the repository, and each blocks the window. Record the
answer next to each item when it is made.

1. **The Cloudflare API token that was exposed has been rotated**
   (checklist, "Before you start", item 1). Blocks everything below.
2. **The production address.** Recommended: serve `apps/site` at the legacy
   address, `app.smog.vlaanderen`, so existing links, bookmarks and the
   address sponsors know keep working. That needs the `smog.vlaanderen` zone
   in the same Cloudflare account as the Worker (a Workers custom domain), or a
   different address chosen instead. Whatever is chosen: add the `routes` /
   custom-domain entry to `apps/site/wrangler.jsonc` and change
   `env.production.vars.SITE_ORIGIN` to it **in the same commit** (the
   checklist's "Open items" says why).
3. **How the mobile app reaches existing users.** `apps/mobile` is currently
   a *different app* from the one in the stores: bundle id and Android package
   `be.zias.smog.next` versus `be.zias.smog`, scheme `smogmobile` versus
   `smog`, and no EAS project linked (`apps/mobile/app.json` versus
   `apps/native/app.json`). Nothing forces an update in either app. Options:
   - **(Recommended) Ship `apps/mobile` under the existing identity**
     (`be.zias.smog`, the existing EAS project and owner), with a version above
     the store's current one (`2.0.2`, iOS build 50, Android versionCode 78).
     Existing installs then update in place. This is a code change to
     `apps/mobile/app.json` and must keep the OAuth callback scheme in step
     with `apps/site/src/endpoints/oauth.ts` (`smogmobile://auth-callback`
     today), plus a rebuild and store review.
   - Ship it as a new listing, and use the old app's EAS Update channel
     (`apps/native/app.json` → `updates.url`) to push a JavaScript update
     telling users where the new app is, **before** the window.
   Either way, allow for store review time: the production build must be
   approved and held for release before the window, not submitted during it.
4. **Email can actually send.** The Email Service sending domain is onboarded
   and verified, and `EMAIL_FROM_ADDRESS` matches it (checklist, "Launch
   blockers that are not variables"). Without it no confirmation, email-change
   or renewal email leaves either environment.
5. **Analytics** — OpenPanel projects exist for production, or it is accepted
   that analytics is off at launch (checklist §1, §6).
6. **The privacy policy** EN/FR drafts have been professionally translated and
   legally reviewed; until then they are marked unreviewed on the site.
7. **Video rendering.** The Remotion submit transport is a stub (checklist,
   "Open items"). Either it is built and deployed, or launching without
   composed sponsor videos is an explicit decision.

## 2. Readiness, the week before

Every item is done on **staging** first, and the result written down.

- **Staging rehearsal of the whole import** with a fresh export, exactly as
  in **Import the catalogue → Staging rehearsal**, including a rerun.
- **Production deployed and idle.** `deploy:database` then `deploy:app` for
  production (checklist, "First deploy, in order"), with every secret set.
  Serving at its `workers.dev` address with an empty catalogue harms nobody,
  and it moves the slow, error-prone part out of the window.
- **The cron ticks on production**: `[jobs] Ran N jobs from the default queue`
  in the Worker log across an hour boundary (checklist, step 8). Any manual
  call to `/api/jobs/run` uses `curl --max-time 600`.
- **Email**: one real message received from production (for example an
  email-change confirmation to an operator's own address).
- **Payments**: one full test-mode checkout on staging with a `test_` key,
  including the webhook turning it `paid`. Production's `live_` key is set but
  not exercised until after the window.
- **Google sign-in**: the redirect URI for the **final** production address
  (`https://<address>/auth/google/callback`) is registered in Google Cloud,
  in addition to the `workers.dev` one.
- **Admin checks on production**: an admin account exists; the search
  collection's Reindex button answers with an error (it must — it empties the
  index on D1; see **Reading the report**); deleting a single search entry by
  hand is refused.
- **Device checks on the production mobile build** (a TestFlight / internal
  track build with `EXPO_PUBLIC_API_URL` set to production — checklist §6):
  the consent banner lays out correctly on a small and a large phone and does
  not sit under a toast; sign-in survives an app restart; after **deleting and
  reinstalling** the app no previous session is silently reused from the
  keychain (iOS keeps keychain items across reinstalls).
- **Lower the DNS TTL** of the production address to 300 seconds at least a
  day before, so the switch and any rollback propagate in minutes.
- **Announce the window** to editors (they must stop editing in the old admin
  at its start; anything edited after the freeze is lost) and, if there is a
  channel for it, to users.

## 3. The window, in order

Allow two hours. Roles: one operator at the keyboard, one person checking.
Stop at any step whose check fails and go to section 4.

1. **Freeze the legacy stack.** On the legacy host, from the production
   checkout (`/opt/smog`):

   ```bash
   docker compose stop server
   docker compose -f maintenance/compose.yml up -d
   ```

   The maintenance page takes over `app.smog.vlaanderen` (the web app and
   every legacy API route behind it). **The old native app writes to Convex
   directly** (`apps/native` calls Convex mutations for lists, favourites and
   account deletion, and creates Convex user rows on sign-in), so stopping the
   server is not enough: **pause the Convex production deployment** from the
   Convex dashboard. (The dashboard control is not in this repository — find
   it before the window.) Check: the legacy address shows the maintenance
   page, and the old app can no longer load or save anything.
2. **Take a fresh Convex export**, after the freeze, to local disk outside any
   git repository (**Import the catalogue → Preconditions**).
3. **Dry run** it against production (**Import the catalogue → Production**).
   Check: the planner does not refuse. **A refusal for users, sponsorships,
   consents or admin logs aborts the window** — unfreeze (section 4) and
   decide what to do about that data before rescheduling. Re-read the
   skipped-gestures list.
4. **Apply** it, then read the report (**Reading the report**). Check:
   `ok: true`, no Incomplete, no Mismatches. Follow **If verification fails**
   otherwise; a rerun is always safe.
5. **Editorial fixes** for the gestures the importer could not bring in
   (**After the import: the editorial task**) can wait until after the window
   — they are missing from the site, not broken on it.
6. **Point the production address at the Worker.** Deploy the commit from
   decision 2 (route plus `SITE_ORIGIN`) with `bun -F site deploy:app`, then
   move DNS. Check, from a network that has not cached the old record: the
   address serves `apps/site` over HTTPS.
7. **Smoke checks on the real address**, in a private window:
   - the home page, a category, a gesture page with its video, and search in
     Dutch and French;
   - sign up with a new address, sign out and back in, and sign in with
     Google; change that account's email address and receive the
     confirmation message (sign-up itself sends no email);
   - add and remove a favourite; create a list and open its share link while
     signed out;
   - the consent banner appears once and is remembered;
   - the Worker log (`bunx wrangler tail --env=production`) shows no errors
     while doing the above.
   A live checkout is not part of the window: it takes real money.
8. **Go / no-go.** This is the last point at which rollback costs nothing
   (section 4). Decide with the person checking. On "go": the window is over
   on the web.
9. **Release the mobile app** that was approved ahead of time (a phased
   release where the store offers one).
10. **Leave the legacy stack frozen** — maintenance page up, server stopped,
    Convex paused — and do not delete anything (section 5).

## 4. Rollback

**Before step 8 (go / no-go):** nothing has been written to the new stack
by users, so rollback is free:

1. Move DNS back (the lowered TTL makes this minutes) and revert the route
   commit if it was deployed.
2. On the legacy host: `docker compose -f maintenance/compose.yml down`, then
   `docker compose start server`.
3. Unpause the Convex deployment.
4. Tell editors they can edit again. The imported production catalogue can
   stay; the next attempt's import skips what is already there, or the
   production D1 can be emptied before trying again.

**After step 8:** every account, favourite, list, consent and sponsorship
created on the new stack exists **only in Payload**. Nothing in `apps/site` or
`apps/mobile` writes to Convex, and there is no reverse sync. Rolling back
then loses all of it, so the answer after go-live is to fix forward. If the
site must come down while that happens, put a maintenance response in front
of the Worker rather than reviving the legacy stack.

## 5. After the window

- **Next day:** the cron has ticked every hour (Worker log or Workers Logs);
  no `[jobs] Recovered stranded jobs` line, or if there is one, find out why
  the run was killed (checklist, step 8); renewal and expiry jobs are
  queued.
- **The first real sponsorship** is watched end to end: checkout, webhook,
  `paid`, confirmation email.
- **Keep the legacy stack frozen, not deleted, for 30 days**: the host with
  the maintenance page, and the paused Convex deployment. It is the only copy
  of anything the import did not carry.
- **Store the final Convex export encrypted and offline**, and delete every
  other copy (including the rehearsal copies). It contains personal data.
- **Retire the old app's store listing** if the mobile app shipped as a new
  listing (decision 3), after its users have had time to move.
- **Then delete the legacy code** from the repository (`apps/server`,
  `apps/web`, `apps/native`, `apps/remotion`, `packages/convex` and the
  packages only they use), in its own reviewed change — the spec's last step
  for Stage 10.

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

1. **Freeze writes on the old stack** — section 3, step 1: the server
   stopped, the maintenance page up, and the Convex deployment paused.
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
plugin's reindex first deletes every search entry; the statement that
follows binds one parameter per deleted id, exceeds D1's cap of 100, and
the plugin swallows that error and skips the rebuild — leaving the search
index empty (observed against a local D1, not just inferred). Re-save the
individual gesture instead. **Deploys that include this change refuse it:**
the search collection's `delete` access is `denyAll` (`payload.config.ts`),
and the Reindex handler refuses to start without it, so the button answers
with an error for every account. The same rule refuses deleting a single
search entry by hand; the entry for a deleted gesture is still removed
automatically.

The "delete and rerun" remedy for a gesture with no search entry rests on
that entry being proof nobody has saved it since the import. If the search
index was ever emptied — a Reindex, or search entries deleted in the admin,
both possible only on a deploy from before that change — that proof is
gone. This cannot happen on production before cutover (nothing is there
yet), but on a **staging** database that ran an older deploy, before
deleting a gesture flagged this way on a rerun, check with the editors that
nobody has changed it.

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
  else wrote to it concurrently. The one expected exception: gestures
  missing because their category is listed under "Failed" (a category left
  without its Dutch name) are resolved by that category's remedy — delete
  the category and rerun — not investigated separately.
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
