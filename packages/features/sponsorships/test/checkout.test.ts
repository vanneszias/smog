import { env } from "cloudflare:workers";
import {
  gesture as gestureTable,
  invoiceRequest,
  payment,
  paymentItem,
  sponsor,
  sponsorship,
} from "@smog/db";
import { createDb } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import {
  createFakeMollie,
  FAKE_MOLLIE_API_KEY,
  type FakeMollie,
} from "@smog/payments/testing";
import { TURNSTILE_HEADER } from "@smog/rpc/contract";
import { newId } from "@smog/utils";
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  callAt,
  eventsOf,
  paymentRow,
  SITE_URL,
  seedCheckout,
  statusOf,
  testDb,
} from "./helpers";
import { GIF, media, PNG, putLogo } from "./logos";

const LOGO_KEY = /^logos\/[0-9a-f-]{36}$/;

const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
});

interface CheckoutAnswer {
  checkoutUrl: string;
  paymentId: string;
}

function checkoutInput(
  gestureIds: string[],
  extra: Record<string, unknown> = {}
) {
  const logo = typeof extra.logoKey === "string";
  return {
    checkoutId: newId(),
    contact: {
      company: "Acme BV",
      email: "alex@example.com",
      name: "Alex Sponsor",
    },
    displayName: "Acme",
    expectedTotalCents: gestureIds.length * (logo ? 6000 : 5000),
    gestureIds,
    locale: "fr",
    ...extra,
  };
}

/**
 * A D1 binding that runs `hook` once, just before the first batch: what
 * another request could do between the checkout's reads and its write.
 */
function d1Before(hook: () => Promise<void>): D1Database {
  let ran = false;
  return new Proxy(env.DB, {
    get(target, key, receiver) {
      if (key === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          if (!ran) {
            ran = true;
            await hook();
          }
          return await target.batch(statements);
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function checkout(
  input: unknown,
  overrides: Parameters<typeof callAt>[2] = {},
  beforeBatch?: () => Promise<void>
): Promise<CheckoutAnswer> {
  return callAt<CheckoutAnswer>(
    "checkout",
    input,
    beforeBatch
      ? { ...overrides, db: createDb(d1Before(beforeBatch)) }
      : overrides,
    { mollieFetch: fake.fetch }
  );
}

async function logoKeys(): Promise<string[]> {
  const listed = await media().list({ prefix: "logos/" });
  return listed.objects.map((object) => object.key).sort();
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return { code: "ok" };
  } catch (error) {
    const { code, data } = error as { code?: string; data?: unknown };
    return { code, data };
  }
}

async function nothingWritten(checkoutId: string, gestureIds: string[]) {
  expect(
    await db.select().from(payment).where(eq(payment.id, checkoutId))
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(sponsorship)
      .where(inArray(sponsorship.gestureId, gestureIds))
  ).toEqual([]);
}

describe("sponsorships.checkout (ruling 5)", () => {
  it("writes the sponsor, invoice, sponsorships, payment, items and events in one go, then creates the Mollie payment", async () => {
    const gestures = [await makeGesture(db), await makeGesture(db)];
    const logoKey = await putLogo();
    const input = checkoutInput(
      gestures.map((g) => g.id),
      {
        invoice: {
          email: "billing@example.com",
          name: "Acme BV",
          vatNumber: "BE 0123.456.749",
        },
        logoKey,
      }
    );
    const answer = await checkout(input);
    expect(answer.paymentId).toBe(input.checkoutId);
    const [created] = [...fake.payments.values()];
    expect(answer.checkoutUrl).toBe(`${fake.apiUrl}/checkout/${created?.id}`);

    const row = await paymentRow(db, input.checkoutId);
    expect(row).toMatchObject({
      amountCents: 12_000,
      checkoutUrl: answer.checkoutUrl,
      kind: "initial",
      mollieId: created?.id,
      status: "open",
    });
    const items = await db
      .select()
      .from(paymentItem)
      .where(eq(paymentItem.paymentId, input.checkoutId));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.amountCents === 6000 && i.includesLogo)).toBe(
      true
    );
    const rows = await db
      .select()
      .from(sponsorship)
      .where(
        inArray(
          sponsorship.id,
          items.map((i) => i.sponsorshipId)
        )
      );
    expect(rows.map((r) => r.gestureId).sort()).toEqual(
      gestures.map((g) => g.id).sort()
    );
    // The verified logo was copied to a key no client can write (I-2), and
    // the upload key is gone.
    const storedKey = rows[0]?.logoKey ?? "";
    expect(storedKey).toMatch(LOGO_KEY);
    expect(storedKey).not.toBe(logoKey);
    expect(await media().head(logoKey)).toBeNull();
    const copy = await media().get(storedKey);
    expect(copy?.httpMetadata?.contentType).toBe("image/png");
    expect(new Uint8Array((await copy?.arrayBuffer()) ?? [])).toEqual(PNG);
    for (const s of rows) {
      expect(s).toMatchObject({
        displayName: "Acme",
        endsAt: null,
        logoKey: storedKey,
        startsAt: null,
        status: "awaiting_payment",
      });
      // biome-ignore lint/performance/noAwaitInLoops: one trail per sponsorship.
      const events = await eventsOf(db, s.id);
      expect(events.map((e) => [e.type, e.data])).toEqual([
        ["created", { paymentId: input.checkoutId }],
      ]);
    }
    const sponsorId = rows[0]?.sponsorId ?? "";
    expect(
      await db.select().from(sponsor).where(eq(sponsor.id, sponsorId))
    ).toMatchObject([
      {
        company: "Acme BV",
        email: "alex@example.com",
        locale: "fr",
        name: "Alex Sponsor",
      },
    ]);
    expect(
      await db
        .select()
        .from(invoiceRequest)
        .where(eq(invoiceRequest.sponsorId, sponsorId))
    ).toEqual([
      {
        email: "billing@example.com",
        name: "Acme BV",
        sponsorId,
        vatNumber: "0123456749",
      },
    ]);

    // The Mollie request (ruling 2).
    const [request] = fake.requests;
    expect(request).toMatchObject({
      idempotencyKey: input.checkoutId,
      method: "POST",
      path: "/v2/payments",
    });
    expect(request?.body).toEqual({
      amount: { currency: "EUR", value: "120.00" },
      description: expect.any(String),
      locale: "fr_BE",
      metadata: { kind: "initial", paymentId: input.checkoutId },
      redirectUrl: `${SITE_URL}/sponsor/success?payment=${input.checkoutId}`,
    });
  });

  it("answers a replay with the same checkout URL, without a second Mollie payment", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    const first = await checkout(input);
    const again = await checkout(input);
    expect(again).toEqual(first);
    expect(fake.payments.size).toBe(1);
    expect(
      await db
        .select()
        .from(sponsorship)
        .where(eq(sponsorship.gestureId, gesture.id))
    ).toHaveLength(1);
  });

  it("answers concurrent replays with one payment and one set of rows", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    const answers = await Promise.all([
      checkout(input),
      checkout(input),
      checkout(input),
    ]);
    expect(new Set(answers.map((a) => a.checkoutUrl)).size).toBe(1);
    expect(fake.payments.size).toBe(1);
    expect(
      await db
        .select()
        .from(sponsorship)
        .where(eq(sponsorship.gestureId, gesture.id))
    ).toHaveLength(1);
  });

  it("answers INVALID_STATE alreadySettled for a replay once the payment is no longer open", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    await checkout(input);
    await db
      .update(payment)
      .set({ status: "paid" })
      .where(eq(payment.id, input.checkoutId));
    expect(await codeOf(checkout(input))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "alreadySettled" },
    });
  });

  it("answers GESTURE_UNAVAILABLE with the taken gesture and writes nothing", async () => {
    const free = await makeGesture(db);
    const taken = await makeGesture(db);
    await seedCheckout(db, { gestures: [taken], status: "in_review" });
    const input = checkoutInput([free.id, taken.id]);
    expect(await codeOf(checkout(input))).toEqual({
      code: "GESTURE_UNAVAILABLE",
      data: { gestureIds: [taken.id] },
    });
    await nothingWritten(input.checkoutId, [free.id]);
    expect(fake.requests).toEqual([]);
  });

  it("lets the unique index decide a race: one of two checkouts wins", async () => {
    const gesture = await makeGesture(db);
    const results = await Promise.all([
      codeOf(checkout(checkoutInput([gesture.id]))),
      codeOf(checkout(checkoutInput([gesture.id]))),
    ]);
    expect(results.map((r) => r.code).sort()).toEqual([
      "GESTURE_UNAVAILABLE",
      "ok",
    ]);
    expect(results.find((r) => r.code !== "ok")?.data).toEqual({
      gestureIds: [gesture.id],
    });
    expect(
      await db
        .select()
        .from(sponsorship)
        .where(eq(sponsorship.gestureId, gesture.id))
    ).toHaveLength(1);
  });

  it("answers GESTURE_UNAVAILABLE for an unpublished or unknown gesture (bug 39)", async () => {
    const published = await makeGesture(db);
    const draft = await makeGesture(db, { publishedAt: null });
    const unknown = newId();
    const input = checkoutInput([published.id, draft.id, unknown]);
    expect(await codeOf(checkout(input))).toEqual({
      code: "GESTURE_UNAVAILABLE",
      data: { gestureIds: [draft.id, unknown] },
    });
    await nothingWritten(input.checkoutId, [published.id, draft.id]);
  });

  it("answers PAYMENT_MISMATCH when the client's total differs, and writes nothing", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id], { expectedTotalCents: 4999 });
    expect((await codeOf(checkout(input))).code).toBe("PAYMENT_MISMATCH");
    await nothingWritten(input.checkoutId, [gesture.id]);
  });

  it("compensates when Mollie is down: the payment failed, the gestures free again", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    fake.failNext(503);
    expect(await codeOf(checkout(input))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "paymentProvider" },
    });
    expect((await paymentRow(db, input.checkoutId)).status).toBe("failed");
    const [item] = await db
      .select()
      .from(paymentItem)
      .where(eq(paymentItem.paymentId, input.checkoutId));
    expect(await statusOf(db, item?.sponsorshipId ?? "")).toBe("cancelled");
    // The gesture is free: a new checkout takes it.
    expect((await codeOf(checkout(checkoutInput([gesture.id])))).code).toBe(
      "ok"
    );
  });

  it("answers INVALID_STATE paymentsUnavailable without a Mollie key, before writing or calling anything", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    expect(
      await codeOf(checkout(input, { env: { MOLLIE_API_KEY: undefined } }))
    ).toEqual({
      code: "INVALID_STATE",
      data: { reason: "paymentsUnavailable" },
    });
    await nothingWritten(input.checkoutId, [gesture.id]);
    expect(fake.requests).toEqual([]);
  });

  it("answers INVALID_STATE logoInvalid for a bad logo, deletes it and writes nothing", async () => {
    const gesture = await makeGesture(db);
    const logoKey = await putLogo(GIF, "image/png");
    const input = checkoutInput([gesture.id], { logoKey });
    expect(await codeOf(checkout(input))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "logoInvalid" },
    });
    expect(await media().head(logoKey)).toBeNull();
    await nothingWritten(input.checkoutId, [gesture.id]);
  });

  it("answers INVALID_STATE logoInvalid for a logo that was never uploaded", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id], {
      logoKey: `logos/${newId()}`,
    });
    expect((await codeOf(checkout(input))).data).toEqual({
      reason: "logoInvalid",
    });
  });

  it("refuses a logo key a sponsorship already uses, and leaves that logo alone (fix wave, payments M-4)", async () => {
    const owner = await seedCheckout(db, { count: 1, logo: true });
    const claimed = await putLogo();
    await db
      .update(sponsorship)
      .set({ logoKey: claimed })
      .where(eq(sponsorship.id, owner.sponsorshipIds[0] as string));
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id], { logoKey: claimed });
    expect(await codeOf(checkout(input))).toEqual({
      code: "INVALID_STATE",
      data: { reason: "logoInvalid" },
    });
    expect(await media().head(claimed)).not.toBeNull();
    await nothingWritten(input.checkoutId, [gesture.id]);
  });

  it("a double click whose twin claimed and removed the upload first answers the twin's checkout (fix wave, payments M-7)", async () => {
    const gesture = await makeGesture(db);
    const logoKey = await putLogo();
    const input = checkoutInput([gesture.id], { logoKey });
    let twin: CheckoutAnswer | undefined;
    const bucket = media();
    // Call A runs to the end while call B reads the upload.
    const racing = new Proxy(bucket, {
      get(target, key, receiver) {
        if (key === "head") {
          return async (objectKey: string) => {
            if (!twin && objectKey === logoKey) {
              twin = await checkout(input);
            }
            return await target.head(objectKey);
          };
        }
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const answer = await checkout(input, {
      env: { MEDIA: racing, MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
    });
    expect(twin).toBeDefined();
    expect(answer).toEqual(twin);
  });

  it("keeps the upload and drops the copy when the batch fails, so a retry can use the logo", async () => {
    const taken = await makeGesture(db);
    await seedCheckout(db, { gestures: [taken], status: "in_review" });
    const logoKey = await putLogo();
    const before = await logoKeys();
    const lost = await codeOf(checkout(checkoutInput([taken.id], { logoKey })));
    expect(lost.code).toBe("GESTURE_UNAVAILABLE");
    expect(await media().head(logoKey)).not.toBeNull();
    expect(await logoKeys()).toEqual(before);
    const free = await makeGesture(db);
    expect(
      (await codeOf(checkout(checkoutInput([free.id], { logoKey })))).code
    ).toBe("ok");
  });

  it("answers GESTURE_UNAVAILABLE when a gesture is unpublished between the check and the batch (the in-batch guard)", async () => {
    const gesture = await makeGesture(db);
    const input = checkoutInput([gesture.id]);
    const result = await codeOf(
      checkout(input, {}, async () => {
        await db
          .update(gestureTable)
          .set({ publishedAt: null })
          .where(eq(gestureTable.id, gesture.id));
      })
    );
    expect(result).toEqual({
      code: "GESTURE_UNAVAILABLE",
      data: { gestureIds: [gesture.id] },
    });
    await nothingWritten(input.checkoutId, [gesture.id]);
    expect(fake.requests).toEqual([]);
  });

  it("refuses a replay whose gestures or total differ from the stored payment", async () => {
    const [a, b] = [await makeGesture(db), await makeGesture(db)];
    const input = checkoutInput([a.id]);
    await checkout(input);
    expect(
      await codeOf(
        checkout({
          ...input,
          expectedTotalCents: 10_000,
          gestureIds: [a.id, b.id],
        })
      )
    ).toEqual({ code: "INVALID_STATE", data: { reason: "alreadySettled" } });
    expect(
      await codeOf(
        checkout({ ...input, expectedTotalCents: 5000, gestureIds: [b.id] })
      )
    ).toEqual({ code: "INVALID_STATE", data: { reason: "alreadySettled" } });
    expect(
      await codeOf(
        checkout({
          ...input,
          expectedTotalCents: 6000,
          logoKey: await putLogo(),
        })
      )
    ).toEqual({ code: "INVALID_STATE", data: { reason: "alreadySettled" } });
    // The same input still answers the same.
    expect((await codeOf(checkout(input))).code).toBe("ok");
  });

  it("is guarded: Turnstile missing → TURNSTILE_FAILED, RL_SPONSOR exhausted → RATE_LIMITED", async () => {
    const gesture = await makeGesture(db);
    const turnstile = await codeOf(
      checkout(checkoutInput([gesture.id]), {
        env: { MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY, TURNSTILE_SECRET_KEY: "s" },
        request: new Request(`${SITE_URL}/api/rpc/sponsorships/checkout`, {
          headers: { [TURNSTILE_HEADER]: "" },
        }),
      })
    );
    expect(turnstile.code).toBe("TURNSTILE_FAILED");
    const limited = await codeOf(
      checkout(checkoutInput([gesture.id]), {
        env: {
          RL_SPONSOR: { limit: () => Promise.resolve({ success: false }) },
        },
      })
    );
    expect(limited.code).toBe("RATE_LIMITED");
    expect(fake.requests).toEqual([]);
  });
});
