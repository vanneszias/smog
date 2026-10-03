/**
 * The renewal link (S-20, ruling 11): `sponsorships.renewal.get` and
 * `renewal.checkout` against the Mollie fake, and the settle that uses
 * the token only when the payment is paid.
 */
import { env } from "cloudflare:workers";
import { type AnyProcedure, call } from "@orpc/server";
import { payment, paymentItem, sponsorship, sponsorshipToken } from "@smog/db";
import {
  createFakeMollie,
  FAKE_MOLLIE_API_KEY,
  type FakeMollie,
} from "@smog/payments/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { DAY_MS, newId } from "@smog/utils";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSponsorshipsRouter } from "../src/server/router";
import { settleFromMollie } from "../src/server/settle";
import { runReminderSweep } from "../src/server/sweeps";
import { clearSponsorships } from "./clean";
import {
  paymentRow,
  SITE_URL,
  seedCheckout,
  sponsorshipRow,
  testDb,
} from "./helpers";

const db = testDb();
let fake: FakeMollie;

async function renewal<T>(
  path: "get" | "checkout",
  input: unknown,
  envOverrides: Record<string, unknown> = {}
): Promise<T> {
  const router = createSponsorshipsRouter({ mollieFetch: fake.fetch });
  const procedure = router.renewal[path] as unknown as AnyProcedure;
  return (await call(procedure, input, {
    context: makeRpcContext({
      db,
      env: {
        MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
        MOLLIE_API_URL: fake.apiUrl,
        ...envOverrides,
      },
      kv: env.KV,
    }),
    path: ["sponsorships", "renewal", path],
  })) as T;
}

async function failure(result: Promise<unknown>) {
  try {
    await result;
    return "ok";
  } catch (error) {
    const { code, data } = error as { code?: string; data?: unknown };
    return { code, data };
  }
}

/** A live sponsorship 10 days from its end, reminded: it holds a renewal link. */
async function reminded(logo = false) {
  const now = new Date();
  const endsAt = new Date(now.getTime() + 10 * DAY_MS);
  const seeded = await seedCheckout(db, {
    count: 1,
    endsAt,
    logo,
    paymentStatus: "paid",
    status: "live",
  });
  const id = seeded.sponsorshipIds[0] as string;
  let token = "";
  await runReminderSweep({
    db,
    email: {
      send: (email) => {
        token =
          new URL((email.props as { url: string }).url).searchParams.get(
            "token"
          ) ?? "";
        return Promise.resolve();
      },
    },
    now,
    siteUrl: SITE_URL,
  });
  return { endsAt, gesture: seeded.gestures[0], id, token };
}

beforeEach(async () => {
  fake = createFakeMollie();
  await clearSponsorships(db);
});

describe("sponsorships.renewal.get", () => {
  it("shows the sponsorship to renew and its price", async () => {
    const { endsAt, gesture, token } = await reminded(true);

    const view = await renewal("get", { token });

    expect(view).toEqual({
      amountCents: 6000,
      displayName: "Acme BV",
      endsAt: endsAt.getTime(),
      gesture: { name: gesture?.name, slug: gesture?.slug },
      hasLogo: true,
    });
  });

  it("refuses an unknown or expired link, and a sponsorship that ended", async () => {
    expect(
      await failure(renewal("get", { token: "e".repeat(43) }))
    ).toMatchObject({
      code: "TOKEN_INVALID",
    });

    const late = await reminded();
    const at = new Date(Date.now() - 1);
    await db
      .update(sponsorshipToken)
      .set({ expiresAt: at })
      .where(eq(sponsorshipToken.sponsorshipId, late.id));
    expect(await failure(renewal("get", { token: late.token }))).toEqual({
      code: "TOKEN_EXPIRED",
      data: { expiresAt: at.getTime() },
    });

    const ended = await reminded();
    await db
      .update(sponsorship)
      .set({ status: "expired" })
      .where(eq(sponsorship.id, ended.id));
    expect(await failure(renewal("get", { token: ended.token }))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "notRenewable" },
    });
  });
});

describe("sponsorships.renewal.checkout", () => {
  it("creates one renewal payment and its Mollie checkout; the same id answers it again", async () => {
    const { id, token } = await reminded(true);
    const checkoutId = newId();

    const first = await renewal<{ checkoutUrl: string; paymentId: string }>(
      "checkout",
      { checkoutId, token }
    );
    const again = await renewal("checkout", { checkoutId, token });
    // Another id while that one is open: the open one.
    const other = await renewal("checkout", { checkoutId: newId(), token });

    expect(first.paymentId).toBe(checkoutId);
    expect(again).toEqual(first);
    expect(other).toEqual(first);
    const row = await paymentRow(db, checkoutId);
    expect(row).toMatchObject({
      amountCents: 6000,
      kind: "renewal",
      status: "open",
    });
    const items = await db
      .select()
      .from(paymentItem)
      .where(eq(paymentItem.paymentId, checkoutId));
    expect(items).toEqual([
      {
        amountCents: 6000,
        includesLogo: true,
        paymentId: checkoutId,
        sponsorshipId: id,
      },
    ]);
    const creates = fake.requests.filter((r) => r.method === "POST");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.idempotencyKey).toBe(checkoutId);
    expect(creates[0]?.body).toMatchObject({
      amount: { currency: "EUR", value: "60.00" },
      metadata: { kind: "renewal", paymentId: checkoutId },
    });
    // The token is used only when the payment is paid.
    const [tokenRow] = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(tokenRow?.usedAt).toBeNull();
  });

  it("pays: one more year, live, the reminder reset, the token used", async () => {
    const { endsAt, id, token } = await reminded();
    const { paymentId } = await renewal<{ paymentId: string }>("checkout", {
      checkoutId: newId(),
      token,
    });
    const mollieId = (await paymentRow(db, paymentId)).mollieId as string;
    fake.setStatus(mollieId, "paid");

    await settleFromMollie(db, fake.mollie, { mollieId, now: new Date() });
    await settleFromMollie(db, fake.mollie, { mollieId, now: new Date() });

    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("live");
    expect(row.endsAt?.getTime()).toBe(endsAt.getTime() + 365 * DAY_MS);
    expect(row.reminderSentAt).toBeNull();
    expect(await failure(renewal("get", { token }))).toMatchObject({
      code: "TOKEN_INVALID",
    });
  });

  it("keeps the link usable after a failed payment, with a new checkout", async () => {
    const { id, token } = await reminded();
    const first = await renewal<{ paymentId: string }>("checkout", {
      checkoutId: newId(),
      token,
    });
    const mollieId = (await paymentRow(db, first.paymentId)).mollieId as string;
    fake.setStatus(mollieId, "failed");
    await settleFromMollie(db, fake.mollie, { mollieId, now: new Date() });

    expect((await paymentRow(db, first.paymentId)).status).toBe("failed");
    expect((await sponsorshipRow(db, id)).status).toBe("expiring");
    expect(await failure(renewal("get", { token }))).toBe("ok");
    // The failed id is settled; a new one starts a new payment.
    expect(
      await failure(renewal("checkout", { checkoutId: first.paymentId, token }))
    ).toEqual({ code: "INVALID_STATE", data: { reason: "alreadySettled" } });
    const second = await renewal<{ paymentId: string }>("checkout", {
      checkoutId: newId(),
      token,
    });
    expect(second.paymentId).not.toBe(first.paymentId);
    expect((await paymentRow(db, second.paymentId)).status).toBe("open");
  });

  it("refuses a renewal after the sponsorship expired, and writes nothing", async () => {
    const { id, token } = await reminded();
    await db
      .update(sponsorship)
      .set({ status: "expired" })
      .where(eq(sponsorship.id, id));

    expect(
      await failure(renewal("checkout", { checkoutId: newId(), token }))
    ).toEqual({ code: "INVALID_STATE", data: { reason: "notRenewable" } });
    expect(
      await db
        .select()
        .from(paymentItem)
        .where(and(eq(paymentItem.sponsorshipId, id)))
    ).toHaveLength(1);
    expect(fake.requests).toHaveLength(0);
  });

  it("answers paymentsUnavailable without a Mollie key, before anything", async () => {
    const { token } = await reminded();
    const checkoutId = newId();

    expect(
      await failure(
        renewal(
          "checkout",
          { checkoutId, token },
          { MOLLIE_API_KEY: undefined }
        )
      )
    ).toEqual({
      code: "INVALID_STATE",
      data: { reason: "paymentsUnavailable" },
    });
    expect(
      await db.select().from(payment).where(eq(payment.id, checkoutId))
    ).toHaveLength(0);
  });

  it("marks the renewal payment failed when Mollie is down (paymentProvider), and the link still works", async () => {
    const { id, token } = await reminded();
    fake.failNext(503);
    const checkoutId = newId();

    expect(await failure(renewal("checkout", { checkoutId, token }))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "paymentProvider" },
    });
    expect((await paymentRow(db, checkoutId)).status).toBe("failed");
    expect((await sponsorshipRow(db, id)).status).toBe("expiring");
    expect(await failure(renewal("get", { token }))).toBe("ok");
  });
});
