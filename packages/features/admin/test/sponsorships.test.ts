import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { renderJob, sponsorshipEvent, sponsorshipToken } from "@smog/db";
import { createDb } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import { DAY_MS, newId } from "@smog/utils";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminSponsorshipDetail,
  AdminSponsorshipPage,
} from "../src/schema";
import {
  adminSponsorshipsQuery,
  sponsorshipFilters,
  statusFilter,
} from "../src/server/sponsorships";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  expectAudit,
  procedureAt,
  signedUp,
  testDb,
} from "./helpers";
import {
  clearQueues,
  deletedAssets,
  enqueued,
  mollieFaults,
  muxFaults,
  queueFaults,
  testMollie,
} from "./sponsorship-fakes";
import {
  eventTypes,
  paymentRow,
  seedCheckout,
  seedRenderFailed,
  seedRenewal,
  seedToken,
  sponsorshipRow,
} from "./sponsorship-helpers";

/*
 * `admin.sponsorships.*` over the test D1: the list and the detail, and
 * every action through the real `@smog/sponsorships` batches (as
 * `@smog/api` wires them), with the Mollie and Mux fakes and recording
 * queues. Each action's audit entries share its batch (ruling 5): a
 * failing batch leaves neither, and a lost race is `INVALID_STATE stale`.
 */

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin", "Mo Moderator");
});

beforeEach(() => {
  clearQueues();
});

const AUDIT_INSERT = /insert into "audit_log"/i;
const LOGO_URL = /^\/api\/logos\/[0-9a-f-]{36}$/;
const REEDIT_URL =
  /^http:\/\/localhost:5173\/sponsor\/edit\?token=[A-Za-z0-9_-]{43}$/;

async function failure(
  run: Promise<unknown>
): Promise<{ code: string; data?: unknown }> {
  try {
    await run;
  } catch (error) {
    return error as { code: string; data?: unknown };
  }
  throw new Error("[test] expected the call to fail");
}

/** Calls `admin.<path>` as `admin` over `d1` instead of the test D1. */
async function callOver<T>(
  d1: D1Database,
  path: string,
  input: unknown
): Promise<T> {
  const context = await contextAs(admin);
  return (await call(procedureAt(path), input, {
    context: { ...context, db: createDb(d1) },
    path: ["admin", ...path.split(".")],
  })) as T;
}

/** Calls `admin.<path>` as `admin` with no Mollie key (staging before its key). */
async function callWithoutMollie<T>(path: string, input: unknown): Promise<T> {
  const context = await contextAs(admin);
  return (await call(procedureAt(path), input, {
    context: {
      ...context,
      env: { ...context.env, MOLLIE_API_KEY: undefined },
    },
    path: ["admin", ...path.split(".")],
  })) as T;
}

/** Calls `admin.<path>` as `admin` with no queue bindings (a broken config). */
async function callWithoutQueues<T>(path: string, input: unknown): Promise<T> {
  const context = await contextAs(admin);
  const logged = quietErrors();
  try {
    return (await call(procedureAt(path), input, {
      context: {
        ...context,
        env: {
          ...context.env,
          EMAIL_QUEUE: undefined,
          EVENTS_QUEUE: undefined,
        },
      },
      path: ["admin", ...path.split(".")],
    })) as T;
  } finally {
    logged.mockRestore();
  }
}

/** A D1 that refuses the `audit_log` insert (the batch then fails whole). */
function failingAudit(): D1Database {
  return new Proxy(env.DB, {
    get(d1, key) {
      if (key === "prepare") {
        return (query: string) => {
          if (AUDIT_INSERT.test(query)) {
            throw new Error("audit_log is down");
          }
          return d1.prepare(query);
        };
      }
      const value: unknown = Reflect.get(d1, key, d1);
      return typeof value === "function" ? value.bind(d1) : value;
    },
  });
}

/**
 * A D1 that runs `meanwhile` (another admin's change) just before the
 * action's batch: the batch then finds the state it read gone.
 */
function racingD1(meanwhile: string, ...params: unknown[]): D1Database {
  return new Proxy(env.DB, {
    get(d1, key) {
      if (key === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          await d1
            .prepare(meanwhile)
            .bind(...params)
            .run();
          return await d1.batch(statements);
        };
      }
      const value: unknown = Reflect.get(d1, key, d1);
      return typeof value === "function" ? value.bind(d1) : value;
    },
  });
}

async function eventCount(sponsorshipId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM sponsorship_event WHERE sponsorship_id = ?"
  )
    .bind(sponsorshipId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function quietErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {
    // Asserted by the callers where it matters.
  });
}

describe("admin.sponsorships.list", () => {
  /** A window of its own (2001), so other tests' rows stay out. */
  const BASE = Date.UTC(2001, 0, 1);
  const window = { from: BASE, to: BASE + 10 * DAY_MS };
  const at = (day: number) => new Date(BASE + day * DAY_MS);

  let ids: Record<string, string>;
  let paymentId: string;
  let pairPlaybackId: string;

  beforeAll(async () => {
    const review = await seedCheckout({
      createdAt: at(1),
      displayName: "Bakkerij Zon",
      invoice: true,
      logo: true,
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "review-render",
    });
    const pair = await seedCheckout({
      count: 2,
      createdAt: at(2),
      email: "Lotte@Example.com",
    });
    const live = await seedCheckout({
      createdAt: at(3),
      gestures: [await makeGesture(testDb(), { name: "Zwaaien Uniek" })],
      paymentStatus: "paid",
      status: "live",
    });
    const flagged = await seedCheckout({
      createdAt: at(4),
      paymentStatus: "refund_needed",
      status: "cancelled",
    });
    ids = {
      flagged: flagged.sponsorshipIds[0] as string,
      live: live.sponsorshipIds[0] as string,
      pairA: pair.sponsorshipIds[0] as string,
      pairB: pair.sponsorshipIds[1] as string,
      review: review.sponsorshipIds[0] as string,
    };
    ({ paymentId } = pair);
    pairPlaybackId = pair.gestures[0]?.playbackId ?? "";
  });

  const list = (input: Record<string, unknown> = {}) =>
    callAs<AdminSponsorshipPage>(admin, "sponsorships.list", {
      ...window,
      ...input,
    });

  it("lists newest first with the row fields, and pages by keyset", async () => {
    const all = await list();
    const expected = [
      ids.flagged,
      ids.live,
      // One batch: the same created_at, then id descending.
      ...[ids.pairA, ids.pairB].sort().reverse(),
      ids.review,
    ];
    expect(all.items.map((row) => row.id)).toEqual(expected);
    expect(all.nextCursor).toBeNull();
    const review = all.items.at(-1);
    expect(review).toMatchObject({
      amountCents: 6000,
      displayName: "Bakkerij Zon",
      endsAt: null,
      hasLogo: true,
      invoiceRequested: true,
      paymentStatus: "paid",
      playbackId: "review-render",
      refundNeeded: false,
      sponsor: { company: "Acme BV", name: "Alex Sponsor" },
      startsAt: null,
      status: "in_review",
    });
    expect(all.items[0]?.refundNeeded).toBe(true);
    // Without a sponsored video yet, the thumbnail is the gesture's own.
    expect(all.items.find((row) => row.id === ids.pairA)?.playbackId).toBe(
      pairPlaybackId
    );

    const first = await list({ limit: 2 });
    expect(first.items.map((row) => row.id)).toEqual(expected.slice(0, 2));
    const second = await list({ cursor: first.nextCursor, limit: 2 });
    expect(second.items.map((row) => row.id)).toEqual(expected.slice(2, 4));
    const third = await list({ cursor: second.nextCursor, limit: 2 });
    expect(third.items.map((row) => row.id)).toEqual(expected.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it("filters by status, q, payment, refundNeeded and date; counts ignore only the status", async () => {
    const awaiting = await list({ status: ["awaiting_payment"] });
    expect(awaiting.items.map((row) => row.id).sort()).toEqual(
      [ids.pairA, ids.pairB].sort()
    );
    expect(awaiting.counts).toMatchObject({
      awaiting_payment: 2,
      cancelled: 1,
      expired: 0,
      in_review: 1,
      live: 1,
    });
    const two = await list({ status: ["live", "in_review"] });
    expect(two.items.map((row) => row.id)).toEqual([ids.live, ids.review]);

    // q: the gesture name, the display name, the sponsor email (any case).
    expect((await list({ q: "zwaaien uniek" })).items).toHaveLength(1);
    expect((await list({ q: "BAKKERIJ" })).items[0]?.id).toBe(ids.review);
    const byEmail = await list({ q: "lotte@example" });
    expect(byEmail.items).toHaveLength(2);
    expect(byEmail.counts.awaiting_payment).toBe(2);
    expect(byEmail.counts.live).toBe(0);
    // Taken literally: `%` is no wildcard.
    expect((await list({ q: "%" })).items).toEqual([]);

    expect(
      (await list({ paymentId })).items.map((row) => row.id).sort()
    ).toEqual([ids.pairA, ids.pairB].sort());
    expect((await list({ refundNeeded: true })).items.map((r) => r.id)).toEqual(
      [ids.flagged]
    );
    const days = await list({ from: at(2).getTime(), to: at(3).getTime() });
    expect(days.items.map((row) => row.id)).toEqual([
      ids.live,
      ...[ids.pairA, ids.pairB].sort().reverse(),
    ]);
  });

  it("refuses a foreign cursor (VALIDATION), a reversed range and a repeated status (BAD_REQUEST)", async () => {
    expect(await failure(list({ cursor: "nope" }))).toMatchObject({
      code: "VALIDATION",
    });
    expect(
      await failure(list({ from: at(3).getTime(), to: at(2).getTime() }))
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(await failure(list({ status: ["live", "live"] }))).toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("seeks the (created_at, id) index of migration 0010, with no sort", async () => {
    const db = testDb();
    const plans = await Promise.all(
      [null, { createdAt: BASE, id: "x" }].map(async (position) => {
        const query = adminSponsorshipsQuery(
          db,
          sql`${sql.raw("1")} = 1`,
          position,
          50
        ).toSQL();
        const { results } = await env.DB.prepare(
          `EXPLAIN QUERY PLAN ${query.sql}`
        )
          .bind(...query.params)
          .all<{ detail: string; parent: number }>();
        return results
          .filter(
            (row) =>
              row.parent === 0 &&
              !row.detail.startsWith("CORRELATED") &&
              !row.detail.startsWith("SEARCH gesture") &&
              !row.detail.startsWith("SEARCH sponsor ")
          )
          .map((row) => row.detail);
      })
    );
    expect(plans).toEqual([
      ["SCAN sponsorship USING INDEX sponsorship_created_id_idx"],
      [
        "SEARCH sponsorship USING INDEX sponsorship_created_id_idx (created_at<?)",
      ],
    ]);
  });
});

describe("admin.sponsorships.get", () => {
  it("returns the detail: video, sponsor, invoice, payments, trail, jobs and tokens", async () => {
    const gesture = await makeGesture(testDb(), {
      name: "Detail gebaar",
      playbackId: "original-playback",
    });
    const seeded = await seedCheckout({
      gestures: [gesture],
      invoice: true,
      logo: true,
      mollie: true,
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "original-playback",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const actor = await makeUser(testDb(), { name: "Gone Admin" });
    const db = testDb();
    await db.batch([
      db.insert(sponsorshipEvent).values({
        actorId: null,
        data: { paymentId: seeded.paymentId },
        id: newId(),
        sponsorshipId: id,
        type: "payment_paid",
      }),
      db.insert(sponsorshipEvent).values({
        actorId: admin.user.id,
        data: { paymentId: seeded.paymentId },
        id: newId(),
        sponsorshipId: id,
        type: "marked_paid_manually",
      }),
      db.insert(sponsorshipEvent).values({
        actorId: actor.id,
        data: { paymentId: seeded.paymentId, reason: "chargeback" },
        id: newId(),
        sponsorshipId: id,
        type: "refund_needed",
      }),
      db.insert(renderJob).values({
        id: "job-1",
        input: { v: 1 },
        sponsorshipId: id,
        status: "succeeded",
        workflowInstanceId: "job-1",
      }),
      db.insert(sponsorshipToken).values({
        expiresAt: new Date(Date.now() + DAY_MS),
        id: "token-1",
        purpose: "reedit",
        sponsorshipId: id,
        tokenHash: "f".repeat(64),
      }),
    ]);
    await env.DB.prepare(
      "UPDATE payment SET charged_back_cents = 6000, charged_back_at = ? WHERE id = ?"
    )
      .bind(Date.now(), seeded.paymentId)
      .run();
    await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(actor.id).run();

    const detail = await callAs<AdminSponsorshipDetail>(
      admin,
      "sponsorships.get",
      { id }
    );
    expect(detail.sponsorship).toMatchObject({
      displayName: "Acme BV",
      hasLogo: true,
      id,
      status: "in_review",
    });
    expect(detail.gesture).toEqual({
      id: gesture.id,
      name: "Detail gebaar",
      playbackId: "original-playback",
      slug: gesture.slug,
    });
    expect(detail.video).toEqual({
      fakeRender: true,
      playbackId: "original-playback",
    });
    expect(detail.sponsor).toMatchObject({
      company: "Acme BV",
      name: "Alex Sponsor",
    });
    expect(detail.invoice).toEqual({
      email: "factuur@example.com",
      name: "Acme Facturatie",
      vatNumber: "0123456749",
    });
    expect(detail.logoUrl).toMatch(LOGO_URL);
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0]).toMatchObject({
      amountCents: 6000,
      chargedBackCents: 6000,
      id: seeded.paymentId,
      items: [
        {
          amountCents: 6000,
          gesture: { id: gesture.id, name: "Detail gebaar" },
          includesLogo: true,
          sponsorshipId: id,
          status: "in_review",
        },
      ],
      kind: "initial",
      mollieDashboardUrl: `https://my.mollie.com/dashboard/payments/${seeded.mollieId}`,
      mollieId: seeded.mollieId,
      refunded: false,
      refundedCents: 0,
      status: "paid",
    });
    expect(detail.events.map((event) => [event.type, event.actor])).toEqual([
      ["payment_paid", null],
      ["marked_paid_manually", { id: admin.user.id, name: "Mo Moderator" }],
      // The acting account was deleted: the entry stays without an actor.
      ["refund_needed", null],
    ]);
    expect(detail.events[2]?.data).toEqual({
      paymentId: seeded.paymentId,
      reason: "chargeback",
    });
    expect(detail.renderJobs).toMatchObject([
      { attempt: 1, id: "job-1", status: "succeeded" },
    ]);
    expect(detail.tokens).toHaveLength(1);
    expect(Object.keys(detail.tokens[0] ?? {}).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "purpose",
      "usedAt",
    ]);
    expect(JSON.stringify(detail)).not.toContain("f".repeat(64));
  });

  it("is NOT_FOUND for an unknown sponsorship", async () => {
    expect(
      await failure(callAs(admin, "sponsorships.get", { id: "missing" }))
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("approve", () => {
  it("goes live for 365 days, audits and emails the stored dates", async () => {
    const seeded = await seedCheckout({
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "rendered",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.approve", { id })
    ).resolves.toEqual({ id, status: "live" });
    const row = await sponsorshipRow(id);
    expect(row.status).toBe("live");
    const startsAt = row.startsAt?.toISOString();
    const endsAt = row.endsAt?.toISOString();
    expect((row.endsAt?.getTime() ?? 0) - (row.startsAt?.getTime() ?? 0)).toBe(
      365 * DAY_MS
    );
    await expectAudit("sponsorships.approve", {
      actorId: admin.user.id,
      data: { endsAt, startsAt },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    expect(await eventTypes(id)).toEqual(["approved"]);
    expect(enqueued.emails).toHaveLength(1);
    expect(enqueued.emails[0]).toMatchObject({
      idempotencyKey: `sponsorship_live:${id}:${row.startsAt?.getTime()}`,
      props: { endsAt, startsAt },
      template: "transactional/sponsorship-live",
    });
  });

  it("is refused without a video, and outside in_review", async () => {
    const noVideo = await seedCheckout({ status: "in_review" });
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "sponsorships.approve", { id: noVideo.sponsorshipIds[0] })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "noVideo" } });
    const live = await seedCheckout({
      status: "live",
      videoPlaybackId: "rendered",
    });
    expect(
      await failure(
        callAs(admin, "sponsorships.approve", { id: live.sponsorshipIds[0] })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(enqueued.emails).toEqual([]);
  });

  it("a lost race is INVALID_STATE stale and leaves nothing", async () => {
    const seeded = await seedCheckout({
      status: "in_review",
      videoPlaybackId: "rendered",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const mark = await auditMark();
    const racing = racingD1(
      "UPDATE sponsorship SET status = 'rejected' WHERE id = ?",
      id
    );
    expect(
      await failure(callOver(racing, "sponsorships.approve", { id }))
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    expect((await sponsorshipRow(id)).status).toBe("rejected");
    expect(await eventCount(id)).toBe(0);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(enqueued.emails).toEqual([]);
  });

  it("a failing audit insert leaves neither the change nor the entry", async () => {
    const seeded = await seedCheckout({
      status: "in_review",
      videoPlaybackId: "rendered",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const mark = await auditMark();
    const logged = quietErrors();
    expect(
      await failure(callOver(failingAudit(), "sponsorships.approve", { id }))
    ).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    logged.mockRestore();
    expect((await sponsorshipRow(id)).status).toBe("in_review");
    expect(await eventCount(id)).toBe(0);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(enqueued.emails).toEqual([]);
  });
});

describe("reject", () => {
  it("rejects with the reason in the trail and the entry, revoking the open link", async () => {
    const seeded = await seedCheckout({ status: "changes_requested" });
    const id = seeded.sponsorshipIds[0] as string;
    await seedToken(id, "reedit");
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.reject", { id, reason: "  Onleesbaar  " })
    ).resolves.toEqual({ id, status: "rejected" });
    await expectAudit("sponsorships.reject", {
      actorId: admin.user.id,
      data: { reason: "Onleesbaar" },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    expect(await eventTypes(id)).toEqual(["rejected"]);
    // The emailed re-edit link no longer opens (phase 6 close-out).
    expect((await tokenRows(id)).map((token) => token.usedAt)).not.toContain(
      null
    );
  });

  it("needs a reason", async () => {
    const seeded = await seedCheckout({ status: "in_review" });
    expect(
      await failure(
        callAs(admin, "sponsorships.reject", {
          id: seeded.sponsorshipIds[0],
          reason: "   ",
        })
      )
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});

async function tokenRows(sponsorshipId: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, purpose, used_at AS usedAt FROM sponsorship_token WHERE sponsorship_id = ? ORDER BY created_at, rowid"
  )
    .bind(sponsorshipId)
    .all<{ id: string; purpose: string; usedAt: number | null }>();
  return results;
}

describe("requestChanges and regenerateToken", () => {
  it("request changes issues a 7 day link, revokes the open one and audits no token", async () => {
    const seeded = await seedCheckout({
      paymentStatus: "paid",
      status: "in_review",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const old = await seedToken(id, "reedit");
    const mark = await auditMark();
    const link = await callAs<{ expiresAt: number; url: string }>(
      admin,
      "sponsorships.requestChanges",
      { id }
    );
    expect(link.url).toMatch(REEDIT_URL);
    expect(link.expiresAt - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect((await sponsorshipRow(id)).status).toBe("changes_requested");
    const tokens = await tokenRows(id);
    expect(tokens).toHaveLength(2);
    expect(tokens.find((token) => token.id === old)?.usedAt).not.toBeNull();
    expect(tokens.find((token) => token.id !== old)?.usedAt).toBeNull();
    await expectAudit("sponsorships.requestChanges", {
      actorId: admin.user.id,
      data: { expiresAt: new Date(link.expiresAt).toISOString() },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    const raw = new URL(link.url).searchParams.get("token") as string;
    const { results } = await env.DB.prepare(
      "SELECT data FROM audit_log WHERE rowid > ? UNION ALL SELECT data FROM sponsorship_event WHERE sponsorship_id = ?"
    )
      .bind(mark, id)
      .all<{ data: string }>();
    expect(results.some((row) => row.data.includes(raw))).toBe(false);
  });

  it("request changes on a rejected sponsorship whose gesture was taken is gestureTaken", async () => {
    const gesture = await makeGesture(testDb());
    const rejected = await seedCheckout({
      gestures: [gesture],
      status: "rejected",
    });
    await seedCheckout({ gestures: [gesture], status: "live" });
    expect(
      await failure(
        callAs(admin, "sponsorships.requestChanges", {
          id: rejected.sponsorshipIds[0],
        })
      )
    ).toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "gestureTaken" },
    });
  });

  it("regenerates a re-edit link and a renewal link, revoking the open ones", async () => {
    const reedit = await seedCheckout({ status: "changes_requested" });
    const reeditId = reedit.sponsorshipIds[0] as string;
    const oldReedit = await seedToken(reeditId, "reedit");
    const mark = await auditMark();
    const link = await callAs<{ expiresAt: number; url: string }>(
      admin,
      "sponsorships.regenerateToken",
      { id: reeditId, purpose: "reedit" }
    );
    expect(link.url).toContain("/sponsor/edit?token=");
    expect(
      (await tokenRows(reeditId)).find((token) => token.id === oldReedit)
        ?.usedAt
    ).not.toBeNull();
    await expectAudit("sponsorships.regenerateToken", {
      actorId: admin.user.id,
      data: {
        expiresAt: new Date(link.expiresAt).toISOString(),
        purpose: "reedit",
      },
      mark,
      targetId: reeditId,
      targetType: "sponsorship",
    });

    const endsAt = new Date(Date.now() + 20 * DAY_MS);
    const renewal = await seedCheckout({
      endsAt,
      paymentStatus: "paid",
      startsAt: new Date(endsAt.getTime() - 365 * DAY_MS),
      status: "expiring",
    });
    const renewalId = renewal.sponsorshipIds[0] as string;
    const oldRenewal = await seedToken(renewalId, "renewal");
    const renewed = await callAs<{ expiresAt: number; url: string }>(
      admin,
      "sponsorships.regenerateToken",
      { id: renewalId, purpose: "renewal" }
    );
    expect(renewed.url).toContain("/sponsor/renew?token=");
    expect(renewed.expiresAt).toBe(endsAt.getTime());
    expect(
      (await tokenRows(renewalId)).find((token) => token.id === oldRenewal)
        ?.usedAt
    ).not.toBeNull();
    // Not in the wrong status.
    expect(
      await failure(
        callAs(admin, "sponsorships.regenerateToken", {
          id: renewalId,
          purpose: "reedit",
        })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
  });
});

describe("markPaid", () => {
  it("marks a 3-item payment paid: 3 entries, 3 rendering, one payment.settled", async () => {
    const seeded = await seedCheckout({ count: 3 });
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.markPaid", {
        note: "Overschrijving BE12",
        paymentId: seeded.paymentId,
      })
    ).resolves.toEqual({
      paymentId: seeded.paymentId,
      result: "marked_paid",
      sponsorshipIds: [...seeded.sponsorshipIds].sort(),
    });
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect((await sponsorshipRow(id)).status).toBe("rendering");
        expect(await eventTypes(id)).toEqual(["marked_paid_manually"]);
        await expectAudit("sponsorships.markPaid", {
          actorId: admin.user.id,
          data: {
            note: "Overschrijving BE12",
            paymentId: seeded.paymentId,
            source: "manual",
          },
          mark,
          targetId: id,
          targetType: "sponsorship",
        });
      })
    );
    expect(await auditRowsSince(mark)).toHaveLength(3);
    const stored = await paymentRow(seeded.paymentId);
    expect(stored.status).toBe("paid");
    expect(stored.paidAt).not.toBeNull();
    expect(enqueued.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
  });

  it("cancels the open Mollie payment first", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    await callAs(admin, "sponsorships.markPaid", {
      paymentId: seeded.paymentId,
    });
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "canceled"
    );
    expect((await paymentRow(seeded.paymentId)).status).toBe("paid");
  });

  it("settles normally when Mollie already has the money", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.markPaid", { paymentId: seeded.paymentId })
    ).resolves.toMatchObject({ result: "settled" });
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect((await sponsorshipRow(id)).status).toBe("rendering");
        // Mollie's payment, not a manual one: no "paid twice" later.
        expect(await eventTypes(id)).toEqual(["payment_paid"]);
        await expectAudit("sponsorships.markPaid", {
          actorId: admin.user.id,
          data: { paymentId: seeded.paymentId, source: "mollie" },
          mark,
          targetId: id,
          targetType: "sponsorship",
        });
      })
    );
    expect(enqueued.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
  });

  it("is stale for a payment that is not open, and on a lost race", async () => {
    const paid = await seedCheckout({
      paymentStatus: "paid",
      status: "rendering",
    });
    expect(
      await failure(
        callAs(admin, "sponsorships.markPaid", { paymentId: paid.paymentId })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });

    const seeded = await seedCheckout({ count: 2 });
    const mark = await auditMark();
    const racing = racingD1(
      "UPDATE payment SET status = 'canceled' WHERE id = ?",
      seeded.paymentId
    );
    expect(
      await failure(
        callOver(racing, "sponsorships.markPaid", {
          paymentId: seeded.paymentId,
        })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect((await sponsorshipRow(id)).status).toBe("awaiting_payment");
      })
    );
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(enqueued.events).toEqual([]);
  });

  it("a failing audit insert leaves the payment open", async () => {
    const seeded = await seedCheckout({ count: 3 });
    const logged = quietErrors();
    expect(
      await failure(
        callOver(failingAudit(), "sponsorships.markPaid", {
          paymentId: seeded.paymentId,
        })
      )
    ).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    logged.mockRestore();
    expect((await paymentRow(seeded.paymentId)).status).toBe("open");
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect(await eventCount(id)).toBe(0);
      })
    );
    expect(enqueued.events).toEqual([]);
  });

  it("is NOT_FOUND for an unknown payment", async () => {
    expect(
      await failure(
        callAs(admin, "sponsorships.markPaid", { paymentId: "missing" })
      )
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cancel", () => {
  it("cancels the whole payment, at Mollie too, one entry per sponsorship", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.cancel", { paymentId: seeded.paymentId })
    ).resolves.toMatchObject({ result: "canceled" });
    expect((await paymentRow(seeded.paymentId)).status).toBe("canceled");
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "canceled"
    );
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect((await sponsorshipRow(id)).status).toBe("cancelled");
        await expectAudit("sponsorships.cancel", {
          actorId: admin.user.id,
          data: { paymentId: seeded.paymentId },
          mark,
          targetId: id,
          targetType: "sponsorship",
        });
      })
    );
  });

  it("is refused when Mollie reports the payment paid, which is settled instead", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "sponsorships.cancel", { paymentId: seeded.paymentId })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "paid" } });
    expect((await paymentRow(seeded.paymentId)).status).toBe("paid");
    await Promise.all(
      seeded.sponsorshipIds.map(async (id) => {
        expect((await sponsorshipRow(id)).status).toBe("rendering");
      })
    );
    // The refused cancel is audited with the settlement (fix round 1, I1).
    expect(await auditRowsSince(mark)).toHaveLength(2);
    expect(enqueued.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
  });
});

describe("forceExpire", () => {
  it("expires behind the typed gesture name and deletes the sponsored asset", async () => {
    const gesture = await makeGesture(testDb(), {
      muxAssetId: "gesture-asset",
      name: "Afscheid nemen",
    });
    const seeded = await seedCheckout({
      endsAt: new Date(Date.now() + 100 * DAY_MS),
      gestures: [gesture],
      paymentStatus: "paid",
      startsAt: new Date(),
      status: "live",
      videoAssetId: "sponsored-asset",
      videoPlaybackId: "sponsored-playback",
    });
    const id = seeded.sponsorshipIds[0] as string;
    expect(
      await failure(
        callAs(admin, "sponsorships.forceExpire", {
          confirmName: "Afscheid",
          id,
        })
      )
    ).toMatchObject({ code: "VALIDATION" });
    expect((await sponsorshipRow(id)).status).toBe("live");

    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.forceExpire", {
        confirmName: " afscheid NEMEN ",
        id,
      })
    ).resolves.toEqual({ id, status: "expired" });
    expect(await eventTypes(id)).toEqual(["force_expired"]);
    await expectAudit("sponsorships.forceExpire", {
      actorId: admin.user.id,
      data: { deletesAsset: true, from: "live" },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    expect(deletedAssets).toContain("sponsored-asset");
  });

  it.each([
    [404, false],
    [500, true],
  ])(
    "deletes through @smog/video deleteAsset: Mux %i is done or logged, and the expiry stands",
    async (status, logs) => {
      const gesture = await makeGesture(testDb(), { name: "Weg ermee" });
      const seeded = await seedCheckout({
        gestures: [gesture],
        paymentStatus: "paid",
        status: "live",
        videoAssetId: `asset-${status}`,
      });
      const id = seeded.sponsorshipIds[0] as string;
      muxFaults.deleteStatus = status;
      const logged = quietErrors();
      try {
        await expect(
          callAs(admin, "sponsorships.forceExpire", {
            confirmName: "Weg ermee",
            id,
          })
        ).resolves.toEqual({ id, status: "expired" });
        // `deleteAsset`'s own message: the admin no longer sends the DELETE itself.
        const videoLine = `[video] Mux answered ${status} to DELETE /video/v1/assets/asset-${status}`;
        expect(logged.mock.calls.some(([line]) => line === videoLine)).toBe(
          logs
        );
        expect(
          logged.mock.calls.some(
            ([line]) =>
              line ===
              `[admin] Failed to delete the sponsored asset asset-${status}:`
          )
        ).toBe(logs);
      } finally {
        muxFaults.deleteStatus = null;
        logged.mockRestore();
      }
      expect((await sponsorshipRow(id)).status).toBe("expired");
    }
  );

  it("leaves the gesture's own asset alone and revokes the open renewal link", async () => {
    const gesture = await makeGesture(testDb(), { muxAssetId: "own-asset" });
    const seeded = await seedCheckout({
      gestures: [gesture],
      paymentStatus: "paid",
      status: "expiring",
      videoAssetId: "own-asset",
    });
    const id = seeded.sponsorshipIds[0] as string;
    await seedToken(id, "renewal");
    const mark = await auditMark();
    await callAs(admin, "sponsorships.forceExpire", {
      confirmName: gesture.name,
      id,
    });
    expect(deletedAssets).not.toContain("own-asset");
    // One entry, in the batch that revoked the link (the guard counts it).
    await expectAudit("sponsorships.forceExpire", {
      actorId: admin.user.id,
      data: { deletesAsset: false, from: "expiring" },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    const tokens = await tokenRows(id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.usedAt).not.toBeNull();
  });
});

describe("recordRefund", () => {
  it("is refused while Mollie reports nothing refunded", async () => {
    const seeded = await seedCheckout({
      mollie: true,
      paymentStatus: "refund_needed",
      status: "cancelled",
    });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "sponsorships.recordRefund", {
          paymentId: seeded.paymentId,
        })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "notRefunded" } });
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("stores Mollie's refunded amount and audits it on the payment", async () => {
    const seeded = await seedCheckout({
      mollie: true,
      paymentStatus: "refund_needed",
      status: "cancelled",
    });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    testMollie.refund(seeded.mollieId as string, 5000);
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.recordRefund", {
        paymentId: seeded.paymentId,
      })
    ).resolves.toEqual({
      amountCents: 5000,
      paymentId: seeded.paymentId,
      refundedCents: 5000,
    });
    const stored = await paymentRow(seeded.paymentId);
    expect(stored.refundedCents).toBe(5000);
    expect(stored.refundedAt).not.toBeNull();
    await expectAudit("sponsorships.recordRefund", {
      actorId: admin.user.id,
      data: { amountCents: 5000, refundedCents: 5000 },
      mark,
      targetId: seeded.paymentId,
      targetType: "payment",
    });
  });
});

/*
 * Fix round 1: the settle paths audit in the settlement's batch (I1), mark
 * paid commits before it cancels at Mollie (I2), and the atomicity, race
 * and degradation cases of every action (M6).
 */

/** The data of the audit entries written since `mark`, by target. */
async function auditData(mark: number): Promise<Map<string | null, unknown>> {
  return new Map(
    (await auditRowsSince(mark)).map((row) => [row.targetId, row.data])
  );
}

describe("settle paths audit in the settlement's batch (I1)", () => {
  it("mark paid on a Mollie-paid payment: a failing audit leaves it open and enqueues nothing", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    const mark = await auditMark();
    const logged = quietErrors();
    expect(
      await failure(
        callOver(failingAudit(), "sponsorships.markPaid", {
          paymentId: seeded.paymentId,
        })
      )
    ).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    logged.mockRestore();
    expect((await paymentRow(seeded.paymentId)).status).toBe("open");
    const counts = await Promise.all(seeded.sponsorshipIds.map(eventCount));
    expect(counts).toEqual([0, 0]);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(enqueued.events).toEqual([]);
  });

  it("keeps the admin's note, and reports a flagged payment as refund_needed", async () => {
    const seeded = await seedCheckout({ mollie: true });
    const mollieId = seeded.mollieId as string;
    testMollie.setStatus(mollieId, "paid");
    // Mollie reports another amount: settled as refund_needed (ruling 6).
    testMollie.corruptAmount(mollieId, "1.00");
    const mark = await auditMark();
    await expect(
      callAs(admin, "sponsorships.markPaid", {
        note: "Overschrijving",
        paymentId: seeded.paymentId,
      })
    ).resolves.toMatchObject({ result: "refund_needed" });
    expect((await paymentRow(seeded.paymentId)).status).toBe("refund_needed");
    await expectAudit("sponsorships.markPaid", {
      actorId: admin.user.id,
      data: {
        note: "Overschrijving",
        paymentId: seeded.paymentId,
        source: "mollie",
      },
      mark,
      targetId: seeded.sponsorshipIds[0] as string,
      targetType: "sponsorship",
    });
  });

  it("cancel on a Mollie-paid payment audits the refused cancel with the settlement", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "sponsorships.cancel", { paymentId: seeded.paymentId })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "paid" } });
    const data = await auditData(mark);
    expect(data.size).toBe(2);
    for (const id of seeded.sponsorshipIds) {
      expect(data.get(id)).toEqual({
        paymentId: seeded.paymentId,
        refused: "paid",
      });
    }
  });
});

describe("mark paid fails loudly when payment.settled cannot be enqueued", () => {
  it("by hand and when Mollie had the money: the call fails, the payment stays paid", async () => {
    const manual = await seedCheckout({ count: 2 });
    const settled = await seedCheckout({ mollie: true });
    testMollie.setStatus(settled.mollieId as string, "paid");
    queueFaults.events = true;
    const logged = quietErrors();
    try {
      const outcomes = await Promise.all(
        [manual.paymentId, settled.paymentId].map(async (paymentId) => ({
          code: (
            await failure(callAs(admin, "sponsorships.markPaid", { paymentId }))
          ).code,
          // Committed: the stale sweep re-sends `payment.settled` (task 5).
          status: (await paymentRow(paymentId)).status,
        }))
      );
      expect(outcomes).toEqual([
        { code: "INTERNAL_SERVER_ERROR", status: "paid" },
        { code: "INTERNAL_SERVER_ERROR", status: "paid" },
      ]);
      expect(
        logged.mock.calls.some(([message]) =>
          String(message).startsWith(
            "[admin] Failed to enqueue after the commit"
          )
        )
      ).toBe(true);
    } finally {
      queueFaults.events = false;
      logged.mockRestore();
    }
    expect(enqueued.events).toEqual([]);
  });

  it("other actions log a failed enqueue and still answer", async () => {
    const seeded = await seedCheckout({
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "rendered",
    });
    const id = seeded.sponsorshipIds[0] as string;
    await expect(
      callWithoutQueues("sponsorships.approve", { id })
    ).resolves.toEqual({ id, status: "live" });
    expect((await sponsorshipRow(id)).status).toBe("live");
  });
});

describe("mark paid commits before it cancels at Mollie (I2)", () => {
  it("a failed Mollie cancel after the commit leaves the payment paid", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    mollieFaults.cancelStatus = 500;
    const logged = quietErrors();
    await expect(
      callAs(admin, "sponsorships.markPaid", { paymentId: seeded.paymentId })
    ).resolves.toMatchObject({ result: "marked_paid" });
    const messages = logged.mock.calls.map(([message]) => String(message));
    logged.mockRestore();
    expect((await paymentRow(seeded.paymentId)).status).toBe("paid");
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "open"
    );
    expect(
      messages.some((message) =>
        message.startsWith("[admin] Failed to cancel the Mollie payment")
      )
    ).toBe(true);
    // Mollie's later `canceled` changes nothing: the payment is paid.
    testMollie.setStatus(seeded.mollieId as string, "canceled");
    expect(enqueued.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
  });

  it("a failing local batch leaves the Mollie payment open", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    const logged = quietErrors();
    await failure(
      callOver(failingAudit(), "sponsorships.markPaid", {
        paymentId: seeded.paymentId,
      })
    );
    logged.mockRestore();
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "open"
    );
  });

  it("audits an item it did not change as changed: false (M8)", async () => {
    const seeded = await seedCheckout({ count: 2 });
    const [moved, kept] = seeded.sponsorshipIds as [string, string];
    await env.DB.prepare(
      "UPDATE sponsorship SET status = 'cancelled' WHERE id = ?"
    )
      .bind(kept)
      .run();
    const mark = await auditMark();
    await callAs(admin, "sponsorships.markPaid", {
      paymentId: seeded.paymentId,
    });
    const data = await auditData(mark);
    expect(data.get(moved)).toEqual({
      paymentId: seeded.paymentId,
      source: "manual",
    });
    expect(data.get(kept)).toEqual({
      changed: false,
      paymentId: seeded.paymentId,
      source: "manual",
    });
  });
});

describe("every action: a failing audit leaves nothing (M6)", () => {
  async function failsWhole(path: string, input: unknown): Promise<void> {
    const logged = quietErrors();
    expect(await failure(callOver(failingAudit(), path, input))).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    logged.mockRestore();
  }

  it("reject", async () => {
    const id = (await seedCheckout({ status: "in_review" }))
      .sponsorshipIds[0] as string;
    await failsWhole("sponsorships.reject", { id, reason: "Nee" });
    expect((await sponsorshipRow(id)).status).toBe("in_review");
    expect(await eventCount(id)).toBe(0);
  });

  it("requestChanges and regenerateToken keep the old token open", async () => {
    const review = (await seedCheckout({ status: "in_review" }))
      .sponsorshipIds[0] as string;
    const oldReview = await seedToken(review, "reedit");
    await failsWhole("sponsorships.requestChanges", { id: review });
    expect((await sponsorshipRow(review)).status).toBe("in_review");
    expect(await tokenRows(review)).toEqual([
      { id: oldReview, purpose: "reedit", usedAt: null },
    ]);

    const changes = (await seedCheckout({ status: "changes_requested" }))
      .sponsorshipIds[0] as string;
    const oldChanges = await seedToken(changes, "reedit");
    await failsWhole("sponsorships.regenerateToken", {
      id: changes,
      purpose: "reedit",
    });
    expect(await tokenRows(changes)).toEqual([
      { id: oldChanges, purpose: "reedit", usedAt: null },
    ]);
  });

  it("cancel", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    await failsWhole("sponsorships.cancel", { paymentId: seeded.paymentId });
    expect((await paymentRow(seeded.paymentId)).status).toBe("open");
    // Mollie is cancelled only after the local commit.
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "open"
    );
  });

  it("forceExpire keeps the sponsored asset", async () => {
    const gesture = await makeGesture(testDb(), { name: "Blijf staan" });
    const seeded = await seedCheckout({
      gestures: [gesture],
      paymentStatus: "paid",
      status: "live",
      videoAssetId: "kept-asset",
    });
    await failsWhole("sponsorships.forceExpire", {
      confirmName: "Blijf staan",
      id: seeded.sponsorshipIds[0],
    });
    expect(
      (await sponsorshipRow(seeded.sponsorshipIds[0] as string)).status
    ).toBe("live");
    expect(deletedAssets).not.toContain("kept-asset");
  });

  it("recordRefund", async () => {
    const seeded = await seedCheckout({
      mollie: true,
      paymentStatus: "refund_needed",
      status: "cancelled",
    });
    testMollie.setStatus(seeded.mollieId as string, "paid");
    testMollie.refund(seeded.mollieId as string, 5000);
    await failsWhole("sponsorships.recordRefund", {
      paymentId: seeded.paymentId,
    });
    expect((await paymentRow(seeded.paymentId)).refundedCents).toBe(0);
  });
});

describe("lost races, Mollie failures, no Mollie key, renewals (M6)", () => {
  it("reject and cancel lose a race as INVALID_STATE stale", async () => {
    const id = (await seedCheckout({ status: "in_review" }))
      .sponsorshipIds[0] as string;
    expect(
      await failure(
        callOver(
          racingD1("UPDATE sponsorship SET status = 'live' WHERE id = ?", id),
          "sponsorships.reject",
          { id, reason: "Nee" }
        )
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    expect(await eventCount(id)).toBe(0);

    const seeded = await seedCheckout({ count: 2 });
    expect(
      await failure(
        callOver(
          racingD1(
            "UPDATE payment SET status = 'paid' WHERE id = ?",
            seeded.paymentId
          ),
          "sponsorships.cancel",
          { paymentId: seeded.paymentId }
        )
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    const statuses = await Promise.all(
      seeded.sponsorshipIds.map(
        async (sid) => (await sponsorshipRow(sid)).status
      )
    );
    expect(statuses).toEqual(["awaiting_payment", "awaiting_payment"]);
  });

  it("a Mollie outage is INVALID_STATE paymentProvider, and nothing changes", async () => {
    const seeded = await seedCheckout({ count: 2, mollie: true });
    testMollie.failNext(503);
    const logged = quietErrors();
    expect(
      await failure(
        callAs(admin, "sponsorships.markPaid", { paymentId: seeded.paymentId })
      )
    ).toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "paymentProvider" },
    });
    logged.mockRestore();
    expect((await paymentRow(seeded.paymentId)).status).toBe("open");
  });

  it("without a Mollie key: mark paid is local only, record refund is paymentsUnavailable", async () => {
    const seeded = await seedCheckout({ mollie: true });
    await expect(
      callWithoutMollie("sponsorships.markPaid", {
        paymentId: seeded.paymentId,
      })
    ).resolves.toMatchObject({ result: "marked_paid" });
    expect((await paymentRow(seeded.paymentId)).status).toBe("paid");
    expect(testMollie.payments.get(seeded.mollieId as string)?.status).toBe(
      "open"
    );
    expect(
      await failure(
        callWithoutMollie("sponsorships.recordRefund", {
          paymentId: seeded.paymentId,
        })
      )
    ).toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "paymentsUnavailable" },
    });
  });

  it("mark paid renews, cancel only marks a renewal payment", async () => {
    const endsAt = new Date(Date.now() + 20 * DAY_MS);
    const live = await seedCheckout({
      endsAt,
      paymentStatus: "paid",
      startsAt: new Date(endsAt.getTime() - 365 * DAY_MS),
      status: "expiring",
    });
    const id = live.sponsorshipIds[0] as string;
    const renewal = await seedRenewal(id);
    await expect(
      callAs(admin, "sponsorships.markPaid", { paymentId: renewal })
    ).resolves.toMatchObject({ result: "marked_paid", sponsorshipIds: [id] });
    const renewed = await sponsorshipRow(id);
    expect(renewed.status).toBe("live");
    expect(renewed.endsAt?.getTime()).toBe(endsAt.getTime() + 365 * DAY_MS);

    const second = await seedRenewal(id);
    await callAs(admin, "sponsorships.cancel", { paymentId: second });
    expect((await paymentRow(second)).status).toBe("canceled");
    expect((await sponsorshipRow(id)).status).toBe("live");
  });

  it("the raw token reaches no log", async () => {
    const id = (await seedCheckout({ status: "in_review" }))
      .sponsorshipIds[0] as string;
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method)
    );
    const link = await callAs<{ url: string }>(
      admin,
      "sponsorships.requestChanges",
      { id }
    );
    const raw = new URL(link.url).searchParams.get("token") as string;
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const spy of spies) {
      spy.mockRestore();
    }
    expect(logged).not.toContain(raw);
  });
});

describe("the status-filtered list keeps the created index (M1)", () => {
  it("plans the Review tab and a combined filter without a sort", async () => {
    const db = testDb();
    const shapes = [
      statusFilter(["in_review"]),
      statusFilter(["live", "expiring"]),
      sql`${statusFilter(["in_review"])} AND ${sponsorshipFilters({
        q: "acme",
        refundNeeded: true,
      })}`,
    ];
    const plans = await Promise.all(
      shapes.map(async (filters) => {
        const query = adminSponsorshipsQuery(db, filters, null, 50).toSQL();
        const { results } = await env.DB.prepare(
          `EXPLAIN QUERY PLAN ${query.sql}`
        )
          .bind(...query.params)
          .all<{ detail: string }>();
        return results.map((row) => row.detail);
      })
    );
    for (const plan of plans) {
      expect(plan).toContain(
        "SCAN sponsorship USING INDEX sponsorship_created_id_idx"
      );
      expect(plan.some((step) => step.includes("TEMP B-TREE"))).toBe(false);
    }
  });
});

describe("retryRender (A-27)", () => {
  async function renderJobsOf(sponsorshipId: string) {
    return await testDb()
      .select()
      .from(renderJob)
      .where(sql`${renderJob.sponsorshipId} = ${sponsorshipId}`);
  }

  it("moves render_failed back to rendering with job 2, its events, the audit entry and one message", async () => {
    const seeded = await seedRenderFailed();
    const id = seeded.sponsorshipIds[0] as string;
    const mark = await auditMark();

    const result = await callAs<{ attempt: number; renderJobId: string }>(
      admin,
      "sponsorships.retryRender",
      { id }
    );

    expect(result.attempt).toBe(2);
    expect((await sponsorshipRow(id)).status).toBe("rendering");
    const jobs = await renderJobsOf(id);
    expect(
      jobs.map((job) => [
        job.attempt,
        job.status,
        job.id === result.renderJobId,
      ])
    ).toEqual(
      expect.arrayContaining([
        [1, "failed", false],
        [2, "queued", true],
      ])
    );
    expect(jobs).toHaveLength(2);
    expect(await eventTypes(id)).toEqual(["render_retried", "render_started"]);
    await expectAudit("sponsorships.retryRender", {
      actorId: admin.user.id,
      data: { attempt: 2, renderJobId: result.renderJobId },
      mark,
      targetId: id,
      targetType: "sponsorship",
    });
    expect(enqueued.events).toEqual([
      { renderJobId: result.renderJobId, type: "render.requested" },
    ]);
  });

  it("two concurrent retries: one job, the other INVALID_STATE stale", async () => {
    const id = (await seedRenderFailed()).sponsorshipIds[0] as string;
    const mark = await auditMark();
    const results = await Promise.allSettled([
      callAs(admin, "sponsorships.retryRender", { id }),
      callAs(admin, "sponsorships.retryRender", { id }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "stale" },
    });
    expect(await renderJobsOf(id)).toHaveLength(2);
    expect(await auditRowsSince(mark)).toHaveLength(1);
    expect(enqueued.events).toHaveLength(1);
  });

  it("refuses a sponsorship in review with INVALID_STATE stale, writing nothing", async () => {
    const id = (
      await seedCheckout({ paymentStatus: "paid", status: "in_review" })
    ).sponsorshipIds[0] as string;
    const mark = await auditMark();
    expect(
      await failure(callAs(admin, "sponsorships.retryRender", { id }))
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "stale" } });
    expect((await sponsorshipRow(id)).status).toBe("in_review");
    expect(await renderJobsOf(id)).toHaveLength(0);
    expect(await auditRowsSince(mark)).toHaveLength(0);
    expect(enqueued.events).toEqual([]);
  });

  it("an unknown sponsorship is NOT_FOUND", async () => {
    expect(
      await failure(callAs(admin, "sponsorships.retryRender", { id: newId() }))
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  it("a demoted admin is FORBIDDEN and changes nothing", async () => {
    const demoted = await signedUp("admin");
    const id = (await seedRenderFailed()).sponsorshipIds[0] as string;
    await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?")
      .bind(demoted.user.id)
      .run();
    expect(
      await failure(callAs(demoted, "sponsorships.retryRender", { id }))
    ).toMatchObject({ code: "FORBIDDEN" });
    expect((await sponsorshipRow(id)).status).toBe("render_failed");
    expect(await renderJobsOf(id)).toHaveLength(1);
  });

  it("a failing audit insert fails the whole batch: still render_failed, no job", async () => {
    const id = (await seedRenderFailed()).sponsorshipIds[0] as string;
    const logged = quietErrors();
    try {
      await expect(
        callOver(failingAudit(), "sponsorships.retryRender", { id })
      ).rejects.toThrow();
    } finally {
      logged.mockRestore();
    }
    expect((await sponsorshipRow(id)).status).toBe("render_failed");
    expect(await renderJobsOf(id)).toHaveLength(1);
    expect(enqueued.events).toEqual([]);
  });

  it("a lost render.requested is logged; the retry stands", async () => {
    const id = (await seedRenderFailed()).sponsorshipIds[0] as string;
    queueFaults.events = true;
    const logged = quietErrors();
    try {
      await expect(
        callAs(admin, "sponsorships.retryRender", { id })
      ).resolves.toMatchObject({ attempt: 2 });
      // Logged by the producer, and the call still succeeds: the hourly
      // render watchdog re-sends a lost render.requested.
      expect(
        logged.mock.calls.some(([message]) =>
          String(message).startsWith("[jobs] Failed to enqueue")
        )
      ).toBe(true);
    } finally {
      queueFaults.events = false;
      logged.mockRestore();
    }
    expect((await sponsorshipRow(id)).status).toBe("rendering");
  });
});
