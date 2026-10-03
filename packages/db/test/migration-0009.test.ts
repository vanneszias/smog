import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * Migration 0009 (`payment_chargebacks`) on a database that already has
 * payments: 0000–0008 first, then a paid payment with a refund, then 0009.
 * Every existing payment must read `charged_back_cents = 0` and
 * `charged_back_at = NULL`, with the row otherwise unchanged.
 */

const db = env.MIGRATION_DB;

describe("migration 0009_payment_chargebacks", () => {
  it("adds the chargeback columns without touching existing payments", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0009")
    );
    await db
      .prepare(
        "INSERT INTO payment (id, mollie_id, kind, status, amount_cents, currency, refunded_cents, refunded_at, created_at, updated_at) VALUES ('p-old', 'tr_old', 'initial', 'paid', 6000, 'EUR', 1000, 7, 1, 1)"
      )
      .run();

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    expect(
      await db
        .prepare(
          "SELECT id, status, amount_cents, refunded_cents, refunded_at, charged_back_cents, charged_back_at FROM payment WHERE id = 'p-old'"
        )
        .first()
    ).toEqual({
      amount_cents: 6000,
      charged_back_at: null,
      charged_back_cents: 0,
      id: "p-old",
      refunded_at: 7,
      refunded_cents: 1000,
      status: "paid",
    });
  });
});
