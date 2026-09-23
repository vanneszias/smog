# SMOG

Sign-language learning platform: a public website with accounts, lists and
sponsorships, a mobile app, and the video renderer behind sponsored videos.

## Stack

- **Site (`apps/site`):** Payload CMS 3 on Next.js 16, deployed to Cloudflare
  Workers through OpenNext, with D1 for data and R2 for files. It serves the
  admin panel, the public website and the API the mobile app uses.
- **Mobile (`apps/mobile`):** React Native 0.83 + Expo 55 + Expo Router,
  talking to the site's Payload API.
- **Render (`apps/render`):** Remotion compositions, rendered on Remotion
  Lambda when a sponsorship is paid for.
- **Video:** Mux streaming
- **Payments:** Mollie
- **Analytics:** consent-gated, self-hosted OpenPanel
- **Monorepo:** Turborepo + Bun workspaces, Biome, knip

## Quick Start

```bash
bun install
bun dev                  # every app's dev server, through turbo
```

`apps/site` runs on `http://localhost:3003` and needs `PAYLOAD_SECRET` and
`CLOUDFLARE_ENV=staging`; see [`apps/site/README.md`](./apps/site/README.md).
[`.env.example`](./.env.example) lists every variable the apps read.

## Commands

```bash
bun check                # Biome, with auto-fix
bun run check:ci         # Biome, as CI runs it
bun check-types          # typecheck every workspace
bun run test             # every workspace's tests
bun run build            # build every workspace
bun run release:check    # the full release gate (see below)

bun run dev:site         # or: bun -F site dev
bun run dev:mobile       # or: bun -F mobile dev
bun run mobile:ios
bun run mobile:android
```

Per app:

```bash
bun -F site dev | test | test:e2e | check-types | generate:types | generate:importmap | seed
bun -F mobile dev | ios | android | test | check-types | export
bun -F render dev:studio | bundle | test | check-types
```

`apps/site` and `apps/render` also have deploy scripts (`deploy:database`,
`deploy:app`, `deploy:function`, `deploy:site:*`); they reach Cloudflare or
AWS, so run them only as
[`docs/deployment-checklist.md`](./docs/deployment-checklist.md) describes.

## Release check

`bun run release:check` is what has to pass before a push. It runs Biome,
`release:config-check` (the CI workflow's required steps), the typecheck, the
tests, `bun audit --production`, `mobile:release-check` (`expo-doctor` and an
`expo export` of `apps/mobile`), the build and knip.

CI runs `bun run release:check:ci`, the same gate with the `apps/site` suite
moved to its own `site-tests` job, alongside `site-bundle-size`, `site-e2e`
and `site-payload-types-drift` (`.github/workflows/ci.yml`).

## Layout

```text
apps/
  site/         Payload + Next.js on Cloudflare Workers: website, admin, API
  mobile/       Expo mobile app
  render/       Remotion compositions for Remotion Lambda
packages/
  config/       Shared constants, sponsorship statuses, base tsconfig
  i18n/         Locale catalogues (en, fr, nl) for apps/mobile
  shared/       Analytics event types shared by site and mobile
  styles/       Design tokens
  types/        The render contract and the sponsor overlay configuration
  ui-native/    React Native component kit (NativeWind) for apps/mobile
  ui-web/       Web component kit for apps/site
docs/           Operating documentation
scripts/        Release checks run by release:check
```

Start with [`apps/site/README.md`](./apps/site/README.md),
[`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md) and
[`apps/render/README.md`](./apps/render/README.md), then read
[the deployment checklist](./docs/deployment-checklist.md),
[the cutover runbook](./docs/cutover-runbook.md),
[Privacy and Analytics](./docs/PRIVACY_AND_ANALYTICS.md) and
[Components](./docs/COMPONENTS.md).
