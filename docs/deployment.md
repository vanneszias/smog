# Deployment

First-time setup of the three environments, in the order the owner does it. The switch-over from the old system (the domain decision, the data import, the timeline) is `docs/cutover-runbook.md`; the ordered list of everything the owner still has to do is "Owner actions in order" in `docs/PROGRESS.md`. Every command here was checked against the code (`--help`, `--dry-run` or the script's own header); a name that only a dashboard can confirm is marked **(dashboard)**: dashboards move, so read the label you see.

**Nothing in the repository holds a credential.** Secrets live in Cloudflare (`wrangler secret put`), in GitHub (environment secrets) and in EAS. The session that built this had none of them, so everything that needs one is an owner action.

## 1. The environments

| | `dev` | `staging` | `production` |
|---|---|---|---|
| Deployed from | your machine (`bun dev`, local Miniflare) | `develop`, every push, once CI passes (the four release-check lanes and the seven e2e shards) | `master`, the same way |
| Origin (`SITE_URL`) | `http://localhost:5173` | `https://smog-site-staging.zias.workers.dev` | `https://smog-site-production.zias.workers.dev` (the default launch origin), or `https://app.smog.vlaanderen` on path D (`docs/cutover-runbook.md`) |
| Worker | none | `smog-site-staging` | `smog-site-production` |
| D1, KV | local state | `smog-staging`, ids in `wrangler.jsonc` | `smog-production`, **ids are placeholders until step 4** |
| Queues, bucket | local | `smog-staging-*` (`-email`, `-email-dlq`, `-sponsorship-events`, `-sponsorship-events-dlq`, bucket `smog-staging-media`) | the same names with `production` |
| Mux | the fake (`@smog/video/testing/server`) | its **own** Mux environment | the **existing (old) production** Mux environment |
| Mollie key | the fake | `test_` | `live_` |
| Email | the KV mailbox at `/dev/mail` | Email Service, sender `info@smog.zias.be` | Email Service, sender `noreply@smog.vlaanderen` |
| CSP | enforced | `Report-Only` | enforced |

`deploy.yml` (`.github/workflows/deploy.yml`) runs, for the env of the branch: the secrets check, **Check deploy config** (`scripts/check-deploy-config.ts`), **Ensure Cloudflare resources** (`scripts/ensure-cloudflare-resources.ts`), the D1 migrations (`wrangler d1 migrations apply DB --env <env> --remote`), then `bun -F @smog/site deploy`. It first runs the whole of `ci.yml` as the `release-check` job, so a red commit never deploys. Without the `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` secret of that GitHub environment, **staging skips every step with a warning (the job is green and nothing is deployed) and production fails at its first step** (`Check Cloudflare secrets`), so create the `production` environment and both secrets before the first `master` push. **Never run a bare `wrangler deploy`**: the guarded script builds the workspace packages through turbo and the site for the env first (`CLOUDFLARE_ENV=<env> bun -F @smog/site deploy`).

## 2. The Cloudflare account and the token

One account holds both envs (the `zias` workers.dev subdomain). **Confirm that production deploys to that same account**: `zias` is the account's workers.dev subdomain, so another account would give another host and `SITE_URL` would change.

Needed on the account: the **Workers Paid** plan (Queues), and **R2 enabled** (dashboard → R2 Object Storage, once; otherwise `[code: 10042]`). Workflows and Containers are no longer used (the render pipeline is retired, phase 10b task 9).

**The deploy token** (a GitHub environment secret `CLOUDFLARE_API_TOKEN` per env, plus `CLOUDFLARE_ACCOUNT_ID`). Staging already deploys with its token, so start from the permissions it has; production's must cover the same list:

| Permission | Why |
|---|---|
| Account › Workers Scripts: Edit | `wrangler deploy`, `wrangler secret put` and **`wrangler secret list`** (Read, which Edit includes; the deploy config check needs it) |
| Account › Workers R2 Storage: Edit | the bucket, its CORS, and a deploy with an `r2_buckets` binding |
| Account › **Queues: Edit** | creating the queues and DLQs (Workers Scripts: Edit is accepted too), **and** the Queues HTTP API `we-moved` calls (a local token, below) |
| Account › D1: Edit | `wrangler d1 migrations apply` and the importer's `d1 execute` |
| Account › Workers KV Storage: Edit | the KV namespace binding, `wrangler kv key put` (maintenance, `catalog:version`) |

`scripts/ensure-cloudflare-resources.ts` stops with a `[provision]` line naming whichever of these is missing; nothing is created half way that a re-run would not finish.

The **`we-moved` command** (`docs/cutover-runbook.md`) runs on the owner's machine with its own short-lived token (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in the shell): **Queues: Edit** for `GET /accounts/:id/queues` and the batch POST, and D1 and Workers Scripts read access for the recipients and the provider names. Revoke it afterwards.

## 3. GitHub: secrets and variables

| Name | Kind and scope | Meaning |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets of each **environment** (`staging`, `production`) | without them a staging deploy skips with a warning (green, nothing deployed); a production deploy fails at its first step. The `production` environment and both secrets are created before the first `master` push (`docs/PROGRESS.md`, step 5.5) |
| `SMOG_REQUIRE_SECRETS` | variable of the **`staging` environment** (not the repository) | `1` makes staging enforce the deploy config check; without it staging only warns (`--warn-only`). A repository-level `1` would also make staging enforce, and production ignores it (production always enforces) |
| `SMOG_PROVISION_PRODUCTION` | repository variable | `1` lets the production deploy **create** the queues and the bucket; otherwise it only checks (`--check`) and fails with the exact commands. It refuses while `SITE_URL` is a placeholder (the four-label workers.dev rule) |

`SMOG_RENDER_PIPELINE` is gone: the build no longer reads it. **Owner: delete the variable** from the `staging` and `production` GitHub environments if you set it (it does nothing now, and `RENDER_MODE` is no longer a var either). Details: `docs/DECISIONS.md`, "Retire the render pipeline (phase 10b task 9)".

**Branch protection (owner, GitHub → Settings → Branches, for `develop` and `master`).** Require the status checks `Release check (core)`, `Release check (tests)`, `Release check (mobile)` and the seven `Playwright e2e (<shard>)` checks (`public`, `a11y`, `a11y-signed-in`, `a11y-reflow`, `admin`, `admin-a11y`, `serial`). Deploy's reusable call of `ci.yml` already waits for them, but a branch rule is what stops a red e2e shard from being merged on a pull request. The names are the job names in `.github/workflows/ci.yml` (`scripts/docs-check.test.ts` keeps the shard list in step).

## 4. D1 and KV (production)

`apps/site/wrangler.jsonc` `env.production` ships placeholders (`database_id` `00000000-0000-4000-8000-000000000000`, KV `id` of 32 zeros). The deploy config check refuses both. Create the real ones from `apps/site` and paste the ids into the file:

```bash
cd apps/site
bunx wrangler d1 create smog-production                  # prints database_id
bunx wrangler kv namespace create smog-production-kv     # prints id; the title is free
```

`wrangler d1 create` and `kv namespace create` may offer to add the binding to `wrangler.jsonc` (an unverified prompt): decline, and paste the printed ids into `env.production` by hand.

**Choose the location now.** D1 takes `--location weur` (a hint) or `--jurisdiction eu` (a restriction), and neither can change afterwards. The owner decides it together with the bucket (below): the data is Belgian users' personal data, and the privacy text does not promise a region. Staging uses the default. Commit the two ids to `develop` (they are not secrets), and the migrations run on the first deploy.

## 5. Queues and the bucket (production)

Names (from `wrangler.jsonc`): `smog-production-email`, `smog-production-email-dlq`, `smog-production-sponsorship-events`, `smog-production-sponsorship-events-dlq`, bucket `smog-production-media`. With `SMOG_PROVISION_PRODUCTION=1` the deploy creates what is missing and never changes or deletes what exists; without it, `--check` fails with the commands. Preview them: `bun scripts/ensure-cloudflare-resources.ts --env production --dry-run` (prints every command; with `SMOG_RENDER_PIPELINE=1` also the Workflows, Docker and Containers probes).

**The bucket's location cannot change after creation**, and the script creates with the account default. For a location hint other than the default, create the bucket **by hand before the first deploy** (the script then finds it and only checks its CORS). **Only a location hint is supported, on purpose (phase 9 ruling 8).** The bucket holds sponsor company logos (an image of at most 2 MB per gesture), not personal data: the personal data is in D1 (which has its own location choice, section 4) and in Mux. An EU **jurisdiction** bucket (`--jurisdiction eu`) does **not** work with the code: the presigned logo PUT is hard-coded to `<account>.r2.cloudflarestorage.com` (`packages/features/sponsorships/src/server/logo.ts`, and the CSP `connect-src` follows it), a jurisdiction bucket lives at `<account>.eu.r2.cloudflarestorage.com`, and `ensure-cloudflare-resources.ts` lists buckets without a jurisdiction, so it would create a second default bucket of the same name. If the owner wants it, it is a small task whose design is recorded in `docs/DECISIONS.md` ("R2 jurisdiction: the design for a later task", phase 9 task 11); say so before creating production's bucket, because the bucket cannot change afterwards. D1's `--jurisdiction eu` is fine (no code depends on it).

```bash
cd apps/site
bunx wrangler r2 bucket create smog-production-media --location weur --no-update-config
```

**The bucket's CORS** (the browser's presigned logo `PUT` from the site) is set by the script when the bucket has none. It is **never overwritten**: when `SITE_URL` is not among the allowed origins the deploy fails and prints `wrangler r2 bucket cors set smog-production-media --file cors.json --force` with the JSON. The JSON is `{"rules":[{"allowed":{"headers":["content-type"],"methods":["PUT"],"origins":["<origin>"]},"maxAgeSeconds":3600}]}`. A rule that lists the origin among several is accepted, which is what path D needs (both origins).

The `production` `R2_ACCOUNT_ID` var (empty placeholder in `wrangler.jsonc`) is the Cloudflare account id, with `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (step 6) for the presigned PUT; all of them come together (`workerEnvSchema` refuses a partial set).

## 6. Secrets per env

`scripts/check-deploy-config.ts` holds each env to `REQUIRED_WORKER_CONFIG[env]` (`@smog/config/env/worker`). Online it runs `wrangler secret list --env <env>` (JSON), so the token needs Workers Scripts: Read. **The first `wrangler secret put` creates the Worker**; `secret list` fails until then. Setting a value:

```bash
cd apps/site
bunx wrangler secret put <NAME> --env <staging|production>      # prompts for the value
```

| Env | Required secrets | Required vars (`wrangler.jsonc`) |
|---|---|---|
| staging | `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY` | none |
| production | `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `MOLLIE_API_KEY` (`live_`), `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | `TURNSTILE_SITE_KEY`, `R2_ACCOUNT_ID` |

- `BETTER_AUTH_SECRET`: at least 32 characters, `openssl rand -base64 32`. **Changing it signs everyone out** and invalidates the signed logo-upload URLs.
- Value rules the check cannot see (secret values are unreadable) stay in `workerEnvSchema` at runtime: a `live_` Mollie key in production and `test_` elsewhere, the real Mux and Mollie API URLs outside dev, the R2 trio together.
- **Optional**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID` + `APPLE_CLIENT_SECRET` + `APPLE_APP_BUNDLE_IDENTIFIER`, `OPENPANEL_CLIENT_ID` + `OPENPANEL_CLIENT_SECRET`. (`REMOTION_LICENSE_KEY` is no longer read: delete it with `wrangler secret delete` if you set one.) The check lists an absent provider or OpenPanel pair as "not configured" (recommended), never an error.
- **Providers are pairs.** An env that has any of a provider's secrets needs all of them (Google two, Apple three); the check refuses a partial one.
- **The "make Google and Apple mandatory in production" decision (owner).** Today they are optional: production launches without them if they are not set, and the sign-in page then offers an email code, a magic link, a password and passkeys. The old app offered whatever WorkOS offered, which only the WorkOS dashboard shows: look there first, because migrated users who signed in with Google or Apple have no password and would use a code or link instead (the `we_moved` email says so). If production must offer them, set the secrets and let the check enforce them by listing them as required (a one-line change to `BASE_REQUIRED_CONFIG.production` in `packages/config/src/env/worker.ts`, a normal task). App Store guideline 4.8 applies: an iOS app that offers Google sign-in must offer Sign in with Apple too.
- **Check the staging set** before opting in: `bun scripts/check-deploy-config.ts --env staging` (online, with the deploy token in the environment) prints what is missing as `[deploy-config]` lines with the `wrangler secret put` command for each. `--offline` skips the secrets; `--warn-only` is staging only and turns every problem into a `::warning::`; **production refuses `--warn-only`**.
- **Fill production's vars before the first production deploy**, or `Check deploy config` fails it: `TURNSTILE_SITE_KEY` and `R2_ACCOUNT_ID` in `env.production.vars`, the real KV and D1 ids, and a `SITE_URL` that is a bare `https:` origin that is not a placeholder (a workers.dev host must be `<script>.<subdomain>.workers.dev`). `bun scripts/check-deploy-config.ts --env production --offline` prints what is still open, with no credentials.

## 7. `SMOG_REQUIRE_SECRETS` and `SMOG_PROVISION_PRODUCTION`

See the table in section 3. The order for production is: the secrets and ids first (the check), then `SMOG_PROVISION_PRODUCTION=1` (the resources), then the first deploy. `deploy.yml` runs the check **before** `Ensure Cloudflare resources`, so with `SMOG_PROVISION_PRODUCTION=1` nothing is created before a missing secret is found.

## 8. Cloudflare Access on staging, and its bypass list

Staging sits behind Cloudflare Access (`ziasbe.cloudflareaccess.com`): every path answers `302` to the login. Nothing in the code works around that, so the owner **extends the Access Bypass policy** (the existing Bypass item, or a separate Access application with a Bypass rule for the staging hostname) to cover what machines call, because they carry no Access token and do not follow redirects:

| Path | Caller |
|---|---|
| `/api/webhooks/*` | Mollie, Mux |
| `/webhooks/mollie` | Mollie's legacy alias path |
| `/api/csp-report` | browsers' CSP reports (staging sends `Content-Security-Policy-Report-Only`; without the bypass the reports never reach the Worker) |
| `/.well-known/*` | the app-link files (`apple-app-site-association`, `assetlinks.json`) |
| `/turnstile-bridge` | the staging mobile builds' Turnstile challenge page (`/api/*` does not cover it), and likewise the app magic-link page `/magic-link/app` |
| `/api/*` (or at least `/api/rpc/*` and `/api/auth/*`) | the staging **mobile builds**, which carry no Access session |

How much of staging to open is the owner's decision. The same applies to production if Access is ever put in front of it.

### 8a. Cloudflare notifications (owner, before the first production deploy)

The site alerts nobody by itself (no external error reporter, by design: the privacy text), so set these in the Cloudflare dashboard **(dashboard: Notifications; names move, read the label you see)** for the account, delivered to an address the owner reads, for **both** envs:

- **Worker errors:** an alert on the error rate or exceptions of `smog-site-production` (and `-staging`). The Worker logs one redacted `[error]` line per unhandled fetch, queue or scheduled error (`apps/site/src/worker/top-level.ts`), which `wrangler tail` shows.
- **Queue backlog:** an alert on `smog-<env>-email` and `smog-<env>-sponsorship-events` growing (a stuck consumer). A message that exhausted its retries is stored in D1 by the DLQ consumers instead (`/admin/dead-letters`), so the dead-letter queues themselves stay near empty.
- **Cron failures:** the four crons (`stale` hourly, `expiry` 00:00, `retention` 03:15, `reminders` 08:00 UTC). A failed cron logs `[error]`; a missing `[cron] …` line in `wrangler tail` is the other sign. The **daily `admin_dead_letter` digest** (sent by the retention cron to every admin, once per UTC day, only when something needs attention) is the in-app alert for dead letters and lost messages; if the owner stops receiving digests on a day with open dead letters, the retention cron did not run.
- **D1 and R2:** whatever usage or error notification the dashboard offers for the account's D1 databases and the media bucket.

Staging's Access bypass (above) must include `/api/csp-report` for the CSP reports to arrive at all.

## 9. Mux: environments and webhooks

- **Production uses the existing (old) production Mux environment**: every gesture asset is there, so the admin asset picker needs its token. **Staging gets a new Mux environment**; dev keeps the fake. Separate environments keep staging uploads out of the production picker and staging assets off the production bill (`test: true` is dev only).
- Each Mux environment has its own **access token** (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`; permissions: Mux Video read and write) and its own **webhook** with a **signing secret** (`MUX_WEBHOOK_SECRET`). The webhook URL is **`<SITE_URL>/api/webhooks/mux`**.
- A late event of a retired render job (the passthrough `render-job:…`, phase 7) is answered `IGNORED` and touches no asset. A Mux environment shared by accident does not delete the other env's assets: the webhook deletes nothing.
- **Production's webhook secret exists before the secrets and the first deploy (PROGRESS step 4, before step 5).** `MUX_WEBHOOK_SECRET` is required at the first production deploy, but the old webhook of the old environment points at the old system until T-0. The new URL is known now (the production `SITE_URL`), so add a **second** webhook endpoint (Mux dashboard → Settings → Webhooks, in the production environment) for `<production SITE_URL>/api/webhooks/mux` first, and put its signing secret in `MUX_WEBHOOK_SECRET`; the old endpoint is removed at step 10 of T-0. The new endpoint ignores the old app's events (they are not `gesture-upload:` passthroughs). If the dashboard allows only one endpoint per environment, set any random value as `MUX_WEBHOOK_SECRET` before the first deploy (every delivery is then `400`) and put the real secret in at step 10 with `wrangler secret put MUX_WEBHOOK_SECRET --env production`.
- **Staging smoke (owner, pending):** answer one delivery with a 503 (for example unset `MUX_WEBHOOK_SECRET` briefly) and confirm Mux's retry more than 5 minutes later still verifies (that Mux signs each attempt with a fresh `t`); if it does not, widen the 300 s window or verify `t` against the event's `created_at`.
- **The importer's two Mux commands use a separate, low-priority token** of the production environment, created for the migration and revoked afterwards (`docs/cutover-runbook.md`).

## 10. Turnstile

- `TURNSTILE_SITE_KEY` is a public var in `wrangler.jsonc` (`env.<env>.vars`); `TURNSTILE_SECRET_KEY` is a secret. **Both are required in production before launch**: without the site key the web shows no widget and email sign-up, sign-in, reset, code and magic-link requests fail. Staging uses Cloudflare's always-pass test keys; dev needs neither.
- Create a **production widget** (dashboard → Turnstile → Add widget) with its own keys. Its **hostnames** are the production origin's host, **and both hosts on path D** (`smog-site-production.zias.workers.dev` and `app.smog.vlaanderen`). The app's challenge web view loads `/turnstile-bridge` from the same origin.
- Device signals of Turnstile are declared in the store privacy forms (section 15).

## 11. Google and Apple sign-in

Both are optional (section 6). The redirect URIs are Better Auth's: **`<origin>/api/auth/callback/google`** and **`<origin>/api/auth/callback/apple`**, for **every origin that serves the site** (both hosts on path D).

- **Google:** Google Cloud console → APIs & Services → Credentials → an OAuth client of type "Web application"; authorised redirect URI as above; the client id and secret are `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The consent screen takes its homepage, privacy-policy and terms links (`/privacy`, `/terms`) on a domain you own. `workers.dev` is a public suffix, so it cannot be verified as an authorised domain: check in the console what it accepts for a workers.dev origin.
- **Apple:** Apple Developer → Certificates, Identifiers & Profiles. A **Services ID** (`APPLE_CLIENT_ID`) with Sign in with Apple enabled, its domain and the return URL above; an App ID for `be.zias.smog` (`APPLE_APP_BUNDLE_IDENTIFIER`, used for the native iOS flow); a **Sign in with Apple key** (`.p8`, with its key id). `APPLE_CLIENT_SECRET` is a **JWT signed with that key** (ES256; header `kid` = the key id; claims `iss` = the team id `96XKP6MU2A`, `iat`, `exp`, `aud` = `https://appleid.apple.com`, `sub` = the Services ID). Apple accepts an `exp` at most **15 777 000 s (about 6 months)** ahead. The repository has no generator for it: any ES256 JWT tool will do, and the secret is never committed. Apple's console may ask to verify the domain: a verification file goes in `apps/site/public/.well-known/` (next to `apple-app-site-association` and `assetlinks.json`, which the site already serves as static files), a normal change on `develop`.
- **Apple client secret rotation.** The secret **expires within 6 months**. Put the expiry in a calendar with a reminder two weeks before, generate a new JWT, and `wrangler secret put APPLE_CLIENT_SECRET --env production` (and staging). When it expires, Apple sign-in fails for everyone (an email code, link or Google still works). The cutover runbook lists the date after cutover.

## 12. Apple private-relay email registration (`smog.vlaanderen`)

Users who chose "Hide my email" in Sign in with Apple have an address `…@privaterelay.appleid.com`, and **Apple forwards our mail only from domains and addresses registered for the relay**. The importer counts these users (the plan report's `privateRelay`), and they get **no email at all** (sign-in codes, reset, magic links, `we_moved`, sponsor emails) until this is done. Do it before the first production deploy:

1. Apple Developer → Certificates, Identifiers & Profiles → **Services → Sign in with Apple for Email Communication (Configure)** **(dashboard)**.
2. Add the domain **`smog.vlaanderen`** and the sender address **`noreply@smog.vlaanderen`** (production's `EMAIL_FROM`).
3. Apple verifies the domain (a DNS TXT record it shows) and requires that mail from it **passes SPF and is DKIM-signed** for that domain. Use the records the **Cloudflare Email Service onboarding** gives you (section 13): its SPF include and its DKIM CNAME/TXT records, so the mail the binding sends is aligned. Apple shows the status per domain and address.
4. Staging sends from `info@smog.zias.be` on the `zias.be` zone, so a staging private-relay user would need the same registration for that domain; staging holds no real addresses, so it is not needed.

## 13. Mollie and the Email Service

- **Mollie.** The production **profile** (Mollie dashboard → Developers / Website profiles) has its **website** set to the production `SITE_URL` (Mollie checks the profile's website), and the **live** API key comes from that profile (`MOLLIE_API_KEY`, `live_…`; the schema refuses `test_` in production and `live_` elsewhere). There is **no webhook to configure**: every payment carries `webhookUrl: <SITE_URL>/api/webhooks/mollie` and `redirectUrl: <SITE_URL>/sponsor/success?payment=<id>`, and the site checks a webhook by fetching the payment back with the key. **Confirm early that Mollie accepts a workers.dev website for the profile**: if it does not, path D (the domain) is forced. Staging uses the test key and its own profile. The old payments created before the cutover keep the old webhook URL (`<old origin>/webhooks/mollie`); the site serves `POST /webhooks/mollie` as an alias (`docs/cutover-runbook.md`).
- **Email Service onboarding (production, before the first admin signs in).** Production sends from `noreply@smog.vlaanderen` through the `EMAIL` `send_email` binding (`allowed_sender_addresses` in `wrangler.jsonc`). Until the domain is onboarded the binding only sends to verified destination addresses, and the first production admin could not receive a sign-in code. Cloudflare dashboard → **Email Service** **(dashboard)** → onboard `smog.vlaanderen`: it shows the SPF and DKIM (and any other) DNS records to add. The dashboard says whether the zone must be on Cloudflare DNS (expected: yes, it adds the records itself), which is also what path D needs. Staging is onboarded for `smog.zias.be`. Test with the first admin's code (`admin:grant --create`).

## 14. The render pipeline (retired)

The Remotion render pipeline (the `SmogRenderer` container, the `RenderSponsorshipVideo` Workflow, the render flip, the Remotion licence question and the container cost) was removed in phase 10b task 9, on the owner's decision of 2026-10-23: a sponsor's name and logo are an end card over the gesture's own video, so nothing is rendered and there is no licence to confirm. The section number stays so that references to later sections hold; the history is `docs/DECISIONS.md`, "Retire the render pipeline (phase 10b task 9)".

## 15. EAS and the stores (mobile)

The profiles, origins and versions are in `apps/mobile/eas.json`; `scripts/release-config-check.ts` holds them to the site's origins (`checkEasProfiles`). The CLI belongs to the owner (`eas-cli >= 24.10.0`, not a dependency).

1. **Login:** `eas login` (the account that owns the project, `smog-and-co`).
2. **Seed the remote version counters once, before the first build.** `appVersionSource` is `remote` (`app.config.ts` is dynamic, so EAS cannot write a local `autoIncrement` back). Set the last values the stores have: `eas build:version:set` for iOS **51** and for Android **80** (it asks the platform and profile `production`); the first build is then 52 / 81. **Skipping the seed is not safe**: the remote counter then starts at 1, and Play refuses a `versionCode` below 80.
3. **EAS environment variables** (the OpenPanel write-only pair, `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` and `EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET`), one pair per EAS environment (`development`, `preview`, `production`), visibility **Plain text** (it ships in the binary anyway), never in git: `eas env:create --environment <env> --visibility plaintext --name EXPO_PUBLIC_OPENPANEL_CLIENT_ID --value <id>` (see `apps/mobile/.env.example`). Without them the build has analytics off, which is safe. The origin keys stay in `eas.json` (public, reviewed in git, checked).
4. **Credentials:** upload the **Play service-account key** and the **App Store Connect API key** as EAS-hosted credentials (`eas credentials`); no key path is in git.
5. **Builds per profile:** `eas build --profile <development|staging|production> --platform <ios|android>`. `development` is a dev client (internal), `staging` internal, `production` store distribution with `autoIncrement`. **The `development` and `staging` profiles set `APP_VARIANT`** (phase 9), so they install beside the store app with an identity of their own: `SMOG Dev` / `be.zias.smog.dev` / `smog-dev://` and `SMOG Staging` / `be.zias.smog.staging` / `smog-staging://`, with no universal links (the AASA and `assetlinks.json` name the store identifiers only). `production` is the store identity, byte for byte. A local `expo run:*` without `APP_VARIANT` installs under the store identity. **`development` points at `http://localhost:5173`, which only a simulator or emulator reaches** (and `eas.json`'s `env` beats a local `.env`): for a physical device run the app locally with `expo run` and an `apps/mobile/.env` that holds your LAN address, not an EAS development build. The production origin is `PRODUCTION_LAUNCH_ORIGIN` (`@smog/config/constants`). **Owner setup per variant, before a test build can sign in** (`docs/PROGRESS.md`, owner step 9): an Apple App ID per variant (`be.zias.smog.staging`, `be.zias.smog.dev`) with **Sign in with Apple** (no Associated Domains) and a provisioning profile per EAS profile; the staging site's **`APPLE_APP_BUNDLE_IDENTIFIER` secret** is a single value in Better Auth, so set it to `be.zias.smog.staging` while testers use the staging variant (the store build then cannot use Apple sign-in against staging; `check-deploy-config` checks only that the Apple trio is present, not its value); a **Google OAuth Android client** per package with the SHA-1 of each signing key, if Google sign-in is used on a variant; the EAS credentials per profile (iOS distribution certificate and provisioning profile, Android keystore for `development` and `staging`). A **magic link signs in only the store app** (the emailed link is an https universal link the variants do not claim): testers of a variant use an email code, a password or a provider. The reasoning is in `docs/DECISIONS.md`, "Mobile: app variants" (phase 9 task 3).
6. **Submit:** `eas submit --profile production --platform <ios|android>`. The profile holds `ascAppId` `6758547774` and `appleTeamId` `96XKP6MU2A`; Android goes to the `internal` track as a `draft`, so nothing reaches users without a promotion in Play Console.
7. **OTA updates: always through the wrapper**, never a bare `eas update`: **`bun -F @smog/mobile update -- --profile <development|staging|production> [eas update args]`** (`scripts/eas-update.ts`). `eas update` does not read `eas.json`'s build `env`, so a bare run would ship JS without the origin keys (or with a local `.env`'s localhost). The wrapper loads the profile's keys and passes `--channel` and `--environment` itself, and refuses `--channel`, `--branch` and `--environment`. `release-config-check` refuses a package script that calls `eas update` directly.
8. **`SPONSOR_LINK_IN_APP`** (`apps/mobile/src/config.ts`) stays `true` for the first iOS review: sponsoring is a service bought by a business for the public, not digital content unlocked in the app. If App Review rejects it under 3.1.1 or 3.1.3, set it to `false` and resubmit (iOS then drops the card with the link; Android keeps it).
9. **Review timing and the app/domain pairing** are in `docs/cutover-runbook.md` (the domain decision).

### The store privacy answers (X-16; the owner submits them)

Both forms answer for the **app**; the website is outside them. The answers follow what the code sends, not the old app's forms. Two need the owner's confirmation: Turnstile's device signals as "Other Data", and the Google photo URL left undeclared.

**App Store privacy label ("App Privacy")**
- *Data used to track you:* **none** (no IDFA, no ATT prompt).
- *Contact Info → Email Address, Name:* collected, **linked**, **App Functionality** (the account); optional, only with an account.
- *Identifiers → User ID:* collected, linked, **App Functionality**; also **Analytics** (OpenPanel links to the user id only after sign-in, only with consent).
- *Identifiers → Device ID:* **Analytics** only, with consent (OpenPanel's pseudonymous device id); answer "linked" to stay on the safe side. Again for **App Functionality**, **not linked**, not tracking: `expo-updates` sends a per-install `EAS-Client-ID` to Expo's update server.
- *Location → Coarse Location:* **Analytics** only, with consent (OpenPanel derives country and region from the IP address of each event); linked after sign-in.
- *Usage Data → Product Interaction:* **Analytics**, with consent only (which gesture was viewed or saved, screens; no search terms, names or emails). OpenPanel is self-hosted (`analytics.zias.be`), so it is not a third party for the label, and there is no tracking.
- *User Content → Other User Content:* favorites and lists, linked, **App Functionality**, only with an account.
- *Other Data Types → Other Data* (Turnstile's device signals for fraud prevention, collected by a third party, Cloudflare): **App Functionality**, not linked, not used for tracking.
- *Diagnostics:* **not collected**. *Precise Location, Contacts, Health, Financial Info, Purchases, Browsing or Search History, Sensitive Info, Photos or Videos, Audio:* **not collected** (sponsorship payments happen on the website; a search term is sent only to answer that search and is not stored). The Google photo URL the server keeps as part of the account is not the photo library, so *Photos or Videos* stays unchecked; if App Review asks, it is account data from the sign-in provider.

**Google Play data safety**
- *Data shared with third parties:* **none** in Play's sense (Cloudflare, Mux, Expo and our self-hosted OpenPanel are service providers); *sold:* none. *Encrypted in transit:* yes. *Deletion:* the account screen in the app and the website's account page (the deletion URL).
- *Personal info → Name, Email address, User IDs:* collected, **optional**, **Account management, App functionality**.
- *App activity → App interactions:* collected, optional (consent), **Analytics**. *Other user-generated content* (favorites and lists): optional, **App functionality**.
- *Device or other IDs:* optional; **Analytics** (OpenPanel's device id, with consent) and **Fraud prevention, security and compliance** (Turnstile); Expo's update client id goes to a service provider, for **App functionality**.
- *Location → Approximate location:* optional (consent), **Analytics**.
- *Precise location, Financial info, Photos and videos, Messages, Contacts, Calendar, Files and docs, Health, Web browsing, App info and performance:* not collected. Not tracking, not advertising; the app shows no ads.

The full reasoning is in `docs/DECISIONS.md`, "Mobile environments" (phase 8 task 6).

## 16. The first production deploy

Before the first `master` push (every item is in `docs/PROGRESS.md`, "Owner actions in order"):

1. `bun scripts/check-deploy-config.ts --env production` (online, with the production token) prints nothing but `ok` and the recommended list.
2. The legal sign-off (`docs/LEGAL-SIGNOFF.md`) is done: the texts under `/privacy` and `/terms` are the owner's.
3. Maintenance is **on** in production's KV before the first deploy (`bun run maintenance --env production on --message … --yes`), so the public never sees an empty site. `/sign-in` and the admin sign-in routes stay open; a signed-in admin gets past the rest with `POST /api/maintenance/bypass`.
4. The `production` GitHub environment exists with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (a missing one fails the production deploy at its first step; staging would skip silently).
5. The first deploy goes `develop` → `master`; production is on workers.dev. After it, open the Deploy job and confirm that `Check deploy config`, `Apply D1 migrations` and `Deploy` actually ran. Then `bun run admin:grant --env production --create --yes <email>`, and sign in with an email code (the admin sign-in check).

## 17. Known gaps

- The e2e runs as the `e2e` job of `ci.yml` (seven shards) and locally with `bun run test:e2e` on its own ports (`E2E_PORT`, `E2E_MUX_PORT`, `E2E_MOLLIE_PORT`); a green `release:check` does not include it.
- A dead letter is stored in D1 (14 days) and shown in `/admin/dead-letters` with replay and discard; a message that carries a secret (sign-in codes, magic and reset links, renewal tokens) is stored without its body and cannot be replayed (the person asks again). The real queue behaviour (consumer attach, retry delay) is first proven on staging. Treat the stored bodies as personal data (recipient addresses): do not paste them into tickets.
- Device checks no test covers are the owner's (`docs/PROGRESS.md`, owner step 7): a screen reader (VoiceOver, TalkBack), large text and high contrast on real devices, Turnstile in the iOS simulator and on an Android device, universal links and `/magic-link/app` on a real iPhone, and a link scanner (Outlook Safe Links) that must keep the `#token=` of a sponsor link.
