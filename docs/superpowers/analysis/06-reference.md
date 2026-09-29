# Reference branch analysis: /home/user/ref-cerf (HEAD edf8f23)

Paths below are relative to /home/user/ref-cerf. Repo name is `smog`, bun@1.3.14 workspaces `apps/*`, `packages/*`. Apps: `mobile`, `render` (Remotion), `site` (Payload/Next; NOT to be ported). Packages: `brand`, `config`, `i18n`, `shared`, `styles`, `types`, `ui-native`, `ui-web`.

## 1. packages/brand (`@smog/brand`, private, type: module)

Files (all copyable):
- `packages/brand/package.json` : scripts `check-types: tsc -b`, `generate: bun run src/generate.ts`, `test: vitest run`. devDeps: `@smog/config`, `@smog/styles` (workspace), `sharp 0.35.4`, `typescript ^5.9.3`, `vitest ^4.1.11`.
- `packages/brand/tsconfig.json` (extends `@smog/config/tsconfig.base.json`, composite, rootDir src, references ../styles), `vitest.config.ts` (node env, globals, `src/**/*.test.ts`).
- `src/generate.ts` (9 KB) : the icon generator.
- `src/ico.ts` : hand-written ICO encoder (PNG-in-ICO, ICONDIR + 16-byte entries, sizes 1..256). `src/ico.test.ts`.
- `src/recolour.ts` : `svg.replaceAll("currentColor", colour)`; separate module so tests avoid importing the generator.
- `src/outputs.test.ts` + `src/test-helpers.ts` : drift tests. Verify each committed output: PNG dimensions/colour type/opacity, ICO contents, SVG vectors equal `recolour(art, colour)`, and store icon SHA-256 (`655c3d08...8042`). Minimal PNG/ICO/XML readers, no sharp needed.
- Artwork in `src/art/`:
  - `logo.svg` (18 KB) : horizontal wordmark "SMOG & Co", viewBox `0 0 2666.6667 578.88`, single `<g fill="currentColor" transform="matrix(0.1333,0,0,-0.1333,0,578.88)">` containing raw `<path d=...>` glyph outlines (font-outline paths, flipped Y). No components.
  - `logo-stacked.svg` (23 KB) : stacked mark, viewBox `0 0 2399 1489`, `fill/stroke=currentColor`, nested `<g>` with transforms and `<path>`s.
  - `hand-1.svg`, `hand-2.svg`, `hand-3.svg` : illustration hands, viewBox `0 0 400 350`, `fill="currentColor"` paths.
  - `icon.png` : the App Store/Play store icon (kept byte-exact, hash-pinned in test).
  - `smog.icon/icon.json` + `smog.icon/Assets/logo.svg` : iOS 26 Icon Composer bundle (fill = green srgb 0.18206,0.58664,0.43133; layer `logo.svg` scale 0.32, translation [-15,30]; translucency 0.5; neutral shadow).
- All artwork is plain SVG paths in `currentColor`; there are no React components for it. RN uses pre-rasterised PNGs.

Generator (`bun -F @smog/brand generate`, i.e. `bun run src/generate.ts`; also `bun -F @smog/brand test`): reads the SVGs, extracts viewBox/body via regex, `compose()` builds a wrapped nested-`<svg>` on a canvas (optional `<rect rx>` background), recolours `currentColor` to fixed colours from `tokens.color.brand.primary` (green #00805F) and `tokens.color.white`, rasterises with `sharp` (`png({compressionLevel:9})`, `flatten` to green if opaque). Deterministic; outputs are committed and builds never run it. Constants: SQUARE_MARK_WIDTH 0.845 (matches store icon), FAVICON_CORNER_RADIUS 0.1875, MASKABLE_SAFE_ZONE 0.8, ANDROID_SAFE_ZONE 0.66, OG_LOGO_WIDTH 0.6, APP_LOGO_HEIGHT 32.

Outputs:
- Site (`apps/site/public`): `favicon.ico` (16/32/48), `icon.svg` (512), `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `og.png` 1200x630 (white logo on green), `brand/logo.svg`, `logo-green.svg`, `logo-white.svg`, `logo-stacked-white.svg`, `hand-{1,2,3}.svg`.
- Mobile (`apps/mobile/assets`): `icon.png` (copied verbatim), `smog.icon/` (copied dir), `android-icon-foreground.png` + `android-icon-monochrome.png` + `splash-icon.png` (all 1024, white stacked mark in 66% circle, transparent), `favicon.png` 48, `logo-{white,green}{,@2x,@3x}.png` (height 32/64/96 px).
- To port: change `SITE_PUBLIC`/`MOBILE_ASSETS` constants (top of generate.ts, derived from `../../../`), drop or repoint site outputs (favicon/og/PWA icons still useful for a Vite web app). Imports `tokens` from `@smog/styles` (only needs brand.primary and white). Error style: `[brand] ...` prefixes.

## 2. UI packages, NativeWind, Tailwind, tokens

### packages/styles (`@smog/styles`, source of truth)
`src/tokens.ts` (`tokens` object: `color.brand {primary #00805F, secondary #97C699, accent #EE971C, warning #F0C814, error #FF3B30}`, `color.neutral` 50..950 (#F7F8F9 ... #0E1013), `color.white`, `semantic.light` / `semantic.dark` roles (background, surface, surfaceRaised, borderSubtle, border, borderStrong, foreground, foregroundMuted, primary(+Foreground), accent, success, warning, danger, ring), `spacing` (0,1,2,3,4,5,6,8,10,12,16,20,24 + xs..xxl aliases), `radius` (sm 8, md 12, lg 16, xl 20, full), `fontSize` (+ lineHeight), durations), `hex.ts` (mixHex/parseHex, ramps), `contrast.ts` (WCAG contrast checks used by tests), `css.ts` (`toCssVariables(tokens, theme)`), plus tests. Pure TS, no deps beyond typescript/vitest. `main`/`types` point at `./src/index.ts` (no build step).

### packages/ui-web (`@smog/ui-web`, React 19 + Radix + Tailwind v4)
- `exports`: `.` -> `src/index.ts`, `./styles/theme.css`, `./styles/spacingScale`, `./vocabulary`. Script `generate:theme` (`scripts/generate-theme.ts` -> writes `src/styles/theme.css` from `src/styles/theme.ts::renderThemeCss()`).
- Components (`src/components`, each with a `.test.tsx`): Avatar, Badge, Banner, Button, Card, Checkbox, Dialog, DropdownMenu, EmptyState, Field, Input, Label, Pagination, Select, Sheet, Skeleton, Switch, Table, Tabs, Textarea, Toast (sonner), Tooltip. Domain (`src/domain`): CategoryFilter, GestureCard, GestureGrid, SearchBar, StatusBadge, VideoPlayer (Mux player). Lib: `cn.ts` (clsx + tailwind-merge), `controlBase.ts`. `vocabulary.ts` + test; `spacingScale.ts`; `test/jsdomShims.ts`.
- Deps: radix-ui primitives (avatar, checkbox, dialog, dropdown-menu, label, select, slot, switch, tabs, tooltip), `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `tailwind-merge ^3.5.0`, `lucide-react ^0.473.0`, `sonner ^2.0.7`, `@mux/mux-player-react ^3.12.0`. Dev: vitest ^4.1.11, jsdom ^28, @testing-library/react ^16.3, user-event ^14.6. Peer react/react-dom ^19.
- `"use client"` is per-component (Next-specific concern; irrelevant for Vite, can be stripped).
- Tailwind v4 wiring is CSS-first, no tailwind.config: generated `src/styles/theme.css` contains a header "GENERATED FILE", then `@theme { --color-background: #EDEFF1; ... --spacing-N ... --radius-* ... --font-size-* ... --line-height-* }`, then `.dark { ...overrides only }`, then `@theme inline { --text-xs: var(--font-size-xs); --text-xs--line-height: var(--line-height-xs); ... }`. Dark mode = class `.dark` re-declaring variables (no `dark:` classes needed on web). Consumer stylesheet (`apps/site/src/app/(frontend)/tailwind.css`):
```css
@import "tailwindcss" source(none);
@import "@smog/ui-web/styles/theme.css";
@source "../..";
@source "../../../../../packages/ui-web/src";
@source not "../../**/*.test.ts"; /* + .test.tsx, and same for ui-web */
```
  PostCSS: `postcss.config.mjs` -> `{ plugins: { "@tailwindcss/postcss": {} } }`. With Vite use `@tailwindcss/vite` instead. Versions: `tailwindcss ^4.3.2`, `@tailwindcss/postcss ^4.3.2`.

### packages/ui-native (`@smog/ui-native`, NativeWind v4 + Tailwind v3)
- `exports`: `.` -> `src/index.ts`, `./tailwind.config` -> `tailwind.config.js`, `./global.css`. Script `generate:theme` (`scripts/generate-theme.ts` -> `src/theme.ts::renderTailwindConfig()` -> `tailwind.config.js`, marked GENERATED; `src/theme.test.ts` fails on drift).
- Components (`src/components`, tests alongside): Avatar, Badge, Banner, Button (reference component, cva + `cn(variants, className)` last, `accessibilityRole` set), Card, EmptyState, Input, Sheet, Skeleton, Switch, Text, Toast (`ToastProvider`, `useToast`), plus `contract.test.tsx` (every component roots at `testID="root"`). Domain: CategoryFilter, GestureCard, GestureGrid (FlashList), SearchBar, StatusBadge, VideoPlayer (expo-video). Also `gate.test.tsx`, `lib/cn.ts`, `test/expoVideoMock.tsx`, `test/resolvedColor.ts`. Native has fewer components than web (no Checkbox/Dialog/Select/Table/Tabs/Tooltip/Textarea/Label/Field/Pagination/DropdownMenu).
- `babel.config.js`:
```js
module.exports = (api) => { api.cache(true); return { presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"] }; };
```
- `tailwind.config.js` (generated, v3 format):
```js
module.exports = { content: ["./src/**/*.{ts,tsx}"], presets: [require("nativewind/preset")],
  theme: { extend: { colors: {...}, spacing: {...px}, borderRadius: {...}, fontSize: {...} } } };
```
  Colors: `white`, each semantic light role kebab-cased (`background`, `surface`, `surface-raised`, `border-subtle`, `border`, `foreground-muted`, `primary`, `primary-foreground`, `ring`, ...), each dark role as `<role>-dark` (used as `dark:bg-surface-dark`; NativeWind needs real class), and `neutral-50..950`. Spacing keys 0..24 plus xs/sm/md/lg/xl/xxl; radius sm..full; fontSize xs..xxl.
- `global.css`: `@tailwind base; @tailwind components; @tailwind utilities;`. `nativewind-env.d.ts`: `/// <reference types="nativewind/types" />`.
- Jest: `preset: "jest-expo"`, `setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]`, `transformIgnorePatterns` allow-list `(\.bun/|\.pnpm|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop)`.
- Deps: `class-variance-authority ^0.7.1`, `clsx`, `tailwind-merge ^3.5.0`; peer `@shopify/flash-list 2.0.2`, `expo-video ~55.0.21`, `nativewind ^4.1.23`, `react ^19`, `react-native ^0.83.0`, `react-native-safe-area-context ~5.6.2`; dev `tailwindcss ^3.4.17`, `react-native-css-interop 0.2.7`, `react-native-reanimated 4.2.1`, `react-native-worklets 0.7.4`, `babel-preset-expo ~55.0.8`, `jest ~29.7.0`, `jest-expo ~55.0.22`, `@testing-library/react-native ^13.2.0`, `postcss ^8.5.28`.
- App-level (`apps/mobile`): `metro.config.js`:
```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
```
  `babel.config.js` = same presets as above plus `plugins: ["react-native-reanimated/plugin"]` (must be last). `tailwind.config.js` spreads `require("@smog/ui-native/tailwind.config")`, overrides `content: ["./app/**/*.{ts,tsx}","./src/**/*.{ts,tsx}","../../packages/ui-native/src/**/*.{ts,tsx}"]` and `darkMode: "class"` (required so `useColorScheme().setColorScheme` works for a manual light/dark override). `tsconfig.json` sets `jsxImportSource: "nativewind"`, `@/*` -> `./src/*`, includes `nativewind-env.d.ts`. `global.css` imported first in `app/_layout.tsx` (`import "../global.css";`).
- Gotcha: split ui-web (Tailwind v4, CSS vars) and ui-native (Tailwind v3 via NativeWind 4) share only `@smog/styles` tokens; both configs are generated and drift-tested.

## 3. Deep links and legacy redirects

Domain: `app.smog.vlaanderen` (served via Cloudflare-for-SaaS custom hostname on zone zias.be). Claimed paths: `/{nl,en,fr}/gestures/*`. Custom scheme `smogmobile://` (Google OAuth return `smogmobile://auth-callback`).

Files:
- `apps/mobile/app.json` : `ios.associatedDomains: ["applinks:app.smog.vlaanderen"]`, `ios.bundleIdentifier "be.zias.smog"`, `appleTeamId "96XKP6MU2A"`; `android.package "be.zias.smog"`, `intentFilters: [{ action: "VIEW", autoVerify: true, data: [ {scheme:"https", host:"app.smog.vlaanderen", pathPrefix:"/nl/gestures/"}, ..."/en/gestures/", "/fr/gestures/" ], category: ["BROWSABLE","DEFAULT"] }]`; `scheme: "smogmobile"`.
- `apps/mobile/app/+native-intent.tsx` : `redirectSystemPath({initial, path})`, called by expo-router before routing:
```ts
const GESTURES_URL = new RegExp(
  `^(?:https://app\\.smog\\.vlaanderen)?/(?:${availableLocales.join("|")})/gestures(/[^?#]*)?(\\?[^#]*)?(?:#.*)?$`, "i");
```
  Behaviour: `path.startsWith(REDIRECT_URI)` (Google auth return) -> `null` (do not navigate); `/xx/gestures/12[?q]` -> `/gestures/12[?q]` (fragment dropped); `/xx/gestures` or `/xx/gestures/` -> `/search` (query not carried); deeper (`/xx/gestures/12/video`) -> `/`; dot-segment ids (`.`, `..`, `%2E`, `%2E%2E`) -> `/` via `isDotSegment` (decodeURIComponent in try/catch); anything else returned unchanged. Must never throw (crash at launch). Imports `availableLocales` from `@smog/i18n` and `REDIRECT_URI` from `@/lib/google`.
- Tests: `apps/mobile/src/nativeIntent.test.ts` (it.each tables, includes app.json/well-known consistency checks), `apps/mobile/src/nativeIntentRouting.test.tsx` (expo-router/testing-library `renderRouter`), `apps/site/src/lib/appLinks.test.ts` (asserts AASA/assetlinks/_headers match `LOCALES`, APP_ID and fingerprint).
- `apps/site/public/.well-known/apple-app-site-association` (extensionless, JSON):
```json
{"applinks":{"details":[{"appIDs":["96XKP6MU2A.be.zias.smog"],"components":[
  {"/":"/nl/gestures/*","comment":"Gesture pages open in the app"},
  {"/":"/en/gestures/*","comment":"..."},{"/":"/fr/gestures/*","comment":"..."}]}]}}
```
- `apps/site/public/.well-known/assetlinks.json`:
```json
[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"be.zias.smog","sha256_cert_fingerprints":["23:4A:F1:75:8A:A7:4E:68:6B:D0:C0:9B:DA:E0:7F:ED:3F:64:C8:4E:D5:BD:EE:4A:AF:E6:EE:27:73:60:B1:C5"]}}]
```
  (Play app signing key; only Play-installed builds verify.)
- `apps/site/public/_headers` (Cloudflare Workers assets): both well-known files get `Content-Type: application/json` (AASA has no extension); `/brand/*` -> `Cache-Control: public,max-age=86400`; `/_next/static/*` immutable. Files must be static assets, no redirects (Apple refuses redirects).
- Verification commands documented in `docs/deployment-checklist.md` "App links" (curl -sI both files; `https://app-site-association.cdn-apple.com/a/v1/app.smog.vlaanderen`; `adb shell pm get-app-links be.zias.smog`).

Legacy URL redirects (web, in `apps/site/src/lib/legacyRedirects.ts`; consumed by `next.config.ts` `async redirects() { return LEGACY_REDIRECTS; }`; all 308, query passed through by Next; tested in `legacyRedirects.test.ts`). `home = "/nl"` (DEFAULT_LOCALE). The map, verbatim:
```ts
export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  { destination: `${home}/favorites`, source: "/favorites" },
  { destination: `${home}/account/lists`, source: "/lists" },
  { destination: `${home}/account/lists`, source: "/lists/:token" },
  { destination: `${home}/privacy`, source: "/privacy" },
  // No terms page exists; the home page is the nearest thing to one.
  { destination: home, source: "/terms" },
  { destination: `${home}/sponsor`, source: "/sponsor" },
  { destination: `${home}/sponsor`, source: "/sponsors" },
  { destination: `${home}/sponsor`, source: "/sponsors/re-edit" },
  { destination: `${home}/sponsor`, source: "/sponsors/success" },
  { destination: `${home}/sponsor`, source: "/success" },
  { destination: `${home}/account`, source: "/account" },
  { destination: `${home}/sign-in`, source: "/login" },
  // The old sign-in provider's return path; nothing signs in through it now.
  { destination: home, source: "/callback" },
].map((row) => ({ ...row, permanent: true as const }));
```
Data-dependent legacy routes live in `apps/site/src/endpoints/legacy.ts` (Payload endpoints, reached via Next rewrites): `/gestures/:id` looks up `legacyId` (old Convex `_id`) -> 308 to `/nl/gestures/<newId>` (Cache-Control `public, max-age=86400`) or 307 `no-store` to gesture list when unknown/inactive; `/gestures?category=<_id>` translates category ids through `legacyId` (max 20 values). Portable idea: a stable legacy-id column plus redirect-with-query-preserved. Not portable as-is (Payload/Next specific). `/lists/:token` deliberately goes to the owner's lists page.

## 4. Cloudflare D1/R2, CI gate, docs

### wrangler (`apps/site/wrangler.jsonc`, JSONC with long rationale comments)
- Top level: `main: "worker.ts"`, `name: "smog-site"`, `compatibility_date "2025-08-15"`, flags `["nodejs_compat","global_fetch_strictly_public"]`, `observability.enabled true`, `assets {directory: ".open-next/assets", binding: "ASSETS"}`, `triggers.crons ["0 * * * *"]` (hourly job drain via `worker.ts` `scheduled()`).
- Deliberately NO bindings at top level: D1/R2 exist only inside `env.staging` and `env.production`, so a deploy without `--env` fails instead of touching the wrong DB.
  - staging: name `smog-site-staging`; `d1_databases [{binding "D1", database_name "smog-staging", database_id "de652ee5-3851-4b02-85fb-f4eb8bddfe29", remote: true}]`; `r2_buckets [{binding "R2", bucket_name "smog-staging-media"}]`; `send_email [{name "EMAIL"}]` (must be repeated per env, not inherited); vars EMAIL_FROM_*, OPENPANEL_API_URL, REMOTION_REGION, SITE_ORIGIN.
  - production: name `smog-site-production`; D1 `smog-production` id `6f48c5c2-43f3-44a9-a083-46d18bf44831`; R2 `smog-production-media`; same vars pattern.
- Secrets only via `wrangler secret put <NAME> --env=<env>`; never in `vars`.
- `apps/site/package.json` scripts: `generate:types:cloudflare: wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts`; `deploy:guard` (shell `case "$CLOUDFLARE_ENV" in staging|production)` else exit 1); `deploy:database: deploy:guard && NODE_ENV=production PAYLOAD_SECRET=ignore payload migrate`; `build:app`/`deploy:app` (`opennextjs-cloudflare build|deploy --env="$CLOUDFLARE_ENV"`); `deploy` = database then app ("schema then code"); `check-bundle-size` (`scripts/check-bundle-size-ci.ts`, parses `wrangler deploy --dry-run` "Total Upload ... gzip", 10 MiB limit / 8 MiB warn). wrangler `~4.136.3`.
- Migrations are Payload D1 migrations (`apps/site/src/migrations/*`) and Payload-specific; for non-Payload use `wrangler d1 migrations` / Drizzle instead. Payload adapters: `@payloadcms/db-d1-sqlite 3.89.0`, `@payloadcms/storage-r2 3.89.0`; `drizzle-orm 0.45.2`.

### CI (`.github/workflows/ci.yml`, single workflow)
Triggers: `pull_request`, push to `master`, tags `**`; `permissions: contents: read`; concurrency group cancels in-progress on PRs. Common steps: `actions/checkout@v5`, `oven-sh/setup-bun@v2` with `bun-version-file: package.json`, `bun install --frozen-lockfile`. Jobs:
- `release-check` : `bun run release:check:ci`
- `site-tests` : `bun -F site test` (split from release-check to reduce miniflare flakes)
- `site-bundle-size` : skips with `::warning::` if `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PAYLOAD_SECRET` secrets absent; else `build:app` + `check-bundle-size` for staging
- `site-e2e` : Playwright chromium, `--workers=1`, local D1
- `site-payload-types-drift` : regenerate + `git diff --exit-code` (Payload-specific, but the drift-guard pattern is reusable)
CI never deploys.

### release gate (root package.json)
```
"check:ci": "biome check apps packages scripts package.json turbo.json biome.json knip.json",
"release:check": "bun run check:ci && bun run release:config-check && bun run check-types && bun run test && bun audit --production && bun run mobile:release-check && bun run build && knip --no-progress --no-config-hints",
"release:check:ci": "...same but `turbo test --filter=!site`",
"release:config-check": "bun scripts/release-config-check.ts",
"mobile:release-check": "bun scripts/mobile-release-check.ts"
```
- `scripts/release-config-check.ts` (27 lines): parses `.github/workflows/ci.yml` with `Bun.YAML.parse` and asserts required substrings exist (`pull_request:`, `branches: [master]`, `tags: ["**"]`, `permissions:\n  contents: read`, `bun-version-file: package.json`, `bun install --frozen-lockfile`, `bun run release:check`, `bun -F site test`). Errors prefixed `[releaseConfig]`.
- `scripts/mobile-release-check.ts` (71 lines): `Bun.spawnSync` helper `run()`, npm check, runs `expo export` and prints total bundle size via `du -sk` (no budget enforced). Errors prefixed `[mobileReleaseCheck]`. Copyable with small edits.

### docs
- `docs/deployment-checklist.md` (399 lines). Structure: title with scope line; "Before you start" (numbered rules: rotate token, never put credentials in chat/commits/wrangler.jsonc, no secrets in vars, non-file vars get wiped by deploy, authenticate with `read -rs`); `## 1. Worker secrets` (table: Name | Kind | Envs | Command | Breaks without it); `## 2. Worker vars`; `## 3. Bindings and Cloudflare resources` (D1, R2, EMAIL, ASSETS with check/create commands `bunx wrangler d1 list`, `d1 create`, `r2 bucket list|create`); `## 4. Build/deploy shell environment`; `## 5. GitHub Actions secrets`; `## 6. Mobile / EAS` (incl. `### App links`, `### Mobile analytics`); `## First deploy, in order` (numbered steps with bash blocks, staging then production, smoke checks); `## Open items (not configured in the repo yet ...)`; `## Launch blockers that are not variables`. Style: dense, imperative, tables with an explicit "Breaks without it" column with blast radius, exact commands, references to file paths and env names, bold **BLOCKING**/**Constraint**, dated decisions.
- `docs/cutover-runbook.md` (835 lines). Structure: intro with "How to use this document" (work top to bottom), credentials rule, blockquote note on out-of-repo systems, `## What moves, and what does not`, `## 1. Decisions that must be made before a date is set` (numbered, each blocking; includes production address = Cloudflare for SaaS custom hostname `app.smog.vlaanderen` on zone `zias.be` with fallback origin `smog-origin.zias.be AAAA 100::`, route commit `"routes": [{ "pattern": "app.smog.vlaanderen/*", "zone_name": "zias.be" }]` changed together with `SITE_ORIGIN`), `## 2. Readiness, the week before`, `## 3. The window, in order` (roles: operator + checker; numbered steps 0..N each with check and stop condition; "rollback stops being free" at step 6), `## 4. Rollback`, `## 5. After the window`, then `## Import the catalogue` (Preconditions, Order of operations, Staging rehearsal, Production, Reading the report, If verification fails, After the import, Local rehearsal note). Style: sequential runbook, explicit stop/abort criteria, dates in decisions, checks with expected output.
- Other docs: `docs/COMPONENTS.md` (14 lines), `docs/PRIVACY_AND_ANALYTICS.md` (69 lines). Root `AGENTS.md`, `apps/mobile/AGENTS.md` describe conventions.

## 5. Root tooling

`package.json` (name `smog`, `packageManager: "bun@1.3.14"`):
- `workspaces.catalog: { "zod": "4.3.6" }` (only one catalog entry).
- Scripts: `check` = `biome check --write .`; `check:ci`; `dev` = `turbo dev`; `build` = `turbo build`; `check-types` = `turbo check-types`; `test` = `turbo test`; `release:check`, `release:check:ci`, `release:config-check`, `mobile:release-check`; `dev:mobile` = `turbo -F mobile dev`; `dev:site`; `mobile:ios` = `turbo -F mobile ios --`; `mobile:android`.
- devDeps: `@biomejs/biome 2.3.13`, `@types/bun ^1.4.2`, `@types/react 19.2.14`, `expo-doctor 1.20.0`, `knip ^5.88.1`, `turbo ^2.11.2`, `ultracite 7.1.1`.
- `overrides` (pin security/consistency): react 19.2.0, react-dom 19.2.0, @babel/core 7.29.7, expo-application 55.0.19, expo-constants 55.0.17, esbuild 0.25.12, postcss 8.5.28, sharp 0.35.4, rollup 4.62.2, drizzle-orm 0.45.2, ws, undici, uuid, yaml, etc.
- `patchedDependencies`: `@openpanel/react-native@1.4.1`, `query-string@7.1.3` (patches/*.patch).
- Key versions: Expo SDK 55 (`expo ~55.0.31`, sdkVersion 55.0.0), expo-router ~55.0.18, react 19.2.0, react-native 0.83.10, nativewind ^4.1.23, react-native-css-interop 0.2.7, tailwindcss ^3.4.17 (native) and ^4.3.2 (web/site), reanimated 4.2.1, worklets 0.7.4, safe-area-context ~5.6.2, screens ~4.23.0, flash-list 2.0.2, TypeScript ^5.9.3 in packages (site pins 6.0.3), vitest ^4.1.11, jest ~29.7.0 + jest-expo ~55.0.22, wrangler ~4.136.3, next 16.3.3, payload 3.89.0, zod 4.3.6, sharp 0.35.4, biome 2.3.13, ultracite 7.1.1, turbo ^2.11.2, bun 1.3.14.

`turbo.json` (`ui: "tui"`): tasks `build` (dependsOn `^build`, inputs `$TURBO_DEFAULT$`, `.env*`, outputs `dist/**`, `build/**`, `.next/**` minus cache, `.open-next/**`), `check-types` (dependsOn `^check-types`, `generate:types:cloudflare`), `dev` (cache false, persistent), `generate:types:cloudflare`, `generate:types`, `generate:importmap` (cache false), `ios`/`android` (persistent, no cache), `test` (cache false).

`biome.json`: `extends: ["ultracite/core","ultracite/react"]`; `javascript.globals: ["__DEV__","Bun"]`; jest globals override for `*.test.ts(x)`; ignores `.next`, `dist`, `.turbo`, `.expo`, `.wrangler`, `wrangler.jsonc`, `payload-types.ts`, generated `packages/ui-web/src/styles/theme.css`, `packages/ui-native/global.css`, `packages/ui-native/tailwind.config.js`, `apps/mobile/global.css`, `.agents`. Rules off: performance.noBarrelFile/noNamespaceImport/useTopLevelRegex; complexity.noForEach; style.useFilenamingConvention/noNestedTernary/useDefaultSwitchClause/noNonNullAssertion/noExportedImports/useConsistentMemberAccessibility; suspicious.noAlert/useAwait; nursery.noShadow/useMaxParams/noIncrementDecrement.

`knip.json`: `ignoreFiles [".agents/**"]`, `ignoreDependencies ["expo-doctor"]`, per-workspace entries: `apps/mobile` entry `["app/**/*.{ts,tsx}","metro.config.js","tailwind.config.js"]` ignoring `@babel/core`, `tailwindcss`; `packages/ui-native` entry `["src/index.ts","tailwind.config.js","babel.config.js","scripts/*.ts"]` ignoring the same two; plus site/render entries (skip).

`bunfig.toml`:
```toml
[install]
# Expo native builds require a single installation of every native module. ...
linker = "hoisted"
```
`packages/config/tsconfig.base.json`: ESNext, moduleResolution bundler, strict, verbatimModuleSyntax, noUncheckedIndexedAccess, noUnusedLocals/Parameters, types ["bun"]. `packages/config/src` = constants + sponsorships (project-specific).

## 6. apps/mobile

Structure (`apps/mobile`): `AGENTS.md`, `app.json`, `eas.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `jest.config.js`, `jest.setup.ts`, `tsconfig.json`, `package.json` (`main: expo-router/entry`, scripts dev/start/android/ios/export/web/test/test:watch/check-types).
- `app/` (expo-router): `_layout.tsx` (imports `../global.css`, ToastProvider, SafeAreaProvider, ConsentBanner, `enableScreens()`, SplashScreen), `+native-intent.tsx`, `(tabs)/{_layout,index,search,favorites}.tsx`, `(tabs)/lists/{_layout,index,[id]}.tsx`, `(tabs)/settings/{_layout,index,account}.tsx`, `(auth)/{sign-in,sign-up,forgot-password}.tsx`, `gestures/[id].tsx`, `dev/kitchen-sink.tsx`.
- `assets/`: generated brand PNGs (from packages/brand) + `smog.icon/`.
- `src/`: `components/{BrandLogo,ConsentBanner}.tsx`; `data/{favorites,gestures,lists}.ts` (+tests); `lib/{analytics,api,consent,consentSync,google,guest,i18n,locale,session,site,theme}.ts(x)` (api.ts `payloadFetch` is Payload-specific; guest/consent/i18n/locale/theme/analytics are largely portable); `screens/*.test.tsx`; `test/{expoVideoMock,insetsProbe}.tsx`; `appConfig.test.ts`, `boundary.test.ts`, `nativeIntent*.test.ts(x)`.
- `BrandLogo.tsx`: `Image` with `require("../../assets/logo-green.png")` / `logo-white.png` (Metro picks @2x/@3x), chosen from NativeWind `useColorScheme().colorScheme`; 147x32 points.
- Deps: expo ~55.0.31 (+ application, constants, localization, router ~55.0.18, secure-store, splash-screen, system-ui, updates, video ~55.0.21, web-browser), `@openpanel/react-native 1.4.1` (patched), `@react-native-async-storage/async-storage 2.2.0`, `@shopify/flash-list 2.0.2`, `@smog/i18n`, `@smog/shared`, `@smog/ui-native` (workspace), nativewind ^4.1.23, react 19.2.0, react-native 0.83.10, reanimated 4.2.1, worklets 0.7.4, safe-area-context ~5.6.2, screens ~4.23.0. Dev: babel core ^7.29.7, jest ~29.7, jest-expo ~55.0.22, @testing-library/react-native ^13.2.0, tailwindcss ^3.4.17, react-native-css-interop 0.2.7, postcss ^8.5.28.
- `app.json` (`expo`): name "SMOG & Co", slug "smog", version "3.0.0", `runtimeVersion {policy: "fingerprint"}`, sdkVersion "55.0.0", orientation portrait, icon `./assets/icon.png`, scheme `smogmobile`, `userInterfaceStyle: "automatic"`; ios: supportsTablet, bundleIdentifier `be.zias.smog`, icon `./assets/smog.icon`, `ITSAppUsesNonExemptEncryption false`, buildNumber "51", appleTeamId `96XKP6MU2A`, associatedDomains; android: adaptiveIcon (foreground/monochrome PNGs, backgroundColor `#00805F`), package `be.zias.smog`, versionCode 79, intentFilters (above); web favicon; plugins `expo-router`, `expo-localization`, `expo-splash-screen` (image splash-icon.png, width 200, contain, bg `#00805F` both light and dark); `experiments.typedRoutes true`; `extra.eas.projectId 9fa68b63-dfa5-498a-9196-5eba93ecac29`; `owner "smog-and-co"`; `updates.url https://u.expo.dev/9fa68b63-...`.
- `eas.json`: cli `>= 16.31.0`, `appVersionSource: "local"`; build profiles `development` (developmentClient, internal, channel development), `preview` (internal, channel preview), `production` (store, autoIncrement, channel production); all set `EXPO_USE_PRECOMPILED_MODULES: "0"`; `submit.production {}`.
- Only runtime env var: `EXPO_PUBLIC_API_URL` (falls back to staging Worker if unset; docs warn about it).
- `tsconfig.json`: extends `expo/tsconfig.base`, `jsx: react-jsx`, `jsxImportSource: nativewind`, `@/*` alias.

## Port recommendations (short)
Copy nearly verbatim: `packages/brand/**` (retarget output dirs), `packages/styles/**`, `packages/ui-native/**` (+ babel/metro/tailwind config pattern and generator), `packages/ui-web/**` (drop `"use client"` and Mux/Next bits as needed), `apps/mobile/app/+native-intent.tsx` + tests, `.well-known` files + `_headers` idea, `scripts/release-config-check.ts` and `scripts/mobile-release-check.ts`, root `biome.json`/`knip.json`/`bunfig.toml`/`turbo.json` patterns, and doc structure of `deployment-checklist.md` / `cutover-runbook.md`. Rewrite: anything Payload/Next/OpenNext (`apps/site`, `payloadFetch`, Payload migrations, legacy endpoints using Payload local API, `check-bundle-size`).
