#!/usr/bin/env bun
/**
 * `bun -F site migrate:convex` — imports the Convex catalogue export into
 * Payload.
 *
 *   CLOUDFLARE_ENV=staging bun -F site migrate:convex \
 *     --export ~/convex-export --report ~/import-report.md \
 *     [--target=local|staging|production] [--apply] [--i-have-a-maintenance-window]
 *
 * In order, and each step only if the one before it passed:
 *
 * 1. The guards in `./guard` — the export and report outside the work
 *    tree, `CLOUDFLARE_ENV` equal to the target, the maintenance flag for
 *    production.
 * 2. The export is read and planned (`./plan`), which refuses exports this
 *    import was not built for.
 * 3. The target, its database name from `wrangler.jsonc`, and the planned
 *    counts are printed. Without `--apply` the run ends here, exit 0,
 *    having loaded no Payload and written nothing.
 * 4. With `--apply`: connect, note what already exists — refusing a
 *    production target that already holds catalogue documents without a
 *    legacy id, since production is empty at cutover — apply the plan
 *    (`./apply`), verify the result (`./verify`), write the report
 *    (`./report`), and exit non-zero on any failure, mismatch or
 *    incomplete document.
 *
 * `payload.config.ts` is imported **dynamically**, and only in step 4: it
 * resolves the Cloudflare bindings when it is evaluated, so a static import
 * would connect before any guard ran (the seed script's rule, too).
 */

import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Payload } from "payload";
import { applyPlan, forbidConsentWrites } from "./apply";
import {
  assertOutsideWorkTree,
  assertTargetAllowed,
  databaseNameFor,
  parseCliArgs,
  type Target,
  workTreeRoot,
} from "./guard";
import { buildPlan, readExport } from "./plan";
import { buildReport, runFailed } from "./report";
import { snapshotBeforeRun, type VerifyResult, verify } from "./verify";

const SITE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
/**
 * The one `wrangler.jsonc` both the printed database name and the remote
 * binding come from, whatever the working directory.
 */
const WRANGLER_CONFIG = path.join(SITE_ROOT, "wrangler.jsonc");

/** Where `@opennextjs/cloudflare` looks for an installed Cloudflare context. */
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

interface PlatformProxyLike {
  env: unknown;
  cf: unknown;
  ctx: unknown;
}

interface LoadDeps {
  /**
   * Where `NODE_ENV` is written. `payload.config.ts` reads the real
   * `process.env`, so that is the default and the only value the CLI uses;
   * tests pass their own object so the runner's environment is untouched.
   */
  env?: Record<string, string | undefined>;
  getPlatformProxy: (options: {
    environment: string;
    remoteBindings: true;
    configPath: string;
  }) => Promise<PlatformProxyLike>;
  loadConfiguredPayload: () => Promise<Payload>;
}

const loadConfiguredPayload = async (): Promise<Payload> => {
  const { getPayload } = await import("payload");
  const { default: config } = await import("../../src/payload.config");
  return await getPayload({ config });
};

const wranglerPlatformProxy: LoadDeps["getPlatformProxy"] = async (options) => {
  const { getPlatformProxy } = await import("wrangler");
  return await getPlatformProxy(options);
};

/**
 * Payload, connected to `target`.
 *
 * `local` needs nothing: `payload.config.ts` resolves the emulated bindings
 * itself whenever `NODE_ENV` is not `production`, which the guard ensured.
 *
 * `staging` and `production` must reach the real D1, the way
 * `deploy:database` does. That script gets there through `payload migrate`,
 * which `payload.config.ts` recognises as its CLI and hands
 * `remoteBindings: NODE_ENV === "production"`. This script is not that
 * CLI, so under `NODE_ENV=production` the config instead asks
 * `@opennextjs/cloudflare` for the Worker's context — which, outside a
 * Worker, is whatever was installed on the global. So this sets
 * `NODE_ENV=production` and installs a platform proxy for exactly the
 * target's environment with remote bindings on, and only then imports the
 * config.
 *
 * That path depends on how `payload.config.ts` and `@opennextjs/cloudflare`
 * behave today, so it is checked, not trusted: the D1 binding Payload's
 * adapter ended up holding (`payload.db.binding`, which
 * `@payloadcms/db-d1-sqlite` keeps from its `binding` option) must be the
 * very object the remote proxy handed out. Anything else — a config that
 * resolved its own bindings, a local emulation — fails closed here, before
 * a single read or write.
 *
 * `local` is not checked the same way: a remote and a local D1 binding are
 * not cheaply told apart from the object, and the guard has already made
 * `NODE_ENV` non-production, which is what keeps the config's own
 * `getPlatformProxy` call local.
 */
export async function loadPayloadFor(
  target: Target,
  deps: LoadDeps
): Promise<Payload> {
  if (target === "local") {
    return await deps.loadConfiguredPayload();
  }

  const env = deps.env ?? process.env;
  env.NODE_ENV = "production";
  const proxy = await deps.getPlatformProxy({
    environment: target,
    remoteBindings: true,
    configPath: WRANGLER_CONFIG,
  });
  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
    env: proxy.env,
    cf: proxy.cf,
    ctx: proxy.ctx,
  };

  const payload = await deps.loadConfiguredPayload();
  const remoteD1 = (proxy.env as { D1?: unknown } | undefined)?.D1;
  const inUse = (payload.db as { binding?: unknown }).binding;
  if (remoteD1 === undefined || inUse !== remoteD1) {
    throw new Error(
      `[migrate-convex] Refusing: the D1 binding Payload loaded is not the remote D1 binding for ${target} from ${WRANGLER_CONFIG}. Nothing was read or written.`
    );
  }
  return payload;
}

/**
 * Writes the report without following a symlink: the guard refused one at
 * the path already, and `O_NOFOLLOW` makes a link swapped in since then
 * fail the write instead of redirecting it into the repository.
 */
async function writeReport(
  reportPath: string,
  markdown: string
): Promise<void> {
  const handle = await open(
    reportPath,
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) flags are a bit set.
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    await handle.writeFile(markdown);
  } finally {
    await handle.close();
  }
}

interface RunCliOptions {
  argv: string[];
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  /** Injectable so tests can prove what runs before anything connects. */
  loadPayload?: (target: Target) => Promise<Payload>;
}

/** Runs the CLI and returns its exit code; see the module doc for the steps. */
export async function runCli(options: RunCliOptions): Promise<number> {
  const { env, log, error } = options;
  const loadPayload =
    options.loadPayload ??
    ((target: Target) =>
      loadPayloadFor(target, {
        getPlatformProxy: wranglerPlatformProxy,
        loadConfiguredPayload,
      }));

  try {
    const cli = parseCliArgs(options.argv);
    const workTree = workTreeRoot();
    assertOutsideWorkTree(cli.exportDir, "export", workTree);
    assertOutsideWorkTree(cli.reportPath, "report", workTree);
    assertTargetAllowed(cli, env);
    const database = databaseNameFor(
      cli.target,
      await readFile(WRANGLER_CONFIG, "utf8")
    );

    const plan = buildPlan(await readExport(cli.exportDir));

    log(`Target:      ${cli.target}`);
    log(`Database:    ${database}`);
    log(`Mode:        ${cli.apply ? "APPLY — this run writes" : "dry run"}`);
    log(`Export:      ${cli.exportDir}`);
    log(`Report:      ${cli.reportPath}`);
    log("Planned:");
    log(`  categories  ${plan.categories.length}`);
    log(`  gestures    ${plan.gestures.length}`);
    log(`  skipped     ${plan.skipped.length} (need editorial action)`);
    log(`  favourites  ${plan.dropped.favourites} dropped`);

    if (!cli.apply) {
      log("Dry run: nothing was written. Rerun with --apply to import.");
      return 0;
    }

    const startedAt = new Date();
    const payload = await loadPayload(cli.target);
    const release = forbidConsentWrites(payload);
    try {
      const before = await snapshotBeforeRun(payload, plan);
      log(
        `Already in the target: ${before.preexisting.categories.size} of the categories, ${before.preexisting.gestures.size} of the gestures.`
      );
      const { withoutLegacyId } = before;
      log(
        `Already in the target without a legacy id: ${withoutLegacyId.categories} categories, ${withoutLegacyId.gestures} gestures.`
      );
      // Production is empty at a big-bang cutover: anything already there
      // that this import did not write means the target is not the one the
      // operator thinks it is.
      if (
        cli.target === "production" &&
        withoutLegacyId.categories + withoutLegacyId.gestures > 0
      ) {
        throw new Error(
          `[migrate-convex] Refusing: the production target already holds ${withoutLegacyId.categories} categories and ${withoutLegacyId.gestures} gestures without a legacy id, and production must be empty at cutover. Nothing was written.`
        );
      }

      const result = await applyPlan(payload, plan, { log });
      const report = {
        target: cli.target,
        database,
        startedAt,
        withoutLegacyId,
        plan,
        result,
      };

      let verification: VerifyResult;
      try {
        verification = await verify(payload, plan, before);
      } catch (verifyError) {
        // The import wrote; its record must survive a failed verification.
        const message =
          verifyError instanceof Error
            ? verifyError.message
            : String(verifyError);
        console.error(
          "[migrate-convex] Failed to verify the import:",
          verifyError
        );
        await writeReport(
          cli.reportPath,
          buildReport({
            ...report,
            verification: undefined,
            verificationError: message,
          })
        );
        error(
          `[migrate-convex] Verification did not complete: ${message}. The import's counts are in ${cli.reportPath}.`
        );
        return 1;
      }

      await writeReport(
        cli.reportPath,
        buildReport({ ...report, verification })
      );
      log(
        `Verification ${verification.ok ? "passed" : "FAILED"}: ${verification.incomplete.length} incomplete, ${verification.mismatches.length} mismatches.`
      );
      log(`Report: ${cli.reportPath}`);
      return runFailed(result, verification) ? 1 : 0;
    } finally {
      release();
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (message.startsWith("[migrate-convex]")) {
      // A refusal or a planning error: the message is the whole story.
      error(message);
    } else {
      error(`[migrate-convex] Failed to run the import: ${message}`);
      console.error("[migrate-convex] Failed to run the import:", caught);
    }
    return 1;
  }
}

async function main(): Promise<void> {
  // Nothing on this path signs a token; `deploy:database` passes the same
  // kind of placeholder for the same reason. The config refuses to load
  // without one.
  process.env.PAYLOAD_SECRET ||= "migrate-convex-signs-nothing";

  const code = await runCli({
    argv: process.argv.slice(2),
    env: process.env,
    log: console.log,
    error: console.error,
  });
  // The platform proxy's workerd child keeps the event loop alive (see
  // `src/seed/index.ts`), so exit explicitly, with the real status.
  process.exit(code);
}

// Only when invoked directly (`bun run scripts/migrate-convex/index.ts`).
if (import.meta.main) {
  await main();
}
