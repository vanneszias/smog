# apps/site

Payload CMS 3 on Next.js 16, deployed to Cloudflare Workers via OpenNext.

This app will eventually serve the Payload admin panel, the public API and the
redesigned public website from a single Worker. Today it holds the template's
two collections and nothing else — see
[the migration spec](../../docs/superpowers/specs/2026-09-19-payload-migration-design.md).

While the migration runs, the existing stack (`apps/web`, `apps/native`,
`apps/server`, `apps/remotion`) keeps serving production untouched.

## Stack

| Layer | |
|---|---|
| App | Next.js 16.3.3, React 19.2, Payload 3.82.1 |
| Worker | `@opennextjs/cloudflare`, `wrangler` |
| Database | Cloudflare D1 via `@payloadcms/db-d1-sqlite` |
| Files | Cloudflare R2 via `@payloadcms/storage-r2` |

All Payload packages sit on exactly `3.82.1`. Upgrade them together or not at all.

## Local development

```bash
bun -F site dev          # http://localhost:3003
```

Port 3003 keeps out of the way of web (3001), server (3000) and Remotion (3002),
which keep running during the parallel run.

You need `PAYLOAD_SECRET` in your environment for anything that boots Payload.
Generate one with `openssl rand -hex 32`. Set `CLOUDFLARE_ENV=staging` too —
bindings live only in named environments, so nothing resolves without it.

## Commands

```bash
bun -F site test              # Vitest
bun -F site check-types       # tsc --noEmit
bun -F site generate:types    # Cloudflare env types + Payload types
bun -F site generate:importmap
bun -F site check-bundle-size # measure the Worker against its budget
```

`src/payload-types.ts` is **committed**. Regenerate it whenever you change a
collection — CI fails on drift.

## Deploying

Always schema first, then code:

```bash
CLOUDFLARE_ENV=staging bun -F site deploy
```

`deploy` runs `deploy:database` (migrations) then `deploy:app` (build and
upload). Both refuse to run unless `CLOUDFLARE_ENV` is exactly `staging` or
`production` — there is no default, so a deploy cannot guess which environment
it is touching.

Staging: `https://smog-site-staging.vanneszias.workers.dev`

`PAYLOAD_SECRET` is a Cloudflare secret, set with
`wrangler secret put PAYLOAD_SECRET --env=<env>`. It is deliberately absent at
build time: `next build` signs no session and issues no query, so config
collection tolerates its absence while the runtime path does not.

## Bundle budget

The Worker has a **10 MiB gzipped** limit on the Workers Paid plan, and Stage 0
already uses **6.45 MiB of it** with two collections and no public site.

Measure before you add anything large:

```bash
CLOUDFLARE_ENV=staging bun -F site check-bundle-size
```

This parses wrangler's `Total Upload` line. Do not gzip `.open-next/worker.js`
and read that — it is a ~2 KB entry stub and reports a number three orders of
magnitude too small.

## A warning about the upstream template

This app was scaffolded from Payload's official `with-cloudflare-d1` template,
which does **not** type-check or build against the versions it pins. Four
confirmed defects, all fixed here:

| Template said | Reality in 3.82.1 |
|---|---|
| `storage: [r2Storage(...)]` | no such `Config` key — belongs in `plugins` |
| `generatePayloadViewport` | does not exist in `@payloadcms/next` |
| import map → `@payloadcms/ui/rsc` | generator emits `@payloadcms/next/rsc` |
| `"build": "payload build"` | no such command — it is `next build` |

The first silently dropped R2 storage, so uploads never worked. The last would
have failed every deploy. Verify template code against the installed packages
rather than trusting it.
