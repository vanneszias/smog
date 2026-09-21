import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CloudflareContext,
  getCloudflareContext,
} from "@opennextjs/cloudflare";
import { sqliteD1Adapter } from "@payloadcms/db-d1-sqlite";
import { searchPlugin } from "@payloadcms/plugin-search";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { r2Storage } from "@payloadcms/storage-r2";
import type { PayloadLogger } from "payload";
import { buildConfig } from "payload";
import type { GetPlatformProxyOptions } from "wrangler";
import { isAdmin, publicReadActive } from "./access";
import { AdminLogs } from "./collections/AdminLogs";
import { Categories } from "./collections/Categories";
import { Gestures } from "./collections/Gestures";
import { Lists } from "./collections/Lists";
import { Media } from "./collections/Media";
import { Sponsorships } from "./collections/Sponsorships";
import { UserConsents } from "./collections/UserConsents";
import { Users } from "./collections/Users";
import { WebhookDeliveries } from "./collections/WebhookDeliveries";
import { accountEndpoints } from "./endpoints/account";
import { authEndpoints } from "./endpoints/auth";
import { crawlerEndpoints } from "./endpoints/crawler";
import { favoritesEndpoints } from "./endpoints/favorites";
import { listsEndpoints } from "./endpoints/lists";
import { mollieEndpoints } from "./endpoints/mollie";
import { oauthEndpoints } from "./endpoints/oauth";
import { sponsorshipEndpoints } from "./endpoints/sponsorships";
import { requireBinding, requireEnv } from "./lib/env";
import { beforeSyncGesture } from "./search/beforeSync";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const realpath = (value: string) =>
  fs.existsSync(value) ? fs.realpathSync(value) : undefined;

const isCLI = process.argv.some((value) =>
  realpath(value)?.endsWith(path.join("payload", "bin.js"))
);
const isProduction = process.env.NODE_ENV === "production";

/**
 * Vitest sets `VITEST_WORKER_ID` uniquely per worker process. Without this,
 * every integration test that boots a real Payload instance shares the same
 * on-disk local D1 (miniflare) state at `.wrangler/state/v3` — fine for one
 * test file at a time, but a second worker process touching it concurrently
 * (two integration test files, `--shard`, or plain Vitest parallelism)
 * corrupts it with spurious "index already exists" / "internal error" D1
 * errors. Giving each worker its own persistence directory removes that
 * race instead of only serializing access to a shared one.
 *
 * Outside Vitest, `VITEST_WORKER_ID` is unset and `persist` is `undefined`,
 * so `getPlatformProxy` falls back to its normal shared default location —
 * this only changes behavior under the test runner.
 */
const vitestPersist = process.env.VITEST_WORKER_ID
  ? {
      path: path.resolve(
        dirname,
        "..",
        ".wrangler",
        "state",
        "vitest",
        `worker-${process.env.VITEST_WORKER_ID}`
      ),
    }
  : undefined;

/**
 * True while `next build` is collecting route configuration.
 *
 * PAYLOAD_SECRET and the D1/R2 bindings are *runtime* inputs: the secret comes
 * from Cloudflare's secret store and the bindings from the Worker environment,
 * neither of which exists during a build. Demanding them here broke the root
 * `bun run build` and `release:check` for the whole monorepo, and it would
 * break any real CI build too — the earlier build only passed because a
 * throwaway secret happened to be exported by hand.
 *
 * Nothing security-relevant happens during a build: no session is signed, no
 * query is issued. The strict checks still run in the Worker, where a missing
 * secret or binding is a genuine fault and fails loudly on the first request.
 */
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

/** Placeholder used only while collecting route config; never reaches a request. */
const BUILD_PHASE_SECRET = "build-phase-placeholder-not-used-at-runtime";

const createLog =
  (level: string, fn: typeof console.log) =>
  (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === "string") {
      fn(JSON.stringify({ level, msg: objOrMsg }));
    } else {
      fn(
        JSON.stringify({
          level,
          ...objOrMsg,
          msg: msg ?? (objOrMsg as { msg?: string }).msg,
        })
      );
    }
  };

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || "info",
  trace: createLog("trace", console.debug),
  debug: createLog("debug", console.debug),
  info: createLog("info", console.log),
  warn: createLog("warn", console.warn),
  error: createLog("error", console.error),
  fatal: createLog("fatal", console.error),
  silent: () => {
    // Cloudflare Workers logging has no silent sink; this is an intentional no-op.
  },
} as unknown as PayloadLogger;

/**
 * Bindings during `next build`.
 *
 * Booting a Workers runtime here is not just unnecessary, it is actively
 * harmful: Next collects page data for several routes in parallel, each
 * evaluating this module, each starting its own miniflare against the *same*
 * local D1 directory. They then fight over the SQLite lock and the build dies
 * with `SQLITE_BUSY`. The per-worker `persist` path above only covers Vitest,
 * which sets `VITEST_WORKER_ID`; Next's build workers do not.
 *
 * Nothing legitimate queries the database while collecting page data, so the
 * adapters get inert placeholders. If some future code *does* try to query at
 * build time it will fail loudly on a missing method — which is the right
 * outcome, because a build that reads the production database is a bug.
 */
const BUILD_PHASE_BINDINGS = {
  D1: undefined as unknown as D1Database,
  R2: undefined as unknown as R2Bucket,
};

const cloudflare = isNextBuild
  ? { env: BUILD_PHASE_BINDINGS }
  : isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true });

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Categories,
    Gestures,
    Lists,
    Sponsorships,
    AdminLogs,
    UserConsents,
    WebhookDeliveries,
  ],
  editor: lexicalEditor(),
  /*
   * `/api/sitemap.xml` and `/api/robots.txt`, rewritten to `/sitemap.xml` and
   * `/robots.txt` in `next.config.ts`. They live here rather than in `app/`
   * because a Next metadata route that imports Payload is its own bundle
   * entry and costs half a megabyte gzipped; see `endpoints/crawler.ts` for
   * the four measurements.
   *
   * `/api/auth/*` — sign-in, sign-up and sign-out — are here for exactly the
   * same reason and reached the same way, through rewrites at `/auth/*`. A
   * `route.ts` would be a second copy of the Payload/D1/drizzle graph; these
   * ride on `app/(payload)/api/[...slug]/route.ts`, which already carries it.
   *
   * `oauthEndpoints` adds `/api/auth/google` and `/api/auth/google/callback`
   * to the same set. They are registered unconditionally, even though no
   * Google credentials exist in development or in CI: `resolveProvider`
   * answers `null` when they are absent and the endpoint redirects with
   * `?error=oauth-unavailable`, which keeps the route table the same shape
   * everywhere and keeps the handlers reachable from a test that supplies
   * its own provider.
   *
   * `favoritesEndpoints` adds `/api/account/favorites`, reached at
   * `/account/favorites`. It is the signed-in half of the favourite control
   * on the detail page and the favorites list, and it is here rather than in
   * `app/` for the same half-megabyte reason as everything above — Stage 3
   * Task 6 measured that exact route and recorded the number in
   * `lib/favoritesQuery.ts`.
   *
   * `accountEndpoints` adds the four writes the account page makes —
   * `/account/password`, `/account/email`, `/account/confirm-email` and
   * `/account/delete` — on the same terms.
   *
   * `listsEndpoints` adds the six writes the owner's list pages make, under
   * `/account/lists/*`. Flat siblings rather than nested paths — `create`,
   * `rename`, `delete`, `add`, `remove`, `share` — for the reason
   * `next.config.ts` gives about `/account/confirm-email`: overlapping
   * patterns leave Payload's endpoint matcher to choose, and the wrong
   * choice here would answer "saved" without saving.
   *
   * `sponsorshipEndpoints` adds the sponsor wizard's writes, under
   * `/sponsor/*`. They are the only endpoints here with no session check at
   * all: sponsoring is a public purchase flow in the shipped product, so what
   * stands in for authentication is that nothing the form says is believed —
   * see `endpoints/sponsorships.ts`.
   *
   * `mollieEndpoints` adds `POST /api/webhooks/mollie`, reached at
   * `/webhooks/mollie`. It is the only endpoint here that a third party calls,
   * and the only one with no origin check — Mollie posts from its own servers
   * with no `Origin` header. Nothing in the request is trusted: the handler
   * keeps the payment id and asks Mollie what that payment is.
   */
  endpoints: [
    ...crawlerEndpoints,
    ...authEndpoints,
    ...oauthEndpoints,
    ...favoritesEndpoints,
    ...accountEndpoints,
    ...listsEndpoints,
    ...sponsorshipEndpoints,
    ...mollieEndpoints,
  ],
  localization: {
    locales: [
      { label: "Nederlands", code: "nl" },
      { label: "English", code: "en" },
      { label: "Français", code: "fr" },
    ],
    defaultLocale: "nl",
    fallback: true,
  },
  secret: isNextBuild
    ? (process.env.PAYLOAD_SECRET ?? BUILD_PHASE_SECRET)
    : requireEnv("PAYLOAD_SECRET"),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteD1Adapter({
    binding: isNextBuild
      ? (cloudflare.env.D1 as D1Database)
      : requireBinding(cloudflare.env.D1, "D1"),
  }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: isNextBuild
        ? (cloudflare.env.R2 as R2Bucket)
        : requireBinding(cloudflare.env.R2, "R2"),
      collections: { media: true },
    }),
    /**
     * Maintains a `search` collection synced from `gestures`, replacing the
     * Convex `search_content` index.
     *
     * Access is spelled out rather than left to the plugin, whose defaults are
     * `create: () => false`, `read: () => true` and — for `update`/`delete`,
     * which it does not set — Payload's `defaultAccess`, i.e. any signed-in
     * user. Two problems with that here. A public `read` leaks exactly what
     * `publicReadActive` hides: the index entry of an inactive gesture, which
     * would make search a way to enumerate gestures the API refuses to serve.
     * And a signed-in non-admin could rewrite index entries.
     *
     * `publicReadActive` works unchanged because `isActive` is mirrored onto
     * the search document by `beforeSyncGesture`. The plugin's own writes are
     * unaffected: they go through the local API, where `overrideAccess`
     * defaults to `true`.
     *
     * `create`, `update` and `delete` are `isAdmin` rather than `denyAll`
     * because the admin panel's Reindex button checks exactly those three
     * permissions before running (`generateReindexHandler`, 3.89.0) — and
     * checks `create` and `read` only when they are overridden here, which
     * they are. `denyAll` would make reindexing impossible for everybody.
     */
    searchPlugin({
      collections: ["gestures"],
      defaultPriorities: { gestures: 10 },
      beforeSync: beforeSyncGesture,
      searchOverrides: {
        access: {
          read: publicReadActive,
          create: isAdmin,
          update: isAdmin,
          delete: isAdmin,
        },
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: "concepts",
            type: "text",
            index: true,
            // `gestures.concepts` is localized, and the plugin syncs one
            // locale per save. A non-localized column here would mean a save
            // in `fr` overwriting the Dutch synonyms for every reader.
            localized: true,
            admin: { readOnly: true },
          },
          {
            name: "isActive",
            type: "checkbox",
            index: true,
            admin: { readOnly: true },
          },
        ],
      },
    }),
  ],
});

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(
    /* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`
  ).then(({ getPlatformProxy }) =>
    getPlatformProxy({
      environment: process.env.CLOUDFLARE_ENV,
      remoteBindings: isProduction,
      persist: vitestPersist,
    } satisfies GetPlatformProxyOptions)
  );
}
