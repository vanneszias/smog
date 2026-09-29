# Phase 4: Account, consent, analytics, legal, links, maintenance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full account management (profile, sign-in methods, consent, export, deletion), consent-gated analytics through OpenPanel, localized legal pages, app and universal links with the web open-in-app flow, legacy URL redirects, a native Turnstile path for mobile email auth, maintenance mode, and security headers (CSP).

**Architecture:**
- `@smog/account` gains the rest of its procedures and hooks.
- A new `@smog/analytics` package has `./schema` (taxonomy), `./web`, `./native` and `./server` (relay) entries.
- The site gains `/account`, `/privacy`, `/terms`, the analytics relay route, the legacy redirect table, the maintenance middleware and the response headers middleware.
- The mobile app gains settings/account, the consent sheet and a Turnstile WebView.

**Tech stack:**
- Better Auth client APIs: `passkey`, `linkSocial`/`unlinkAccount`, `changePassword`, `deleteUser`.
- `@openpanel/react-native` for mobile, with a bun patch if its peers still reject SDK 57. Web has no SDK: it uses a first-party relay.
- `react-native-webview` ([dep], Expo-supported) for the Turnstile widget.
- Web Crypto HMAC for the maintenance bypass cookie.

**Spec:** §6, §9, §10, §11, §12, §14, §16 (flow 3), and inventory rows U-* (account, consent, export, deletion), P-* (analytics, consent banner, legal, rate limits, maintenance, SEO/headers, deep links, legacy URLs).

## Global constraints

- All earlier phase global constraints apply. In addition: migrations are append-only; every cookie-authenticated non-oRPC endpoint applies `isForeignRequest` (`@smog/rpc`); analytics never blocks or fails a product action; nothing is sent to OpenPanel before consent is `true`; no free text, search terms, emails or names ever go into analytics properties.
- Consent policy version: `CONSENT_POLICY_VERSION` (`@smog/config/constants`). A signed-in consent change appends a `consent_event`; guests keep it in the local store only.
- Account deletion: requires a fresh session (Better Auth `deleteUser` with the password or a recent sign-in, per Better Auth's documented options). It cascades per the data model. Sponsorship records are kept (they belong to the sponsor, not the user, per the legal retention rules). Afterwards the client signs out and clears local data.
- The export is JSON and versioned (`exportVersion: 2`). It contains profile, sign-in methods (provider names only, never tokens), favorites, lists with items and active share links, consent history, and sponsorships whose `sponsor.email` equals the user's verified email (contact and invoice fields plus status and dates, but no payment ids).
- Legal copy: Dutch is canonical and ported from `/home/user/ref-master/apps/web/src/routes/{privacy,terms}.tsx`, updated for the new processors (Cloudflare: Workers, D1, R2, KV, Queues, Email; Better Auth self-hosted; Mux; Mollie; OpenPanel self-hosted at analytics.zias.be; Expo; Google/Apple as optional sign-in providers). Remove WorkOS, Convex, Redis/BullMQ, SMTP/IMAP and guest server rows ("guest data never leaves the device"). Retention: remove the guest line; keep admin logs 3 years, unpaid sponsorship attempts 24 h, and payment/invoice data up to 10 years. The en/fr versions are complete translations with a banner "This translation is provided for convenience; the Dutch version prevails" (i18n key).

## Review focus

1. No analytics network request happens before consent (e2e asserts zero requests to `/api/analytics` before clicking Allow, and zero after Withdraw).
2. Delete account really removes user data (favorites, lists, shares, consents, sessions) and signs out everywhere. A second tab's session is invalid immediately.
3. The maintenance page never blocks `/api/webhooks/*`, `/api/health`, `/.well-known/*` or the admin bypass, and the bypass cookie can't be forged (HMAC-verified, expiring).
4. Legacy redirects preserve the query string, never create open redirects (destinations are fixed paths), and `/gestures/<legacyId>` resolves.
5. CSP: nothing on the site breaks. Mux player, Turnstile, the theme script (hash), Remotion Player (phase 7, allow `blob:`), and OpenPanel only via same-origin relay. Report-only first in staging (`Content-Security-Policy-Report-Only`), enforce in production.

---

### Task 1: `@smog/account` (profile, consent, export, delete)

**Files:** `packages/features/account/src/{schema,contract}.ts` (extend), `src/server/{profile,consent,export,delete}.ts`, `src/client/{use-account,use-consent,use-export,use-delete-account}.ts`, tests.

**Interfaces:**
- `account.me() → { id, name, email, emailVerified, image, locale, role, createdAt, methods: { password: boolean, google: boolean, apple: boolean, passkeys: number } }`
- `account.updateProfile({ name?: 1..80, locale?: Locale | null })`
- `account.consent.get() → { analytics: boolean|null, decidedAt: number|null, policyVersion }`
- `account.consent.set({ analytics: boolean })`: appends a row and returns the new state.
- `account.export() → AccountExport` (schema in `./schema`, versioned 2)
- `account.delete({ confirm: literal("DELETE") })`: wraps Better Auth `deleteUser` via `auth.api`, and requires a fresh session (for example `freshAge`). Returns `{ deleted: true }`. On success the client calls `signOut` and resets the local store.
- `useConsent()` (platform-neutral): signed-in reads and writes the server log and mirrors it to the local store. Guests use the local store only. It exposes `{ status, analytics, set(value) }`.
- [ ] TDD service tests: consent append and current state, the export shape (Zod-validated) with a seeded user, list, share, consent and sponsor rows, a user without data, delete cascades plus session invalidation, updateProfile validation. Commit `feat(account): profile, consent log, export and deletion`.

### Task 2: `@smog/analytics` (taxonomy, consent gate, web relay, native client)

**Files:** `packages/analytics/src/{schema.ts,gate.ts,web.ts,native.ts,server/relay.ts,react.tsx}`, tests. Site: `apps/site/src/routes/api/analytics.ts`. Mobile: providers wiring. Patch `@openpanel/react-native` peers via `bun patch` if needed.

**Interfaces:**
- `analyticsEventSchema`: a discriminated union over `gesture_viewed { gesture_id, source }`, `gesture_collection_changed { action, collection: "favorites"|"list", gesture_id, source }`, `search_performed { query_length, result_count, category_count, has_results, source }`, `video_playback_completed { gesture_id }`, `screen_view { path }`, `sign_in_completed { method }`, `guest_data_imported { favorites, lists }` and `sponsorship_checkout_started { gesture_count, has_logo }`. All enums come from the old taxonomy (analysis 05 §5). The `platform` property is added by the client.
- `createAnalytics({ transport, getConsent, platform })` returns `{ track(event), identify(userId), reset(), screen(path) }`. It is a no-op unless consent is `true`; errors are logged with `[analytics]` and swallowed.
- Web transport: `POST /api/analytics` with `{ type: "track"|"identify", payload }`, `keepalive`.
- Server `handleAnalyticsRelay(request, env)`:
  - checks `isForeignRequest` (403), `RL_ANALYTICS`, and the body against the schema (400);
  - forwards to `${OPENPANEL_API_URL}/track` with the `openpanel-client-id`/`openpanel-client-secret` headers, `x-client-ip` from `cf-connecting-ip`, and the user-agent;
  - always returns 202;
  - skips with a warning if the credentials are unset.
- Native transport: `@openpanel/react-native` with a write-only client id/secret from `EXPO_PUBLIC_OPENPANEL_*`, created only after consent. `clear()` on withdraw.
- `AnalyticsProvider` plus `useAnalytics()` hook.
- The screen tracker hooks into the router location on both apps.
- Wire every `// analytics:` marker left in phase 3 code, and add `sign_in_completed` and `guest_data_imported`.
- [ ] TDD:
  - gate tests: no transport call before consent, and none after withdraw
  - schema tests: reject free text and unknown events
  - relay tests with a fetch mock: forwards with secret headers; 403 for a foreign origin; 429 over the limit; 202 when OpenPanel fails
  - e2e: no `/api/analytics` request before Allow
- Commit `feat(analytics): consent-gated OpenPanel with a first-party relay`.

### Task 3: Consent UI and account screens (site + mobile)

**Files:** `apps/site/src/routes/account.tsx` (full), `apps/site/src/components/consent-banner.tsx`, `apps/mobile/app/settings/account.tsx`, `apps/mobile/src/components/consent-sheet.tsx`, i18n, e2e.

**Behaviour:**
- Consent: the web banner is fixed at the bottom on first visit with Allow / Only necessary and a privacy link. The mobile sheet shows on first launch. Both have a toggle in settings and account.
- Account page sections:
  - Profile: name, email (read-only), language.
  - Sign-in methods:
    - password: set when none exists (reset flow), otherwise change
    - passkeys (web): list, add, remove
    - Google/Apple: link and unlink, where unlinking is refused if it is the last method
  - Privacy: analytics toggle, download export (web: file download; mobile: Share sheet with a JSON file via `expo-file-system` + `expo-sharing` [dep if not present]).
  - Delete account: an AlertDialog typing `DELETE`, with a fresh sign-in if required.
  - Preferences: theme, language.
- Guests see a sign-in prompt plus their local preferences.
- e2e:
  - consent banner behaviour
  - export downloads valid JSON
  - delete account: sign in again fails, and the favorites are gone
- Screenshots (light/dark × 390/1280) of `/account` and the banner, reviewed.
- Commit `feat(site,mobile): account management and consent UI`.

### Task 4: Legal pages, deep links, open-in-app, legacy redirects

**Files:**
- `apps/site/src/routes/{privacy,terms}.tsx`, with content in `packages/i18n/src/legal/{nl,en,fr}/{privacy,terms}.md` or structured JSON sections rendered with kit typography (keep it one source per language)
- `apps/site/public/.well-known/{apple-app-site-association,assetlinks.json}` (paths `/gestures/*`, `/lists/*`; Apple team `96XKP6MU2A`, bundle `be.zias.smog`; the Android SHA-256 from the old repo)
- `_headers`-equivalent content types via the headers middleware
- `apps/site/src/lib/legacy-redirects.ts` + tests
- the site AppBanner (the old copy: store links `https://apps.apple.com/app/smog-co/id6758547774` and `https://play.google.com/store/apps/details?id=be.zias.smog`, shown on mobile browsers after the consent decision, dismissible in the local store)
- the Open-in-app button on the gesture page (a universal link)

**Behaviour:**
- The legacy redirect table (301, query preserved) follows spec §9: `/sponsors*` → `/sponsor*`, `/sponsors/re-edit` → `/sponsor/edit`, `/sponsors/success` and `/success` → `/sponsor/success`, `/login` → `/sign-in`, `/callback` → `/`, `/favorites` stays, `/gestures?category=<Name>` → slug mapping (spec DECISIONS), and `/gestures/<convexId>` (already done in phase 3; test it here).
- release-config-check asserts that the AASA and assetlinks files match `app.config.ts` (team id, bundle, package, paths).
- [ ] Tests for the redirect table, the AASA/assetlinks consistency and the legal pages rendering in 3 languages with a translation banner for en/fr. Commit `feat(site): legal pages, app links, open-in-app and legacy redirects`.

### Task 5: Mobile Turnstile and magic-link handoff

**Files:**
- `apps/site/src/routes/turnstile-bridge.tsx`: a minimal page rendering the Turnstile widget that posts the token to `window.ReactNativeWebView.postMessage`. It is only for the `smog://` app user agent and has a CSP allowing challenges.
- `apps/mobile/src/components/turnstile-sheet.tsx` (`react-native-webview`)
- `packages/auth/src/react.tsx` (`useAuthFlow` asks for a captcha token when `requiresCaptcha`)
- Magic link for the app: the link goes to `https://<site>/magic-link?…&app=1`. The site verifies it, then redirects to `smog://auth-callback?cookie=…` using Better Auth's expo plugin mechanism (check the current `@better-auth/expo` docs for a supported deep-link session handoff). If none is supported, keep magic links web-only and record it.
- Tests: the auth-flow state machine asks for a captcha when the server says it is required; the bridge page posts its message (Playwright with a fake RN bridge).
- Commit `feat(auth,mobile): Turnstile bridge for the app and magic-link handoff`.

### Task 6: Maintenance mode, security headers and CSP

**Files:** `apps/site/src/worker/{maintenance.ts,headers.ts}`, `apps/site/src/worker/maintenance-page.ts` (static HTML, nl/en/fr by `Accept-Language`, port the old `maintenance/index.html` design with the brand tokens), `scripts/maintenance.ts` (`bun run maintenance --env <env> on|off [--message …] [--until ISO]`, which uses `wrangler kv key put --binding KV`), tests.

**Behaviour:**
- KV `maintenance` holds `{ enabled, message?, until?, bypassVersion }`, with a 30 s isolate cache.
- When enabled, every request except the exempt paths gets 503 with `Retry-After` (the seconds until `until`, else 600) and `Cache-Control: no-store`. The exempt paths are `/api/webhooks/*`, `/api/health`, `/.well-known/*` and requests with a valid bypass cookie.
- The bypass cookie is `smog_mx=<exp>.<hmac>`. The HMAC is SHA-256 over `exp|bypassVersion` with `BETTER_AUTH_SECRET`, and the cookie is `HttpOnly; Secure; SameSite=Lax`, 12 h. It is issued by `POST /api/maintenance/bypass`, admin session only (phase 5 adds the admin UI toggle; the CLI works now).
- Security headers on every HTML response:
  - `Strict-Transport-Security` (not in dev), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`.
  - CSP: `default-src 'self'; script-src 'self' 'sha256-<theme script>' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://image.mux.com; media-src 'self' blob: https://stream.mux.com https://*.mux.com; connect-src 'self' https://*.mux.com https://inferred.litix.io; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
  - The theme script hash is computed at build time from the same source string used in the page. A test asserts the header hash matches the inline script.
  - Staging sends it `Report-Only`; production enforces it.
- Tests:
  - maintenance on → 503 page in the right language
  - exempt paths pass
  - a forged, expired or old-version bypass cookie → 503
  - a valid cookie passes
  - the headers are present
  - the CSP hash matches
  - e2e with the CSP enforced in the test env: the home, gesture (the Mux player loads) and sign-in (Turnstile test key) pages show no CSP console violations
- Commit `feat(site): maintenance mode, security headers and CSP`.
