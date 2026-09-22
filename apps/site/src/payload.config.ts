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
import { Claims } from "./collections/Claims";
import { Gestures } from "./collections/Gestures";
import { Lists } from "./collections/Lists";
import { Media } from "./collections/Media";
import { Renders } from "./collections/Renders";
import { Sponsorships } from "./collections/Sponsorships";
import { UserConsents } from "./collections/UserConsents";
import { Users } from "./collections/Users";
import { cloudflareEmailAdapter } from "./email/adapter";
import { accountEndpoints } from "./endpoints/account";
import { authEndpoints, mobileAuthEndpoints } from "./endpoints/auth";
import { crawlerEndpoints } from "./endpoints/crawler";
import { favoritesEndpoints } from "./endpoints/favorites";
import { jobsEndpoints } from "./endpoints/jobs";
import { listsEndpoints } from "./endpoints/lists";
import { mobileEndpoints } from "./endpoints/mobile";
import { mobileSessionEndpoints } from "./endpoints/mobileSession";
import { mollieEndpoints } from "./endpoints/mollie";
import { oauthEndpoints } from "./endpoints/oauth";
import { renderEndpoints } from "./endpoints/render";
import { sponsorshipEndpoints } from "./endpoints/sponsorships";
import { jobsConfig } from "./jobs";
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
  EMAIL: undefined as unknown as SendEmail,
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
    Renders,
    Claims,
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
   *
   * `renderEndpoints` adds `POST /api/render/callback`, reached at
   * `/render/callback`. It is the second endpoint a third party calls, and the
   * opposite arrangement from Mollie's: there is nobody to ask back about a
   * render, so the body *is* the evidence and an HMAC over it is the whole of
   * the authentication. See `endpoints/render.ts`.
   *
   * `jobsEndpoints` adds `GET /api/jobs/run`, the only thing that runs
   * Payload's queue on Workers — `autoRun` needs a long-lived process and
   * there is not one. It is the third endpoint something outside a browser
   * calls, it carries a shared secret in `Authorization`, and it answers every
   * caller the same bytes so that a right token cannot be told from a wrong
   * one. See `endpoints/jobs.ts`.
   *
   * `mobileAuthEndpoints` adds `POST /api/mobile/sign-up` — the Stage 8
   * native app's one missing auth endpoint; sign-in, "who am I", refresh,
   * sign-out and forgot-password are all covered by `/api/users/*` already
   * (the first shadowed by `usersCollectionEndpoints` above, the rest
   * Payload's own). It is a flat sibling of `/mobile/*` for the same
   * matcher reason as `listsEndpoints`, and it shares its accept/refuse
   * decision with `authEndpoints`' own `/auth/sign-up` through
   * `decideSignUp` rather than reimplementing it: "created" and "already
   * registered" are one value computed once, and each endpoint only
   * renders it — a redirect for the form, a JSON body here — so the
   * enumeration-safety property this file exists for cannot agree in one
   * response shape and quietly drift in the other. See `endpoints/auth.ts`.
   *
   * `mobileSessionEndpoints` adds `POST /api/mobile/session` — Stage 8's
   * Google sign-in on the phone. `oauthEndpoints`' own callback, when asked
   * for `?client=mobile`, hands back a single-use exchange code instead of a
   * cookie; this is the other half, trading that code for the real session
   * over HTTPS so the token itself never rides in a redirect URL. See
   * `endpoints/mobileSession.ts`.
   *
   * `mobileEndpoints` adds `GET /api/mobile/gestures` — the browse and
   * search screens' one non-trivial read, calling `gestureQuery.ts`'s
   * stable, clamped sort and `search.ts`'s two-pass locale fallback rather
   * than re-deriving either as a query string. A gesture by id and the
   * category list are ordinary `GET /api/gestures/:id` and
   * `GET /api/categories` reads and need no endpoint of their own — see
   * `endpoints/mobile.ts`.
   */
  endpoints: [
    ...crawlerEndpoints,
    ...authEndpoints,
    ...mobileAuthEndpoints,
    ...mobileSessionEndpoints,
    ...mobileEndpoints,
    ...oauthEndpoints,
    ...favoritesEndpoints,
    ...accountEndpoints,
    ...jobsEndpoints,
    ...listsEndpoints,
    ...sponsorshipEndpoints,
    ...mollieEndpoints,
    ...renderEndpoints,
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
  /**
   * Mail, through Cloudflare's `send_email` binding.
   *
   * The binding is passed as a **thunk**, deliberately. `cloudflare.env` is
   * resolved at module scope because the D1 adapter needs it there, but
   * `EMAIL` is absent during `next build` (see `BUILD_PHASE_BINDINGS`) and in
   * any environment that has not been given one — so reaching for it here
   * would be `createMollieClient({ apiKey: "" })` again, a module that cannot
   * be imported rather than a request that cannot send. `src/email/adapter.ts`
   * calls the thunk inside `sendEmail` and fails there.
   *
   * The sender is the shipped product's, transcribed from
   * `apps/server/src/services/email.ts` (`SMTP_FROM`, defaulting to
   * `Smog <no-reply@smog.app>`) rather than chosen here, and overridable for
   * whichever domain Task 7 onboards to Email Service. Until that domain is
   * verified every send answers `E_SENDER_NOT_VERIFIED`, which is the whole
   * of what Stage 7 is blocked on.
   */
  email: cloudflareEmailAdapter({
    binding: () => cloudflare.env.EMAIL,
    defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@smog.app",
    defaultFromName: process.env.EMAIL_FROM_NAME ?? "Smog",
  }),
  /**
   * The queue, and the four scheduled jobs it will drive.
   *
   * Two things follow from this key existing at all, and both are written up
   * in `src/jobs/index.ts`: Payload adds a `payload-jobs` collection (a
   * schema change, migrated in `20260921_200000_add_payload_jobs`), and it
   * registers `GET /api/payload-jobs/run`, which without
   * `jobs.access.run` would run the whole queue for any signed-in account.
   */
  jobs: jobsConfig,
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
