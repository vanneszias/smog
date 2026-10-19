/**
 * The integration suite's import (phase 8 task 10): the fixture export is
 * planned in process with every transform and input (the WorkOS export,
 * the Mux map, the overlay overrides), then applied to the test D1 (every
 * migration) as `apply` does: the preflight against D1, the files in
 * manifest order, and the catalogue bump. The real services then read the
 * result.
 */
import { env } from "cloudflare:workers";
import { buildGrantStatements } from "@smog/config/admin-grant";
import { createDb, type Db } from "@smog/db/client";
import { bumpCatalogVersion } from "@smog/gestures/server";
import { expect } from "vitest";
import { legacyUuid } from "../../src/core/ids";
import { type PlanOutput, plan } from "../../src/core/plan";
import {
  type D1Query,
  type PreflightResult,
  preflightFactsSchema,
  runPreflight,
} from "../../src/core/preflight";
import type { Target } from "../../src/core/target";
import adminLogs from "../fixtures/export/adminLogs/documents.jsonl?raw";
import categories from "../fixtures/export/categories/documents.jsonl?raw";
import gestureListItems from "../fixtures/export/gesture_list_items/documents.jsonl?raw";
import gestureLists from "../fixtures/export/gesture_lists/documents.jsonl?raw";
import gestures from "../fixtures/export/gestures/documents.jsonl?raw";
import sponsorships from "../fixtures/export/sponsorships/documents.jsonl?raw";
import userConsents from "../fixtures/export/user_consents/documents.jsonl?raw";
import userFavorites from "../fixtures/export/user_favorites/documents.jsonl?raw";
import users from "../fixtures/export/users/documents.jsonl?raw";
import muxMap from "../fixtures/mux-map.json?raw";
import overrides from "../fixtures/overlay-overrides.json?raw";
import workosUsers from "../fixtures/workos-users.csv?raw";

/** The plan's `--now`. */
export const NOW = new Date("2026-10-04T12:00:00.000Z");
export const SITE_URL = "http://localhost:5173";

/** The admin `admin:grant --create` made before the import (a fixture user whose Convex role is `user`). */
export const PRE_EXISTING = {
  email: "preexisting.admin@example.test",
  id: "0b7d0a9e-6a8e-4f43-9d1e-6f0a2b9c1d00",
  legacyId: "jd7usr000000000000000000000pre1",
} as const;

export const convex = {
  gesture: (suffix: string) => `kg7ges000000000000000000000${suffix}`,
  sponsorship: (n: string) =>
    n === "01"
      ? "ks7spn000000000000000000000spn1"
      : `ks7spn000000000000000000000sp${n}`,
  user: (suffix: string) => `jd7usr000000000000000000000${suffix}`,
};

export function testDb(): Db {
  return createDb(env.DB);
}

export const query: D1Query = async (sql) =>
  (await env.DB.prepare(sql).all<Record<string, unknown>>()).results;

const plans = new Map<Target, Promise<PlanOutput>>();

/** The fixture's plan for `target` (made once per file). */
export function fixturePlan(
  target: Target = "production"
): Promise<PlanOutput> {
  let made = plans.get(target);
  if (!made) {
    made = plan({
      export: {
        adminLogs,
        categories,
        gesture_list_items: gestureListItems,
        gesture_lists: gestureLists,
        gestures,
        sponsorships,
        user_consents: userConsents,
        user_favorites: userFavorites,
        users,
      },
      muxMap,
      now: NOW,
      overrides,
      target,
      workosUsers,
    });
    plans.set(target, made);
  }
  return made;
}

/** A plan's SQL files in manifest order (`groups`), or its reset files, as statements. */
export function statementsOf(
  result: PlanOutput,
  which: "groups" | "reset"
): string[] {
  const files =
    which === "groups" ? result.manifest?.files : result.manifest?.reset;
  return (files ?? []).flatMap((file) =>
    (result.files.get(file.name) ?? "")
      .split("\n")
      .filter((line) => line.length > 0)
  );
}

/** Runs statements in order, one D1 batch per 100 (each `--file` is idempotent on its own). */
export async function run(statements: readonly string[]): Promise<void> {
  for (let start = 0; start < statements.length; start += 100) {
    // biome-ignore lint/performance/noAwaitInLoops: in order, as `--file` runs them.
    await env.DB.batch(
      statements
        .slice(start, start + 100)
        .map((statement) => env.DB.prepare(statement))
    );
  }
}

/** Every table the import or the services write, children first. */
const WIPE_ORDER = [
  "render_job",
  "payment_item",
  "sponsorship_token",
  "sponsorship_event",
  "payment",
  "sponsorship",
  "invoice_request",
  "sponsor",
  "list_share",
  "list_item",
  "list",
  "favorite",
  "consent_event",
  "audit_log",
  "gesture_keyword",
  "gesture_category",
  "gesture_fts",
  "gesture",
  "category",
  "session",
  "account",
  "passkey",
  "verification",
  "guest_import",
  "user",
] as const;

export async function wipe(): Promise<void> {
  await env.DB.batch(
    WIPE_ORDER.map((table) => env.DB.prepare(`DELETE FROM "${table}"`))
  );
}

/** The tables `counts` reads. */
const COUNTED = [
  "user",
  "category",
  "gesture",
  "gesture_keyword",
  "gesture_category",
  "gesture_fts",
  "favorite",
  "list",
  "list_item",
  "list_share",
  "consent_event",
  "audit_log",
  "sponsor",
  "invoice_request",
  "payment",
  "payment_item",
  "sponsorship",
  "sponsorship_event",
  "sponsorship_token",
] as const;

export async function counts(): Promise<Record<string, number>> {
  const rows = await env.DB.batch<{ n: number }>(
    COUNTED.map((table) =>
      env.DB.prepare(`SELECT count(*) AS n FROM "${table}"`)
    )
  );
  return Object.fromEntries(
    COUNTED.map((table, index) => [table, rows[index]?.results[0]?.n ?? -1])
  );
}

export interface Imported {
  readonly plan: PlanOutput;
  readonly preflight: PreflightResult;
}

/**
 * A clean D1 with the pre-existing admin (`admin:grant --create`), then
 * the fixture imported as `apply --env dev` does it.
 */
export async function importFixture(
  options: { target?: Target; withAdmin?: boolean } = {}
): Promise<Imported> {
  await wipe();
  if (options.withAdmin ?? true) {
    await run(
      buildGrantStatements(PRE_EXISTING.email, {
        create: true,
        id: PRE_EXISTING.id,
      })
    );
  }
  const result = await fixturePlan(options.target ?? "production");
  expect(result.report.blockers).toBe(0);
  const facts = preflightFactsSchema.parse(
    JSON.parse(result.files.get("preflight.json") ?? "")
  );
  const preflight = await runPreflight(query, {
    env: "dev",
    facts,
    maintenance: null,
    nativeCatalog: false,
    target: result.report.target,
  });
  expect(preflight.refusals).toEqual([]);
  await run(statementsOf(result, "groups"));
  await bumpCatalogVersion(env.KV);
  return { plan: result, preflight };
}

/** The new id of a migrated row (`legacyUuid`). */
export function newIdOf(
  table: "gesture" | "sponsorship" | "user" | "category",
  legacyId: string
): Promise<string> {
  return legacyUuid(table, legacyId);
}
