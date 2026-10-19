import { env } from "cloudflare:workers";
import { CATALOG_VERSION_KEY } from "@smog/gestures/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type OwnRows,
  ownRowsOf,
  type PreflightFacts,
  preflightFactsSchema,
  runPreflight,
  verifyCounts,
} from "../../src/core/preflight";
import {
  convex,
  counts,
  fixturePlan,
  importFixture,
  newIdOf,
  PRE_EXISTING,
  query,
  run,
  statementsOf,
  wipe,
} from "./harness";

/*
 * `apply` on a D1 with every migration (phase 8 ruling 14): the preflight,
 * the files and the catalogue bump, then the verification (the report's
 * counts equal D1's), re-runs, the reset, the claimed admin, the last
 * admin, a native slug collision and a staging plan.
 */

const ADMIN_TRIGGER = /last_admin/;
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const FIXTURE_ADDRESS = /fixture@|@example\.test|privaterelay/;

async function adminCount(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM "user" WHERE role = 'admin'`
  ).first<{ n: number }>();
  return row?.n ?? -1;
}

beforeEach(async () => {
  await wipe();
});

describe("apply's files on D1", () => {
  it("apply leaves D1 holding exactly the report's counts, and bumps the catalogue", async () => {
    const before = await env.KV.get(CATALOG_VERSION_KEY);
    const { plan, preflight } = await importFixture();
    expect(await env.KV.get(CATALOG_VERSION_KEY)).not.toBe(before);
    const verified = await verifyCounts(query, plan.report);
    expect(verified.filter((entry) => entry.status !== "ok")).toEqual([]);
    // The claimed admin is listed, with its role kept and the difference reported.
    expect(preflight.claims).toEqual([
      {
        email: PRE_EXISTING.email,
        legacyId: PRE_EXISTING.legacyId,
        role: "admin",
        state: "claim",
      },
    ]);
    expect(preflight.roleDifferences).toEqual([
      {
        convexRole: "user",
        d1Role: "admin",
        email: PRE_EXISTING.email,
        legacyId: PRE_EXISTING.legacyId,
      },
    ]);
  });

  it("re-applying changes no count", async () => {
    const { plan } = await importFixture();
    const first = await counts();
    await run(statementsOf(plan, "groups"));
    expect(await counts()).toEqual(first);
    const facts = preflightFactsSchema.parse(
      JSON.parse(plan.files.get("preflight.json") ?? "")
    );
    const again = await runPreflight(query, {
      env: "dev",
      facts,
      maintenance: null,
      nativeCatalog: false,
      target: "production",
    });
    expect(again.refusals).toEqual([]);
    expect(again.claims.every((claim) => claim.state === "present")).toBe(true);
  });

  it("--reset then a re-apply gives the same counts, keeps the claimed admin with its role, and an admin always exists", async () => {
    const { plan } = await importFixture();
    const applied = await counts();
    await run(statementsOf(plan, "reset"));
    const reset = await counts();
    expect(reset).toMatchObject({
      audit_log: 0,
      category: 0,
      favorite: 0,
      gesture: 0,
      gesture_fts: 0,
      list: 0,
      payment: 0,
      sponsor: 0,
      sponsorship: 0,
      user: 1,
    });
    expect(
      (await env.DB.prepare('SELECT id, role, legacy_id FROM "user"').all())
        .results
    ).toEqual([{ id: PRE_EXISTING.id, legacy_id: null, role: "admin" }]);
    expect(await adminCount()).toBe(1);
    await run(statementsOf(plan, "groups"));
    expect(await counts()).toEqual(applied);
    expect(
      await env.DB.prepare('SELECT role, legacy_id FROM "user" WHERE id = ?')
        .bind(PRE_EXISTING.id)
        .first()
    ).toEqual({ legacy_id: PRE_EXISTING.legacyId, role: "admin" });
  });

  it("the reset never deletes the last admin, even one the import created", async () => {
    const { plan } = await importFixture({ withAdmin: false });
    const applied = await counts();
    // Only imported admins exist: the reset deletes none of them (no admin
    // outside its set would remain) and sets them free; the rest goes.
    await run(statementsOf(plan, "reset"));
    const kept = await env.DB.prepare(
      'SELECT role, legacy_id FROM "user"'
    ).all<{ legacy_id: string | null; role: string }>();
    expect(kept.results.length).toBeGreaterThan(0);
    expect(
      kept.results.every(
        (row) => row.role === "admin" && row.legacy_id === null
      )
    ).toBe(true);
    // A re-apply claims them again by address.
    await run(statementsOf(plan, "groups"));
    expect(await counts()).toEqual(applied);
  });

  it("demoting the last admin still fails (0007's trigger survives the import)", async () => {
    await importFixture();
    await env.DB.prepare(
      `UPDATE "user" SET role = 'user' WHERE role = 'admin' AND id <> ?`
    )
      .bind(PRE_EXISTING.id)
      .run();
    expect(await adminCount()).toBe(1);
    await expect(
      env.DB.prepare(`UPDATE "user" SET role = 'user' WHERE id = ?`)
        .bind(PRE_EXISTING.id)
        .run()
    ).rejects.toThrow(ADMIN_TRIGGER);
  });

  it("an injected native slug collision is refused by the preflight, and fails loudly if applied anyway", async () => {
    await env.DB.prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES ('native-mama', 'mama', 'Mama', 'mama', 'p', 0, 0)"
    ).run();
    const plan = await fixturePlan();
    const facts = preflightFactsSchema.parse(
      JSON.parse(plan.files.get("preflight.json") ?? "")
    );
    const preflight = await runPreflight(query, {
      env: "dev",
      facts,
      maintenance: null,
      nativeCatalog: false,
      target: "production",
    });
    expect(preflight.refusals.map((refusal) => refusal.code)).toEqual([
      "slugTakenByNativeRow",
    ]);
    expect(preflight.refusals[0]?.ids).toEqual(["native-mama"]);
    const withNative = await runPreflight(query, {
      env: "dev",
      facts,
      maintenance: null,
      nativeCatalog: true,
      target: "production",
    });
    expect(withNative.refusals).toEqual([]);
    expect(withNative.nativeCatalog.gestures).toEqual(["native-mama"]);
    await expect(run(statementsOf(plan, "groups"))).rejects.toThrow(
      UNIQUE_FAILED
    );
  });

  it("a staging plan applied in full holds no fixture address, with the same counts", async () => {
    const { plan } = await importFixture({
      target: "staging",
      withAdmin: false,
    });
    const verified = await verifyCounts(query, plan.report);
    expect(verified.filter((entry) => entry.status !== "ok")).toEqual([]);
    const production = await fixturePlan("production");
    expect(plan.report.sections.map((part) => part.counts)).toEqual(
      production.report.sections.map((part) => part.counts)
    );
    const addresses = await env.DB.batch<{ email: string }>([
      env.DB.prepare('SELECT email FROM "user"'),
      env.DB.prepare("SELECT email FROM sponsor"),
      env.DB.prepare("SELECT email FROM invoice_request"),
    ]);
    const all = addresses.flatMap((result) =>
      result.results.map((row) => row.email)
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((email) => FIXTURE_ADDRESS.test(email))).toEqual([]);
    expect(all.every((email) => email.endsWith("@staging.invalid"))).toBe(true);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM sponsorship_token"
      ).first()
    ).toEqual({ n: 0 });
  });
});

describe("--reset's preflight (phase 9 ruling 10)", () => {
  async function factsOf(
    variant: "fixture" | "other"
  ): Promise<{ facts: PreflightFacts; own: OwnRows }> {
    const result = await fixturePlan("production", variant);
    return {
      facts: preflightFactsSchema.parse(
        JSON.parse(result.files.get("preflight.json") ?? "")
      ),
      own: ownRowsOf(
        (result.manifest?.reset ?? []).map(
          (file) => result.files.get(file.name) ?? ""
        )
      ),
    };
  }

  function preflight(facts: PreflightFacts, own: OwnRows | null) {
    return runPreflight(query, {
      env: "dev",
      facts,
      maintenance: null,
      nativeCatalog: false,
      ownRows: own,
      target: "production",
    });
  }

  it("A's rows are ignored for A's --reset, and still block B (another export)", async () => {
    await importFixture();
    const a = await factsOf("fixture");
    const b = await factsOf("other");

    // A's own rows hold each other's tokens and legacy ids: they block a
    // plain apply, not A's own --reset.
    const [first, second] = a.facts.shareTokens;
    if (!(first && second)) {
      throw new Error("the fixture has two shares");
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE list_share SET token = ? WHERE id = ?").bind(
        "swapped-token-0001",
        first.id
      ),
      env.DB.prepare("UPDATE list_share SET token = ? WHERE id = ?").bind(
        first.token,
        second.id
      ),
      env.DB.prepare("UPDATE user SET legacy_id = NULL WHERE email = ?").bind(
        PRE_EXISTING.email
      ),
      env.DB.prepare("UPDATE user SET legacy_id = ? WHERE id = ?").bind(
        PRE_EXISTING.legacyId,
        await newIdOf("user", convex.user("ada1"))
      ),
    ]);
    const plain = await preflight(a.facts, null);
    expect(plain.refusals.map((refusal) => refusal.code).sort()).toEqual([
      "addressClaimedByOtherLegacyId",
      "legacyIdOnOtherAddress",
      "shareTokenTaken",
    ]);
    expect((await preflight(a.facts, a.own)).refusals).toEqual([]);

    // B is another export: A's rows are not B's, with or without --reset.
    for (const own of [null, b.own]) {
      // biome-ignore lint/performance/noAwaitInLoops: one case after the other.
      const refused = await preflight(b.facts, own);
      const codes = refused.refusals.map((refusal) => refusal.code);
      expect(codes).toContain("slugTakenByOtherImport");
      expect(codes).toContain("shareTokenTaken");
      expect(codes).toContain("addressClaimedByOtherLegacyId");
    }
  });

  it("after A's reset files ran, B has no refusal at all", async () => {
    const { plan: a } = await importFixture();
    await run(statementsOf(a, "reset"));
    const b = await factsOf("other");
    expect((await preflight(b.facts, null)).refusals).toEqual([]);
  });
});
