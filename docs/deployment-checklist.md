# Deployment checklist — apps/site + apps/mobile

Covers the Payload stack only: `apps/site` (Payload 3.89 / Next.js 16 on
Cloudflare Workers via OpenNext, D1 + R2) and `apps/mobile` (Expo, talks to
`apps/site`'s REST API). The legacy stack (`apps/server`, `apps/web`,
`apps/native`, `apps/remotion` Docker service) is out of scope.

Every name below was checked against the code that reads it. All `wrangler`
commands run **from `apps/site`** (`cd apps/site`), where `bunx wrangler`
resolves the pinned wrangler 4.136 and finds `wrangler.jsonc`.

## Before you start

1. **BLOCKING: rotate the Cloudflare API token that was previously exposed.**
   Roll or delete it in the Cloudflare dashboard (My Profile → API Tokens)
   before running anything below, then update the `CLOUDFLARE_API_TOKEN`
   GitHub secret with the new token. Nothing in this checklist is safe to run
   with the old token still valid.
2. **Credentials never go in chat, commits, `wrangler.jsonc` or shell
   history.** Every secret below is set through `wrangler secret put`, which
   reads the value from an interactive, non-echoing prompt (or from a pipe,
   e.g. `openssl rand -hex 32 | bunx wrangler secret put …`, so the value is
   never displayed). Keep any value a second system also needs (e.g.
   `RENDER_CALLBACK_SECRET`), or an operator needs again (`JOBS_RUN_TOKEN`),
   in a password manager, not a file in the repo.
3. **Do not put a secret in `vars`.** `vars` are committed and visible to
   anyone with repo access; `wrangler.jsonc` says so for the OpenPanel secret.
4. **Anything not already in `wrangler.jsonc` must be set with
   `wrangler secret put`, even if it is not secret.** A plain var added in the
   dashboard is wiped by the next `wrangler deploy`, which overwrites `vars`
   from the file. Secrets survive deploys. (Or add it to
   `env.<env>.vars` in `wrangler.jsonc` — a reviewed file change.)
5. Authenticate wrangler for your shell without echoing the token:

   ```bash
   read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # paste at the blank prompt
   read -r CLOUDFLARE_ACCOUNT_ID && export CLOUDFLARE_ACCOUNT_ID   # not secret, but needed if the token spans accounts
   ```

   (Or `bunx wrangler login` for an interactive OAuth session.)

## 1. Worker secrets (`wrangler secret put`, per environment)

Command form: `bunx wrangler secret put <NAME> --env=<staging|production>`
from `apps/site`. `--env` is mandatory — the top level of `wrangler.jsonc` has
no bindings by design. Verify afterwards with
`bunx wrangler secret list --env=<env>` (lists names only).

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `PAYLOAD_SECRET` | secret | staging + production (different values) | `openssl rand -hex 32 \| bunx wrangler secret put PAYLOAD_SECRET --env=<env>` | **Site down.** `payload.config.ts` calls `requireEnv("PAYLOAD_SECRET")` at module load outside `next build`, so every request that boots Payload 500s: the admin, every `/api/*` route, and every content page (home, gestures, lists, account — the locale layout reads the session through Payload whenever a session cookie is present). **Constraint:** signs web session JWTs, mobile bearer tokens, Google OAuth sessions, the OAuth state cookie and the mobile handoff code. Changing it after users exist signs everyone out on web and mobile and breaks any in-flight OAuth sign-in. Set once per env; rotate only deliberately. |
| `GOOGLE_CLIENT_ID` | secret | both (only if Google sign-in is offered) | `bunx wrangler secret put GOOGLE_CLIENT_ID --env=<env>` | Google sign-in switched off, not an error: `/auth/google` answers 303 to the sign-in page with `?error=oauth-unavailable` (web and mobile). Needs **both** id and secret, or neither is used. Register `https://<site-origin>/auth/google/callback` as a redirect URI in Google Cloud for each environment's origin. |
| `GOOGLE_CLIENT_SECRET` | secret | both (with the above) | `bunx wrangler secret put GOOGLE_CLIENT_SECRET --env=<env>` | Same as `GOOGLE_CLIENT_ID`. |
| `MOLLIE_API_KEY` | secret | both (`test_…` key on staging, `live_…` on production) | `bunx wrangler secret put MOLLIE_API_KEY --env=<env>` | Sponsorship checkout fails: `POST /sponsor/checkout` logs the error and answers 303 back to the preview with `?error=payment`; the rows stay `pending_payment` with no payment id. The Mollie webhook `POST /webhooks/mollie` answers **502** to every delivery (Mollie keeps retrying). Rest of the site unaffected. The webhook URL is derived from the request origin — nothing to configure in Mollie. |
| `MUX_TOKEN_ID` | secret | both | `bunx wrangler secret put MUX_TOKEN_ID --env=<env>` | Render callback `POST /render/callback` answers **502** "composed video could not be uploaded" (after a valid signature). The `expire-sponsorships` job cannot delete or read Mux assets (logged, counted as failures, retried next run). Needs both id and secret. |
| `MUX_TOKEN_SECRET` | secret | both | `bunx wrangler secret put MUX_TOKEN_SECRET --env=<env>` | Same as `MUX_TOKEN_ID`. |
| `MUX_SIGNING_KEY_ID` | secret | both (once the Lambda function is deployed) | `bunx wrangler secret put MUX_SIGNING_KEY_ID --env=<env>` | If `REMOTION_*` are all set, every render submission fails before anything is claimed — renders are submitted by the Mollie webhook once a payment is paid, and it logs `[renderJob] Failed to submit a render for sponsorship <id>` and still answers 200, so the payment is recorded. `GET /api/mux/source/:id` also throws → **500** for any caller holding the service token. Needs both id and private key. |
| `MUX_SIGNING_KEY_PRIVATE` | secret | both (with the above) | `bunx wrangler secret put MUX_SIGNING_KEY_PRIVATE --env=<env>` — paste Mux's **base64-encoded** private key at the prompt (single line) | Same as `MUX_SIGNING_KEY_ID`. **Format:** PKCS#8 PEM, either base64-wrapped (what Mux hands out — preferred, it is one line) or the raw PEM; anything else throws "not a PEM private key". |
| `MUX_SOURCE_SERVICE_TOKEN` | secret | optional — **not needed for Lambda renders** | `openssl rand -hex 32 \| bunx wrangler secret put MUX_SOURCE_SERVICE_TOKEN --env=<env>` (store it too — whatever calls the endpoint must present it) | Nothing on the Lambda path calls `GET /api/mux/source/:id`: the Worker mints the signed source URL itself (`lib/renderJob.ts`). Unset, the endpoint fails closed and answers **401** to every caller, which is what it protects — no caller can enumerate which playback ids exist. Set it only if something ever needs to call that endpoint. |
| `RENDER_CALLBACK_SECRET` | secret | both (once the Lambda function is deployed) | `bunx wrangler secret put RENDER_CALLBACK_SECRET --env=<env>` (same value goes in the start payload's `webhook.secret`, so Lambda signs with it — nothing to configure on a "Remotion side", there is no separate Remotion account) | Unset: `lib/renderJob.ts` refuses to submit any render (logged per sponsorship), since its callback would be refused. Set but wrong: `POST /render/callback` fails closed with **401** to every callback, so composed sponsor videos never get attached. HMAC-SHA512 over the body, Remotion's own scheme (`X-Remotion-Signature: sha512=…`); pinned in `src/lib/renderSignature.ts`. Watch for: non-ASCII callback bodies (runbook §1, decision 7, "Callback length"). |
| `REMOTION_AWS_ACCESS_KEY_ID` | secret | both, once the Lambda function is deployed — staging first | `bunx wrangler secret put REMOTION_AWS_ACCESS_KEY_ID --env=<env>` — the **Worker** IAM user's access key, whose only permission is `lambda:InvokeFunction` on `arn:aws:lambda:eu-central-1:<account-id>:function:remotion-render-*` (`apps/render/README.md`, "One-time AWS setup"). **Never the deploy user's key** (`npx remotion lambda policies user`): that one stays on the operator's machine for `deploy:function` / `deploy:site:*`. The Worker needs no S3 or IAM access, because the start routine runs as the Lambda role and the props are inline, so a leaked Worker key can only start renders. | Every render submission fails (logged per sponsorship; the Mollie webhook still answers 200 and records the payment): `lib/remotionLambda.ts` cannot sign the Lambda invoke. Read from `process.env` per call, never at module scope; never logged. Needs both id and secret key. |
| `REMOTION_AWS_SECRET_ACCESS_KEY` | secret | both (with the above) | `bunx wrangler secret put REMOTION_AWS_SECRET_ACCESS_KEY --env=<env>` — the same **Worker** user's secret key | Same as `REMOTION_AWS_ACCESS_KEY_ID`. |
| `OPENPANEL_CLIENT_ID` | secret | both (per-env OpenPanel project) | `bunx wrangler secret put OPENPANEL_CLIENT_ID --env=<env>` | Analytics silently off: `POST /api/analytics/track` still answers 202, logs a warning, and **drops the event**. Needs both id and secret. |
| `OPENPANEL_CLIENT_SECRET` | secret | both | `bunx wrangler secret put OPENPANEL_CLIENT_SECRET --env=<env>` | Same as `OPENPANEL_CLIENT_ID`. Must never be a `vars` entry. |
| `JOBS_RUN_TOKEN` | secret | both | Generate it in the password manager and save it there first (64 letters and digits) — an operator needs it again for a manual run — then `bunx wrangler secret put JOBS_RUN_TOKEN --env=<env>` and paste it at the prompt. | The hourly cron (`wrangler.jsonc`'s `triggers.crons`, `worker.ts`'s `scheduled()`) calls this endpoint every hour on its own — an operator no longer has to. **A missing or wrong token does not show up as an error.** `endpoints/jobs.ts` answers `200 {"status":"ok"}` for a missing/mismatched token exactly the same as for a real run — `acknowledged()` is not an oracle for the token, by design — so the only visible symptom is `[jobs] A run was requested without a usable token; nothing was run` in the Worker log (`bunx wrangler tail --env=<env>`), and queued jobs quietly never execute: no email is ever sent, sponsorships never expire, stale payments/orphaned media/rate-limit rows are never cleaned. Check that warning is absent after setting the secret. **Positive confirmation, not just the absence of a warning:** keep `bunx wrangler tail --env=<env>` open across the next `:00` and expect to see `[jobs] Ran N jobs from the default queue`; or, while tailing, `read -rs JOBS_RUN_TOKEN` (paste it from the password manager; never type it into a command) and then `printf 'Authorization: Bearer %s\n' "$JOBS_RUN_TOKEN" | curl --max-time 600 -H @- https://<origin>/api/jobs/run` (the header goes in on standard input, so the token is in neither shell history nor the process list) (it answers `200` either way, so read the log line, not the status; `--max-time` because an HTTP run has no wall-clock limit while the client stays connected, and the stranded-job recovery assumes every run ends within thirty minutes). A tick that fails now also shows as **failed** in that Worker's **Cron Triggers → Past Events** table in the dashboard, not as a success — and with `observability.enabled` on (`wrangler.jsonc`), these `[cron]`/`[jobs]` lines persist in **Workers Logs** too, so they're readable after the fact and not only during a live tail. |

## 2. Worker vars (plain, non-secret)

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `OPENPANEL_API_URL` | var — **already in `wrangler.jsonc`** (`https://analytics.zias.be/api`, both envs) | both | Nothing to do; deployed from the file. | Falls back to the same URL (`DEFAULT_API_URL` in `endpoints/analytics.ts`). One OpenPanel instance serves both envs; the per-env client id/secret separate the projects. |
| `EMAIL_FROM_ADDRESS` | var — **already in `wrangler.jsonc`**, per environment | both | Nothing to do; deployed from the file: `no-reply@zias.be`. | Email Service only sends from a domain in this Cloudflare account, and `smog.vlaanderen` cannot be moved into it, so the sender is on `zias.be` (decided 2026-09-23). Until `zias.be` is onboarded as a sending domain every send fails with `E_SENDER_NOT_VERIFIED` / `E_SENDER_DOMAIN_NOT_AVAILABLE`. |
| `EMAIL_FROM_NAME` | var — **already in `wrangler.jsonc`**, per environment | both | Nothing to do: `SMOG & Co` on production, `SMOG & Co (staging)` on staging. | Cosmetic. |
| `PAYLOAD_LOG_LEVEL` | var — not in `wrangler.jsonc`; undocumented | optional | `bunx wrangler secret put PAYLOAD_LOG_LEVEL --env=<env>` | Defaults to `info`. |
| `REMOTION_REGION` | var — **already in `wrangler.jsonc`** (`eu-central-1`, both envs) | both | Nothing to do; deployed from the file. | `lib/renderJob.ts` submits nothing until `REMOTION_FUNCTION_NAME` and `REMOTION_SERVE_URL` join it (below) — this var alone is not "configured". Also the `--region` of every `apps/render` deploy script; must never drift from those. |
| `REMOTION_FUNCTION_NAME` | var — **not yet in `wrangler.jsonc`**, filled in after `bun -F render deploy:function` | both, once the function is deployed — **staging first**, production only after staging's first render reached `ready` | Add it to `env.<env>.vars` in `apps/site/wrangler.jsonc`, in a **reviewed commit** (never `wrangler secret put`: it is not a secret, and a plain var set that way is wiped by the next deploy) — the exact value `deploy:function` prints, e.g. `remotion-render-4-0-484-mem3009mb-disk2048mb-240sec`. **The same value in both environments** once both are live: the function is shared. A Remotion version bump deploys a *new* function name, and each environment moves only when its own value changes, so a bump can go to staging first. | Rendering off: when a payment is paid, the Mollie webhook logs "No render was submitted" per sponsorship and records the payment normally. All three `REMOTION_*` must be set together to count as configured. Once all three are set, a paid payment really does invoke Lambda — this is no longer a stub. Watch for: the licence and the Lambda log level (runbook §1, decision 7). |
| `REMOTION_SERVE_URL` | var — **not yet in `wrangler.jsonc`**, filled in after `bun -F render deploy:site:staging` / `deploy:site:production` | both, with the above — **different per environment** | Same commit as that environment's `REMOTION_FUNCTION_NAME` — the exact **serve URL** that environment's site deploy prints (`https://remotionlambda-eucentral1-….s3.eu-central-1.amazonaws.com/sites/smog-render-staging/index.html`, or `…/sites/smog-render-production/index.html`). | Same as `REMOTION_FUNCTION_NAME`. Watch for: old render files accumulating in S3 (runbook §1, decision 7). |
| `SITE_ORIGIN` | var — **already in `wrangler.jsonc`**, per environment | both | Nothing to do; deployed from the file. staging: `https://smog-site-staging.vanneszias.workers.dev`. production: `https://smog-site-production.vanneszias.workers.dev` — **must change in the same commit that adds a custom-domain route** for that environment. | Read by `src/jobs/cron.ts`'s hourly scheduled tick. Missing it: the tick throws `[cron] SITE_ORIGIN is not set`, logged (not thrown out of `scheduled()`), and no jobs run that tick. Renewal and confirmation links in queued email are built from it, so a stale value here is a working link to nowhere in a sponsor's inbox. |

The Remotion Lambda invoke (SigV4, `lib/remotionLambda.ts`) is built and
tested against Remotion's own fixtures; nothing here needs the `@remotion/lambda`
dependency or a real AWS call. What it needs to actually submit a render are
the AWS credentials in §1 above and the three `REMOTION_*` vars in this
table — until every one of the five is set, `submitRenderJob` logs and does
nothing, exactly as before this stage.

## 3. Bindings and Cloudflare resources

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `D1` | D1 binding → `smog-staging` / `smog-production` (IDs in `wrangler.jsonc`) | both | Must exist before the first deploy. Check: `bunx wrangler d1 list`. If it has to be (re)created: `bunx wrangler d1 create smog-<env>` — the new `database_id` then has to replace the one in `wrangler.jsonc` (a reviewed change). | **Site down**: `requireBinding(D1)` throws at config load → same blast radius as a missing `PAYLOAD_SECRET`. `deploy:database` cannot migrate. |
| `R2` | R2 binding → `smog-staging-media` / `smog-production-media` | both | Check: `bunx wrangler r2 bucket list`. Create: `bunx wrangler r2 bucket create smog-<env>-media` | **Site down** (`requireBinding(R2)` at config load), and deploy fails to bind a missing bucket. |
| `EMAIL` | `send_email` binding (Cloudflare Email Service), `name` only, no allowlist | both | Declared in `wrangler.jsonc`; no command. **Requires sending-domain onboarding** in the Cloudflare dashboard (Email Service → add domain → publish the DNS records it gives). | Until the domain is verified every send answers `E_SENDER_NOT_VERIFIED`; queued email jobs fail and are recorded. If the binding were absent, `sendEmail` throws at send time only (the rest of the site is fine). |
| `ASSETS` | static assets binding (`.open-next/assets`) | both | Produced by `build:app`; no command. | Static files (JS/CSS/images) 404. |

## 4. Build/deploy shell environment (operator's machine)

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `CLOUDFLARE_ENV` | shell env, **required** by `deploy:guard` | per run: `staging` or `production` exactly | `CLOUDFLARE_ENV=staging bun run deploy:database` (prefix each command; do not leave it exported between envs) | `deploy:guard` exits 1 and `deploy:database` / `build:app` / `deploy:app` do nothing. Selects which env's bindings the build and deploy use. Not needed at Worker runtime. |
| `CLOUDFLARE_API_TOKEN` | shell env (or `bunx wrangler login`) | per run | `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN` | `deploy:database` (it runs `payload migrate` against the **remote** D1/R2 via wrangler's platform proxy, because the script sets `NODE_ENV=production`), `deploy:app` and every `wrangler secret`/`d1`/`r2` command fail to authenticate. Scopes per `.env.example`: Workers Scripts edit, D1 edit, R2 edit (+ Email Service if you onboard via API). |
| `CLOUDFLARE_ACCOUNT_ID` | shell env | per run | `read -r CLOUDFLARE_ACCOUNT_ID && export CLOUDFLARE_ACCOUNT_ID` | wrangler prompts or fails when the token can see more than one account. |
| `PAYLOAD_SECRET` (build time) | shell env, optional | — | Not needed. `deploy:database` sets `PAYLOAD_SECRET=ignore` itself; `next build` substitutes a placeholder when it is unset. | Nothing. Never export the real production secret into a build shell. |

`NODE_ENV` is set by the scripts themselves — do not export it. Never set any
of these in a deployed environment:

- `GOOGLE_AUTHORIZATION_ENDPOINT`, `GOOGLE_ISSUER`, `GOOGLE_JWKS_URI`,
  `GOOGLE_TOKEN_ENDPOINT` — test-only overrides. In production (with Google
  credentials set) `resolveProvider` throws and `/auth/google` answers **500**.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL`,
  `SEED_USER_PASSWORD` — local seed only; `bun -F site seed` refuses to run
  against anything but local staging emulation.

## 5. GitHub Actions secrets (`.github/workflows/ci.yml`)

CI does **not** deploy. These feed only the `site-bundle-size` job.

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GH repo secret | CI | `gh secret set CLOUDFLARE_API_TOKEN` (prompts for the value) | `site-bundle-size` **skips** with a warning (green, but the 10 MiB Worker budget is not enforced). Used for `build:app` and `wrangler deploy --dry-run` against `staging`. Use the **rotated** token. |
| `CLOUDFLARE_ACCOUNT_ID` | GH repo secret | CI | `gh secret set CLOUDFLARE_ACCOUNT_ID` | Same skip. |
| `PAYLOAD_SECRET` | GH repo secret | CI | `openssl rand -hex 32 \| gh secret set PAYLOAD_SECRET` | Same skip (the job requires all three to be non-empty). The build never uses the value for signing — give it a throwaway, **not** the staging or production secret. |

Jobs that need no secrets: `release-check`, `site-tests`, `site-e2e` (uses a
hard-coded local-only `PAYLOAD_SECRET`), `site-payload-types-drift`
(`PAYLOAD_SECRET=ignore`). `publish` (legacy Docker images) uses the
automatic `GITHUB_TOKEN` and repo **variables** `VITE_*` for `apps/web` —
out of scope here.

## 6. Mobile / EAS (`apps/mobile`)

`eas.json` requires eas-cli ≥ 16.31.0 (not a repo dependency — use
`bunx eas-cli@latest` or a global install). The app reads exactly one
environment variable.

| Name | Kind | Envs | Command | Breaks without it |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_*` — inlined into the JS bundle at build time, **not secret** | EAS `production` (and `preview` if it should not hit staging) | `eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://<production-site-origin> --visibility plaintext` (run in `apps/mobile`) | Falls back to the **staging** Worker (`https://smog-site-staging.vanneszias.workers.dev`, `src/lib/api.ts`). A production store build without it silently talks to staging. The value is the site origin with no `/api` suffix. |

`eas.json` profiles set no `environment` key; set one explicitly per profile
(or confirm in the build log which EAS environment was loaded) rather than
relying on inference. Google sign-in on mobile needs nothing in the app: it
goes through the site's `/auth/google?client=mobile` and returns via
`smogmobile://auth-callback` (hard-coded; the `scheme` in `app.json`).

### Mobile analytics (Stage 8.6)

`apps/mobile` sends analytics events straight from the device to OpenPanel
(`src/lib/analytics.ts`), gated on the on-device consent decision — never
through `apps/site`. It reads three variables, all `EXPO_PUBLIC_*`:

- `EXPO_PUBLIC_OPENPANEL_API_URL`
- `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`
- `EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET`

Every `EXPO_PUBLIC_*` variable is inlined into the JS bundle at build time —
Expo/Metro substitutes the literal `process.env.EXPO_PUBLIC_…` expression
during bundling — so it ships inside the compiled app and is extractable
from any installed copy. It is **public by construction**, not a secret in
the normal sense, regardless of the name. This is exactly why these three
values must be a **separate, least-privileged** OpenPanel client scoped to
this native app, and must never be the web pair (`OPENPANEL_CLIENT_ID` /
`OPENPANEL_CLIENT_SECRET`, set as Worker secrets in §6 above) — the web
pair's blast radius (the whole `analytics.zias.be` project as seen from the
Worker) is not something to also hand out in an APK/IPA.

Set each with `eas env:create`, matching the form already used for
`EXPO_PUBLIC_API_URL` above (run in `apps/mobile`):

```bash
eas env:create --environment production --name EXPO_PUBLIC_OPENPANEL_API_URL --value https://analytics.zias.be/api --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_OPENPANEL_CLIENT_ID --value <native-client-id> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET --value <native-client-secret> --visibility sensitive
```

`--visibility plaintext` for the URL and client id (there is nothing to hide
about either — both are readable in the shipped bundle anyway).
`--visibility sensitive` for the client secret only to keep it out of the EAS
dashboard's plaintext listing and build logs; it does **not** make the value
secret in the shipped app itself — see above. Repeat for `preview` if that
profile should also report analytics (`eas.json`'s `preview` profile builds
against `NODE_ENV=production`).

**Without these set:** analytics is a silent no-op. `src/lib/analytics.ts`'s
`getClient()` returns `null` whenever `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` or
`EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET` is unset, so `trackEvent`/
`trackScreenView` do nothing and no OpenPanel client is ever constructed —
no crash, no queued/dropped events, nothing in the OpenPanel dashboard. This
is entirely independent of consent: the prompt (`ConsentBanner`), the
Settings analytics switch, and the `smog.consent.analytics` /
`smog.consent.synced` on-device state (and the signed-in `POST
/api/consent` row it drives) all work exactly the same with or without these
variables set — only the OpenPanel send is affected.

**Local dev:** `apps/mobile` has no `.env.example` of its own; the three
`EXPO_PUBLIC_OPENPANEL_*` names are already documented in the **root**
`.env.example` (written for the legacy `apps/native`, reused here — the
comment there calls out the native pair specifically, distinct from the web
`OPENPANEL_CLIENT_*` pair above it). Copy the root `.env.example` values (or
your own least-privileged native-client credentials) into `apps/mobile`'s
local environment however Expo picks up `EXPO_PUBLIC_*` for that dev flow
(e.g. a `.env` file read by `expo start`); nothing further to add per-app.

## First deploy, in order

Run from the repo root unless stated. Do staging end to end first; repeat
steps 4–9 with `production`.

1. **Rotate the exposed Cloudflare API token** (dashboard). Update the GH
   secret: `gh secret set CLOUDFLARE_API_TOKEN`.
2. Authenticate this shell (§ Before you start, item 5).
3. Confirm resources exist (from `apps/site`):
   ```bash
   cd apps/site
   bunx wrangler d1 list              # expect smog-staging, smog-production with the IDs in wrangler.jsonc
   bunx wrangler r2 bucket list       # expect smog-staging-media, smog-production-media
   bunx wrangler r2 bucket create smog-staging-media      # only if missing
   bunx wrangler r2 bucket create smog-production-media   # only if missing
   ```
   Start Email Service sending-domain onboarding now (DNS propagation is the
   slow part).
4. Set the Worker secrets for the environment (still in `apps/site`). If
   wrangler reports the Worker does not exist yet, accept its offer to create
   it, or run step 6 first and accept that the site 500s until
   `PAYLOAD_SECRET` is set.
   ```bash
   openssl rand -hex 32 | bunx wrangler secret put PAYLOAD_SECRET --env=staging
   bunx wrangler secret put JOBS_RUN_TOKEN --env=staging            # paste from the password manager (§1)
   bunx wrangler secret put MOLLIE_API_KEY --env=staging
   bunx wrangler secret put OPENPANEL_CLIENT_ID --env=staging
   bunx wrangler secret put OPENPANEL_CLIENT_SECRET --env=staging
   bunx wrangler secret put GOOGLE_CLIENT_ID --env=staging          # if offering Google sign-in
   bunx wrangler secret put GOOGLE_CLIENT_SECRET --env=staging      # if offering Google sign-in
   bunx wrangler secret put MUX_TOKEN_ID --env=staging
   bunx wrangler secret put MUX_TOKEN_SECRET --env=staging
   # Once the Remotion Lambda function and site are deployed (apps/render/README.md), not before:
   #   MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_PRIVATE, RENDER_CALLBACK_SECRET,
   #   REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY (the Worker IAM user's key)
   # MUX_SOURCE_SERVICE_TOKEN is not needed for Lambda renders (see §1).
   # REMOTION_REGION is already a var in wrangler.jsonc; REMOTION_FUNCTION_NAME and
   # REMOTION_SERVE_URL are vars too, added in a reviewed commit once deployed — see §2.
   bunx wrangler secret list --env=staging                          # names only — check spelling
   ```
5. Migrate the database (schema before code, always):
   ```bash
   CLOUDFLARE_ENV=staging bun -F site deploy:database
   ```
   For importing the Convex catalogue export into this database, see
   [`docs/cutover-runbook.md`](./cutover-runbook.md).
6. Build and upload the Worker:
   ```bash
   CLOUDFLARE_ENV=staging bun -F site deploy:app
   ```
   (`CLOUDFLARE_ENV=staging bun -F site deploy` runs 5 then 6.)
7. Register the Google redirect URI `https://<origin>/auth/google/callback`
   for this environment's origin in Google Cloud (if Google sign-in is on).
8. Smoke-check: home page renders; `/admin` loads; sign-in works; the
   Worker log (`bunx wrangler tail --env=staging`) shows no
   `[openpanel] Relay credentials are not configured` warning after a page
   view. Then confirm the cron actually ticks, rather than trusting the
   dashboard's "configured" badge: keep `bunx wrangler tail --env=staging`
   open across the next `:00` and expect
   `[jobs] Ran N jobs from the default queue`; or, while tailing:
   ```bash
   read -rs JOBS_RUN_TOKEN     # from the password manager
   printf 'Authorization: Bearer %s\n' "$JOBS_RUN_TOKEN" | curl --max-time 600 -H @- https://<origin>/api/jobs/run
   ```
   (it answers `200` either way, so read the log line, not the status;
   `--max-time` because an HTTP run has no wall-clock limit while the client
   stays connected, and the recovery below assumes every run ends within
   thirty minutes).
   Check the Worker's **Cron Triggers → Past Events** tab: a failing tick
   now records as failed there. And check **Workers Logs** for the same
   `[cron]`/`[jobs]` lines — with `observability.enabled` on
   (`wrangler.jsonc`), they persist there and are not only visible to a live
   tail.

   **A killed run, and what it leaves behind.** A run the platform cuts off
   (the fifteen-minute ceiling, an eviction, a deploy mid-tick) leaves the
   jobs it had claimed marked `processing`. Every tick now recovers any
   such job in the `default` queue that has not been written for thirty
   minutes (`src/jobs/reapStrandedJobs.ts`) — safe because a scheduled run
   cannot outlive its fifteen-minute ceiling, and a manual `curl` is held to
   ten minutes by `--max-time 600` above — and logs `[jobs] Recovered
   stranded jobs: N released to run again, M filed as failed, K could not
   be recovered and are left for the next tick`. A non-zero K comes with a
   `[jobs] Failed to reap stranded job <id>` error per row. Seeing the line
   at all means a run was killed; look for why
   around the same time in Workers Logs. A released `send-email` may send
   its message twice (at-least-once, as the old queue did). A job **filed as
   failed** was given up on; for a `send-email` row that is a message that
   may never have been sent. List them with:

   ```bash
   bunx wrangler d1 execute smog-staging --remote --env=staging --command \
     "SELECT id, task_slug, total_tried, updated_at FROM payload_jobs WHERE has_error = 1 AND json_extract(error, '$.message') LIKE '[jobs] Stranded%'"
   ```

   (`smog-production` / `--env=production` for production.) The query reads
   only ids, task names and times — never `input`, which holds the
   recipient.
9. Mobile: `eas env:create …EXPO_PUBLIC_API_URL…` for the matching EAS
   environment, then build. Only production builds should point at production.

## Open items (not configured in the repo yet — do not invent config)

- **Production origin — decided 2026-09-23: `https://app.smog.vlaanderen`,
  as a Cloudflare for SaaS custom hostname on the `zias.be` zone**
  (`docs/cutover-runbook.md`, section 1, decision 2, has every step and the
  records the `smog.vlaanderen` DNS owner adds). Until the cutover's switch
  `wrangler.jsonc` has no `routes` and production answers at
  `smog-site-production.<account>.workers.dev`, which is also today's
  `vars.SITE_ORIGIN`. The route
  (`app.smog.vlaanderen/*` on zone `zias.be`) and `SITE_ORIGIN` change
  together in one commit, since a stale `SITE_ORIGIN` after the address moves
  is a working link to nowhere in a sponsor's inbox. `EXPO_PUBLIC_API_URL`
  for the production store build and the Google redirect URI use the final
  address.
- **Remotion Lambda is not deployed.** The submit transport, the callback and
  the stalled-render sweep are built and tested against Remotion's own
  fixtures (no AWS account is available to this work); what is left is the
  operator's own deploy. `docs/cutover-runbook.md`, section 1, decision 7 has
  the full setup order, staging first: AWS account, the deploy and Worker IAM
  users, `bun -F render deploy:function`, `deploy:site:staging`, staging's
  vars and secrets, one real staging render that must reach `ready`, then
  `deploy:site:production` and production's. Renders are submitted when a
  payment is paid (the Mollie webhook), never at checkout. Until then the
  `REMOTION_*` vars, the two AWS secrets, `RENDER_CALLBACK_SECRET` and
  `MUX_SIGNING_KEY_*` are unset and rendering stays off, exactly as it is in
  every environment today.

## Launch blockers that are not variables

- **The first staging render must reach `ready`** before production's
  rendering vars are set, or before launching with rendering on at all
  (`docs/cutover-runbook.md`, section 1, decision 7, step 5). Pay for a
  sponsorship on staging and confirm its `renders` row in `/admin` ends
  `ready`, with a Mux playback id on the sponsorship's preview. The likeliest
  failure is the source video: `lib/mux.ts` renders from Mux's `high.mp4`,
  which exists only for assets with MP4 static renditions, and the legacy
  uploader never enabled them. The two known fixes — a `highest` static
  rendition on every gesture asset, or a master-access source as the legacy
  renderer used — are in the runbook.

- **Privacy policy EN/FR:** `apps/site/src/app/(frontend)/[locale]/privacy/page.tsx`
  — only the Dutch text is reviewed. English and French are machine-assisted
  drafts showing an "Unreviewed draft translation" notice. Needs professional
  translation and legal review; remove each locale's `draft` only after
  sign-off.
- **OpenPanel projects for `analytics.zias.be`:** decide and create the
  staging and production projects (one self-hosted instance serves both;
  the client id/secret pair is what separates them) before setting
  `OPENPANEL_CLIENT_*`.
- **Email Service sending-domain onboarding for `zias.be`:** in the
  Cloudflare dashboard, onboard `zias.be` to Email Service (Email → Email
  Sending) and let it add its SPF, DKIM and DMARC records to the zone; until
  they verify, no email can be sent from either environment. `zias.be` is in
  this account, so this needs nobody outside it. If `zias.be` already has
  SPF or DMARC records for another mail sender, merge them rather than
  adding a second record of either kind.
- **Code work still open before cutover:** the cron is wired (`worker.ts`'s
  `scheduled()`, `wrangler.jsonc`'s hourly `triggers.crons`) and drains the
  job queue every hour once `JOBS_RUN_TOKEN` and `SITE_ORIGIN` are set (see
  §1–§2 above) — proven against a real build and a real local scheduled
  trigger, `docs/superpowers/plans/2026-09-22-cron-wiring.md`'s "Exit:
  measured". What is still open is either deploying Remotion Lambda (this
  checklist's "Open items" above) or an explicit decision to launch
  sponsorship with rendering off. Production holds no sponsorships today
  (spec, "What the production export actually contains"), which makes that a
  product decision, not a data risk.
