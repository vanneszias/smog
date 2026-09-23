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
  possible at all. The old stack can still create them (section 2 says how),
  so they are counted the day before and again at the freeze. **If the export
  on the day has any, the window is aborted** (section 3, steps 2 and 4):
  there is no path for accounts, lists or sponsorships from Convex to
  Payload, by design.
- **Favourites** in Convex belong to users that no longer exist (5 rows in the
  rehearsal); they are dropped and counted in the report.
- **Consent is not imported** (decided 2026-09-22): every visitor sees the
  consent banner once on the new site.
- **Sign-in changes.** The legacy stack signs in through WorkOS; `apps/site`
  has its own accounts (email and password, optionally Google). Nobody carries
  a session across.
- **Old deep links break.** If the address stays the same (decision 2), the
  address itself keeps working, but links into the old web app do not:
  `/gestures/<id>` carried a Convex id, and the new site does not look those
  up.

## 1. Decisions that must be made before a date is set

None of these is in the repository, and each blocks the window. Record the
answer next to each item when it is made.

1. **The Cloudflare API token that was exposed has been rotated**
   (checklist, "Before you start", item 1). Blocks everything below.
2. **The production address, and exactly how it switches — decided
   2026-09-23: `app.smog.vlaanderen`, served as a Cloudflare for SaaS custom
   hostname on the `zias.be` zone.** `smog.vlaanderen` cannot be moved into
   the Worker's Cloudflare account (its DNS owner can add records, not
   transfer the zone), so a Workers custom domain is not possible. Instead
   `zias.be`, which is in the account, is the SaaS zone, and the DNS owner
   points `app.smog.vlaanderen` at it with a CNAME. Custom hostnames are
   available on every plan, the first 100 free
   ([docs](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/)).
   **Set up well before the window**, in the `zias.be` zone:
   - **Enable Custom Hostnames** (SSL/TLS → Custom Hostnames).
   - **Create the fallback origin**: an originless, proxied record
     `smog-origin.zias.be AAAA 100::`, and set `smog-origin.zias.be` as the
     fallback origin. The Worker answers, so the address never reaches it
     ([Workers as your fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)).
   - **Add the custom hostname `app.smog.vlaanderen`** with TXT validation.
     Cloudflare shows an ownership TXT record and a certificate-validation
     TXT record. **Ask the DNS owner to add both** now, while `app` still
     points at the legacy host; both only prove control and change no
     traffic. Wait until the hostname and its certificate show **Active**.
   - **Prepare the route commit** and keep it on its own branch, on top of the
     release tag, until the switch (section 3, step 8): in `env.production`
     of `apps/site/wrangler.jsonc`, add
     `"routes": [{ "pattern": "app.smog.vlaanderen/*", "zone_name": "zias.be" }]`
     and change `vars.SITE_ORIGIN` to `https://app.smog.vlaanderen` **in the
     same commit** (the checklist's "Open items" says why). The route is
     scoped to the one hostname, never `*/*`, so nothing else on `zias.be`
     (such as `analytics.zias.be`) is captured. Deploying `main` with it
     would only matter once DNS points here, but keep it off `main` anyway so
     the switch is one deliberate step.
   - **Book the DNS owner for the window.** The switch and the un-switch are
     both their changes, not ours.
   - **Switch:** deploy the route branch, then the DNS owner **replaces the
     `app` record with `app.smog.vlaanderen CNAME smog-origin.zias.be`**. The
     DNS change is the switch; the deploy alone changes nothing public.
   - **Un-switch:** the DNS owner restores the legacy `app` record exactly as
     it was (write down its type, value and TTL before the window). Then
     revert the route commit and redeploy, so `SITE_ORIGIN` is not left on an
     address the Worker no longer serves.
3. **How the mobile app reaches existing users — decided 2026-09-23:
   `apps/mobile` takes over the existing store identity**, so existing
   installs update in place. Done in `apps/mobile/app.json`: name
   `SMOG & Co`, slug `smog`, owner `smog-and-co`, the existing EAS project id
   and update URL, bundle id and Android package `be.zias.smog`, Apple team
   `96XKP6MU2A`, version `3.0.0`, iOS build `51`, Android versionCode `79`.
   What is left for the operator:
   - **Check the real current numbers** in App Store Connect and the Play
     Console before the first store build; if either store already has a
     higher build or versionCode than 51 / 79, raise them in `app.json`
     (production builds then auto-increment from there).
   - **`apps/native` must never be built, submitted or published to again**
     (no `eas build`, `eas submit` or `eas update` from it): it now shares the
     identity and EAS project with `apps/mobile`, and an update published from
     it would reach the new app's installs only if fingerprints matched — do
     not find out.
   - The scheme stays `smogmobile`; `apps/mobile/src/lib/google.ts:19` and
     `apps/site/src/endpoints/oauth.ts:76` must stay identical. The old app's
     `smog://` links and its `app.smog.vlaanderen` universal links are not
     carried over (the new app declares no associated domains), so shared
     links open in the browser, on the new site.

   **The store build carries the final production address** in
   `EXPO_PUBLIC_API_URL` (checklist §6), because installs keep it for years.
   Until the switch that address still reaches the legacy host, so store
   reviewers see the old site or the maintenance page: give them reviewer
   notes that say so, with demo instructions. (The alternative, a store build
   against the `workers.dev` address, is reviewable at once but leaves every
   install on `workers.dev` until another store release.) Either way, allow
   for store review time: the build must be approved and held for release
   before the window, not submitted during it.
4. **Email can actually send — sender decided 2026-09-23:
   `no-reply@zias.be`** (`wrangler.jsonc` vars), because Email Service only
   sends from a domain in this Cloudflare account and `smog.vlaanderen` cannot
   be moved into it. Left: onboard `zias.be` to Email Service and let its
   records verify (checklist, "Launch blockers that are not variables"). Without it none of the site's three
   messages — the email-change confirmation, the sponsor re-edit link, the
   renewal reminder — leaves either environment.
5. **Analytics** — OpenPanel projects exist for production, or it is accepted
   that analytics is off at launch (checklist §1, §6).
6. **The privacy policy** EN/FR drafts have been professionally translated and
   legally reviewed; until then they are marked unreviewed on the site.
7. **Video rendering.** The Remotion submit transport is a stub (checklist,
   "Open items"). Either it is built and deployed, or launching without
   composed sponsor videos is an explicit decision.

## 2. Readiness, the week before

Every item that can be is done on **staging** first, and the result written
down.

- **Staging rehearsal of the whole import** with a fresh export, exactly as
  in **Import the catalogue → Staging rehearsal**, including a rerun. Time the
  apply: the window's length depends on it.
- **Production deployed and idle**, from the release tag (checklist, "First
  deploy, in order"), with every secret in the checklist's step 4 set — the
  rendering secrets only once rendering goes live:

  ```bash
  CLOUDFLARE_ENV=production bun -F site deploy:database
  CLOUDFLARE_ENV=production bun -F site deploy:app
  ```

  Serving at its `workers.dev` address
  (`https://smog-site-production.vanneszias.workers.dev`) with an empty
  catalogue harms nobody, and it moves the slow, error-prone part out of the
  window.
- **The first admin, immediately after that first deploy.** With no users,
  `/admin` shows Payload's create-first-user screen, and anyone who finds it
  can use it until a user exists. Create the operator's account there with
  Role set to Admin. Create the editors' accounts (also Admin: it is the only
  role that opens `/admin`) before go-live.
- **No Convex deploy to production** from the rehearsal until the window.
  `packages/convex/convex/schema.ts` defines `gesture_lists`, which production
  has never had; a deploy creates it and the importer refuses the export.
- **The refusal gate, the day before.** In the Convex production dashboard,
  read **row counts only** — never open rows — for `users`, `sponsorships`,
  `user_consents` and `adminLogs`, and confirm `gesture_lists` does not exist.
  Any non-zero count, or the table, aborts the window, so decide what to do
  now, not on the day. The old stack still writes them: every edit in the
  legacy admin writes `adminLogs`; the old app writes `users` for guests and
  on sign-in; the legacy sponsor form writes `sponsorships` before checkout.
  The same check runs again right after the freeze.
- **End legacy sponsor checkout at least a day before**: announce it, and
  stop it if you can (the repository has no switch for it). A sponsor caught
  mid-checkout by the freeze is stranded: the maintenance page 404s Mollie's
  success redirect (`/sponsors/success`) and errors its webhook POST
  (`/webhooks/mollie`), and a retry that reaches the new Worker after the
  switch is answered `200` and never recorded
  (`apps/site/src/endpoints/mollie.ts`).
- **The Convex export works on a paused deployment.** The window exports
  after pausing; prove it on a paused non-production deployment (pausing
  production would take the old app down). The production deploy key comes
  from the Convex dashboard; keep it in the password manager. Also confirm
  the dashboard still shows table row counts while paused. If it does not,
  take the window's row counts just before pausing, with the maintenance page
  already up; the dry run refuses the same tables either way.
- **The maintenance image is built the day before**, on the legacy host from
  `/opt/smog`: `docker compose -f maintenance/compose.yml build`. A build in
  the window is time with the site down. Its Caddy keeps certificates in its
  own volume, so its **first** start in the window fetches a new certificate
  for the legacy address — which works because the address still points at
  the legacy host at that point, and is one issuance against Let's Encrypt's
  weekly limit. Do not rehearse it by starting and stopping it repeatedly.
- **The cron ticks on production**: `[jobs] Ran N jobs from the default queue`
  in the Worker log across an hour boundary (checklist, step 8).
- **Email**: one real message received from production (for example an
  email-change confirmation to an operator's own address). Messages are
  queued and sent by the next job run, at the next `:00` tick; to send it
  sooner, run the queue by hand:

  ```bash
  read -rs JOBS_RUN_TOKEN     # from the password manager
  printf 'Authorization: Bearer %s\n' "$JOBS_RUN_TOKEN" |
    curl --max-time 600 -H @- \
    https://smog-site-production.vanneszias.workers.dev/api/jobs/run
  unset JOBS_RUN_TOKEN
  ```

  `printf` is a shell builtin and `-H @-` reads the header from standard
  input, so the token is in neither shell history nor the process list. The
  token was stored in the password manager when it was set (checklist, step
  4). If it was not, set a new one that way now.
- **Payments**: one full test-mode checkout on staging with a `test_` key,
  including the webhook moving the sponsorship to `pending_approval` (Mollie
  shows the payment `paid`). Production's `live_` key is set but not
  exercised until after the window.
- **Google sign-in**: the redirect URI for the **final** production address
  (`https://<address>/auth/google/callback`) is registered in Google Cloud,
  in addition to the `workers.dev` one.
- **Admin checks**: on production, the search collection's Reindex button
  answers with an error (it must — it empties the index on D1; see **Reading
  the report**). Deleting a single search entry by hand is refused — check
  that on staging, deployed from the same commit: production has no entries
  yet.
- **Device checks, in two builds.** (a) An internal build
  (`eas build --profile preview`, run in `apps/mobile`) with the EAS
  `preview` environment's `EXPO_PUBLIC_API_URL` set to
  `https://smog-site-production.vanneszias.workers.dev` (checklist §6;
  confirm in the build log which environment was loaded) — the store build's
  final address does not reach the new stack until the switch. On it: the
  consent banner lays out correctly on a small and a large phone and does not
  sit under a toast; sign-in survives an app restart; after **deleting and
  reinstalling** the app no previous session is silently reused from the
  keychain (iOS keeps keychain items across reinstalls). (b) Because decision 3
  took over the existing identity: the store candidate itself, through TestFlight
  and the Play internal testing track, installs as an **upgrade over the
  store's 2.0.2** and starts cleanly. It still reaches the legacy host, so
  check only the install and the start. An internal APK cannot do this on
  Android: its signing key differs from Play's.
- **Ask the DNS owner to lower the TTL of the `app` record** to 300 seconds
  at least a day before, so the switch and any un-switch propagate in
  minutes, and confirm the custom hostname and its certificate are still
  **Active** in the `zias.be` zone (decision 2).
- **Set the window's length** from the staging apply's measured time, plus
  one `deploy:app` build, plus up to 60 minutes if the email check waits for
  the `:00` tick.
- **Announce the window** to editors — they stop editing in the old admin
  before the day-before check, since each edit writes `adminLogs` — and, if
  there is a channel for it, to users.

## 3. The window, in order

Roles: one operator at the keyboard, one person checking. Stop at any step
whose check fails and go to section 4. Steps 0–6 test everything that can be
tested against production's `workers.dev` address — the same Worker and the
same D1 the real address will serve — while the public sees the maintenance
page. Step 7 decides; step 8 moves the address, and is where rollback stops
being free.

0. **Check out the release tag** that production was deployed from in
   section 2 — not the route branch. The importer runs from this checkout, so
   it must match what is deployed. Then `bun install --frozen-lockfile`, so
   the importer and `payload migrate` run the tag's dependencies, and:

   ```bash
   CLOUDFLARE_ENV=production bun -F site deploy:database
   ```

   It applies only pending migrations, so on the right tag it does nothing.
   If it applied anything, the deployed Worker is older than this checkout:
   run `CLOUDFLARE_ENV=production bun -F site deploy:app` too.
1. **Freeze the legacy stack.** On the legacy host, from the production
   checkout (`/opt/smog`):

   ```bash
   docker compose config --quiet
   docker compose stop web server remotion
   docker compose ps -a         # web, server, remotion: exited
   docker compose -f maintenance/compose.yml up -d
   ```

   `web` is the Caddy that holds ports 80 and 443 (`compose.yml`), so it
   stops first or the maintenance container cannot bind them. The
   maintenance page serves `/` only; every other path answers 404 and a POST
   errors. **The old native app writes to Convex directly** (`apps/native`
   calls Convex mutations for lists, favourites — its default list, not
   `user_favorites` — and account deletion, and creates Convex user rows for
   guests and on sign-in), so stopping the server is not enough: **pause the
   Convex production deployment** from the Convex dashboard. (The dashboard
   control is not in this repository — find it before the window.) Check:
   the legacy address shows the maintenance page, a deep link such as
   `/gestures` answers 404, and the old app can no longer load or save
   anything.
2. **Confirm nothing slipped in.** Repeat the refusal gate from section 2:
   row counts only. Any non-zero count, or a `gesture_lists` table, aborts
   the window here (section 4). In the Mollie dashboard, look for legacy
   payments open or paid since checkout ended: the legacy stack will never
   record them, so refund each by hand.
3. **Take a fresh Convex export**, after the freeze, to local disk outside
   any git repository (**Import the catalogue → Preconditions**). From
   `packages/convex` (the Convex CLI needs its `package.json`):

   ```bash
   read -rs CONVEX_DEPLOY_KEY && export CONVEX_DEPLOY_KEY
   npx convex export --prod --path /absolute/path/to/convex-export.zip
   unset CONVEX_DEPLOY_KEY
   unzip /absolute/path/to/convex-export.zip \
     -d /absolute/path/to/convex-export
   ```

   The CLI warns that it is ignoring `--prod` and using the deployment from
   `CONVEX_DEPLOY_KEY`: the key decides, so it must be production's.
4. **Dry run** it against production (**Import the catalogue → Production**).
   Check the banner (target, `smog-production (remote)`, paths) and that the
   planner does not refuse. **Any refusal aborts the window** — the four
   tables, `gesture_lists`, duplicate `_id`s, malformed rows, a missing table:
   unfreeze (section 4) and decide what to do before rescheduling. The dry
   run prints only the skipped count; the list comes with the report.
5. **Apply** it, then read the report (**Reading the report**). Check: exit
   code 0; the CLI prints
   `Verification passed: 0 incomplete, 0 mismatches.`; the report's
   Verification section says **Passed.**, and the report has no `### Failed`
   section and no "Differs from the export" rows. Otherwise follow **If
   verification fails**; a rerun is always safe. Then re-read the report's
   "Needs editorial action" list. Fixing those gestures (**After the import:
   the editorial task**) can wait until after the window — they are missing
   from the site, not broken on it.
6. **Smoke checks on the `workers.dev` address**, in a private window, with
   `bunx wrangler tail --env=production` running from `apps/site`:
   - the home page, a category, a gesture page with its video, and search in
     Dutch and French;
   - sign up with a new address, sign out and back in, and sign in with
     Google; change that account's email address and receive the
     confirmation message (sign-up itself sends no email). It goes out at the
     next job run: wait for the `:00` tick, or run the queue by hand as in
     section 2;
   - add and remove a favourite; create a list and open its share link while
     signed out;
   - the consent banner appears once and is remembered;
   - the Worker log shows no errors while doing the above.
   A live checkout is not part of the window: it takes real money.
7. **Go / no-go.** Decide with the person checking. This is the last point at
   which rollback costs nothing (section 4): after the next step the public
   can sign up, save and pay on the new stack.
8. **Switch the address.** Check out the route branch (decision 2) —
   `git checkout <route-branch>` — then:

   ```bash
   CLOUDFLARE_ENV=production bun -F site deploy:app
   ```

   That adds the route and the new `SITE_ORIGIN`; nothing public changes yet.
   Then the DNS owner replaces the `app` record with
   `app.smog.vlaanderen CNAME smog-origin.zias.be`. **That DNS change is the
   switch. From here, rollback is not free.**
9. **Checks that need the real address**, from a network that has not cached
   the old record: the address serves `apps/site` over HTTPS, and Google
   sign-in works on it.
10. **Release the mobile app** that was approved ahead of time, **to 100% at
    once**: no Android staged rollout, and iOS phased release off. The old
    app stopped working when Convex was paused; holding the new one back
    protects nobody.
11. **Merge the route branch into `main`**, so the next deploy from `main`
    keeps the address and `SITE_ORIGIN`.
12. **Leave the legacy stack frozen** — maintenance page up, `web`, `server`
    and `remotion` stopped, Convex paused — and do not delete anything
    (section 5).

## 4. Rollback

**Unfreeze**, in this order, so the old stack is whole before anyone reaches
it:

1. Unpause the Convex production deployment.
2. On the legacy host, from `/opt/smog`:

   ```bash
   docker compose -f maintenance/compose.yml down
   docker compose start server remotion web
   ```

3. After the switch only: un-switch the address (decision 2).

**Before the address switch (section 3, step 8): free.** Only the import and
the operators' own checks have written to production. Unfreeze, and tell
editors they can edit again. Then **empty the production catalogue before
the next attempt**: editors' changes in the meantime would surface as
"Differs from the export" rows, a failure on production, and their deletions
would linger. Recreate the database rather than deleting rows — Payload
spreads a gesture across locale, relationship and search tables, and a
hand-written `DELETE` is easy to get wrong. From `apps/site`:

```bash
bunx wrangler d1 delete smog-production
bunx wrangler d1 create smog-production   # answer no to adding it to the config
```

Put the new id in `env.production.d1_databases[0].database_id` in
`apps/site/wrangler.jsonc`, in a reviewed commit on `main`; tag it as the new
release and rebase the route branch onto it. Then:

```bash
CLOUDFLARE_ENV=production bun -F site deploy:database
CLOUDFLARE_ENV=production bun -F site deploy:app
```

(the Worker binds the database by id). The create-first-user screen is open
again: create the operator's admin account immediately, then the editors'
(section 2). This is allowed only while nothing but the import and the
operators' checks has written to the database: before the switch.

**After the address switch: not free.** The public can sign up, save and
pay, and all of it exists **only in Payload**: nothing in `apps/site` or
`apps/mobile` writes to Convex, and there is no reverse sync. Before rolling
back, list in the admin the accounts that are not operators' and every
sponsorship created on production. Any sponsorship still `pending_payment`,
or whose Mollie payment is `paid`, needs a refund decision in Mollie before
the address moves back. Then unfreeze, including step 3. Otherwise, fix
forward. Taking the site down while fixing forward has no mechanism yet —
undecided; one option is a Worker route on the address serving a static
page. Decide it before the window.

## 5. After the window

- **Next day:** the cron has ticked every hour (Worker log or Workers Logs);
  no `[jobs] Recovered stranded jobs` line, or if there is one, find out why
  the run was killed (checklist, step 8); renewal and expiry jobs are
  queued.
- **The first real sponsorship** is watched end to end: checkout, webhook,
  `pending_approval`, visible in the admin. There is no payment-confirmation
  email.
- **Admins work only on the final address.** Links in email-change and
  re-edit messages use the host of the request that queued them (`req.origin`
  in `apps/site/src/endpoints/account.ts` and
  `apps/site/src/hooks/queueReEditEmail.ts`), so a re-edit started on the
  `workers.dev` address sends the sponsor there.
- **Keep the legacy stack frozen, not deleted, for 30 days**: the host with
  the maintenance page, and the paused Convex deployment. It is the only copy
  of anything the import did not carry.
- **Store the final Convex export encrypted and offline**, and delete every
  other copy (including the rehearsal copies). It contains personal data.
- **Decommission on dates written down at go-live:**
  - the encrypted export: destroyed after its retention period — 90 days
    proposed, a decision to confirm;
  - after the 30-day hold: delete the Convex production deployment and the
    legacy host's `redis_data` volume (`compose.yml`);
  - revoke the legacy secrets: WorkOS, SMTP and IMAP, the Convex deploy key,
    `INTERNAL_API_KEY`, `REMOTION_API_KEY`, and the Mux tokens only if the
    new stack does not share them; delete the WorkOS users and application.
- **Then delete the legacy code** from the repository (`apps/server`,
  `apps/web`, `apps/native`, `packages/convex` and the packages only they
  use), in its own reviewed change — the spec's last step for Stage 10.
  Delete `apps/remotion` only once its compositions have moved to the
  planned render app (`apps/render` in the spec): it is their only copy.

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

1. **Freeze writes on the old stack** — section 3, step 1: `web`, `server`
   and `remotion` stopped, the maintenance page up, and the Convex
   deployment paused.
2. **Take a fresh Convex export**, after the freeze, so nothing an editor
   did on the old stack is missing from it.
3. **Dry run** that export against the target and check the banner.
4. **Apply** it.

The counts may differ from the 2026-09-22 rehearsal (27 categories, 492
gestures, 4 skipped, 5 favourites dropped); a different count alone is not a
reason to stop. But in this repository's legacy code every admin edit also
writes an `adminLogs` row, which the planner refuses, so any editing since
the rehearsal shows up in the day-before row counts (section 2), not as
drift on the day. The gates are the ones that do not depend on old numbers:
the planner's refusals (it will not plan an export with users,
sponsorships, consents, admin logs, a `gesture_lists` table, duplicate
`_id`s, malformed rows or a missing table), and re-reviewing the
skipped-gestures list the dry run's `skipped` count stands for, which the
apply's report names in full (a dry run writes no report).

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
