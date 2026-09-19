# Stage 0: Foundation and Spikes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/site` as a deployable Payload-on-Cloudflare Worker with nothing in it but the two template collections, and resolve the three unverified risks before any further stage is planned in detail.

**Architecture:** Scaffold from Payload's official `with-cloudflare-d1` template rather than assembling the pieces by hand, adapt it to this monorepo's bun/Turborepo/Biome conventions, provision D1 and R2, and deploy to a staging Worker. Three gates run as their own tasks and each produces a written finding.

**Tech Stack:** Next.js 16.3.3, Payload 3.82.1, `@payloadcms/db-d1-sqlite`, `@payloadcms/storage-r2`, `@opennextjs/cloudflare` ^1.11.0, wrangler ~4.116.0, bun 1.3.14, Turborepo 2.11.

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

## Global Constraints

- Cloudflare Workers **Paid** plan is required; the template cannot deploy on Free due to size limits.
- Package manager is **bun 1.3.14**. Do not introduce pnpm, npm or yarn lockfiles unless Task 5 concludes bun is unworkable.
- All Payload packages sit on exactly **3.82.1**. Never upgrade one alone.
- Biome 2.3.13 extending `ultracite/core` and `ultracite/react`. `bun check` must pass before every commit.
- Every new package registers `build`, `check-types` and `test` in `turbo.json`.
- TypeScript strict mode. Type-only imports use the `type` keyword.
- `wrangler.jsonc` is already in Biome's ignore list; do not remove that entry.
- Deploy order is always schema then code: `payload migrate`, then `opennextjs-cloudflare build && deploy`.

## Review Focus

Five failure modes this stage's tasks must pin down, each assigned to the task that owns the code:

1. **`PAYLOAD_SECRET` absent or rotated** invalidates every session and silently breaks admin login. Task 2 asserts the app refuses to boot without it rather than starting with an empty secret.
2. **`payload migrate` targeting the wrong Cloudflare environment** writes staging schema into production. Task 3 makes the environment explicit in every migration script and asserts the wrong-environment case fails loudly.
3. **D1 unreachable from the CLI context** makes `getPlatformProxy` fall back to a local SQLite file, so migrations appear to succeed while the remote database is untouched. Task 3 asserts the remote row exists after a remote migration.
4. **Build artifacts committed to git.** `.open-next/`, `.wrangler/` and `cloudflare-env.d.ts` are large and machine-specific. Task 1 adds ignore entries and asserts a clean `git status` after a build.
5. **Bundle size regressing after Stage 0 passes.** A one-time measurement is worthless by Stage 8. Task 4 records headroom and adds a CI check that fails when the gzipped Worker exceeds a recorded threshold.

---

### Task 1: Scaffold `apps/site` from the official template

**Files:**
- Create: `apps/site/` (from template)
- Modify: `.gitignore`
- Modify: `package.json` (root, workspace scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `apps/site` with `src/payload.config.ts`, `src/collections/Users.ts`, `src/collections/Media.ts`, `src/app/(payload)/`, `src/app/(frontend)/`, `wrangler.jsonc`, `next.config.ts`, `open-next.config.ts`.

- [ ] **Step 1: Fetch the template by sparse checkout**

Do not hand-write the Payload App Router boilerplate. It is generated, verbose, and easy to get subtly wrong. Take it from the source of truth.

```bash
cd /tmp
git clone --depth 1 --filter=blob:none --sparse https://github.com/payloadcms/payload.git payload-src
cd payload-src
git sparse-checkout set templates/with-cloudflare-d1
```

- [ ] **Step 2: Verify the template matches the pinned version**

```bash
grep '"payload"' /tmp/payload-src/templates/with-cloudflare-d1/package.json
```

Expected: `"payload": "3.82.1"`. If it reports a different version, stop and report it — the spec's pinned versions were read from this file and a drift means the plan needs updating, not overriding.

- [ ] **Step 3: Copy the template into the monorepo**

```bash
cd /home/user/smog
cp -R /tmp/payload-src/templates/with-cloudflare-d1 apps/site
rm -rf apps/site/.git apps/site/pnpm-lock.yaml apps/site/node_modules
```

- [ ] **Step 4: Record the template's file inventory**

```bash
find apps/site -type f -not -path "*/node_modules/*" | sort
```

Paste the output into the commit message. Later tasks reference these paths, and a reviewer needs to see what arrived versus what was written by hand.

- [ ] **Step 5: Add build artifacts to `.gitignore`**

Append to the root `.gitignore`:

```gitignore
# Payload / OpenNext / Cloudflare
.open-next/
.wrangler/
apps/site/cloudflare-env.d.ts
apps/site/src/payload-types.ts
```

`payload-types.ts` is generated by `payload generate:types` and regenerating it on every schema change produces noisy diffs. It is regenerated in CI and on install.

- [ ] **Step 6: Verify nothing untracked leaks**

Run: `git status --short`
Expected: only `apps/site/**` source files and the modified `.gitignore`. No `.open-next`, no `.wrangler`, no lockfile from another package manager.

- [ ] **Step 7: Commit**

```bash
git add apps/site .gitignore
git commit -m "feat(site): scaffold Payload app from with-cloudflare-d1 template"
```

---

### Task 2: Adapt the template to monorepo conventions

**Files:**
- Modify: `apps/site/package.json`
- Modify: `apps/site/src/payload.config.ts`
- Modify: `turbo.json`
- Create: `apps/site/src/lib/env.ts`
- Test: `apps/site/src/lib/env.test.ts`

**Interfaces:**
- Consumes: `apps/site` from Task 1.
- Produces: `requireEnv(name: string): string` from `apps/site/src/lib/env.ts`, used by `payload.config.ts` to read `PAYLOAD_SECRET`.

- [ ] **Step 1: Rename the package and drop cross-env**

The template names itself `with-cloudflare-d1` and uses `cross-env` for Windows compatibility. This monorepo's existing scripts set environment variables inline. Match the monorepo.

Set `"name": "site"` in `apps/site/package.json`, remove the `cross-env` dependency, and rewrite the scripts:

```json
{
  "name": "site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "NODE_OPTIONS=--no-deprecation next dev --port 3003",
    "build": "NODE_OPTIONS=\"--no-deprecation --max-old-space-size=8000\" payload build",
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "generate:types": "bun run generate:types:cloudflare && bun run generate:types:payload",
    "generate:types:cloudflare": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
    "generate:types:payload": "NODE_OPTIONS=--no-deprecation payload generate:types",
    "generate:importmap": "NODE_OPTIONS=--no-deprecation payload generate:importmap"
  }
}
```

Port 3003 avoids the existing web (3001), server (3000) and Remotion (3002) dev servers, which keep running during the parallel-run period.

- [ ] **Step 2: Write the failing test for required-environment handling**

Review Focus item 1. An empty `PAYLOAD_SECRET` must not boot — the template's `process.env.PAYLOAD_SECRET || ''` silently accepts one, which produces a running app whose sessions are all forgeable.

Create `apps/site/src/lib/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(requireEnv("EXAMPLE", { EXAMPLE: "value" })).toBe("value");
  });

  it("throws when the variable is missing", () => {
    expect(() => requireEnv("EXAMPLE", {})).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });

  it("throws when the variable is an empty string", () => {
    expect(() => requireEnv("EXAMPLE", { EXAMPLE: "" })).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });

  it("throws when the variable is only whitespace", () => {
    expect(() => requireEnv("EXAMPLE", { EXAMPLE: "   " })).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun -F site test`
Expected: FAIL — `Failed to resolve import "./env"`.

- [ ] **Step 4: Implement `requireEnv`**

Create `apps/site/src/lib/env.ts`:

```ts
export function requireEnv(
  name: string,
  source: Record<string, string | undefined> = process.env
): string {
  const value = source[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun -F site test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Use it in the Payload config**

In `apps/site/src/payload.config.ts`, replace:

```ts
secret: process.env.PAYLOAD_SECRET || '',
```

with:

```ts
secret: requireEnv("PAYLOAD_SECRET"),
```

and add the import alongside the existing ones:

```ts
import { requireEnv } from "./lib/env";
```

- [ ] **Step 7: Register the app with Turborepo**

`turbo.json` already declares `build`, `check-types`, `test` and `dev`. Add the two generation tasks so they cache and order correctly:

```json
"generate:types": {
  "cache": false,
  "outputs": ["cloudflare-env.d.ts", "src/payload-types.ts"]
},
"generate:importmap": {
  "cache": false,
  "outputs": ["src/app/(payload)/admin/importMap.js"]
}
```

- [ ] **Step 8: Verify lint and types**

Run: `bun check && bun -F site check-types`
Expected: both clean. Fix anything Biome reports; `ultracite` is strict and the template was not written against it.

- [ ] **Step 9: Commit**

```bash
git add apps/site turbo.json
git commit -m "feat(site): adapt template to bun, Turborepo and Biome conventions"
```

---

### Task 3: Provision D1 and R2, and prove migrations reach the remote database

**Files:**
- Modify: `apps/site/wrangler.jsonc`
- Modify: `apps/site/package.json` (deploy scripts)
- Create: `apps/site/src/migrations/` (generated)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `apps/site` from Task 2.
- Produces: a `smog-staging` D1 database and `smog-staging-media` R2 bucket, bound as `D1` and `R2`; `bun -F site deploy:database` and `bun -F site deploy:app` scripts.

- [ ] **Step 1: Create the Cloudflare resources**

```bash
cd apps/site
bunx wrangler d1 create smog-staging
bunx wrangler r2 bucket create smog-staging-media
```

Record the `database_id` that `d1 create` prints. It goes into `wrangler.jsonc` verbatim.

- [ ] **Step 2: Configure bindings with an explicit staging environment**

Review Focus item 2. The template ships a single unnamed environment, which makes it trivially easy to migrate production by forgetting a flag. Define staging and production explicitly so that *neither* is the default.

Rewrite `apps/site/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "smog-site",
  "compatibility_date": "2025-08-15",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "env": {
    "staging": {
      "name": "smog-site-staging",
      "d1_databases": [
        {
          "binding": "D1",
          "database_name": "smog-staging",
          "database_id": "PASTE_STAGING_DATABASE_ID",
          "remote": true
        }
      ],
      "r2_buckets": [{ "binding": "R2", "bucket_name": "smog-staging-media" }]
    },
    "production": {
      "name": "smog-site-production",
      "d1_databases": [
        {
          "binding": "D1",
          "database_name": "smog-production",
          "database_id": "PASTE_PRODUCTION_DATABASE_ID",
          "remote": true
        }
      ],
      "r2_buckets": [{ "binding": "R2", "bucket_name": "smog-production-media" }]
    }
  }
}
```

Create the production resources now too, with the same two commands and `-production` names, so the config is complete and nobody improvises one under deadline later.

- [ ] **Step 3: Make `CLOUDFLARE_ENV` mandatory in deploy scripts**

Add to `apps/site/package.json` scripts. The guard is the point: with no default, a bare `deploy` fails instead of guessing.

```json
"deploy:database": "test -n \"$CLOUDFLARE_ENV\" || (echo 'CLOUDFLARE_ENV must be set to staging or production' && exit 1) && NODE_ENV=production PAYLOAD_SECRET=ignore payload migrate",
"deploy:app": "test -n \"$CLOUDFLARE_ENV\" || (echo 'CLOUDFLARE_ENV must be set to staging or production' && exit 1) && opennextjs-cloudflare build --env=$CLOUDFLARE_ENV && opennextjs-cloudflare deploy --env=$CLOUDFLARE_ENV",
"deploy": "bun run deploy:database && bun run deploy:app"
```

`PAYLOAD_SECRET=ignore` matches the template: migrations do not sign tokens, and requiring the real secret in a schema-only step spreads it to more CI contexts than necessary.

- [ ] **Step 4: Verify the guard fails loudly**

Run: `cd apps/site && unset CLOUDFLARE_ENV && bun run deploy:database`
Expected: exits non-zero with `CLOUDFLARE_ENV must be set to staging or production`. No migration runs.

- [ ] **Step 5: Generate and run the first migration**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create initial
bun run deploy:database
```

- [ ] **Step 6: Prove the migration reached the remote database**

Review Focus item 3. `getPlatformProxy` falls back to a local SQLite file when it cannot reach D1, so a green migration log proves nothing on its own. Query the remote database directly.

```bash
bunx wrangler d1 execute smog-staging --remote --env=staging \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected: the output lists `users`, `media` and `payload_migrations`. If it returns an empty set, the migration went to a local file — stop, and report it as a gate failure rather than re-running.

- [ ] **Step 7: Document the environment variables**

Add to `.env.example`:

```bash
# Payload / Cloudflare (apps/site)
PAYLOAD_SECRET=            # openssl rand -hex 32
CLOUDFLARE_ENV=staging     # staging | production — no default, deploys refuse without it
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=      # CI only: Workers Scripts edit, D1 edit, R2 edit
```

- [ ] **Step 8: Commit**

```bash
git add apps/site .env.example
git commit -m "feat(site): provision staging and production D1 and R2 bindings"
```

---

### Task 4: Deploy to staging and establish the bundle-size budget (Gate 2)

**Files:**
- Create: `apps/site/scripts/check-bundle-size.ts`
- Create: `apps/site/scripts/check-bundle-size.test.ts`
- Create: `docs/superpowers/specs/2026-09-19-stage-0-findings.md`
- Modify: `.github/workflows/` (the existing CI workflow)

**Interfaces:**
- Consumes: the deployable app from Task 3.
- Produces: `checkBundleSize(bytes: number, limitBytes: number): { ok: boolean; message: string }` from `apps/site/scripts/check-bundle-size.ts`, and a recorded byte budget in the findings document.

- [ ] **Step 1: Build and deploy to staging**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
export PAYLOAD_SECRET=$(openssl rand -hex 32)
bun run deploy:app
```

- [ ] **Step 2: Record the measurement**

Wrangler prints `Total Upload: X KiB / gzip: Y KiB` on deploy. The Workers Paid limit is **10 MiB gzipped**. Record the gzip figure — that is the number that matters.

```bash
ls -la .open-next/worker.js
gzip -c .open-next/worker.js | wc -c
```

- [ ] **Step 3: Verify the admin panel actually loads**

Open `https://smog-site-staging.<your-subdomain>.workers.dev/admin` and create the first admin user.

A successful deploy is not a working app: OpenNext can bundle a Worker that boots and then fails on the first D1 query. Creating a user exercises the binding, the schema and the session cookie in one action.

Expected: the user is created, the dashboard lists Users and Media.

- [ ] **Step 4: Write the failing test for the budget check**

Review Focus item 5.

Create `apps/site/scripts/check-bundle-size.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkBundleSize } from "./check-bundle-size";

const LIMIT = 10 * 1024 * 1024;

describe("checkBundleSize", () => {
  it("passes when under the limit", () => {
    expect(checkBundleSize(5 * 1024 * 1024, LIMIT).ok).toBe(true);
  });

  it("fails when over the limit", () => {
    const result = checkBundleSize(11 * 1024 * 1024, LIMIT);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("exceeds");
  });

  it("fails exactly at the limit, because the limit is the hard ceiling", () => {
    expect(checkBundleSize(LIMIT, LIMIT).ok).toBe(false);
  });

  it("reports remaining headroom as a percentage", () => {
    expect(checkBundleSize(5 * 1024 * 1024, LIMIT).message).toContain("50%");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `bun -F site test check-bundle-size`
Expected: FAIL — `Failed to resolve import "./check-bundle-size"`.

- [ ] **Step 6: Implement the check**

Create `apps/site/scripts/check-bundle-size.ts`:

```ts
const MIB = 1024 * 1024;

export function checkBundleSize(
  bytes: number,
  limitBytes: number
): { ok: boolean; message: string } {
  const used = (bytes / MIB).toFixed(2);
  const limit = (limitBytes / MIB).toFixed(2);

  if (bytes >= limitBytes) {
    return {
      ok: false,
      message: `Worker bundle is ${used} MiB gzipped, which exceeds the ${limit} MiB limit.`,
    };
  }

  const headroom = Math.round(((limitBytes - bytes) / limitBytes) * 100);

  return {
    ok: true,
    message: `Worker bundle is ${used} MiB gzipped of ${limit} MiB. ${headroom}% headroom remaining.`,
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun -F site test check-bundle-size`
Expected: PASS, 4 tests.

- [ ] **Step 8: Wire the check into CI**

Add a step to the existing GitHub Actions workflow that builds `apps/site`, gzips `.open-next/worker.js`, and calls `checkBundleSize` with the 10 MiB limit, failing the job when `ok` is false.

- [ ] **Step 9: Write the findings document**

Create `docs/superpowers/specs/2026-09-19-stage-0-findings.md` with a **Gate 2** section recording: the raw and gzipped worker size, the percentage headroom, the deployed staging URL, and one sentence on whether five more stages of code plausibly fit. If headroom is under 40%, say so plainly — that is a design-level problem for Stages 3 through 8, not a note.

- [ ] **Step 10: Commit**

```bash
git add apps/site/scripts docs/superpowers/specs .github
git commit -m "feat(site): deploy to staging and add bundle size budget check"
```

---

### Task 5: Resolve the bun compatibility gate (Gate 3)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-stage-0-findings.md`

**Interfaces:**
- Consumes: the working staging deploy from Task 4.
- Produces: a **Gate 3** finding, and either confirmation that bun is fine or a scoped fallback.

- [ ] **Step 1: Exercise every Payload CLI command under bun**

Payload documents pnpm, npm and yarn. This monorepo is bun, and the CLI does filesystem resolution that bun implements differently. Each of these must work, because every later stage depends on all of them.

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bun run generate:types:payload
bun run generate:importmap
bunx payload migrate:create test_gate
bunx payload migrate:status
```

- [ ] **Step 2: Verify each produced the expected artifact**

```bash
test -f src/payload-types.ts && echo "types OK"
test -f "src/app/(payload)/admin/importMap.js" && echo "importmap OK"
ls src/migrations/
bunx payload migrate:status
```

Expected: all four report success, and `migrate:status` lists `initial` as run and `test_gate` as pending.

- [ ] **Step 3: Roll back the throwaway migration**

```bash
rm src/migrations/*test_gate*
```

- [ ] **Step 4: Record the finding**

Add a **Gate 3** section to the findings document naming each command and whether it worked under bun.

If any failed: do not paper over it with a shell alias. Record the failure, then scope pnpm to `apps/site` alone via a `packageManager` field and a `pnpm-workspace.yaml` that excludes the rest of the monorepo, and record that as the decision. The fallback is a real fork in the design and is written down as one.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs apps/site
git commit -m "docs: record bun compatibility findings for Payload CLI"
```

---

### Task 6: Spike Remotion in a Cloudflare Container (Gate 1)

**Files:**
- Create: `apps/render/Dockerfile`
- Create: `apps/render/src/index.ts`
- Create: `apps/render/package.json`
- Modify: `apps/site/wrangler.jsonc`
- Modify: `docs/superpowers/specs/2026-09-19-stage-0-findings.md`

**Interfaces:**
- Consumes: the staging Worker from Task 4.
- Produces: a **Gate 1** finding, and either a working container or a decision to use Remotion Lambda in Stage 6.

This is a spike. Its output is an answer, not code that ships. Anything built here is labeled throwaway and Stage 6 is planned from the finding.

- [ ] **Step 1: State the question**

Can a Cloudflare Container run Remotion's headless Chromium and render one existing composition from `apps/remotion` end to end, within the container's memory and timeout limits?

Everything below is the cheapest path to that answer. Do not build the real render service here.

- [ ] **Step 2: Build a minimal container around an existing composition**

Write `apps/render/Dockerfile` installing Node 22, Chromium and its shared libraries, then `@remotion/renderer` and `@remotion/bundler`. Copy in one composition from `apps/remotion/src` — the simplest sponsor overlay — and expose a single HTTP endpoint that renders it with hardcoded props and returns the MP4 bytes.

No Mux, no callbacks, no queueing. Those are Stage 6's problem and they prove nothing about the gate.

- [ ] **Step 3: Run it locally first**

```bash
cd apps/render
docker build -t smog-render-spike .
docker run --rm -p 8080:8080 smog-render-spike
curl -o /tmp/spike.mp4 http://localhost:8080/render
```

Expected: a playable MP4. If Chromium will not start in Docker at all, the Cloudflare question is moot — record the failure and stop.

- [ ] **Step 4: Deploy it as a Cloudflare Container**

Add a container definition to `apps/site/wrangler.jsonc` bound to the Worker, deploy, and invoke it once from the Worker.

- [ ] **Step 5: Measure what actually matters**

Record four numbers: cold-start time to first render, warm render time, peak memory, and whether a render of the real composition length completes inside the container's request timeout.

- [ ] **Step 6: Record the finding and the Stage 6 decision**

Add a **Gate 1** section to the findings document. State plainly whether the container renders reliably, with the four measurements.

If it does not: Stage 6 is planned against Remotion Lambda instead, and the spec's decision table is updated by editing the "Video composition" row and its accepted cost. Do not leave the spec claiming a choice that the spike disproved.

- [ ] **Step 7: Delete the spike or label it**

If the gate passed, keep `apps/render` but add a header comment to `src/index.ts` reading `SPIKE — replaced wholesale in Stage 6. Do not build on this.` If it failed, delete `apps/render` entirely.

- [ ] **Step 8: Commit**

```bash
git add apps/render apps/site/wrangler.jsonc docs/superpowers/specs
git commit -m "spike: evaluate Remotion in a Cloudflare Container"
```

---

## Stage 0 exit criteria

Stage 0 is done when all of these hold:

- [ ] `https://smog-site-staging.*.workers.dev/admin` loads and an admin user can sign in.
- [ ] `bunx wrangler d1 execute smog-staging --remote` lists the Payload tables.
- [ ] `bun check`, `bun -F site check-types` and `bun -F site test` all pass.
- [ ] CI fails the build when the gzipped Worker exceeds 10 MiB.
- [ ] `docs/superpowers/specs/2026-09-19-stage-0-findings.md` records all three gates with measurements.
- [ ] Any gate that failed has produced an edit to the spec, not a workaround.

Stage 1 planning starts from the findings document, not from this plan.
