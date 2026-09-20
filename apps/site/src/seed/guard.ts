/**
 * The seed script is the only thing in this app that writes content, so it is
 * the only thing that can destroy content. This decides, before Payload is
 * even imported, that the target is a local emulated database and nothing
 * else.
 *
 * Two variables decide which database `payload.config.ts` resolves:
 *
 * - `NODE_ENV`. It is the switch for *remote* bindings. `getPlatformProxy` is
 *   called with `remoteBindings: isProduction` (and `wrangler`'s own default
 *   for that option is `true`, verified in
 *   `node_modules/wrangler/wrangler-dist/cli.d.ts`, 4.116.0). With
 *   `NODE_ENV=production` the D1 bindings in `wrangler.jsonc` — both of which
 *   carry `"remote": true` — resolve to the real Cloudflare databases. That is
 *   the path that can wipe or duplicate staging and production content, so
 *   anything but an explicitly local `NODE_ENV` is refused.
 * - `CLOUDFLARE_ENV`. It names which `env.<name>` block's bindings to resolve.
 *   Bindings exist only under `staging` and `production`, so `staging` is the
 *   only value that both resolves a D1 binding and, with remote bindings off,
 *   is emulated on local disk under `.wrangler/state`. `production` is refused
 *   outright: a local emulation of the production binding set is one stray
 *   `NODE_ENV` away from the real database, and there is no reason to seed it.
 *
 * Matching is exact — no trimming, no case folding. `deploy:guard` learned
 * that the hard way when a whitespace hole let `--env=` through, and the same
 * hole here is the difference between seeding a local file and seeding
 * production. A value that is *nearly* right is a mistake to report, not one
 * to helpfully repair.
 */

/** The only `CLOUDFLARE_ENV` whose bindings the seed may resolve. */
const LOCAL_CLOUDFLARE_ENV = "staging";

/** `NODE_ENV` values that keep `payload.config.ts` on local emulated bindings. */
const LOCAL_NODE_ENVS = new Set(["development", "test"]);

const quote = (value: string | undefined): string =>
  value === undefined ? "unset" : `'${value}'`;

/**
 * Throws unless the environment points the seed at a local emulated database.
 *
 * Callers must run this *before* importing `payload.config.ts`: a static
 * import is hoisted and resolves the Cloudflare bindings at module-evaluation
 * time, which would happen before any check in a function body.
 */
export function assertSeedTargetIsLocal(
  env: Record<string, string | undefined> = process.env
): void {
  const cloudflareEnv = env.CLOUDFLARE_ENV;

  if (cloudflareEnv !== LOCAL_CLOUDFLARE_ENV) {
    throw new Error(
      `Refusing to seed: CLOUDFLARE_ENV must be exactly '${LOCAL_CLOUDFLARE_ENV}' (got: ${quote(cloudflareEnv)}). ` +
        "The seed only ever writes to the locally emulated bindings under .wrangler/state; " +
        "it must never resolve the production binding set."
    );
  }

  const nodeEnv = env.NODE_ENV;

  if (nodeEnv !== undefined && !LOCAL_NODE_ENVS.has(nodeEnv)) {
    throw new Error(
      `Refusing to seed: NODE_ENV must be unset, 'development' or 'test' (got: ${quote(nodeEnv)}). ` +
        "NODE_ENV=production makes payload.config.ts resolve remote Cloudflare bindings, " +
        "which would write this fixture content to the real database."
    );
  }
}
