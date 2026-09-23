import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import { MollieRefusedError, readMolliePayment } from "@/lib/mollie";
import { submitPaidRenders } from "@/lib/paidRenders";
import type { Sponsorship } from "@/payload-types";

/**
 * `POST /api/webhooks/mollie` — the only thing that moves a sponsorship out
 * of `pending_payment`.
 *
 * ## Nothing in the request is trusted
 *
 * Mollie's webhook body is `id=tr_xxx`, posted without authentication from an
 * address nobody can pin down. Anyone can send it. The single thing that makes
 * acting on it safe is that this handler throws the body away except for the
 * id and asks Mollie, over an authenticated connection, what that payment
 * actually is — its status, its amount, and which sponsorships it was opened
 * for. There is no signature to check: Mollie does not sign webhooks, which is
 * precisely why the documented pattern is to treat the call as a *hint* and
 * fetch the resource.
 *
 * `guardOrigin` from `lib/formPost.ts` is deliberately **not** used here. Every
 * other POST in this app is a same-site form and a cross-site post is an
 * attack; this one is a third-party server with no `Origin` header at all, so
 * that guard would reject every real delivery.
 *
 * ## Every answer is the same two hundred bytes
 *
 * A 404 for an unrecognised payment id would turn an unauthenticated endpoint
 * into a "does this Mollie payment belong to you" oracle for anyone who can
 * shape an id. So every decision this handler reaches — paid, failed, still
 * open, unknown to Mollie, metadata this app did not write, an amount that
 * does not match — answers `200 {"status":"ok"}`, byte for byte. What
 * happened goes to the log, where only an operator reads it.
 *
 * There are exactly two exceptions, and neither leaks anything about a payment:
 *
 * - **No id in the body at all** answers 400. There is no payment to talk
 *   about, nothing to retry, and Mollie always sends one.
 * - **Mollie could not be asked** answers 502. Mollie retries every non-2xx,
 *   and that is the point: a timeout, a 503 or a rate limit says nothing
 *   about the payment, so swallowing it would drop a real payment on the
 *   floor and leave a paying sponsor in `pending_payment` for ever —
 *   `cleanup-stale-payments` would eventually cancel them. A 404 is *not* in
 *   this bucket: it is Mollie's definite answer about that id, so it takes the
 *   ordinary 200 along with everything else. `MollieRefusedError.status` is
 *   what makes that distinction possible.
 *
 * ## Idempotence, with no transactions to lean on
 *
 * Mollie retries on every non-2xx and on timeouts, and can have two deliveries
 * for one payment in flight at once. `sqliteD1Adapter` is built without
 * `transactionOptions`, so `beginTransaction` resolves to `null` and nothing
 * on any write path is atomic.
 *
 * The obvious way to handle this is a conditional update — an `update`
 * whose `where` names the status being moved *from*, treating "zero rows
 * changed" as "somebody else got there first". **That was measured on this
 * adapter and it does not work.** `collections/operations/update.js` (3.89.0)
 * resolves the `where` with a separate `payload.db.find` and then updates each
 * id it found, and the adapter's own `updateOne` does the same one layer down.
 * A probe running two such updates concurrently against a real D1 had *both*
 * report exactly one changed document; five concurrent updates had all five
 * report one.
 *
 * So the guard is a `claims` row: a key carrying a unique index, inserted
 * before any sponsorship is touched. SQLite evaluates a unique index inside
 * the INSERT, which makes it the one atomic operation available, and of two
 * concurrent deliveries exactly one gets the row. See `lib/claims.ts`.
 *
 * That was `webhook-deliveries`, a table of its own, until it and
 * `render-completions` were folded into one generic table with four
 * consumers. **Nothing about this handler's behaviour changed**, and the way
 * that is known is that this handler's concurrency mutation still fails its
 * test through the new table: drop `unique` from `claims.key` and `survives
 * two concurrent deliveries of the same payment` fails, alone.
 *
 * The claim is a **receipt**, not a lease: it carries no expiry and is kept
 * for ever, because a payment that has been advanced has been advanced. The
 * expiry that `endpoints/jobs.ts` sets on its own claim would, here, mean a
 * redelivery weeks later advancing the same payment a second time.
 *
 * The `status` clause on the update below is therefore **not** the concurrency
 * guard, and is not written as one. It is how the handler picks the rows that
 * still need moving, so a delivery that arrives after an admin has already
 * approved a sponsorship leaves that row completely alone rather than writing
 * a status onto it that `enforceStatusTransitions` would refuse. Replacing it
 * with a read followed by a write by id is an equivalent mutant given the
 * claim — that is what `payload.update` does internally — and is recorded as
 * such rather than pretended to be caught.
 *
 * ## A paid payment asks for its renders, after the answer
 *
 * The move to `pending_approval` is where the composed videos are asked for
 * (`lib/paidRenders.ts` has why: user decision, 2026-09-23). Exactly the rows
 * this delivery's update moved are submitted, once each, so the delivery
 * claim above is also what keeps two concurrent deliveries from submitting
 * twice: only the one that inserted it reaches the update. A replay is turned
 * away before it, and a delivery that finds a row already advanced moves
 * nothing and so submits nothing for it.
 *
 * The submission runs **off the request path**, through the Worker's
 * `ctx.waitUntil`, because Mollie is owed a prompt answer and a Lambda start
 * takes seconds per gesture. See `afterAnswering`.
 */

/** What a payment id must be resolvable to before anything is written. */
const SPONSORSHIP_STATUS_TO_ADVANCE_FROM = "pending_payment";

/** Where a paid sponsorship goes: the admin queue, never straight to `active`. */
const PAID_TARGET = "pending_approval";

/**
 * Where a sponsorship goes when Mollie says the money is not coming.
 *
 * Note the two spellings. Mollie's payment status is the American `canceled`;
 * this app's sponsorship status is the British `cancelled`, fixed by
 * `@smog/config`'s tuple. They are different words for different things and the
 * mapping between them is this constant pair.
 */
const FAILED_TARGET = "cancelled";

/**
 * The Mollie payment statuses that mean the sponsorship will never be paid.
 *
 * Skipping everything that is not `paid` and answering 200 would leave a
 * failed payment's sponsorship in `pending_payment`, holding its gesture off
 * the market until `cleanup-stale-payments` caught up with it. Cancelling
 * here closes that at once.
 */
const FINAL_FAILURE_STATUSES = new Set(["canceled", "expired", "failed"]);

/**
 * The most sponsorships one payment may name.
 *
 * Ten is the most a sponsor can *select* (`MAX_GESTURES_PER_SPONSORSHIP`), and
 * this is deliberately not that constant: it is a bound on how much work one
 * unauthenticated request may ask for, not a rule about how many gestures an
 * order may cover, and tying them together would mean raising the second
 * silently raised the first. Twenty is the established bound.
 */
const MAX_SPONSORSHIPS_PER_PAYMENT = 20;

/** The one currency this app prices in. */
const CURRENCY = "EUR";

const NO_STORE = { "Cache-Control": "no-store" };

/** HTTP statuses, named so the handler reads as decisions rather than numbers. */
const OK = 200;
const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;

/**
 * The one body every reachable decision answers with.
 *
 * A fresh object each time: `Response.json` does not copy it, and a shared
 * literal handed to two responses is a mutable object two callers hold.
 */
function acknowledged(): Response {
  return Response.json({ status: "ok" }, { headers: NO_STORE, status: OK });
}

function problem(status: number, error: string): Response {
  return Response.json({ error }, { headers: NO_STORE, status });
}

/**
 * The payment id out of the request, whichever way Mollie sent it.
 *
 * Mollie posts `id=tr_xxx` as a form, and this accepts JSON as well, because
 * a body shape is exactly the kind of thing a provider changes between API
 * versions.
 *
 * A body that is neither, or carries no id, yields `""`.
 */
async function readPaymentId(req: PayloadRequest): Promise<string> {
  let raw = "";

  try {
    raw = typeof req.text === "function" ? await req.text() : "";
  } catch {
    return "";
  }

  if (raw === "") {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed !== null && typeof parsed === "object") {
      const id = (parsed as { id?: unknown }).id;

      return typeof id === "string" ? id : "";
    }
  } catch {
    // Not JSON. Mollie's own encoding is a form, so this is the ordinary path
    // rather than the fallback, and it is second only because a form parse
    // accepts almost anything and would happily read `{"id":"x"}` as a key.
  }

  return new URLSearchParams(raw).get("id") ?? "";
}

/**
 * The sponsorship ids a payment was opened for, or `null` if the metadata is
 * not something this app wrote.
 *
 * `lib/mollie.ts` writes `{ sponsorshipIds: JSON.stringify(ids) }` and nothing
 * else — deliberately without an `isBulkPayment` flag, since `apps/site`
 * creates one sponsorship row per selected gesture and so every payment names a
 * list.
 *
 * Every clause below is a way a payment can name work this handler must not
 * do. They are not defensive: Mollie hands metadata back verbatim, and a row
 * written by an older version of this app, by another client, or by
 * hand in Mollie's dashboard reaches here through the same door as a good one.
 */
function parseSponsorshipIds(raw: string | undefined): null | string[] {
  if (raw === undefined || raw === "") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  if (parsed.length === 0 || parsed.length > MAX_SPONSORSHIPS_PER_PAYMENT) {
    return null;
  }

  if (parsed.some((id) => typeof id !== "string" || id.trim() === "")) {
    return null;
  }

  // A duplicate-id screen is load-bearing only where each id is resolved with
  // its own lookup: there `[a, a]` yields two copies of one sponsorship and the
  // expected amount is double what the sponsor owes. It is not load-bearing
  // here, because `resolveSponsorships` asks for the whole set in one query and
  // compares the number of rows it got with the number of ids it asked for —
  // `[a, a]` comes back as one row against two ids and is refused there. A
  // second screen in front of it could not be made to fail by any mutation,
  // which is the same conclusion as the `isGestureId` screen that was removed,
  // so it is absent and
  // `refuses a payment that names the same sponsorship twice` pins the
  // behaviour where it actually lives.
  return parsed as string[];
}

/**
 * The claim one delivery is taken with.
 *
 * `lib/claims.ts` holds the mechanism and the reasoning — the unique index as
 * the only atomic primitive, and the read-back that keeps a database outage
 * from masquerading as a replay. This is only the name the delivery goes under,
 * and it is namespaced by kind so that a Mollie payment id and a Remotion job
 * id that happened to be the same string could never shadow each other.
 */
const deliveryClaim = (paymentId: string) =>
  ({ key: paymentId, kind: CLAIM_KINDS.mollieDelivery }) as const;

/**
 * Gives the lock back, so a delivery that only half applied can be replayed.
 *
 * Mollie will not retry a 200, but an operator can re-fire the webhook and
 * `cleanup-stale-payments` will find the rows that never moved. A
 * claim left behind by a delivery that failed part-way would turn both of
 * those into no-ops — the lock would say the payment was handled when some of
 * its sponsorships never were.
 */
function releaseDelivery(
  req: PayloadRequest,
  paymentId: string
): Promise<void> {
  return releaseClaim(req.payload, {
    ...deliveryClaim(paymentId),
    consequence: `[mollie] Could not release the delivery claim for ${paymentId}; a replay of this payment will be refused`,
  });
}

/**
 * The sponsorships a payment names, or `null` if any of them is missing.
 *
 * All or nothing: the expected amount is the sum of every named sponsorship's
 * `paymentAmount`, so one row that is not there makes the comparison
 * meaningless rather than merely incomplete. A payment that has half its rows
 * is a payment this handler must not act on.
 */
async function resolveSponsorships(
  req: PayloadRequest,
  ids: string[]
): Promise<null | Sponsorship[]> {
  const { docs } = await req.payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: ids.length,
    overrideAccess: true,
    pagination: false,
    where: { id: { in: ids } },
  });

  return docs.length === ids.length ? docs : null;
}

/** An error's message and nothing else: no stack, no cause, no body. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * The Worker's execution context for this request, or `null` outside one.
 *
 * OpenNext's worker entry runs every request inside an `AsyncLocalStorage`
 * holding `{ env, ctx, cf }`, and `getCloudflareContext` reads it
 * (`@opennextjs/cloudflare`, `dist/cli/templates/init.js`). Tests, `next dev`
 * and the Payload CLI run without that entry, where the sync form throws —
 * which is what `null` stands for here.
 */
function executionContext(): null | {
  waitUntil(promise: Promise<unknown>): void;
} {
  try {
    const ctx: unknown = getCloudflareContext().ctx;

    // Checked, not assumed: a context without a callable `waitUntil` would
    // throw synchronously in `afterAnswering`, which is a 500 on a payment
    // that is already recorded.
    return typeof (ctx as { waitUntil?: unknown } | undefined)?.waitUntil ===
      "function"
      ? (ctx as { waitUntil(promise: Promise<unknown>): void })
      : null;
  } catch {
    return null;
  }
}

/**
 * Runs `work` after this request has been answered, where the platform allows
 * it, and settles only once it is done where it does not.
 *
 * On Workers the promise goes to `ctx.waitUntil`, which keeps the invocation
 * alive for it after the response is sent; the handler answers at once.
 * Without a Worker context — tests, local runs — it is awaited instead, so
 * the work still happens and a test can observe it.
 *
 * **The promise it runs never rejects**, and that is load-bearing for the
 * awaited path: a fault in `work` would otherwise become a 500 on a payment
 * that has already been recorded, and Mollie would redeliver it for nothing.
 * `Promise.resolve().then(work)` rather than `work()`, so that even a
 * synchronous throw lands in the `catch`.
 */
function afterAnswering(
  req: PayloadRequest,
  label: string,
  work: () => Promise<void>
): Promise<void> {
  const settled = Promise.resolve()
    .then(work)
    .catch((error: unknown) => {
      req.payload.logger.error(`[mollie] ${label}: ${messageOf(error)}`);
    });
  const context = executionContext();

  if (context === null) {
    return settled;
  }

  context.waitUntil(settled);

  return Promise.resolve();
}

const mollieWebhook: PayloadHandler = async (
  req: PayloadRequest
): Promise<Response> => {
  const paymentId = await readPaymentId(req);

  if (paymentId === "") {
    return problem(BAD_REQUEST, "A payment id is required.");
  }

  let payment: Awaited<ReturnType<typeof readMolliePayment>>;

  try {
    payment = await readMolliePayment(paymentId);
  } catch (error) {
    const notFound =
      error instanceof MollieRefusedError && error.status === 404;

    if (!notFound) {
      req.payload.logger.error(
        { err: error },
        "[mollie] Could not read the payment from Mollie; answering 502 so it is redelivered"
      );

      return problem(BAD_GATEWAY, "The payment could not be read.");
    }

    req.payload.logger.warn(
      "[mollie] A delivery named a payment Mollie does not recognise"
    );

    return acknowledged();
  }

  const target =
    payment.status === "paid"
      ? PAID_TARGET
      : FINAL_FAILURE_STATUSES.has(payment.status)
        ? FAILED_TARGET
        : null;

  if (target === null) {
    // `open`, `pending`, `authorized` — Mollie will deliver again when it is
    // one of the others, so there is nothing to do and nothing to claim.
    req.payload.logger.info(
      `[mollie] Payment ${paymentId} is ${payment.status}; nothing to do yet`
    );

    return acknowledged();
  }

  const ids = parseSponsorshipIds(payment.metadata.sponsorshipIds);

  if (ids === null) {
    req.payload.logger.error(
      `[mollie] Payment ${paymentId} carries metadata this app cannot act on`
    );

    return acknowledged();
  }

  const sponsorships = await resolveSponsorships(req, ids);

  if (sponsorships === null) {
    req.payload.logger.error(
      `[mollie] Payment ${paymentId} names ${ids.length} sponsorships and at least one no longer exists`
    );

    return acknowledged();
  }

  if (target === PAID_TARGET) {
    const expectedCents = sponsorships.reduce(
      (total, sponsorship) => total + sponsorship.paymentAmount,
      0
    );

    if (
      payment.currency !== CURRENCY ||
      payment.amountCents !== expectedCents
    ) {
      // Only on the paid path. Cancelling a sponsorship whose payment failed
      // does not depend on what the failed payment was for.
      req.payload.logger.error(
        `[mollie] Payment ${paymentId} is ${payment.amountCents} cents in ${payment.currency}; its sponsorships come to ${expectedCents} cents in ${CURRENCY}`
      );

      return acknowledged();
    }
  }

  if (!(await takeClaim(req.payload, deliveryClaim(paymentId)))) {
    req.payload.logger.info(
      `[mollie] Payment ${paymentId} is already being handled; this delivery is a replay`
    );

    return acknowledged();
  }

  const { docs, errors } = await req.payload.update({
    collection: "sponsorships",
    data: { status: target },
    // Ids, not populated relations: `submitPaidRenders` reads `overlayImage`
    // as a media id and looks it up itself.
    depth: 0,
    overrideAccess: true,
    where: {
      and: [
        { id: { in: ids } },
        { status: { equals: SPONSORSHIP_STATUS_TO_ADVANCE_FROM } },
      ],
    },
  });

  if (errors.length > 0) {
    req.payload.logger.error(
      `[mollie] Payment ${paymentId} could not move ${errors.map((e) => e.id).join(", ")}: ${errors.map((e) => e.message).join("; ")}`
    );

    await releaseDelivery(req, paymentId);
  }

  req.payload.logger.info(
    `[mollie] Payment ${paymentId} moved ${docs.length} of ${ids.length} sponsorships to ${target}`
  );

  if (target === PAID_TARGET && docs.length > 0) {
    /*
     * The origin is this request's, which is the site's public origin by
     * construction: Mollie posts to the `webhookUrl` checkout built from
     * *its* request's origin (`endpoints/sponsorships.ts`, `webhookUrlFor`),
     * and every other URL this app hands a third party on a request path —
     * the Mollie redirect and webhook, the logo — is built the same way.
     * `SITE_ORIGIN` exists for the scheduled tick, which has no request.
     */
    await afterAnswering(
      req,
      `No render could be submitted for payment ${paymentId}`,
      () =>
        submitPaidRenders(req.payload, {
          origin: req.origin ?? "",
          sponsorships: docs,
        })
    );
  }

  return acknowledged();
};

export const mollieEndpoints: Endpoint[] = [
  { handler: mollieWebhook, method: "post", path: "/webhooks/mollie" },
];
