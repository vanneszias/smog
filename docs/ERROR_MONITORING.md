# Error monitoring (Rustrak)

The Worker, the browser and the mobile app report errors, performance and cron runs to our self-hosted [Rustrak](https://rustrak.dev/getting-started/overview), which speaks the Sentry protocol. The apps use the official Sentry SDKs pointed at Rustrak; nothing goes to sentry.io. Every reporter is **off until its DSN is set**, so dev, the tests and an env without Rustrak behave exactly as before. The decision is in `docs/DECISIONS.md`, "Error monitoring with Rustrak".

All three report to one Rustrak project. The `service` tag (`worker`, `web`, `mobile`) and the release tell them apart; `environment` is `dev`, `staging` or `production`.

| Reporter | SDK | Code | DSN | Release |
|---|---|---|---|---|
| Worker (`fetch`, `queue`, `scheduled`) | `@sentry/cloudflare` | `apps/site/src/worker/monitoring.ts`, wired in `apps/site/src/worker.ts` | `SENTRY_DSN` var (`wrangler.jsonc`, `.dev.vars` locally) | `smog-worker@<commit>` |
| Browser | `@sentry/react` (a lazy chunk) | `apps/site/src/lib/monitoring.ts`, `apps/site/src/lib/monitoring.sdk.ts` | the same `SENTRY_DSN`, rendered into the page as `<meta name="smog-monitoring-dsn">` | `smog-web@<commit>` |
| Mobile app | `@sentry/react-native` (`~8.28`, the version Expo SDK 58 pins) | `apps/mobile/src/monitoring.ts`, `apps/mobile/app/_layout.tsx` | `EXPO_PUBLIC_SENTRY_DSN` (EAS environment variable) | the SDK's own, `<bundle id>@<version>+<build>` |

The commit comes from `SENTRY_RELEASE` (the deploy job sets it to `github.sha`) or `GITHUB_SHA` (`apps/site/build-defines.ts`).

## What is reported

- **Worker.** An exception that escapes `fetch` (`respondSecurely` hands it to Sentry before answering 500), `queue` or `scheduled` (the SDK's wrappers rethrow, so retries and dead letters are unchanged). Every `console.error` line (`captureConsoleIntegration`): the project's `[service] Failed to ...:`, error lines become issues with that prefix as their **`feature` tag** (`[rpc:lessons.get]`, `[maintenance]`, `[i18n]`, ...). The top-level `[error] <entry>` line is dropped there because its exception is reported as itself. A check-in per Cron Trigger run (`cronTriggersIntegration`): Rustrak creates one monitor per `@smog/jobs` cron name (`expiry`, `reminders`, `stale`, `retention`) on its first run and flags a missed or failed run. Request, queue and cron transactions.
- **Browser.** Uncaught errors and rejections (React's uncaught and recoverable errors included, through `window.reportError`), errors an error boundary caught (`hydrateRoot`'s `onCaughtError`, so TanStack Router's error component too), page-load and navigation transactions named by route. Not reported: redirects and not-found (not `Error`s), an API error below 500 (an expected answer; the Worker reports its own 500s) and a fetch that failed for the network.
- **Mobile.** JS errors, native crashes, app hangs, release health (sessions), Expo Router screen transactions, and every `console.error("[feature] Failed to ...", error)` line with its `feature` tag. `Network request failed` (an offline device) is ignored.
- **Sampling.** Errors 100 %; transactions 10 % in production, everything elsewhere (`tracesSampleRate` in `@smog/utils`). The v11 SDKs stream spans by default; the site sets `traceLifecycle: "static"` so Rustrak gets classic transactions.

## The browser tunnel and the bundle

The browser never talks to Rustrak. It posts its envelopes to `POST /api/monitoring` (`apps/site/src/server/monitoring-tunnel.ts`, `docs/API.md`), and the Worker forwards an envelope only when its header names this env's own DSN. So the CSP stays `connect-src 'self'`, ad blockers do not drop reports, and Rustrak sees the Worker's address, never a visitor's. Same-origin, `RL_ANALYTICS` per IP (`monitoring:<ip>`), 256 KiB cap, empty answers, nothing logged.

The SDK (about 30 kB gzip) is a lazy chunk loaded right after hydration starts; only a small buffer is in the entry (about 0.6 kB gzip per route, `apps/site/perf-budget.json`). Errors raised before the chunk arrives are held (at most 20) and sent once it has.

## Privacy

Error reporting runs under legitimate interest (fault diagnosis), not analytics consent; the privacy text already names fault diagnosis and error information; the proposed Rustrak processor and retention lines are in `docs/LEGAL-SIGNOFF.md`, item 12, to publish before the DSN is set. The rules live in one place, `packages/utils/src/monitoring.ts`, and every reporter passes events, transactions and breadcrumbs through them:

- No cookies, request bodies, query strings, fragments or response headers; request headers only `user-agent`, `accept-language` and `content-type` (the SDKs' `dataCollection` is off on top).
- URLs keep their origin and path; capability segments become `:token` (`/lists/<token>`, the app's `/shared/<token>`, reset links, the signed logo upload, any token-shaped segment; `redactUrl` in `packages/utils/src/url.ts`, shared with the CSP report log). Sponsor re-edit and renewal tokens live in the fragment, which is always dropped.
- Free text (messages, exception values, `extra`, tags, breadcrumbs) goes through `redactMessage`: addresses, URL tails, credentials and long token-like runs are masked. A sensitive key (`password`, `token`, `cookie`, `secret`, `email`, ...) is `[Filtered]` wherever it appears.
- The user is the account id only (`setUser({ id })`), never an address, a name or an IP address.

## Setup (owner)

1. **Rustrak reachable at `https://error.zias.be`** with `PUBLIC_URL=https://error.zias.be` (otherwise the DSN it shows names `0.0.0.0:8080`). It runs there with project `2` (the code assumes that id; change `RUSTRAK_PROJECT` in `apps/mobile/app.config.ts` and set the `SENTRY_PROJECT` variable for the site if it differs). Create an API token (Settings, API Tokens) for the uploads.
2. **Worker and browser:** the DSN is in `SENTRY_DSN` of `env.staging.vars` in `apps/site/wrangler.jsonc`; `env.production.vars` stays empty until item 7 below is done, then gets the same DSN. It is public: it also ships in the page.
3. **Source maps of the Worker:** the GitHub secret `SENTRY_AUTH_TOKEN` (the Rustrak API token) and, optionally, the variable `SENTRY_URL` (default `https://error.zias.be/`; it must be the host Rustrak's `PUBLIC_URL` names, or the CLI refuses the token). With the token, the deploy's `vite build` makes hidden source maps **for the Worker only**, uploads them with debug ids and deletes them before the deploy guard runs, which still fails on any map left in `dist`. Without it nothing changes. The organization is `rustrak` (the slug Rustrak reports; the Sentry CLI 0.45 fails on any other), the project `2` (`SENTRY_ORG`, `SENTRY_PROJECT` override them). **The browser bundle gets no maps:** Rustrak matches maps by debug id only, and the plugin's id snippet in every chunk (about 250 bytes gzip each) would cost about 20 kB of initial JavaScript per route, so browser stack traces stay minified. Turning them on is an owner decision with a budget raise (`docs/DECISIONS.md`, "Error monitoring with Rustrak").
4. **Mobile:** EAS environment variables per EAS environment (development, preview, production): `EXPO_PUBLIC_SENTRY_DSN` (plain text) and `SENTRY_AUTH_TOKEN` (secret). The `@sentry/react-native/expo` plugin uploads the Hermes source maps, the dSYMs and the ProGuard mapping to Rustrak during an EAS build. `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD=true` for development and `SENTRY_ALLOW_FAILURE=true` for staging and production, so a missing token or an unreachable Rustrak never fails a build. Local `expo run:*` skips the upload. After an OTA update, upload its maps: `SENTRY_URL=https://error.zias.be/ SENTRY_AUTH_TOKEN=… bunx sentry-expo-upload-sourcemaps dist` from `apps/mobile`.
5. **A native build first.** `@sentry/react-native` is a native module: it changes the runtime fingerprint, so the first release with it must be an EAS build, not an OTA `eas update`.
6. **Staging behind Cloudflare Access:** add `/api/monitoring` to the bypass list (`docs/deployment.md` §8), or the browser's reports never reach the Worker.
7. **The privacy texts:** review and publish item 12 of `docs/LEGAL-SIGNOFF.md`, and set a retention period in Rustrak.

## Trying it locally

```bash
docker run -d --name rustrak -p 8099:8080 \
  -e SESSION_SECRET_KEY=$(openssl rand -hex 32) \
  -e CREATE_SUPERUSER=admin@smog.test:changeme123 \
  -e PUBLIC_URL=http://localhost:8099 -e RUSTRAK_TELEMETRY=off \
  rustrak/rustrak-server:latest
```

Sign in at `http://localhost:8099`, create a project, put its DSN in `apps/site/.dev.vars` as `SENTRY_DSN=...` (and in `apps/mobile/.env` as `EXPO_PUBLIC_SENTRY_DSN`), then start the dev server. Page loads show as transactions, `bun run cron retention` creates the `retention` monitor, and an error thrown in the browser console arrives through `/api/monitoring` with its URL redacted.

## Verifying a deployed env

1. `curl https://error.zias.be/health` answers `{"status":"ok"}`.
2. The page source has `<meta name="smog-monitoring-dsn">`; the browser's network panel shows `POST /api/monitoring` answering 200 after an error.
3. Rustrak shows the env's transactions under `service:worker` within a minute of traffic, and the four cron monitors after a day.
