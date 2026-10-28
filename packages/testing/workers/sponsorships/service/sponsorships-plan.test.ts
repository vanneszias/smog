import { env } from "cloudflare:workers";
import { payment } from "@smog/db";
import { createDb } from "@smog/db/client";
import type { JobQueues } from "@smog/jobs";
import { DAY_MS } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { settleFromMollie } from "../../../../features/sponsorships/src/server/settle";
import {
  runExpirySweep,
  runReminderSweep,
  runRetentionPurge,
  runStaleSweep,
  STALE_PAYMENT_AGE_MS,
} from "../../../../features/sponsorships/src/server/sweeps";
import { recordingD1, scanReport } from "../../../support/db/index";
import { createFakeMollie } from "../../../support/payments/index";
import { createFakeMux } from "../../../support/video/index";
import { clearSponsorships } from "./clean";
import {
  molliePaymentFor,
  NOW,
  SITE_URL,
  seedCheckout,
  testDb,
} from "./helpers";

/*
 * Phase 9 task 6 (P-17): the sweeps (expiry, reminders, stale payments and
 * the render watchdog inside it, the retention purge) and the Mollie
 * webhook's lookup by `mollie_id` seek an index. The real code runs against a
 * recording D1 over a few seeded rows; each statement is explained with its
 * own values. (The retention reads and the watchdog also have their own
 * plan tests in `packages/db` and `render-watchdog.test.ts`.)
 */

const queues: JobQueues = {
  email: { send: () => Promise.resolve() },
  events: { send: () => Promise.resolve() },
};

beforeEach(async () => {
  await clearSponsorships(testDb());
});

describe("the sweeps' and the webhook's query plans (no full table scan)", () => {
  it("expiry, reminder, stale and retention sweeps", async () => {
    const db = testDb();
    const old = new Date(NOW.getTime() - STALE_PAYMENT_AGE_MS - 1);
    const live = await seedCheckout(db, {
      count: 1,
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    await seedCheckout(db, {
      count: 1,
      endsAt: new Date(NOW.getTime() + DAY_MS),
      paymentStatus: "paid",
      status: "live",
    });
    const awaiting = await seedCheckout(db, { count: 1 });
    await db
      .update(payment)
      .set({ createdAt: old })
      .where(eq(payment.id, awaiting.paymentId));
    expect(live.sponsorshipIds).toHaveLength(1);

    const { d1, statements } = recordingD1(env.DB);
    const recorded = createDb(d1);
    await runExpirySweep({ db: recorded, mux: createFakeMux().mux, now: NOW });
    await runReminderSweep({
      db: recorded,
      email: { send: () => Promise.resolve() },
      now: NOW,
      siteUrl: SITE_URL,
    });
    await runStaleSweep({
      db: recorded,
      mollie: createFakeMollie().mollie,
      now: NOW,
      queues,
    });
    const purgeStart = performance.now();
    await runRetentionPurge({
      db: recorded,
      kv: undefined,
      media: undefined,
      mux: null,
      now: NOW,
    });
    // Noted in the task report (no assertion: a local D1 is not production).
    console.log(
      `[perf] retention purge ${(performance.now() - purgeStart).toFixed(1)} ms (local D1)`
    );
    await runRetentionPurge({
      db: recorded,
      dryRun: true,
      kv: undefined,
      media: undefined,
      mux: null,
      now: NOW,
    });
    expect(statements.length).toBeGreaterThan(10);

    // The one accepted scan: the used-token purge (`used_at` has no index;
    // a few rows per sponsorship, docs/DECISIONS.md, 2026-10-02 retention).
    const report = await scanReport(
      env.DB,
      statements,
      (detail) => detail === "SCAN sponsorship_token"
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
    // Migration 0014: the orphan-logo sweep seeks `logo_key`, never scans.
    expect(report.plans.join("\n")).toContain("sponsorship_logo_key_idx");
  });

  it("looks the payment up by Mollie id and by metadata through indexes (the webhook)", async () => {
    const db = testDb();
    const fake = createFakeMollie();
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    const { d1, statements } = recordingD1(env.DB);
    await settleFromMollie(createDb(d1), fake.mollie, { mollieId, now: NOW });
    // Unknown to us: the lookup by Mollie id finds nothing, then the metadata.
    await settleFromMollie(createDb(d1), fake.mollie, {
      mollieId: "tr_unknown123",
      now: NOW,
    });
    expect(statements.length).toBeGreaterThan(3);

    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
    expect(report.plans.join("\n")).toContain("payment_mollie_id_unique");
  });
});
