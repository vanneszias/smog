import { env } from "cloudflare:workers";
import { buildGrantStatements } from "@smog/config/admin-grant";
import { beforeEach, describe, expect, it } from "vitest";
import { type PlanOutput, plan, type Transform } from "../../src/core/plan";
import { accountTransform } from "../../src/core/transform/account";
import { catalogTransform } from "../../src/core/transform/catalog";
import { learningTransform } from "../../src/core/transform/learning";
import { usersTransform } from "../../src/core/transform/users";
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
import workosUsers from "../fixtures/workos-users.csv?raw";

/*
 * Task 7's smoke on a D1 with every migration (0000–0012): the users,
 * catalogue, learning and account statements of the fixture export all
 * apply, a second run changes no count, and an admin made with
 * `admin:grant --create` before the import is claimed (one row, still an
 * admin, with the user's favorites and list). Task 10's integration
 * suite builds on this.
 */

const TRANSFORMS: readonly Transform[] = [
  usersTransform,
  catalogTransform,
  learningTransform,
  accountTransform,
];

const TABLES = [
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
] as const;

const PRE_EXISTING = "preexisting.admin@example.test";
const PRE_EXISTING_ID = "0b7d0a9e-6a8e-4f43-9d1e-6f0a2b9c1d00";
const PRE_LEGACY_ID = "jd7usr000000000000000000000pre1";

async function run(statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    // biome-ignore lint/performance/noAwaitInLoops: in order, as `wrangler d1 execute --file` runs them.
    await env.DB.prepare(statement).run();
  }
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one count per table.
    const row = await env.DB.prepare(
      `SELECT count(*) AS n FROM "${table}"`
    ).first<{ n: number }>();
    out[table] = row?.n ?? -1;
  }
  return out;
}

function fixturePlan(): Promise<PlanOutput> {
  return plan({
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
    now: new Date("2026-10-04T12:00:00.000Z"),
    target: "production",
    transforms: TRANSFORMS,
    workosUsers,
  });
}

/** The plan's SQL files in manifest order (`groups`), or the reset files, as statements. */
function statementsOf(result: PlanOutput, which: "groups" | "reset"): string[] {
  const names =
    which === "groups"
      ? (result.manifest?.files ?? []).map((file) => file.name)
      : (result.manifest?.reset ?? []).map((file) => file.name);
  return names.flatMap((name) =>
    (result.files.get(name) ?? "").split("\n").filter((line) => line.length > 0)
  );
}

describe("task 7's statements on D1", () => {
  beforeEach(async () => {
    await run([...TABLES].reverse().map((table) => `DELETE FROM "${table}";`));
  });

  it("apply, re-apply without changing a count, and claim a pre-existing admin", async () => {
    await run(
      buildGrantStatements(PRE_EXISTING, { create: true, id: PRE_EXISTING_ID })
    );
    const result = await fixturePlan();
    expect(result.report.blockers).toBe(0);
    const statements = statementsOf(result, "groups");
    await run(statements);
    const first = await counts();
    const section = (domain: string) =>
      result.report.sections.find((part) => part.domain === domain)?.counts ??
      {};
    expect(first).toMatchObject({
      audit_log: section("account").auditLogs,
      category: section("catalog").categories,
      consent_event: section("account").consentEvents,
      favorite: section("learning").favorites,
      gesture: section("catalog").gestures,
      gesture_category: section("catalog").gestureCategoryLinks,
      gesture_fts: section("catalog").gestures,
      gesture_keyword: section("catalog").gestureKeywords,
      list: section("learning").lists,
      list_item: section("learning").listItems,
      list_share: section("learning").listShares,
      // The claimed admin is the pre-existing row, not a new one.
      user: section("users").migrated,
    });

    await run(statements);
    expect(await counts()).toEqual(first);

    const claimed = await env.DB.prepare(
      'SELECT id, role, legacy_id, name FROM "user" WHERE email = ?'
    )
      .bind(PRE_EXISTING)
      .all();
    expect(claimed.results).toEqual([
      {
        id: PRE_EXISTING_ID,
        legacy_id: PRE_LEGACY_ID,
        name: "",
        role: "admin",
      },
    ]);
    const owned = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM favorite WHERE user_id = ?1) AS favorites, (SELECT count(*) FROM list WHERE owner_id = ?1) AS lists, (SELECT count(*) FROM list_item WHERE added_by = ?1) AS items"
    )
      .bind(PRE_EXISTING_ID)
      .first();
    expect(owned).toEqual({ favorites: 1, items: 1, lists: 1 });
    const admins = await env.DB.prepare(
      `SELECT count(*) AS n FROM "user" WHERE role = 'admin'`
    ).first<{ n: number }>();
    // Ada, the merged duplicate, the second admin and the pre-existing one.
    expect(admins?.n).toBe(4);

    const search = await env.DB.prepare(
      "SELECT name, keywords, categories FROM gesture_fts WHERE gesture_fts MATCH 'vader'"
    ).all();
    expect(search.results).toMatchObject([
      { categories: "Éten", name: "Papa" },
    ]);
    expect(String(search.results[0]?.keywords).split(" ").sort()).toEqual([
      "papa",
      "vader",
    ]);
  });

  it("resets to nothing but the pre-existing account, and re-applies to the same counts", async () => {
    await run(
      buildGrantStatements(PRE_EXISTING, { create: true, id: PRE_EXISTING_ID })
    );
    const result = await fixturePlan();
    await run(statementsOf(result, "groups"));
    const applied = await counts();
    await run(statementsOf(result, "reset"));
    const reset = await counts();
    expect(reset).toMatchObject({
      audit_log: 0,
      category: 0,
      consent_event: 0,
      gesture: 0,
      gesture_fts: 0,
      list: 0,
      list_item: 0,
      list_share: 0,
      user: 1,
    });
    // The reset keys a favorite by the user id the import would create,
    // which a claimed account does not have; its favorites still go, with
    // their imported gestures (ON DELETE CASCADE).
    expect(reset.favorite).toBe(0);
    const kept = await env.DB.prepare(
      'SELECT role, legacy_id FROM "user"'
    ).all();
    expect(kept.results).toEqual([{ legacy_id: null, role: "admin" }]);
    await run(statementsOf(result, "groups"));
    expect(await counts()).toEqual(applied);
  });
});
