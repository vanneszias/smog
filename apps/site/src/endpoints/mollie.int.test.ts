// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import nextConfig from "../../next.config";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a collision on a unique column throws inside `beforeAll` —
 * which Vitest reports as *skipped* rather than failed, so the file looks green
 * having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const WEBHOOK_PATH = "/api/webhooks/mollie";
const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;

/*
 * A stand-in, never a real credential, and deliberately not shaped like a
 * Mollie key (`live_…` / `test_…`) so a secret scanner has nothing to flag.
 * Read and restored through `process.env.MOLLIE_API_KEY` on every line that
 * mentions it, so that
 *   grep -rn "MOLLIE_API_KEY" apps/site/src | grep -v "process.env.MOLLIE_API_KEY"
 * still prints nothing.
 */
const STUB_KEY = "stub-key-for-tests-only";
const ORIGINAL_KEY = process.env.MOLLIE_API_KEY;

const MOLLIE_PREFIX = "https://api.mollie.com/";

type Status =
  | "active"
  | "cancelled"
  | "expired"
  | "pending_approval"
  | "pending_payment"
  | "pending_resubmission"
  | "rejected";

/**
 * `POST /api/webhooks/mollie`, driven through `handleEndpoints` against a real
 * database, with Mollie's half of the conversation stubbed at `fetch`.
 *
 * `handleEndpoints` rather than the handler directly, for the reason
 * `auth.int.test.ts` gives: half of what can go wrong is routing, and a
 * handler called with a hand-built `req` passes whatever path it is mounted
 * at. It also means every request here arrives with **no `Origin` header**,
 * which is what a real Mollie delivery looks like — so the absence of an
 * origin check in this one endpoint is exercised rather than asserted.
 *
 * Only `api.mollie.com` is intercepted. The D1 emulator behind
 * `getPlatformProxy` talks over `fetch` too, so a blanket `vi.stubGlobal` that
 * answered every request would break the database rather than the payment
 * provider.
 */
describe("the Mollie webhook", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let inactiveGestureId: number;

  const realFetch = globalThis.fetch;

  /** What the next `GET /v2/payments/:id` answers, keyed by payment id. */
  const mollieAnswers = new Map<string, () => Promise<Response>>();
  /** Every Mollie URL this test's code caused to be fetched. */
  let fetched: string[] = [];

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  /** A Mollie payment resource as `readMolliePayment` expects to find it. */
  const paymentResource = (input: {
    amountCents?: number;
    currency?: string;
    id: string;
    metadata?: Record<string, string>;
    sponsorshipIds?: (number | string)[];
    status: string;
  }) => ({
    amount: {
      currency: input.currency ?? "EUR",
      value: ((input.amountCents ?? PRICE) / 100).toFixed(2),
    },
    id: input.id,
    metadata: input.metadata ?? {
      sponsorshipIds: JSON.stringify(
        (input.sponsorshipIds ?? []).map((id) => String(id))
      ),
    },
    status: input.status,
  });

  /**
   * Registers Mollie's answer for one payment id.
   *
   * A factory rather than a `Response`, because a `Response` body may be read
   * exactly once and Mollie is asked again on every redelivery. Handing the
   * same object back twice makes the second read throw `Body is unusable`,
   * which the handler quite correctly cannot tell from an outage and answers
   * 502 to — so a replay test would fail for a reason that has nothing to do
   * with the code under test.
   */
  const mollieWillAnswer = (id: string, answer: () => Promise<Response>) => {
    mollieAnswers.set(id, answer);
  };

  const mollieWillSay = (input: Parameters<typeof paymentResource>[0]) => {
    const resource = paymentResource(input);

    mollieWillAnswer(input.id, () => Promise.resolve(jsonResponse(resource)));
  };

  /** One delivery, exactly as Mollie makes it: a form body, no `Origin`. */
  const deliver = (paymentId: string, body?: BodyInit) =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}${WEBHOOK_PATH}`, {
        body: body ?? new URLSearchParams({ id: paymentId }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
    });

  /** Everything about a response a caller can see. */
  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
    status: response.status,
  });

  const seed = async (
    label: string,
    status: Status,
    overrides: { amountCents?: number; gesture?: number } = {}
  ): Promise<number> => {
    const now = Date.now();
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: overrides.gesture ?? gestureId,
        originalVideoPlaybackId: `wh-${RUN}-${label}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: overrides.amountCents ?? PRICE,
        sponsorEmail: `wh-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(now).toISOString(),
        status,
      },
    });

    return row.id;
  };

  const sponsorship = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  const statusOf = async (id: number) => (await sponsorship(id)).status;

  const logsFor = async (id: number) => {
    const { docs } = await payload.find({
      collection: "admin-logs",
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: "createdAt",
      where: {
        and: [
          { targetType: { equals: "sponsorships" } },
          { targetId: { equals: String(id) } },
        ],
      },
    });

    return docs;
  };

  /**
   * The delivery claim, looked up by the key `lib/claims.ts` actually stores.
   *
   * Namespaced by kind, and spelled out here rather than imported: the whole
   * point of the namespace is that a Mollie payment id and a Remotion job id
   * cannot shadow each other, and a helper shared with the code under test
   * would agree with whatever that code did.
   */
  const claimsFor = async (paymentId: string) => {
    const { totalDocs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: `mollie-delivery:${paymentId}` } },
    });

    return totalDocs;
  };

  /** A payment id no other test in this file uses. */
  const newPaymentId = (label: string) => `tr_${label}_${RUN.slice(0, 8)}`;

  beforeAll(async () => {
    process.env.MOLLIE_API_KEY = STUB_KEY;
    payload = await getPayload({ config });

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith(MOLLIE_PREFIX)) {
        return realFetch(input as RequestInfo, init);
      }

      fetched.push(url);
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      const answer = mollieAnswers.get(id);

      return (
        answer?.() ??
        Promise.resolve(
          jsonResponse(
            { detail: `No payment exists with token ${id}`, status: 404 },
            404
          )
        )
      );
    });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Webhook ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Betaling ${RUN}`,
        playbackId: `pb-webhook-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const inactive = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: false,
        name: `Ingetrokken ${RUN}`,
        playbackId: `pb-webhook-off-${RUN}`,
      },
      locale: "nl",
    });
    inactiveGestureId = inactive.id;
  });

  beforeEach(() => {
    fetched = [];
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    process.env.MOLLIE_API_KEY = ORIGINAL_KEY;
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run that
    // seeded nothing would look green. This turns that into a named failure.
    expect(gestureId).toBeGreaterThan(0);
    expect(inactiveGestureId).toBeGreaterThan(0);
    expect(process.env.MOLLIE_API_KEY).toBe(STUB_KEY);
  });

  it("is reachable at the path next.config.ts rewrites /webhooks/mollie to", async () => {
    // The URL in this line is one Mollie holds: `lib/mollie.ts` hands it over
    // as `webhookUrl` when the payment is opened, and Mollie posts back to it
    // for weeks afterwards. Deleting the rewrite does not fail a handler
    // test — the handler is still mounted — it just makes every retry a 404.
    const rewrites = await nextConfig.rewrites?.();
    const entries = Array.isArray(rewrites)
      ? rewrites
      : (rewrites?.afterFiles ?? []);

    expect(entries).toContainEqual({
      destination: WEBHOOK_PATH,
      source: "/webhooks/mollie",
    });

    // And the destination really resolves to this handler, rather than to a
    // path that merely looks right.
    const id = newPaymentId("rewrite");
    mollieWillSay({ id, status: "open" });

    expect((await deliver(id)).status).toBe(200);
  });

  it("advances a pending_payment sponsorship to pending_approval", async () => {
    const id = await seed("happy", "pending_payment");
    const paymentId = newPaymentId("happy");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    const response = await deliver(paymentId);

    expect(response.status).toBe(200);
    expect(await statusOf(id)).toBe("pending_approval");
    expect(await logsFor(id)).toHaveLength(1);
  });

  it("reads the payment from Mollie rather than trusting the body", async () => {
    // The body is `id=tr_xxx` from an unauthenticated POST. Anyone can send
    // it. The *only* thing that makes this safe is that the handler asks
    // Mollie what that payment actually is — so a delivery for a payment that
    // failed must cancel, not advance, however confident the body looks.
    const id = await seed("not-trusted", "pending_payment");
    const paymentId = newPaymentId("nottrusted");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "failed" });

    await deliver(
      paymentId,
      JSON.stringify({ id: paymentId, status: "paid", paid: true })
    );

    expect(await statusOf(id)).toBe("cancelled");
    // And the ask really happened, against the id from the body.
    expect(fetched).toEqual([
      `https://api.mollie.com/v2/payments/${paymentId}`,
    ]);
  });

  it("accepts Mollie's form encoding and a JSON body alike", async () => {
    const formed = await seed("form", "pending_payment");
    const formPayment = newPaymentId("form");
    mollieWillSay({
      id: formPayment,
      sponsorshipIds: [formed],
      status: "paid",
    });

    await deliver(formPayment);

    expect(await statusOf(formed)).toBe("pending_approval");

    const jsoned = await seed("json", "pending_payment");
    const jsonPayment = newPaymentId("json");
    mollieWillSay({
      id: jsonPayment,
      sponsorshipIds: [jsoned],
      status: "paid",
    });

    await deliver(jsonPayment, JSON.stringify({ id: jsonPayment }));

    expect(await statusOf(jsoned)).toBe("pending_approval");
  });

  it("answers 400 when the body carries no payment id", async () => {
    const response = await deliver("", "");

    expect(response.status).toBe(400);
    // Nothing was asked of Mollie, because there was nothing to ask about.
    expect(fetched).toEqual([]);
  });

  it("is idempotent: the same delivery twice leaves one transition", async () => {
    // What stops the second *sequential* delivery is the `status` clause on
    // the update: the row is no longer `pending_payment`, so it matches
    // nothing and the `afterChange` log hook never fires. The delivery claim
    // short-circuits it earlier, but it is not what this test proves — see
    // the concurrent case below, which is the one only the claim survives.
    const id = await seed("replayed", "pending_payment");
    const paymentId = newPaymentId("replayed");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    await deliver(paymentId);
    await deliver(paymentId);

    expect(await statusOf(id)).toBe("pending_approval");
    expect(await logsFor(id)).toHaveLength(1);
  });

  it("answers 200 to a replay, so Mollie stops retrying", async () => {
    const id = await seed("replay-200", "pending_payment");
    const paymentId = newPaymentId("replay200");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    const first = await snapshot(await deliver(paymentId));
    const second = await snapshot(await deliver(paymentId));

    expect(second).toEqual(first);
    expect(second.status).toBe(200);
  });

  it("survives two concurrent deliveries of the same payment", async () => {
    // The one the `webhook-deliveries` claim exists for, and the only test in
    // this file that fails when it is removed.
    //
    // Both deliveries read the sponsorship as `pending_payment`, because with
    // no transactions the two reads happen before either write.
    // `enforceStatusTransitions` therefore allows both — measured, not
    // assumed: a probe ran two conditional `payload.update` calls against a
    // real D1 concurrently and *both* reported one changed document.
    //
    // The sponsorship row looks identical either way; the log row is what
    // makes "exactly one transition" observable at all.
    const id = await seed("concurrent", "pending_payment");
    const paymentId = newPaymentId("concurrent");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    const [first, second] = await Promise.all([
      deliver(paymentId),
      deliver(paymentId),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await statusOf(id)).toBe("pending_approval");
    expect(await logsFor(id)).toHaveLength(1);
  });

  it("cancels the sponsorship when Mollie reports the payment failed", async () => {
    const id = await seed("failed", "pending_payment");
    const paymentId = newPaymentId("failed");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "failed" });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("cancelled");
    expect((await logsFor(id))[0]?.metadata).toEqual({
      from: "pending_payment",
      to: "cancelled",
    });
  });

  it("cancels it when the payment expired", async () => {
    const id = await seed("expired", "pending_payment");
    const paymentId = newPaymentId("expired");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "expired" });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("cancelled");
  });

  it("cancels it when the payment was canceled", async () => {
    // Mollie's spelling, one `l`. This app's status is `cancelled`, two.
    const id = await seed("canceled", "pending_payment");
    const paymentId = newPaymentId("canceled");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "canceled" });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("cancelled");
  });

  it("leaves it pending while the payment is still open", async () => {
    const id = await seed("open", "pending_payment");
    const paymentId = newPaymentId("open");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "open" });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await logsFor(id)).toHaveLength(0);
    // And no claim was taken, so the delivery that reports `paid` later is not
    // turned away as a replay of this one.
    expect(await claimsFor(paymentId)).toBe(0);
  });

  it("answers 200 to every one of those, so Mollie stops retrying", async () => {
    // A 4xx or 5xx makes Mollie retry a decision that will not change, for
    // days. Every terminal and every in-progress status gets the same answer.
    for (const status of [
      "authorized",
      "canceled",
      "expired",
      "failed",
      "open",
      "paid",
      "pending",
    ]) {
      const id = await seed(`ack-${status}`, "pending_payment");
      const paymentId = newPaymentId(`ack${status}`);
      mollieWillSay({ id: paymentId, sponsorshipIds: [id], status });

      expect((await deliver(paymentId)).status).toBe(200);
    }
  });

  it("answers 502 when Mollie cannot be reached, so the payment is redelivered", async () => {
    // A Mollie outage must not silently drop a payment. Mollie retries every
    // non-2xx, which is the whole recovery mechanism while Stage 7's
    // `cleanup-stale-payments` does not exist.
    const id = await seed("outage", "pending_payment");
    const paymentId = newPaymentId("outage");
    mollieWillAnswer(paymentId, () =>
      Promise.reject(new Error("connect ETIMEDOUT"))
    );

    const response = await deliver(paymentId);

    expect(response.status).toBe(502);
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await claimsFor(paymentId)).toBe(0);
  });

  it("answers an unknown payment id the same way it answers a known one", async () => {
    // A 404 for an unknown id turns this endpoint into a "does this payment
    // exist" oracle for anyone who can shape a Mollie id. Whole responses are
    // compared, not status codes: a body or a header that differs gives the
    // game away exactly as well as a status does.
    //
    // The known payment is deliberately one there is nothing to do about, so
    // the two answers are compared on equal terms rather than on the handler
    // happening to be busier in one of them.
    const known = newPaymentId("oracle-known");
    mollieWillSay({ id: known, status: "open" });

    const unknown = await snapshot(await deliver(newPaymentId("oracle-nope")));

    expect(unknown).toEqual(await snapshot(await deliver(known)));

    // And a payment that *was* acted on answers identically too, so the
    // oracle is not merely narrowed to "did anything happen".
    const id = await seed("oracle-paid", "pending_payment");
    const paid = newPaymentId("oraclepaid");
    mollieWillSay({ id: paid, sponsorshipIds: [id], status: "paid" });

    expect(await snapshot(await deliver(paid))).toEqual(unknown);
  });

  it("still advances when the gesture was deactivated after checkout", async () => {
    // Deliberate: the sponsor paid. Refusing here takes their money and gives
    // them nothing. It goes to the approval queue, where a person decides.
    // Asserted so that a future `overrideAccess: false` "tidy-up" fails here.
    const id = await seed("deactivated", "pending_payment", {
      gesture: inactiveGestureId,
    });
    const paymentId = newPaymentId("deactivated");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_approval");
  });

  it("refuses the whole payment when a sponsorship it names no longer exists", async () => {
    // **The plan asked for "when the gesture row is gone entirely", and that
    // cannot happen.** `blockDeleteWhenSponsored` refuses to delete a gesture
    // any sponsorship points at, with no filter on status — the plan's premise
    // that "a `pending_payment` row is not yet sponsored" is not what the hook
    // does — and Payload's `NOT NULL` + `ON DELETE set null` foreign key
    // refuses it a second time underneath. The reachable version of the same
    // worry is a *sponsorship* row that is gone, which is asserted here, and
    // the unreachable one is pinned below so this is not merely a claim.
    const surviving = await seed("survivor", "pending_payment");
    const doomed = await seed("doomed", "pending_payment");

    await payload.delete({
      collection: "sponsorships",
      id: doomed,
      overrideAccess: true,
    });

    const paymentId = newPaymentId("missing");
    // The amount matches what the *surviving* sponsorship costs, not what the
    // pair cost. Otherwise the amount check would refuse this payment on its
    // own and no mutation of the all-or-nothing rule could fail this test.
    mollieWillSay({
      amountCents: PRICE,
      id: paymentId,
      sponsorshipIds: [surviving, doomed],
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(surviving)).toBe("pending_payment");
    expect(await claimsFor(paymentId)).toBe(0);

    // The gesture behind a sponsorship awaiting payment cannot be deleted, so
    // the case the plan named has no way to arise.
    await expect(
      payload.delete({
        collection: "gestures",
        id: gestureId,
        overrideAccess: true,
      })
    ).rejects.toThrow(/Cannot delete this gesture/);
  });

  it("refuses a payment that names the same sponsorship twice", async () => {
    const id = await seed("twice", "pending_payment");
    const paymentId = newPaymentId("twice");
    // Priced as one sponsorship, which is what a duplicate would slip through
    // as: two ids, one row, one price. An amount of two would be refused by
    // the amount check instead and prove nothing about this rule.
    mollieWillSay({
      amountCents: PRICE,
      id: paymentId,
      sponsorshipIds: [id, id],
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
  });

  it("advances all five sponsorships in a bulk payment", async () => {
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => seed(`bulk-${n}`, "pending_payment"))
    );
    const paymentId = newPaymentId("bulk");
    mollieWillSay({
      amountCents: PRICE * ids.length,
      id: paymentId,
      sponsorshipIds: ids,
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);

    for (const id of ids) {
      expect(await statusOf(id)).toBe("pending_approval");
      expect(await logsFor(id)).toHaveLength(1);
    }
  });

  it("advances the rest when one of them is already advanced", async () => {
    // The already-advanced row sits in the middle, so a handler that walked
    // the ids and stopped at the first that changed nothing would leave the
    // last two behind.
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        seed(`partial-${n}`, n === 3 ? "pending_approval" : "pending_payment")
      )
    );
    const paymentId = newPaymentId("partial");
    mollieWillSay({
      amountCents: PRICE * ids.length,
      id: paymentId,
      sponsorshipIds: ids,
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);

    for (const id of ids) {
      expect(await statusOf(id)).toBe("pending_approval");
    }

    // The one that was already there is not logged a second time.
    expect(await logsFor(ids[2] as number)).toHaveLength(0);
    expect(await logsFor(ids[4] as number)).toHaveLength(1);
  });

  it("reports which ones it could not advance, still answers 200, and lets a replay finish the job", async () => {
    // Without transactions a bulk update is not all-or-nothing: Payload
    // collects a per-document error and carries on. The answer is still 200,
    // because Mollie retrying will not change a decision — but the delivery
    // claim is handed back, so re-firing the webhook (or Stage 7's
    // `cleanup-stale-payments`) can finish what this one started rather than
    // being waved through as a replay.
    const id = await seed("reported", "pending_payment");
    const paymentId = newPaymentId("reported");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    const update = payload.update.bind(payload);
    const spy = vi
      .spyOn(payload, "update")
      .mockImplementation((args: Parameters<typeof update>[0]) =>
        args.collection === "sponsorships"
          ? (Promise.resolve({
              docs: [],
              errors: [{ id, message: "the database went away" }],
            }) as never)
          : update(args)
      );

    let response: Response;

    try {
      response = await deliver(paymentId);
    } finally {
      spy.mockRestore();
    }

    expect(response.status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await claimsFor(paymentId)).toBe(0);

    // The payoff: the same delivery again, with nothing in the way, completes.
    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_approval");
  });

  it("answers a non-2xx when the delivery claim cannot be taken at all", async () => {
    // A create can fail because another delivery already holds the claim, and
    // it can fail because the database is unreachable. Treating the second as
    // the first would answer 200 to a payment nothing was done about, and
    // Mollie would never mention it again. So the claim confirms a failure by
    // reading the row back, and rethrows when it is not there.
    const id = await seed("claim-outage", "pending_payment");
    const paymentId = newPaymentId("claimoutage");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    const create = payload.create.bind(payload);
    const spy = vi
      .spyOn(payload, "create")
      .mockImplementation((args: Parameters<typeof create>[0]) =>
        args.collection === "claims"
          ? Promise.reject(new Error("D1_ERROR: network is unreachable"))
          : create(args)
      );

    let response: Response;

    try {
      response = await deliver(paymentId);
    } finally {
      spy.mockRestore();
    }

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await statusOf(id)).toBe("pending_payment");

    // And the retry Mollie will now make gets through.
    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_approval");
  });

  it("refuses a bulk payment naming more than twenty sponsorships", async () => {
    const ids = await Promise.all(
      Array.from({ length: 21 }, (_, n) => seed(`cap-${n}`, "pending_payment"))
    );
    const paymentId = newPaymentId("cap");
    // Priced correctly for all twenty-one, so the only thing that can refuse
    // this payment is the cap itself.
    mollieWillSay({
      amountCents: PRICE * ids.length,
      id: paymentId,
      sponsorshipIds: ids,
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);

    for (const id of ids) {
      expect(await statusOf(id)).toBe("pending_payment");
    }
  });

  it("refuses a bulk metadata payload that is not an array of ids", async () => {
    const id = await seed("shape", "pending_payment");

    const shapes = [
      // An object, which is what `JSON.parse` hands back for the metadata a
      // careless writer might build from a map.
      JSON.stringify({ "0": String(id) }),
      // A bare string rather than a list of them.
      JSON.stringify(String(id)),
      // Numbers rather than strings: `lib/mollie.ts` writes strings, and a
      // number here means the metadata came from somewhere else.
      JSON.stringify([id]),
      // A list with an empty id in it.
      JSON.stringify([""]),
      // An empty list, which names no work at all.
      JSON.stringify([]),
      // Not JSON.
      "not json at all",
    ];

    for (const [index, sponsorshipIds] of shapes.entries()) {
      // Indexed rather than keyed on the payload, so two shapes that happen
      // to be the same length cannot share a payment id and quietly test the
      // same thing twice.
      const paymentId = newPaymentId(`shape${index}`);
      mollieWillSay({
        id: paymentId,
        metadata: { sponsorshipIds },
        status: "paid",
      });

      expect((await deliver(paymentId)).status).toBe(200);
      expect(await statusOf(id)).toBe("pending_payment");
    }

    // Metadata with no `sponsorshipIds` key at all, which is what a payment
    // opened by the shipped `apps/server` looks like.
    const bare = newPaymentId("shape-bare");
    mollieWillSay({ id: bare, metadata: {}, status: "paid" });

    expect((await deliver(bare)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
  });

  it("refuses a payment whose amount does not match the sponsorship", async () => {
    const id = await seed("amount", "pending_payment");
    const paymentId = newPaymentId("amount");
    mollieWillSay({
      amountCents: PRICE - 1,
      id: paymentId,
      sponsorshipIds: [id],
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await claimsFor(paymentId)).toBe(0);

    // The positive beside the negative: the same sponsorship at the right
    // price does advance, so the refusal above is about the amount and not
    // about this fixture being unadvanceable.
    const right = newPaymentId("amountok");
    mollieWillSay({
      amountCents: PRICE,
      id: right,
      sponsorshipIds: [id],
      status: "paid",
    });

    await deliver(right);

    expect(await statusOf(id)).toBe("pending_approval");
  });

  it("refuses a payment in a currency that is not euro", async () => {
    // Mollie will happily take a payment in another currency, and the numbers
    // match: 50.00 CHF is not 50.00 EUR, and this app prices in one of them.
    const id = await seed("currency", "pending_payment");
    const paymentId = newPaymentId("currency");
    mollieWillSay({
      amountCents: PRICE,
      currency: "CHF",
      id: paymentId,
      sponsorshipIds: [id],
      status: "paid",
    });

    expect((await deliver(paymentId)).status).toBe(200);
    expect(await statusOf(id)).toBe("pending_payment");
  });

  it("does not touch a sponsorship that has already moved past pending_payment", async () => {
    // Mollie redelivers for days, so a webhook can arrive after an admin has
    // approved the sponsorship. The `status` clause on the update is what
    // makes that a no-op rather than an `active -> pending_approval` the
    // transition hook refuses — which would come back as a per-document error
    // and hand the delivery claim back for no reason.
    const id = await seed("already-live", "active");
    const before = await sponsorship(id);
    const paymentId = newPaymentId("live");
    mollieWillSay({ id: paymentId, sponsorshipIds: [id], status: "paid" });

    expect((await deliver(paymentId)).status).toBe(200);

    const after = await sponsorship(id);

    expect(after.status).toBe("active");
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(await logsFor(id)).toHaveLength(0);
    expect(await claimsFor(paymentId)).toBe(1);
  });
});
