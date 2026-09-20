#!/usr/bin/env bun
/**
 * `bun -F site seed` — fills a local development database with the fixtures.
 *
 * Read `./guard` first: this script writes content, so the first thing it does
 * is refuse to run anywhere but against a locally emulated database.
 *
 * Every import of `payload.config` below is **dynamic on purpose**. A static
 * import is hoisted and evaluated before the first statement of this module
 * runs, and evaluating that config resolves the Cloudflare bindings — which is
 * the very thing the guard exists to prevent. Ordering, not politeness.
 */

import type { Payload } from "payload";
import { assertSeedTargetIsLocal } from "./guard";
import { type SeedSummary, seed, seedUsersFromEnv } from "./seed";

export interface RunSeedOptions {
  env?: Record<string, string | undefined>;
  /** Injectable so tests can prove the guard runs before Payload is loaded. */
  loadPayload?: () => Promise<Payload>;
  log?: (message: string) => void;
}

const loadPayloadFromConfig = async (): Promise<Payload> => {
  const { getPayload } = await import("payload");
  const { default: config } = await import("../payload.config");

  return await getPayload({ config });
};

export async function runSeed({
  env = process.env,
  loadPayload = loadPayloadFromConfig,
  log = console.log,
}: RunSeedOptions = {}): Promise<SeedSummary> {
  assertSeedTargetIsLocal(env);

  const payload = await loadPayload();

  return await seed({ payload, env, log });
}

async function main(): Promise<void> {
  const log = console.log;

  try {
    const summary = await runSeed({ log });
    const [admin, user] = seedUsersFromEnv(process.env);

    log("");
    log("Seeded the local database:");
    log(
      `  categories  ${summary.categories.created} created, ${summary.categories.updated} updated`
    );
    log(
      `  gestures    ${summary.gestures.created} created, ${summary.gestures.updated} updated`
    );
    log(
      `  users       ${summary.users.created} created, ${summary.users.updated} updated`
    );
    log("");
    log(`Admin sign-in: ${admin.email} / ${admin.password}`);
    log(`User sign-in:  ${user.email} / ${user.password}`);
  } catch (error) {
    console.error("[seed] Failed to seed the local database:", error);
    // `payload.config.ts` keeps no handle on the platform proxy's `dispose()`,
    // so miniflare's workerd child holds the event loop open and the process
    // would never exit on its own. Exit explicitly, with a real status code.
    process.exit(1);
  }

  process.exit(0);
}

// Only when invoked directly (`bun run src/seed/index.ts`), never on import.
if (import.meta.main) {
  await main();
}
