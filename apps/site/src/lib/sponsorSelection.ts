// The `@smog/config/constants` subpath rather than the barrel, for the reason
// `collections/Sponsorships.ts` documents: the Payload CLI's loader appends a
// `?namespace=<n>` query to every module it resolves and that query rides into
// the barrel's relative re-exports, so `payload generate:types` dies on
// `ENOENT: .../constants.ts?namespace=...`. This module is reached from
// `payload.config.ts` through the sponsorship endpoints, so it is on that path.
import { MAX_GESTURES_PER_SPONSORSHIP } from "@smog/config/constants";
import type { Payload } from "payload";
import { resolveRelationshipId } from "@/collections/Lists";
import type { Gesture } from "@/payload-types";
import { activeAndInTerm } from "./sponsorOverlay";

/*
 * Which gestures a sponsor may buy, answered once for every surface that asks.
 *
 * Step 1's `start` endpoint asks it, the details and preview pages ask it
 * again on every render, and `checkout` asks it last of all — immediately
 * before it writes rows and takes money. They have to agree, and the way to
 * make them agree is one function rather than four `where` clauses that look
 * alike today.
 *
 * **It takes a `Payload` rather than calling `getPayloadClient()`.** This
 * module is reached from `payload.config.ts` through `endpoints/sponsorships.ts`,
 * and the helper imports the config back — the README records that cycle
 * costing 22.86 KiB of duplicated graph the last time something on this path
 * reached for it. The endpoints pass `req.payload`; the pages pass the client
 * they already have.
 */

/**
 * The statuses that make a gesture unavailable *whatever* the dates say.
 *
 * **Transcribed from the shipped product, and wider than the plan asked
 * for.** Stage 5's plan names only "an active sponsorship in term". The
 * shipped rule is `packages/convex/convex/lib/sponsorshipValidation.ts`'s
 * `checkExistingSponsorship`, which every create path runs and which refuses
 * a gesture that has an `active`, `pending_payment` or `pending_approval`
 * sponsorship; `listGesturesWithSponsorship` greys the same set out on the
 * selection screen. The in-term rule alone cannot express those, because a
 * `pending_payment` row has a term nobody has paid for yet — so two sponsors
 * could both select one gesture, both check out, both pay, and the admin
 * queue would hold two sponsorships for one window. That is exactly the
 * "selling the same window twice" the plan calls the failure that costs money
 * to unwind, and the migration's non-goal is that this flow behaves as it
 * does today.
 *
 * `pending_resubmission` is here too: Stage 1 split the shipped `pending`
 * into it, and it is a live sponsorship waiting on its sponsor, not a free
 * slot.
 *
 * `expired`, `rejected` and `cancelled` are deliberately absent — those are
 * answers, the window is free, and blocking on them would make a gesture
 * unsellable for ever after one refused payment.
 */
const BLOCKING_STATUSES = [
  "pending_approval",
  "pending_payment",
  "pending_resubmission",
] as const;

/*
 * Neither type below is exported, and that is knip's doing rather than a
 * design choice: `bun release:check` fails on an exported symbol nothing
 * imports, and no caller names either — the endpoints narrow on `"error" in
 * …` and hand the code straight to `sponsorPath`, whose own `SponsorError`
 * union is where the set is spelled out for a reader. They are still this
 * module's contract; they are just stated in the signature instead of
 * re-exported.
 */

/** Why a selection was refused. One code per sentence the page may show. */
type SelectionRefusal =
  /** Nothing was selected. */
  | "empty"
  /** Something in the selection is not a gesture anyone may sponsor. */
  | "gesture"
  /** One of them is already sponsored, or is on its way to being. */
  | "sold"
  /** More gestures than one sponsorship may cover. */
  | "too-many";

/** A resolved selection, or the code that refuses it. */
type SponsorSelection = { error: SelectionRefusal } | { gestures: Gesture[] };

/**
 * Which of these gestures are already spoken for.
 *
 * `overrideAccess: true` is deliberate and is the same narrow-read argument
 * `fetchGestureOverlay` makes next door: `sponsorships.read` is `isAdmin` and
 * stays that way, because a row carries the sponsor's email, VAT number and
 * re-edit token. What crosses back out of this function is a set of gesture
 * ids the caller already had, so there is nothing to leak.
 *
 * One query for the whole page rather than one per gesture: twelve
 * round-trips to answer twelve yes/nos is twelve times the latency on the
 * screen a sponsor lands on first.
 *
 * Returning the ids rather than a boolean is what lets the selection screen
 * grey a sold gesture out *and* lets `resolveSponsorSelection` refuse one,
 * from a single rule. A boolean here would have meant a second query
 * somewhere with a second copy of the `where`.
 */
export async function sponsoredGestureIds(
  payload: Payload,
  gestureIds: readonly (number | string)[]
): Promise<Set<number>> {
  if (gestureIds.length === 0) {
    return new Set();
  }

  // Read once, so the two term bounds cannot straddle a tick.
  const now = new Date().toISOString();

  const { docs } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    overrideAccess: true,
    /*
     * Every match, not a page of them — one gesture can carry several rows
     * (an expired term, a cancelled attempt, the live one) and a page limit
     * would answer "not sold" for a gesture whose blocking row happened to
     * sort second. Bounded by the `in` below, which the caller caps.
     */
    pagination: false,
    where: {
      and: [
        { gesture: { in: [...gestureIds] } },
        {
          or: [
            { and: activeAndInTerm(now) },
            { status: { in: [...BLOCKING_STATUSES] } },
          ],
        },
      ],
    },
  });

  return new Set(
    docs.map((sponsorship) =>
      Number(resolveRelationshipId(sponsorship.gesture))
    )
  );
}

/**
 * The gestures a submitted selection names, or the code that refuses it.
 *
 * The order of the four refusals is not cosmetic. The cap is applied before
 * anything is looked up, because the ids arrive from a form and an
 * unbounded list would become an unbounded `IN (...)` — D1 caps a statement
 * at 100 bound parameters, which the README records as a real failure in
 * this app rather than a theoretical one.
 *
 * **There is no separate duplicate screen and no `isGestureId` screen**, for
 * the reasons `endpoints/mollie.ts` and `endpoints/lists.ts` respectively
 * record. `[7, 7]` comes back from one `in` query as a single row against two
 * ids and is refused by the row-count comparison; an id that is not a number
 * at all resolves to nothing and is refused by the same line. A second screen
 * in front of either could not be made to fail by any mutation, which is the
 * ruling Stage 4 already made twice.
 *
 * `overrideAccess: false` is what makes "a gesture an editor deactivated" and
 * "a gesture that never existed" the same answer: `publicReadActive` narrows
 * the query to `isActive: true`, so neither resolves and both are refused
 * with `gesture`. Review Focus 2 asks for exactly that screen here.
 */
export async function resolveSponsorSelection(
  payload: Payload,
  raw: readonly string[]
): Promise<SponsorSelection> {
  if (raw.length === 0) {
    return { error: "empty" };
  }

  if (raw.length > MAX_GESTURES_PER_SPONSORSHIP) {
    return { error: "too-many" };
  }

  const { docs } = await payload.find({
    collection: "gestures",
    depth: 0,
    limit: raw.length,
    overrideAccess: false,
    pagination: false,
    // By id, so the order a page renders and the order rows are created in
    // are the same on every request rather than whatever the adapter's
    // default sort happened to be.
    sort: "id",
    where: { id: { in: [...raw] } },
  });

  if (docs.length !== raw.length) {
    return { error: "gesture" };
  }

  const sold = await sponsoredGestureIds(
    payload,
    docs.map((gesture) => gesture.id)
  );

  if (sold.size > 0) {
    return { error: "sold" };
  }

  return { gestures: docs };
}
