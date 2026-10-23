# Cutover runbook

How production replaces the old system (Convex + WorkOS + `app.smog.vlaanderen`) with the Cloudflare rewrite, and how the old data moves. Setup of the accounts, secrets and stores is `docs/deployment.md`; the owner's ordered to-do list is "Owner actions in order" in `docs/PROGRESS.md`. This file is the T-minus timeline, the domain decision, and the commands of the importer, `@smog/migrate-convex` (`bun run migrate:convex <command>`).

**Rules that hold for every step.**
- **Nothing here is automatic.** The importer touches D1, KV, Mux or Queues only through the commands below; `mux renditions` and `we-moved` are **dry without `--apply`**, and `apply` is dry **only with `--dry-run`** (`apply --reset-only` too: `--dry-run` shows what it would delete): on staging and dev a plain `apply` writes at once, and production additionally needs `--yes`. Always run the dry form first; it prints exactly what it would run.
- **Every path option is absolute.** `bun run migrate:convex` runs from `packages/migrate-convex`, not where you typed it; a relative path is refused.
- **The commands that run on your machine need credentials in the shell**, never in a file: wrangler's own login or `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for `apply` and `we-moved`; `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` for the two `mux` commands.
- **The real Mux and Cloudflare Queues HTTP APIs were never called by the tooling** (the session had no credentials; the suite runs against fakes). **The first owner dry runs are the live check**: `mux scan` and `we-moved` without `--apply`. Read their output before anything is applied.

## 1. The domain decision (ruling 2)

Production's `SITE_URL` is **`https://smog-site-production.zias.workers.dev`** (the account's workers.dev host, as staging's shows). That is the **default launch origin** (spec §1: no custom domains yet). Production first deploys there **with maintenance on**, so provisioning, the migrations, the import and the admin check all happen before any public switch. The owner chooses between two paths, and nothing in the code, the checks or the tests assumes either.

### Path W: stay on workers.dev

- The old host `app.smog.vlaanderen` is left with the old server (or the owner points it at a forward). The new site lives only on its workers.dev origin.
- What breaks unless the old host forwards: the **printed QR codes** (`/gestures/<convexId>`, R-03), **old share links** (`/lists/<token>`, R-05), the **emailed re-edit links** (`/sponsors/re-edit?token=…`, R-15) and the **in-flight Mollie webhooks** (`<old origin>/webhooks/mollie`, spec §15). The new site answers all of these paths (`/gestures/<convexId>` and `/lists/<token>` as they were, the re-edit link by a redirect to the fragment form (see the next point), and the webhook alias), but only **on the new origin**.
- **Forwarding options.** (a) A **Cloudflare Redirect Rule** if the zone is on Cloudflare: `https://app.smog.vlaanderen/*` → `https://smog-site-production.zias.workers.dev/${1}`, status 301, **preserving the query string** (an old re-edit link carries its token in the query, and the new site moves it into the URL fragment `/sponsor/edit#token=…` with a `302` and `Cache-Control: no-store`; **a forward that drops the query loses the token**). New links the site emails carry the token in the **fragment** (`/sponsor/edit#token=…`, `/sponsor/renew#token=…`), which no server and no log sees: **check once with a real mailbox that a link scanner (for example Outlook Safe Links) keeps the `#token=`** before the first real sponsor email. (b) Otherwise the **old Caddy**: a `redir` for everything except the webhook. **Do not rely on a redirect for the Mollie webhook**: whether Mollie follows one is not verified. Proxy `/webhooks/mollie` instead (Caddy: `reverse_proxy /webhooks/mollie https://smog-site-production.zias.workers.dev { header_up Host {upstream_hostport} }`). The safety net if a webhook is lost: the hourly stale sweep asks Mollie about every open payment, and `paymentStatus` re-fetches an `open` one when its return page is opened.
- Mobile: the production build points at the workers.dev origin (`PRODUCTION_LAUNCH_ORIGIN`). Universal and app links belong to that host.

### Path D: move to `app.smog.vlaanderen`

A prepared **domain commit**, **documented here as a diff and not committed**:

```diff
--- a/apps/site/wrangler.jsonc   (env.production)
+++ b/apps/site/wrangler.jsonc
     "production": {
+      "workers_dev": true,
+      "routes": [{ "pattern": "app.smog.vlaanderen", "custom_domain": true }],
       "vars": {
-        "SITE_URL": "https://smog-site-production.zias.workers.dev",
+        "SITE_URL": "https://app.smog.vlaanderen",
--- a/apps/mobile/eas.json   (build.production.env)
+++ b/apps/mobile/eas.json
-        "EXPO_PUBLIC_API_URL": "https://smog-site-production.zias.workers.dev",
-        "EXPO_PUBLIC_SITE_HOST": "smog-site-production.zias.workers.dev"
+        "EXPO_PUBLIC_API_URL": "https://app.smog.vlaanderen",
+        "EXPO_PUBLIC_SITE_HOST": "app.smog.vlaanderen"
--- a/packages/config/src/constants.ts
+++ b/packages/config/src/constants.ts
-export const PRODUCTION_LAUNCH_ORIGIN =
-  "https://smog-site-production.zias.workers.dev";
+export const PRODUCTION_LAUNCH_ORIGIN = "https://app.smog.vlaanderen";
```

- **Proved here, not committed.** With exactly this diff applied (and reverted after), `scripts/release-config-check.ts` is `ok` with no warning, `bun test scripts` and the mobile `app-config` tests pass, `check-deploy-config --env production --offline` then lists only the placeholders that are always open before launch (Turnstile site key, `R2_ACCOUNT_ID`, the KV and D1 ids), `ensure-cloudflare-resources` takes the domain as the CORS origin, and a production `wrangler deploy --dry-run` accepts the `custom_domain` route and `workers_dev` (the built `wrangler.json` carries both). No test or check assumes either path (the tests that read the real files derive the production origin from them).
- It is a normal change on `develop`, and reaches `master` only through `develop`, so **the T-0 window contains two full CI runs** (the three lanes and the seven e2e shards; one for `develop`, one for `master`).
- `PRODUCTION_LAUNCH_ORIGIN` equals production's `SITE_URL` on path W. On path D the owner may move `PRODUCTION_LAUNCH_ORIGIN` and `eas.json`'s production URL **earlier** (before T-14) for an app review on the domain (the options below); `release-config-check` then only **warns** while it differs from `SITE_URL`.
- `workers_dev: true` keeps the workers.dev host answering during the alias window and makes a rollback a one-line revert; set it to `false` once nothing needs it. Requests on the workers.dev host fail the origin check of mutating calls (`SITE_URL` is the domain), which is fine for a host nobody should use.

**The checklist.** Every line is a precondition of the commit reaching `master`:

1. **The zone `smog.vlaanderen` is on Cloudflare** (a Custom Domain needs it). The Email Service onboarding (`docs/deployment.md`) wants the zone's DNS too.
2. **The old `A`/`CNAME` for `app.smog.vlaanderen` is deleted in the same window.** A Custom Domain cannot attach while a DNS record exists for the name; the deploy fails otherwise. Write the old record down first (rollback).
3. **B4: the bucket's CORS first.** Before the domain commit is merged, run `wrangler r2 bucket cors set smog-production-media --file cors.json --force` with **both** origins in `allowed.origins` (the JSON shape is in `docs/deployment.md`). Otherwise `ensure-cloudflare-resources` fails the deploy on the CORS drift (it never overwrites a CORS, and checks only that `SITE_URL`'s origin is allowed).
4. **Turnstile:** the production widget's hostnames include **both** hosts (`docs/deployment.md`).
5. **Google and Apple:** the redirect URIs `<origin>/api/auth/callback/google` and `/apple` cover both hosts (the Apple return URL and domain too).
6. **Passkeys:** the passkey RP ID is the host (`new URL(SITE_URL).hostname`), so **admin passkeys made on workers.dev stop working** on the domain. Sign in by email code, then register the passkey again. Users who registered passkeys on the new site before the move (only admins, only on workers.dev) are the ones affected; migrated users have none.
7. **Better Auth's trusted origins follow `SITE_URL` automatically**; there is nothing to configure.
8. **Apple's AASA CDN refreshes after the switch**, so universal links lag (up to a day or more); the Android `assetlinks.json` is read on install and verification.
9. **Mollie:** the profile's website moves to the domain (T-0 step 11) **after the domain serves**.
10. **The `we_moved` email** derives its address from `SITE_URL`: on the domain the "new address" sentence is dropped (the origin equals the old one).

### The app review timing for each path (ruling 3)

Store review takes days and its length is outside our control, so the new builds are **in review before T-0** and **released at step 14**. Old 2.x apps stop working when the old API stops, so plan the release for the same day. The reviewer needs content, and production has none until the import: see "Review content" below.

- **Path W.** Review **and** release on the workers.dev origin, before T-0. The reviewer's demo account is a **member of production** (sign up with an email code; **not** the admin made by `admin:grant --create`, which would show the Admin menu) and **production must be out of maintenance** while the reviewer tests. Maintenance has no per-IP exception, so the runbook uses a **time-boxed window**: maintenance off for the days of the review, with the URL unannounced, then on again on "the day before" (section 5) before the deploy of the final commit (`bun run maintenance --env production on --yes`).
- **Path D** has three options:
  - **(a)** route only the **new paths** (`app.smog.vlaanderen/api/*`, `/gestures/*`, `/lists/*` … as the app needs them) to the Worker before the cutover, so the new build reviews on the domain while the old site still serves the rest of it. This needs the zone on Cloudflare and a route table that sits in front of the old origin; the old paths the old apps use must not be shadowed.
  - **(b)** switch the domain first and submit afterwards, **accepting the broken 2.x window** (the old apps fail until the new build is approved and users update).
  - **(c)** review on workers.dev (the path-W way) and ship a **second build** on the domain: one more review round, so the domain move is not a launch-day risk for the store.

**Review content.** Production's D1 is empty until the import, so a reviewer would see an empty catalogue (a likely rejection for minimum functionality). The importer cannot do a delta (it is insert-only, and `apply --reset` is refused on production), so **do not import early**. Instead, before the review window, create **a few demo gestures in the admin** (Mux direct upload, `admin` → Gestures) with names that **do not exist in Convex**, and **delete them before T-0 step 6**: the preflight refuses a slug that belongs to a native row, and `--native-catalog` is dev and staging only. Give the reviewer the member account in the review notes. **The cleanup covers more than the gestures:** (1) the demo **categories** too (the preflight checks category slugs for collisions as well; delete them in the admin after the gestures); (2) deleting a demo gesture **does not delete its Mux asset**: the asset is orphaned and billed, in the same production Mux environment as the real assets, so delete the demo assets in the Mux dashboard (note their asset ids when you upload them); (3) the reviewer's **favorites and lists** on the demo gestures cascade away with them, which is expected; and (4) do the cleanup before the Time Travel bookmark of step 6, so a restore does not bring the demo rows back.

### Mobile `SPONSOR_LINK_IN_APP`

Decided at the first iOS review: it ships `true`; if rejected under 3.1.1 or 3.1.3, set it to `false` in `apps/mobile/src/config.ts` and resubmit (`docs/deployment.md`).

## 2. Before T-14

All of `docs/deployment.md` for production that does not need the data: the token, the D1 and KV ids, the secrets, the Turnstile widget, the Mux environment, the Mollie profile, the Apple private-relay registration, the Email Service onboarding, the EAS setup and the store forms. And three things for the data:

- **The WorkOS export.** A WorkOS user export (dashboard → Users → Export; JSON or CSV with `id,email,first_name,last_name`). Convex stored the email only at creation; **the WorkOS email wins**, and a Convex user with no email in either is **dropped, losing their favorites and lists** (the report counts what is lost). Without the file, every user keeps the Convex address and names are empty. **Get the file.**
- **Refunds and chargebacks (M2).** The export has none: the old webhook ignored every Mollie status but `paid`, so a refund or chargeback made in the Mollie dashboard (a refunded rejected sponsorship, for example) is missing. Migrated payments start with `refunded_cents` and `charged_back_cents` at 0 until a later settle re-fetches them. **List the Mollie dashboard's refunds and chargebacks before cutover** and, after the import, record them by hand: admin → Sponsorships → the payment → **Record refund** (`admin.sponsorships.recordRefund`; it asks Mollie and records the refunded amount). A chargeback is flagged by the next settle.
- **`rejected` rows that Mollie never paid (M6).** The old `reject` had no API status check (only the UI limited it to `pending_approval`), so a row rejected through the API from an unpaid status imports with a `paid` payment. Unlikely; compare the rejected rows' Mollie ids against Mollie in the same pass as the refunds.

## 3. T-14: a real `plan` (report only)

**Surface the blockers while the old system is still live and fixable.** Nothing here touches the new system.

1. **Export a snapshot** from the old project (Convex dashboard → Settings → **Snapshot export**, or `npx convex export --path <file.zip>` from the old repo, with the production deployment selected; check `npx convex export --help` for the flag your CLI wants). The importer reads `<table>/documents.jsonl` and `_tables/documents.jsonl` and ignores `_storage/` (file storage is not migrated: logos and overlay images are dropped on purpose).
2. **Where it lives:** an **encrypted disk or folder outside the repository**, for example `~/smog-cutover/<date>/`, not a synced or shared folder (see "Personal data").
3. **Plan, report only:**

   ```bash
   bun run migrate:convex plan --export /abs/export.zip --target production \
     --out /abs/cutover/out --workos-users /abs/workos-users.csv --report-only
   ```

   Exit **0** means no blocker; **1** means blockers (the report is still written: `report.json` and `report.md` in `--out`). `--report-only` writes nothing else (no SQL). **The first run on a real export is also the proof that the reader matches reality** (M7): the tests only read ZIPs built with fflate and a hand-written fixture. Look for a `missingTable`, `noTableList` or schema blocker first: those mean the layout or a field is not what the fixture says. Report them before anything else.
4. **Read `report.md`.** The blockers come first. The ones with an owner path:
   - **`overlayOffender` (overlay text over 35 characters).** The text is what the sponsor paid for, so it is never truncated or substituted. The report lists each offender (legacy id, current `overlayText`, `sponsorName`, status, length). Fill **`overlay-overrides.json`** = `{ "<sponsorship legacy id>": "<new text, 1 to 35 characters>" }` (Zod-checked) and pass it with `--overrides`. Contact the sponsor where the text matters. **The report is personal data.**
   - **`blockingConflict`** (two blocking sponsorships on one gesture after mapping), **`checkoutMixedPayment`**, **`missingGesture`**, an account over **100 lists**, an invalid amount or email: **fix them in the old admin before the final export**, because they have no override. This is why T-14 exists.
   - Warnings to read (not blockers): `noEmail` (users dropped), `duplicateEmail` (merged), the private-relay count, the listed share links that will answer not found (the default list's tokens, edit tokens on lists without shared editing, old `/lists/<convexListId>` bookmarks), the gestures whose original video could not be restored, the VAT warnings, missing Mux ids.
5. **Store builds per the chosen path** (`docs/deployment.md`, EAS): build, submit for review, with the review notes and the demo member account.
6. Repeat the plan as the old data changes; the overrides file is reused.

## 4. T-7: the staging rehearsal

**Nothing real reaches staging** (a staging plan always pseudonymises), so no separate Mux environment is needed for safety. The rehearsal times the real thing and proves the tooling on real data.

1. **Plan for staging** (same export or a fresh one):

   ```bash
   bun run migrate:convex plan --export /abs/export.zip --target staging \
     --out /abs/rehearsal/out --workos-users /abs/workos-users.csv \
     --overrides /abs/overlay-overrides.json
   ```

   A staging plan keeps every count identical, with: every `user`, `sponsor` and `invoice_request` email as `<legacyUuid>@staging.invalid`, names as placeholders (`Gebruiker <n>`, `Sponsor <n>`), VAT `""`, `video_asset_id` and `gesture.mux_asset_id` NULL, tokens dropped and share tokens replaced. The overlay blocker still applies, so the rehearsal shows what production will block on.
2. **Staging must be in maintenance** (the preflight refuses otherwise): `bun run maintenance --env staging on`.
3. **Apply, dry first:** `bun run migrate:convex apply --env staging --out /abs/rehearsal/out --dry-run`, then without `--dry-run`. The first import on staging needs no `--reset`; to repeat it use `--reset` (below). **Time the preflight**: it runs one wrangler call per 300 values (slugs, share tokens, Mollie ids, addresses), so a real export is a few dozen calls. Note the elapsed time of each file too: the **import window** is the sum.
4. **Spot checks** (staging is behind Access: use an Access session, or a staging admin):
   - `apply-report.json` has every table `ok` (counts in D1 equal the report's); `more` is only a note, `missing` fails the run.
   - Search finds a migrated gesture; `/gestures/<convexId>` answers 301 to `/gestures/<slug>`; a migrated gesture with a sponsor shows the sponsor's video while `live`.
   - An old share link `/lists/<viewToken>` opens (staging tokens are replaced by deterministic ones: take one from the staging D1).
   - `/admin` sponsorships: statuses match the mapping; an `in_review` row opens.
   - The migrated addresses are `@staging.invalid`, so **no migrated staging user can receive a code**: a sign-in of a migrated account is proven by the integration suite, not here. To look around as an admin, make your own with `bun run admin:grant --env staging --create --yes <your address>` and sign in by code.
5. **Repeat with `--reset`, then prove `--reset-only`.** `bun run migrate:convex apply --env staging --reset --out /abs/rehearsal/out` deletes what this plan imports (`reset-imported-*.sql`, generated from the manifest), then applies it again: the counts must be the same. `--reset`'s preflight leaves out the plan's own rows (it reads the hash-checked reset files back), so a repeat no longer trips over the plan's own earlier import. **`bun run migrate:convex apply --env staging --reset-only --out /abs/rehearsal/out [--dry-run]`** (dev and staging; production refuses it) runs the reset files and **nothing else**: it prints the imported rows per table before and after, bumps `catalog:version` (the catalogue was deleted, so no cache may keep serving it) and ends with `reset_done` in `apply-report.json`; a second run removes 0. Staging must be in maintenance for it too. Run it at the end of the rehearsal to leave staging clean, and use it to wipe an earlier plan (below).
   - **Reset only right after a rehearsal, before anyone uses the staging data (M6).** The reset deletes in `RESTRICT` order and a remote `--file` run is **not one transaction**. A row created after the import on a migrated parent (a new `payment_item` on a migrated sponsorship, a new sponsorship on a migrated gesture, a new `payment` of a migrated sponsorship's renewal) makes the delete fail loudly **part-way**. If a reset fails, **re-run it after removing the rows it names**.
   - **`--native-catalog`** (dev and staging only, with `--reset`) also deletes the native catalogue rows whose slugs the plan uses. It **fails partway when native sponsorships or renewal payments reference those rows** (RESTRICT) and **cascade-deletes native favorites and list items pointing at the migrated gestures**. Order of cleanup: first the native sponsorships and payments on the colliding gestures (admin cancel/force expire, or SQL), then `--reset --native-catalog`. A dry run writes `reset-native-catalog.sql` into `--out` so you can read it first.
   - **Switching to a different export on one database.** Re-running `apply` against an import of a different export is **refused** (`slugTakenByOtherImport`, `legacyIdOnOtherAddress`, a share token or Mollie id on a foreign row): the preflight sees the earlier import's rows, with or without `--reset`, because `--reset` deletes only what *this* plan imports. The way to wipe an earlier plan is **its own plan folder with `--reset-only`**: `bun run migrate:convex apply --env staging --reset-only --out <old out>` (its preflight has no foreign-row checks, which would fail on the very rows being removed), then apply the new plan. By hand, the same effect is `bunx wrangler d1 execute DB --env staging --remote --file <old out>/reset-imported-001.sql` (and `-002` … if there are more), from `apps/site` (`apply --dry-run --reset-only` prints the exact command). Rows the earlier export had that the new one lacks go with that reset; nothing of another export stays.
6. **`mux scan`, `mux renditions` and `we-moved` are not part of the staging rehearsal**: they act on production's Mux environment and production's queue. Their live check is the first production dry run (T-0 steps 4 and 7, and 13); **you may run `mux scan` now** (it is read-only) with the low-priority token to see the counts early.
7. **Staging back out of maintenance:** `bun run maintenance --env staging off`.

## 5. The day before: production back under maintenance

All on workers.dev, even for path D. The public never sees it. **The first production deploy comes earlier in the owner's order** (`docs/PROGRESS.md`, step 7 is before the store builds): the app review of path W needs production up and out of maintenance for the review window, so the first deploy may be weeks before T-0. What this step does (the day before T-0) is bring production back to the final state: the Email Service live, maintenance on, the final commit deployed, the admin check repeated.

1. **The Email Service is live** for `smog.vlaanderen` (`docs/deployment.md`): production's sign-in codes need it (the first admin signs in by code).
2. **Production's maintenance key is on before the deploy** (before the first deploy ever, and again before the final one if the review window had it off): `bun run maintenance --env production on --message "…" --yes` (it writes the KV key `maintenance`; `on` keeps the bypass version). This needs the real KV id in `wrangler.jsonc`, not the Worker.
3. **The production deploy:** merge `develop` into `master` once `bun scripts/check-deploy-config.ts --env production` is clean and the legal sign-off is done. The deploy creates the queues and bucket (`SMOG_PROVISION_PRODUCTION=1`), applies the migrations and deploys. (The render image and the `SMOG_RENDER_PIPELINE` flag are gone, phase 10b task 9: there is nothing to build but the Worker.)
4. **The first admin:** `bun run admin:grant --env production --create --yes <email>`. It inserts the account (verified, admin, no password) when none has that email; with an existing account it is the plain grant. `--dry-run` prints the single-quoted `wrangler d1 execute` line first.
5. **The admin sign-in check.** On the production origin, `/sign-in` and the admin sign-in routes stay open during maintenance (a sign-in-only server: no sign-up, no reset, no email to an unknown address). Request an **email code** for the admin's address and sign in. Every other page still answers 503, so the admin gets the bypass cookie by hand: in the browser console on that origin run `fetch("/api/maintenance/bypass", { method: "POST" }).then((r) => r.json())` (the browser may ask you to type `allow pasting` first) (same-origin only; a signed-in admin only; it answers `{ expiresAt, bypassVersion }` and sets the 12-hour `smog_mx` cookie, valid until the window ends). Reload `/admin`: it opens. After that the admin settings page's **bypass card** renews the cookie (also while maintenance is off, so you can fetch one just before a window). If no code arrives, the Email Service onboarding is not finished. **Do the whole check in a private window**, the way the first real admin will.
6. **Mux:** the production webhook's signing secret is in `MUX_WEBHOOK_SECRET` (`docs/deployment.md`).
7. Wait for the **hourly cron** to run once: `wrangler tail --env production` shows `[cron] stale {…}` (and the other three crons at their times).

## 6. T-0, in order

Allow a half day. Keep `out/` and the export on the same disk, and **do not skip a dry run**.

1. **Old site maintenance, with the old `/webhooks/mollie` answering 503 from now on (risk 13).** The old server must put itself in maintenance and answer `POST /webhooks/mollie` with **503** from the moment of the export: Mollie retries a webhook that does not answer 200 (for how long, see Mollie's documentation: the half-day T-0 is meant to sit inside it, check that before relying on it), so a payment confirmed between the export and the cutover is delivered later to the alias on the new site. A **200 that ignores the call, or no answer from a dead host, loses it**. The change is on the old server, and the owner makes it (Caddy example: `respond /webhooks/mollie 503` in the site block).
2. **`npx convex export`** (or the dashboard snapshot): the **final** export, with the old site frozen. Note its path and hash (`sha256sum`).
3. **`plan --target production`, review, resolve, re-export if needed:**

   ```bash
   bun run migrate:convex plan --export /abs/final.zip --target production \
     --out /abs/cutover/out --workos-users /abs/workos-users.csv \
     --overrides /abs/overlay-overrides.json
   ```

   Read `report.md`: **zero blockers**. A new blocker since T-14 means a re-export after fixing it at the source (the old admin may still be usable under maintenance; if not, lift the old maintenance briefly).
4. **`mux scan`** (read-only) with a **low-priority Mux access token of the production environment**, created for the migration and revoked after:

   ```bash
   MUX_TOKEN_ID=… MUX_TOKEN_SECRET=… bun run migrate:convex mux scan \
     --export /abs/final.zip --out /abs/cutover/out --get-rate 1
   ```

   It looks up every playback id of the export and writes `mux-map.json` and `mux-scan.json` into `--out`. POSTs go at most 1 per second and GETs at `--get-rate` (default 2, at most 4); `--get-rate 1` matches a low-priority token's GET bucket. **Unknown playback ids** are listed on stderr and left out of the map: decide each one (a gesture whose video is gone has no Mux asset). It also counts the **old preview assets** (`previewVideoPlaybackId`): they stay in the production Mux environment, nothing in the new system uses or deletes them, and Mux keeps billing their storage (the owner may delete them in the Mux dashboard after the rollback window; see "After cutover").
5. **`plan --mux-map --overrides`** (the same command as step 3 plus `--mux-map /abs/cutover/out/mux-map.json`). Every gesture and sponsorship video now has its `mux_asset_id` / `video_asset_id`; a missing one is a warning.
6. **The rollback anchor, then `apply --env production --yes`.** The import is irreversible by the tooling (production refuses `--reset`; the hand-run reset file can fail part-way on RESTRICT order once anything references migrated rows, section 4), so **before `apply` record a D1 Time Travel bookmark and take an export**. From `apps/site`, with the production token in the shell:

   ```bash
   cd apps/site
   bunx wrangler d1 time-travel info DB --env production        # prints the current bookmark; --json for a file
   bunx wrangler d1 export DB --env production --remote --output /abs/cutover/pre-import-export.sql \
     --table <name> --table <name>                              # one --table per table, see below
   ```

   - **Write the bookmark down** (the `info` line "bookmark …", with the time) next to the export's path; it is the restore point and Time Travel keeps 30 days. `info --timestamp <RFC3339>` retrieves the bookmark for a moment, and `restore --timestamp` takes a moment directly (the two flags cannot be combined with `--bookmark`), so a forgotten bookmark is recoverable for any time before `apply` started.
   - **`wrangler d1 export` cannot export a database with a virtual table**, and `gesture_fts` is one (`docs/DATA_MODEL.md`): pass `--table` once per table you want (every table except `gesture_fts` and the `sqlite_`/`d1_` internals; `--no-schema` for data only), or skip the export and rely on Time Travel alone. The export is a convenience copy of the admin and native rows; **the bookmark is the anchor**. The export holds personal data: it goes to the same encrypted folder as `out/` and is deleted with it (section 9).
   - **The restore, if the import or the admin check goes wrong** (section 10): `bunx wrangler d1 time-travel restore DB --env production --bookmark <the bookmark>` (it asks to confirm, **overwrites all data in the database** and cancels in-flight queries; it then prints the previous bookmark, which undoes the restore itself: write that down too). It restores D1 only. It does **not** undo: the KV key `catalog:version` and the maintenance key (KV), anything in R2, Mux assets and renditions (step 7 is billable and stays), Queue messages, and **emails already sent**. After a restore, bump the KV key `catalog:version` (any new value; the next `apply` does it) so caches drop the restored catalogue, and keep maintenance on.

   Then:

   ```bash
   bun run migrate:convex apply --env production --out /abs/cutover/out --dry-run
   bun run migrate:convex apply --env production --out /abs/cutover/out --yes
   ```

   Read the dry run first: the preflight line (migrations, admins in D1, rows inserted, accounts **claimed** (an existing account, for example the `admin:grant --create` admin, is claimed by email, never overwritten), the **role differences** it reports and never changes), then the commands. The preflight **refuses** when: the migrations are below 0012; production's maintenance key is not `enabled` (`parseMaintenanceSetting`); an emitted slug belongs to a native row or to another import; an emitted share token or Mollie id is on a foreign row; an emitted address is held by an account with another legacy id; the import would leave **no admin**. **Delete the demo gestures first** (section 1). **Production refuses `--reset`**: the import runs once. A dry run writes `apply-report.json` into `out/` (and nothing to D1 or KV).
   - **Applying a plan of a different export is refused**: reset with the old plan folder's reset file first (section 4, point 5) and apply the new plan. On production this means a manual delete: ask before doing it.
   - **The import window:** while the files apply (`10-users` … `90-fts`), **D1 is briefly unavailable** (a remote `--file` is not one transaction and takes locks), and **the hourly cron may fail in that window** (the next run catches up; everything is idempotent). Under maintenance, that is fine. The files run in manifest order; each holds at most 500 statements and 512 KiB and is idempotent on its own, so **an interrupted `apply` is re-run as it is** (insert-only, `ON CONFLICT DO NOTHING`).
   - Then `catalog:version` is bumped and the counts are verified (`apply-report.json`: `files_applied`, then `ok`). **A `more` count is only a note** (rows added after the import make counts exceed the report's); on production it prints a `WARNING`, so look. A `missing` count exits 1.
7. **`mux renditions --apply`:**

   ```bash
   MUX_TOKEN_ID=… MUX_TOKEN_SECRET=… bun run migrate:convex mux renditions \
     --map /abs/cutover/out/mux-map.json
   MUX_TOKEN_ID=… MUX_TOKEN_SECRET=… bun run migrate:convex mux renditions \
     --map /abs/cutover/out/mux-map.json --apply
   ```

   It requests `static_renditions: highest` on every **resolved gesture asset** (the render pipeline that read these MP4s is retired, phase 10b task 9, and the wizard preview is an end card now: nothing in the app reads a static rendition any more, so **this step is optional**; skip it to save the Mux storage cost, or run it if you want the files for a later use). **Billable** (Mux stores one MP4 per asset): the dry run prints the count, the ids and the cost note, and reads each asset's state live. A ledger (`renditions-ledger.json`, beside the map) makes it resumable.
   - **An `errored` static rendition must be deleted first** (Mux dashboard, or the single-rendition DELETE API), or the re-request ends `failed` and the command **exits 1**. Re-run after deleting.
   - **`legacyMp4Conflict`** (Mux refuses a rendition on an asset that still has the deprecated `mp4_support`): the asset is never changed by the tool. **Decide per asset**: for example set `mp4_support` to `none` in the Mux dashboard (it drops the old MP4 files a running app might link, so decide), then re-run.
8. **The admin check** (the bypass cookie of section 5 step 5; it lasts 12 hours, so fetch a new one if the window ran long): `/admin` dashboard counts equal `apply-report.json`'s tables; open a sponsored gesture (it shows the sponsor's video while `live`); an `in_review` sponsorship opens; a migrated `rendering` or `render_failed` row is moved to `in_review` by the first hourly stale cron after the deploy (`[sponsorships] Moved … from a retired render state to in_review` in `wrangler tail --env production`; its trail shows `render_succeeded` with `retired`), and nothing is rendered: the sponsor's name and logo are an end card over the gesture's own video. A migrated row with a paid logo shows **no logo** on the end card (logos are not migrated; the admin detail says so). **Regenerate the renewal link for each migrated `expiring` sponsorship (M4)**: they have `reminder_sent_at` but no renewal token (the old reminder linked to the site), and the reminder sweep does not send again (`status.expiring` in the report counts them). **Record the refunds and chargebacks** you listed in section 2.
9. **Path D only: the domain.**
   1. **CORS for both origins** (checklist point 3), then the Turnstile hostnames and the OAuth redirect URIs (points 4 and 5).
   2. **Merge the domain commit** through `develop` (CI, staging deploys), then to `master` (CI, production deploys). Two full CI runs.
   3. **Delete the old DNS record** for `app.smog.vlaanderen` in the same window (checklist point 2); the deploy attaches the Custom Domain.
   4. Check `https://app.smog.vlaanderen/api/health` and `/sign-in` (the admin signs in again; the passkey is re-registered).

   **Path W only:** put the **forwarding on the old host** (section 1: the redirect for everything, the proxy for `/webhooks/mollie`) and lift the old site's 503 on the webhook only through that proxy.
10. **The Mux webhook repointed.** In the production Mux environment, the endpoint for `<SITE_URL>/api/webhooks/mux` exists (created before the first production deploy, `docs/deployment.md` §9); **remove the old endpoint** that pointed at the old system. If you could only keep one endpoint, change its URL now and `wrangler secret put MUX_WEBHOOK_SECRET --env production` with its signing secret.
11. **The Mollie profile website** is set to the production `SITE_URL`, **after the alias serves** (`POST /webhooks/mollie` answers on the new site): on path D after step 9, on path W after the forwarding. Mollie checks the profile's site, and payments created before the cutover keep the old webhook URL.
12. **Maintenance off:** `bun run maintenance --env production off --yes` (a new bypass version: every bypass cookie ends). Visitors follow within about 2 minutes.
13. **`we-moved --apply`** (E-13, the one-time "SMOG is verhuisd" email):

    ```bash
    CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bun run migrate:convex we-moved \
      --env production --out /abs/cutover/out
    ```

    **Run it once**, **from the cutover `out/`** (its ledger `we-moved-ledger.json` lives there) and **from a checkout of the deployed `master` commit**: it reads production's `SITE_URL` and the queue name from the local `apps/site/wrangler.jsonc`. A second run from another folder **more than 7 days later re-sends to everyone** (the consumer's KV `email:sent` markers expire after 7 days). The dry run prints the **address** (and whether the "new address" sentence shows), the **providers named** (from production's secret names: Google and Apple only when their pairs are set), the **counts** (banned accounts are excluded, and a placeholder address such as `@example.test` or `.invalid` aborts the run), the nl subject and one masked sample. **Confirm all of it**, review the nl/en/fr copy with the owner (it is under the legal and copy sign-off), then add `--apply`. The token needs Queues: Edit. It queues to `smog-production-email`; messages have `idempotencyKey: we_moved:<userId>`, at most 100 per batch and 256 KB. Revoke the token after.

    **Hard gate before step 14: the emails were delivered, not only queued.** The ledger records *queued*, not *delivered*: the tool pushes up to 400 messages a second, the consumer sends 10 per batch with 5 retries 30 s apart (`wrangler.jsonc`, `env.production.queues.consumers`), and a message that exhausts them lands in `smog-production-email-dlq` (and from there in **Dead letters**) **while the ledger already lists that user as done**, so a plain re-run of `we-moved` does **not** resend it (`--resend` or a dead-letter replay does). Cloudflare Email Service has its own send limits, and a freshly onboarded domain may be throttled: **check the current limits in the Email Service documentation before `--apply`** (nothing in the repository pins them) and, if they are below the account count, queue in parts (stop the run, check, re-run: the ledger resumes) rather than all at once. Then **do not release the stores until both hold**:
    1. **The queue is drained:** the dashboard (Workers & Pages → Queues → `smog-production-email` → Metrics) shows a backlog of **0**, and `wrangler tail --env production` has stopped printing sends. (`wrangler queues info` prints no backlog, only producers and consumers; the backlog is a dashboard metric.)
    2. **No open email dead letter:** admin → Dead letters shows none for `email` (and `smog-production-email-dlq` itself shows **0** messages in the dashboard: its consumer moves a message into D1 within seconds). The stored rows of messages without a secret hold recipient addresses: treat them as personal data (14 days retention).

    **If a message is dead-lettered** (phase 9: the DLQ consumers store each dead message in D1, so it is a screen, not a queue to pull by hand). Open **admin → Dead letters** (`/admin/dead-letters`; filter by queue and status): each row shows its queue, type, attempts, a short reason and its age, never its body. Read why first (`wrangler tail --env production`: the consumer's error line, for example a rate limit or a rejected address), fix the cause, then **Replay** the row (one at a time): replay re-queues the stored message under its **same idempotency key**, and the email consumer writes its `email:sent:<key>` marker only on success, so a message already delivered is dropped as a repeat (within 7 days) and a double click or a race sends one email. **Discard** a row you decide not to send (both are audited). A message that carries a secret has no stored body and **cannot be replayed**: `we_moved` carries no token, but sign-in codes and links of the same window do, and those users ask for a new code. If the failure was on the **tool's side** (the Queues API call failed, so the batch never reached the queue) use **`we-moved --resend`**: `we-moved --env production --out /abs/cutover/out --resend --failed` (dry first, then `--apply`) re-sends the batches recorded in `we-moved-failed.json`, and `--resend <ids-file>` (one user id per line, at most 200 per run) re-sends chosen ids. Both skip a user whose `email:sent:we_moved:<id>` marker exists, replace the ledger entry only when the new batch is accepted, and print ids, never addresses; **past 7 days the markers are gone**, so `--resend` warns for a key queued longer ago than that (a missing marker then means unknown, not undelivered). The daily `admin_dead_letter` digest email (to every admin) repeats the open count once a day. **Delay the store release until no email dead letter is open or you accept that those users find out from the store update**; the old 2.x apps stop working when the old API stops.
14. **The stores released** (App Store "release this version", Play promote the draft). The old 2.x apps stop working when the old API stops, and the email says the app needs an update.

## 7. The rejected-asset decision

**Old rejected videos are never purged automatically.** The daily purge deletes the Mux asset of a sponsorship whose **`rejected` event** is 30 days old or more (`REJECTED_VIDEO_RETENTION_DAYS`, at most 20 per night, a legal-sign-off item). A migrated `rejected` row has only the `legacy` event, so **the first night after the import deletes nothing**: those assets stay until the owner decides. Count them with `bun run retention --env production --dry-run` (the line "rejected videos without a rejected event (migrated, never purged)"), list them:

```bash
cd apps/site
bunx wrangler d1 execute DB --env production --remote --command \
  "SELECT id, video_asset_id, video_playback_id FROM sponsorship WHERE status = 'rejected' AND legacy_id IS NOT NULL AND video_asset_id IS NOT NULL"
```

and either delete the assets in the Mux dashboard and then clear the row's two columns (`UPDATE sponsorship SET video_asset_id = NULL, video_playback_id = NULL WHERE id = '<id>' AND status = 'rejected'`, through the same `wrangler d1 execute` call; the nightly purge does the same for a new rejection), or keep them. The same applies to a rejected row's `requestChanges`: for a migrated row the bound reads `data.legacy.reviewedAt`.

## 8. After the cutover

- **Watch**, with `wrangler tail --env production` and the dashboard, for the first days:
  - **`[mollie] legacy webhook path used`**: payments created before the cutover calling the alias. When it stops (and no payment created before the cutover can still be open), remove the alias.
  - **The dead letters** (admin → Dead letters; `smog-production-email-dlq` and `smog-production-sponsorship-events-dlq` are consumed into D1): the dashboard card shows the open count per queue and its oldest date, and the daily `admin_dead_letter` digest repeats it by email (`docs/deployment.md` §8a has the Cloudflare notifications). Replay or discard each one. No email dead letter may be open **before step 14** (the gate after step 13). Stored email bodies are personal data (recipient addresses) kept 14 days: do not paste them into tickets.
  - **The `[csp]` lines** (`[csp] violation { directive, blocked, document, … }`): a violation that is not an extension or a scanner is a real bug.
  - **A burst of `[sweeps]` stale lines in the first hour is normal (I4)**: old `pending_payment` rows with a Mollie id import as `awaiting_payment` / `open` whatever their age, and the first stale sweep asks Mollie about each one (`cancelled`/`canceled` for an unpaid one).
  - **A migrated payment paid within the last 6 days** whose Mollie webhook is called again can send the sponsor email (`paid_at` is the old `createdAt`, minutes before the payment, so the window is short); the suite pins the older case.
- **Remove the legacy alias at +30 days.** Delete `apps/site/src/routes/webhooks/mollie.ts` and its `EXEMPT_PATHS` entry in `apps/site/src/worker/maintenance.ts`, once the log check above is clean (a normal task).
- **The Apple client secret's rotation date**: put the secret's expiry (at most 6 months after you generated it) in the calendar with a 2-week reminder (`docs/deployment.md`).
- **The orphan preview assets (billing).** `mux scan` reported how many old preview assets (`previewVideoPlaybackId`) stay in the production Mux environment, unused and billed. Delete them in the Mux dashboard when the owner decides (after the rollback window).
- **The old system.** Keep the old Convex deployment, the WorkOS tenant and the old server until the rollback window closes and the owner is satisfied; then delete them, and delete the personal data below.
- **The `we_moved` follow-up:** private-relay users get mail only after Apple's registration; a bounce is expected until then.

## 9. Personal data: where it lives and when it goes

The Convex export, the WorkOS export, the plan folder (`out/`: `report.json`, `report.md`, the SQL files, `apply-report.json`, the ledgers) and the review notes hold **personal data** (emails, names, sponsor texts, tokens, VAT numbers). `report.md` says so on its first line.

- They live on **one encrypted disk or folder outside the repository** (`out/` and `*-ledger.json` are also gitignored under `packages/migrate-convex`, so a stray `git add` does not take them). Never paste them into tickets, chats or CI logs. The importer never logs an email, a token or a name, and `apply` prints no address (`apply-report.json` records the claimed addresses).
- **Deleted:** the **export ZIP and the WorkOS file** right after step 6's verification and the rollback window (proposed: **T+7 days**); the **`out/` folder after `we-moved` finished and its 7-day marker window passed**, and at the latest at the alias removal (**T+30 days**), since `we-moved` must run from it. The staging rehearsal's folder holds pseudonymised data only, but the report quotes real overlay texts if the offenders were not overridden: delete it with the others. Record the deletion dates in `docs/PROGRESS.md`.
- The old Convex and WorkOS data are deleted by closing those services, as above.

## 10. Rollback

- **The data's anchor is step 6's Time Travel bookmark** (the one you wrote down before `apply`): `bunx wrangler d1 time-travel restore DB --env production --bookmark <bookmark>` from `apps/site` puts D1 back before the import, **as long as the new site took no writes** (anything written after the bookmark is lost, so this is for before step 12). It does not undo KV (bump `catalog:version`; maintenance stays on), R2, the Mux renditions and assets, queue messages or emails already sent. It is the better route than the hand-run `reset-imported-*.sql`, which can fail part-way once anything references migrated rows. Then start again from a fresh plan.
- **Before step 9**, nothing has changed for users: lift the old site's maintenance and the 503 on `/webhooks/mollie`, put the old stores' builds back as the current ones (they were never released), and keep the old site. Production's D1 may keep the import; the next attempt starts from a plan of a fresh export and, since production refuses `--reset`, a manual delete with the reset file (section 4, point 5) or a new D1.
- **After step 9 on path D:** **revert the domain commit** (a normal change on `develop`, then `master`: `SITE_URL`, `eas.json`, `PRODUCTION_LAUNCH_ORIGIN` and the route go back; `workers_dev: true` keeps the Worker answering), **restore the old DNS record** (the one you wrote down), and put the old site out of maintenance. Detach the Custom Domain first if the deploy does not (the DNS record cannot return while it is attached).
- **After step 12 (the new site takes writes)** a rollback loses what happened on the new site (new sponsorships, favorites, sign-ups): decide with that in mind. The old data is intact in Convex.
- The stores: an unreleased build is withdrawn; a released one is replaced by a new build, which takes a review round.
