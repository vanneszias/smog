import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * Migration 0008 (`payment_refunds`) on a database that already has data:
 * migrations 0000–0007 and the dev seed first, then rows in `payment`,
 * `session` and `verification`, then 0008. It must keep every row, read
 * `refunded_cents = 0` on the old payments, and give the purge its indexes.
 */

const db = env.MIGRATION_DB;
const BEFORE_0008 = env.TEST_MIGRATIONS.filter(
  (migration) => migration.name < "0008"
);

async function applySeed(): Promise<void> {
  const statements = env.SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await db.batch(statements.map((line) => db.prepare(line)));
}

describe("migration 0008_payment_refunds", () => {
  it("adds the refund columns and the expiry indexes without touching existing rows", async () => {
    await applyD1Migrations(db, BEFORE_0008);
    await applySeed();
    await db.batch([
      db.prepare(
        "INSERT INTO payment (id, mollie_id, kind, status, amount_cents, currency, created_at, updated_at) VALUES ('p-old', 'tr_old', 'initial', 'paid', 6000, 'EUR', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) SELECT 's-old', 5, 'tok-old', 1, 1, id FROM user WHERE email = 'admin@smog.test'"
      ),
      db.prepare(
        "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('v-old', 'x', 'y', 5, 1, 1)"
      ),
    ]);
    const users = await db
      .prepare("SELECT count(*) AS n FROM user")
      .first<{ n: number }>();

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    const payment = await db
      .prepare(
        "SELECT id, status, amount_cents, refunded_cents, refunded_at FROM payment WHERE id = 'p-old'"
      )
      .first();
    expect(payment).toEqual({
      amount_cents: 6000,
      id: "p-old",
      refunded_at: null,
      refunded_cents: 0,
      status: "paid",
    });
    expect(
      await db.prepare("SELECT count(*) AS n FROM user").first<{ n: number }>()
    ).toEqual(users);
    expect(
      await db
        .prepare(
          "SELECT (SELECT count(*) FROM session WHERE id = 's-old') AS s, (SELECT count(*) FROM verification WHERE id = 'v-old') AS v"
        )
        .first()
    ).toEqual({ s: 1, v: 1 });

    const indexes = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('session_expires_at_idx', 'verification_expires_at_idx') ORDER BY name"
      )
      .all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual([
      "session_expires_at_idx",
      "verification_expires_at_idx",
    ]);
  });

  it("makes the purge's expired-row reads index seeks", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    for (const table of ["session", "verification"]) {
      // biome-ignore lint/performance/noAwaitInLoops: two small reads, in order for a readable failure.
      const plan = await db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE expires_at < ? LIMIT 500`
        )
        .bind(Date.now())
        .all<{ detail: string }>();
      expect(plan.results.map((row) => row.detail).join("\n")).toContain(
        `${table}_expires_at_idx`
      );
    }
  });
});
