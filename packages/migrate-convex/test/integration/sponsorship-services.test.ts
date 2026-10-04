import { env } from "cloudflare:workers";
import { type AnyProcedure, call } from "@orpc/server";
import type { EmailMessage, EventMessage, JobQueues } from "@smog/jobs";
import type { MolliePaymentStatus } from "@smog/payments";
import {
  createFakeMollie,
  FAKE_MOLLIE_API_KEY,
  type FakeMollie,
} from "@smog/payments/testing";
import { renderInputSchema } from "@smog/render/contract";
import { makeRpcContext } from "@smog/rpc/testing";
import { hashSponsorshipToken } from "@smog/sponsorships/schema";
import {
  approveStatements,
  createSponsorshipsRouter,
  fakeRenderStarter,
  handlePaymentSettled,
  requestChangesStatements,
  retryRenderStatements,
  runExpirySweep,
  runReminderSweep,
  runRetentionPurge,
  runStaleSweep,
  SponsorshipActionError,
  settleFromMollie,
} from "@smog/sponsorships/server";
import { DAY_MS } from "@smog/utils";
import { createFakeMux } from "@smog/video/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  convex,
  importFixture,
  NOW,
  newIdOf,
  PRE_EXISTING,
  SITE_URL,
  testDb,
} from "./harness";

/*
 * The sponsorship services on migrated rows (phase 8 task 10; rulings 10
 * and 13, the I4 amendment, task 8 review M7): the Mollie webhook's
 * settle and fan-out, the stale, expiry and reminder sweeps, approve,
 * Retry render and a resubmit without a stored logo (I12), the re-edit
 * link by its old raw token, and the rejected-video purge.
 */

const db = testDb();
const HOUR = 3_600_000;

const sponsorshipId = (n: string) =>
  newIdOf("sponsorship", convex.sponsorship(n));

async function row(n: string) {
  const id = await sponsorshipId(n);
  const found = await db.query.sponsorship.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });
  if (!found) {
    throw new Error(`[test] No migrated sponsorship ${n}`);
  }
  return found;
}

async function paymentOf(mollieId: string) {
  const found = await db.query.payment.findFirst({
    where: (table, { eq }) => eq(table.mollieId, mollieId),
  });
  if (!found) {
    throw new Error(`[test] No migrated payment ${mollieId}`);
  }
  return found;
}

async function renderJobsOf(n: string) {
  const id = await sponsorshipId(n);
  return (
    await env.DB.prepare(
      "SELECT id, status, input FROM render_job WHERE sponsorship_id = ?"
    )
      .bind(id)
      .all<{ id: string; input: string; status: string }>()
  ).results;
}

/** The old Mollie payment, as Mollie still holds it after the cutover. */
function molliePayment(
  mollie: FakeMollie,
  id: string,
  amountCents: number,
  status: MolliePaymentStatus,
  createdAt: Date
): void {
  mollie.payments.set(id, {
    amountValue: (amountCents / 100).toFixed(2),
    chargedBackCents: 0,
    createdAt,
    description: "Sponsoring (oud)",
    id,
    locale: "nl_BE",
    metadata: { sponsorshipIds: ["legacy"] },
    paidAt: status === "paid" ? createdAt : null,
    redirectUrl: "https://app.smog.vlaanderen/sponsor/success",
    refundedCents: 0,
    status,
    webhookUrl: "https://app.smog.vlaanderen/webhooks/mollie",
  });
}

function recordingQueues() {
  const events: EventMessage[] = [];
  const emails: EmailMessage[] = [];
  const queues: JobQueues = {
    email: {
      send: (body) => {
        emails.push(body);
        return Promise.resolve();
      },
    },
    events: {
      send: (body) => {
        events.push(body);
        return Promise.resolve();
      },
    },
  };
  return { emails, events, queues };
}

let fake: FakeMollie;

beforeEach(async () => {
  await importFixture();
  fake = createFakeMollie();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the Mollie webhook on migrated payments", () => {
  it("a paid migrated payment settles `already`, with no email for a payment over 6 days old", async () => {
    molliePayment(
      fake,
      "tr_fixture0004",
      10_000,
      "paid",
      new Date("2026-09-20T10:00:00Z")
    );
    const result = await settleFromMollie(db, fake.mollie, {
      mollieId: "tr_fixture0004",
      now: NOW,
    });
    expect(result?.outcome).toBe("already");
    expect(result?.notify).toEqual([]);
    const fanout = await handlePaymentSettled(db, {
      now: NOW,
      paymentId: result?.paymentId ?? "",
      siteUrl: SITE_URL,
    });
    expect(fanout.notify).toEqual([]);
    expect(fanout.events).toEqual([]);
    expect((await row("04")).status).toBe("in_review");
  });

  it("a retried paid for a migrated awaiting_payment settles it: rendering and one render job", async () => {
    expect((await row("02")).status).toBe("awaiting_payment");
    molliePayment(
      fake,
      "tr_fixture0002",
      6000,
      "paid",
      new Date("2026-10-04T08:00:00Z")
    );
    const result = await settleFromMollie(db, fake.mollie, {
      mollieId: "tr_fixture0002",
      now: NOW,
    });
    expect(result?.outcome).toBe("paid");
    expect((await row("02")).status).toBe("rendering");
    const fanout = await handlePaymentSettled(db, {
      now: NOW,
      paymentId: result?.paymentId ?? "",
      siteUrl: SITE_URL,
    });
    const jobs = await renderJobsOf("02");
    expect(jobs).toHaveLength(1);
    expect(fanout.events).toEqual([
      { renderJobId: jobs[0]?.id, type: "render.requested" },
    ]);
    // Paid now: the sponsor's and the admins' emails go out.
    expect(fanout.notify.length).toBeGreaterThan(0);
  });

  it("a paid for a migrated cancelled row needs a refund while its gesture is taken, and revives once it is free", async () => {
    const payment = await paymentOf("tr_fixture0011");
    expect(payment.status).toBe("canceled");
    expect((await row("11")).status).toBe("cancelled");
    molliePayment(
      fake,
      "tr_fixture0011",
      5000,
      "paid",
      new Date("2026-08-03T10:00:00Z")
    );
    // `spn1` is live on the same gesture.
    const taken = await settleFromMollie(db, fake.mollie, {
      mollieId: "tr_fixture0011",
      now: NOW,
    });
    expect(taken?.outcome).toBe("refund_needed");
    expect((await row("11")).status).toBe("cancelled");
  });

  it("revives a migrated cancelled row whose gesture is free (cancelled → rendering)", async () => {
    // The live sponsorship on the gesture expires first.
    await runExpirySweep({ db, mux: null, now: NOW });
    molliePayment(
      fake,
      "tr_fixture0011",
      5000,
      "paid",
      new Date("2026-08-03T10:00:00Z")
    );
    const revived = await settleFromMollie(db, fake.mollie, {
      mollieId: "tr_fixture0011",
      now: NOW,
    });
    expect(revived?.outcome).toBe("late_revived");
    expect((await row("11")).status).toBe("rendering");
  });
});

describe("the stale sweep on migrated open payments (I4)", () => {
  async function sweep(now: Date) {
    return await runStaleSweep({
      db,
      mollie: fake.mollie,
      mux: null,
      now,
      queues: recordingQueues().queues,
      siteUrl: SITE_URL,
      workflow: null,
    });
  }

  it("settles one Mollie reports paid", async () => {
    molliePayment(
      fake,
      "tr_fixture0003",
      5000,
      "paid",
      new Date("2026-10-02T08:00:00Z")
    );
    const result = await sweep(NOW);
    expect(result.settled).toBeGreaterThanOrEqual(1);
    expect((await paymentOf("tr_fixture0003")).status).toBe("paid");
    expect((await row("03")).status).toBe("rendering");
  });

  it("cancels one still open at Mollie, there and here", async () => {
    molliePayment(
      fake,
      "tr_fixture0003",
      5000,
      "open",
      new Date("2026-10-02T08:00:00Z")
    );
    const result = await sweep(NOW);
    expect(result.cancelledAtMollie).toBe(1);
    expect(fake.payments.get("tr_fixture0003")?.status).toBe("canceled");
    expect((await row("03")).status).toBe("cancelled");
  });

  it("cancels one Mollie expired, and leaves a fresh one (sp02) alone", async () => {
    molliePayment(
      fake,
      "tr_fixture0003",
      5000,
      "expired",
      new Date("2026-10-02T08:00:00Z")
    );
    molliePayment(
      fake,
      "tr_fixture0002",
      6000,
      "open",
      new Date("2026-10-04T08:00:00Z")
    );
    await sweep(NOW);
    expect((await row("03")).status).toBe("cancelled");
    expect((await row("02")).status).toBe("awaiting_payment");
    expect(fake.payments.get("tr_fixture0002")?.status).toBe("open");
  });

  it("cancels a migrated open payment without a Mollie id locally after 24 hours (sp13)", async () => {
    await sweep(NOW);
    expect((await row("13")).status).toBe("awaiting_payment");
    await sweep(new Date(NOW.getTime() + 25 * HOUR));
    expect((await row("13")).status).toBe("cancelled");
  });
});

describe("the admin's actions and the sweeps on migrated rows", () => {
  it("approves a migrated in_review row; the reminder sweep reminds it once, and the expiry sweep ends it", async () => {
    const id = await sponsorshipId("04");
    const plan = await approveStatements(db, {
      actorId: PRE_EXISTING.id,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    const live = await row("04");
    expect(live.status).toBe("live");
    // sp08 was reminded in Convex: never reminded again.
    const outbox = { send: vi.fn(() => Promise.resolve()) };
    const now = await runReminderSweep({
      db,
      email: outbox,
      now: NOW,
      siteUrl: SITE_URL,
    });
    expect(now.reminded).toBe(0);
    const later = new Date((live.endsAt?.getTime() ?? 0) - 10 * DAY_MS);
    const reminded = await runReminderSweep({
      db,
      email: outbox,
      now: later,
      siteUrl: SITE_URL,
    });
    expect(reminded.reminded).toBe(1);
    expect((await row("04")).status).toBe("expiring");
    // sp08 (expiring since Convex) ends on 2026-10-20.
    const expired = await runExpirySweep({
      db,
      mux: null,
      now: new Date("2026-10-21T00:00:00Z"),
    });
    expect(expired.expired).toBeGreaterThanOrEqual(2);
    expect((await row("08")).status).toBe("expired");
  });

  it("Retry render on a migrated render_failed row with a paid logo and none stored renders without one (I12)", async () => {
    const failed = await row("06");
    expect(failed.status).toBe("render_failed");
    expect(failed.logoKey).toBeNull();
    const item = await env.DB.prepare(
      "SELECT includes_logo FROM payment_item WHERE sponsorship_id = ?"
    )
      .bind(failed.id)
      .first<{ includes_logo: number }>();
    expect(item?.includes_logo).toBe(1);
    const plan = await retryRenderStatements(db, {
      actorId: PRE_EXISTING.id,
      now: NOW,
      sponsorshipId: failed.id,
    });
    await db.batch(plan.statements as never);
    const [job] = await renderJobsOf("06");
    const input = renderInputSchema.parse(JSON.parse(job?.input ?? "{}"));
    expect(input.logoKey).toBeNull();
    await fakeRenderStarter(db, () => NOW).start({
      input,
      renderJobId: job?.id ?? "",
    });
    const rendered = await row("06");
    expect(rendered.status).toBe("in_review");
    expect(rendered.videoPlaybackId).toBe(input.sourcePlaybackId);
  });

  it("a changes_requested row with a paid logo and none stored resubmits, and renders without a logo", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const id = await sponsorshipId("15");
    expect((await row("15")).status).toBe("in_review");
    const plan = await requestChangesStatements(db, {
      actorId: PRE_EXISTING.id,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    const router = createSponsorshipsRouter();
    const events: EventMessage[] = [];
    await call(
      router.reedit.submit as unknown as AnyProcedure,
      { displayName: "Nieuwe tekst", token: plan.token },
      {
        context: makeRpcContext({
          db,
          env: {
            EVENTS_QUEUE: {
              send: (body: EventMessage) => {
                events.push(body);
                return Promise.resolve();
              },
            } as unknown as Queue,
            MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
          },
          kv: env.KV,
        }),
        path: ["sponsorships", "reedit", "submit"],
      }
    );
    const resubmitted = await row("15");
    expect(resubmitted.status).toBe("rendering");
    const [job] = await renderJobsOf("15");
    expect(
      renderInputSchema.parse(JSON.parse(job?.input ?? "{}")).logoKey
    ).toBeNull();
    expect(events).toEqual([
      { renderJobId: job?.id, type: "render.requested" },
    ]);
  });

  it("the old re-edit link opens with its raw token (R-15)", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const router = createSponsorshipsRouter();
    const view = (await call(
      router.reedit.get as unknown as AnyProcedure,
      { token: "5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c" },
      {
        context: makeRpcContext({
          db,
          env: { MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
          kv: env.KV,
        }),
        path: ["sponsorships", "reedit", "get"],
      }
    )) as { displayName: string; expiresAt: number; gesture: { slug: string } };
    expect(view).toMatchObject({
      displayName: "Gust Fixtureatelier",
      expiresAt: new Date("2026-10-08T10:00:00Z").getTime(),
      gesture: { slug: "fixtuurgebaar-06" },
    });
  });

  it("a migrated changes_requested row resubmits with its old raw token: rendering, one job, the token used (review M-1)", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const before = await row("07");
    expect(before.status).toBe("changes_requested");
    const token = "5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c";
    const router = createSponsorshipsRouter();
    const events: EventMessage[] = [];
    await call(
      router.reedit.submit as unknown as AnyProcedure,
      { displayName: "Gust Fixtureatelier", token },
      {
        context: makeRpcContext({
          db,
          env: {
            EVENTS_QUEUE: {
              send: (body: EventMessage) => {
                events.push(body);
                return Promise.resolve();
              },
            } as unknown as Queue,
            MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
          },
          kv: env.KV,
        }),
        path: ["sponsorships", "reedit", "submit"],
      }
    );
    expect((await row("07")).status).toBe("rendering");
    const jobs = await renderJobsOf("07");
    expect(jobs).toHaveLength(1);
    expect(events).toEqual([
      { renderJobId: jobs[0]?.id, type: "render.requested" },
    ]);
    const stored = await env.DB.prepare(
      "SELECT used_at FROM sponsorship_token WHERE token_hash = ?"
    )
      .bind(await hashSponsorshipToken(token))
      .first<{ used_at: number | null }>();
    expect(stored?.used_at).toBe(NOW.getTime());
    const trail = await env.DB.prepare(
      "SELECT type FROM sponsorship_event WHERE sponsorship_id = ? ORDER BY created_at, rowid"
    )
      .bind(before.id)
      .all<{ type: string }>();
    expect(trail.results.map((event) => event.type)).toEqual([
      "legacy",
      "resubmitted",
      "render_started",
    ]);
  });

  it("the rejected-video purge leaves a migrated rejected row alone, and its old review bounds Request changes", async () => {
    const rejected = await row("10");
    expect(rejected.status).toBe("rejected");
    const mux = createFakeMux();
    const asset = mux.addAsset({});
    await env.DB.prepare(
      "UPDATE sponsorship SET video_asset_id = ? WHERE id = ?"
    )
      .bind(asset.id, rejected.id)
      .run();
    await runRetentionPurge({
      db,
      kv: undefined,
      media: undefined,
      mux: mux.mux,
      now: new Date(NOW.getTime() + 400 * DAY_MS),
    });
    expect(mux.assets.has(asset.id)).toBe(true);
    const after = await row("10");
    expect(after.videoAssetId).toBe(asset.id);
    expect(after.videoPlaybackId).toBe(rejected.videoPlaybackId);
    // Reviewed on 2026-08-10, over 30 days before NOW (ruling 13); the
    // live sponsorship on the same gesture expires first, so the gesture
    // is free and only the bound refuses.
    await runExpirySweep({ db, mux: null, now: NOW });
    const refused = await requestChangesStatements(db, {
      actorId: PRE_EXISTING.id,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: rejected.id,
    }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(SponsorshipActionError);
    expect((refused as SponsorshipActionError).reason).toBe(
      "rejectedTooLongAgo"
    );
  });
});
