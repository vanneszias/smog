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
 * 4. With `--apply`: connect, note what already exists, apply the plan
 *    (`./apply`), verify the result (`./verify`), write the report
 *    (`./report`), and exit non-zero on any failure, mismatch or
 *    incomplete document.
 *
 * `payload.config.ts` is imported **dynamically**, and only in step 4: it
 * resolves the Cloudflare bindings when it is evaluated, so a static import
 * would connect before any guard ran (the seed script's rule, too).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Payload } from "payload";
import { applyPlan } from "./apply";
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
import { snapshotBeforeRun, verify } from "./verify";

const SITE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

/** Where `@opennextjs/cloudflare` looks for an installed Cloudflare context. */
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

interface PlatformProxyLike {
  env: unknown;
  cf: unknown;
  ctx: unknown;
}

interface LoadDeps {
  env: Record<string, string | undefined>;
  getPlatformProxy: (options: {
    environment: string;
    remoteBindings: true;
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
 */
export async function loadPayloadFor(
  target: Target,
  deps: LoadDeps
): Promise<Payload> {
  if (target !== "local") {
    deps.env.NODE_ENV = "production";
    const proxy = await deps.getPlatformProxy({
      environment: target,
      remoteBindings: true,
    });
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
      env: proxy.env,
      cf: proxy.cf,
      ctx: proxy.ctx,
    };
  }
  return await deps.loadConfiguredPayload();
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
        env,
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
      await readFile(path.join(SITE_ROOT, "wrangler.jsonc"), "utf8")
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
    const before = await snapshotBeforeRun(payload, plan);
    log(
      `Already in the target: ${before.preexisting.categories.size} of the categories, ${before.preexisting.gestures.size} of the gestures.`
    );

    const result = await applyPlan(payload, plan, { log });
    const verification = await verify(payload, plan, before);
    await writeFile(
      cli.reportPath,
      buildReport({
        target: cli.target,
        database,
        startedAt,
        plan,
        result,
        verification,
      })
    );

    const failed = runFailed(result, verification);
    log(
      `Verification ${verification.ok ? "passed" : "FAILED"}: ${verification.incomplete.length} incomplete, ${verification.mismatches.length} mismatches.`
    );
    log(`Report: ${cli.reportPath}`);
    return failed ? 1 : 0;
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
