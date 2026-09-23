import type { Payload } from "payload";
import { submitRenderJob } from "@/lib/renderJob";
import type { RenderState } from "@/lib/renderState";
import type { Sponsorship } from "@/payload-types";

/**
 * The renders of an order that has just been paid for.
 *
 * ## Why after payment, and not at checkout
 *
 * A render costs Lambda time, and its result costs Mux storage. Submitted at
 * checkout, both were spent on every sponsor who reached Mollie and then
 * changed their mind, and the checkout's redirect waited on a Lambda start
 * for every gesture in the order. So renders are asked for when the Mollie
 * webhook moves a sponsorship from `pending_payment` to `pending_approval`
 * (`endpoints/mollie.ts`), which is the moment the sale is real (user
 * decision, 2026-09-23). The composite therefore exists only for paid
 * sponsorships, and an administrator reviews it in the approval queue.
 *
 * ## Everything comes from the row
 *
 * The webhook has no form and no draft cookie, only the sponsorship rows the
 * payment names — and they carry everything checkout used to pass by hand:
 * `overlayText`, the gesture's own `originalVideoPlaybackId`, and the logo as
 * the `overlayImage` media row, gated on `hasLogo` exactly as
 * `lib/sponsorOverlay.ts` gates the public overlay.
 */

/**
 * The render states that mean a sponsorship's composite is already in hand,
 * or on its way.
 *
 * `failed` is deliberately absent. It is an answer, not a job
 * (`lib/renderState.ts`): a failed render left the sponsorship with no
 * composite, and nothing will ever settle it into one, so it must not stand
 * in the way of a new job asking again. Every other state is a job that will
 * either produce the composite or be failed by its callback or by the
 * stalled-render sweep, and a second job beside it would be a second Lambda
 * bill and a second Mux asset for one sponsorship.
 */
const RENDER_STATES_IN_HAND = [
  "queued",
  "rendering",
  "uploading",
  "ready",
] as const satisfies readonly RenderState[];

/** An error's message and nothing else: no stack, no cause, no body. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Whether `sponsorshipId` already has a render that is not `failed`.
 *
 * **This is not what makes a redelivered webhook safe**, and is not written
 * as if it were: it is a read, and two concurrent readers both find nothing.
 * The delivery claim in `endpoints/mollie.ts` does that — it is taken before
 * the sponsorships are moved, it is kept for ever, and only the delivery that
 * holds it gets as far as calling this. This check is what holds when a
 * sponsorship reaches this path a second time some other way: a delivery
 * whose claim was handed back after a partial update and replayed, or an
 * operator re-firing a payment by hand.
 */
async function hasRenderInHand(
  payload: Payload,
  sponsorshipId: number
): Promise<boolean> {
  const { totalDocs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { sponsorship: { equals: sponsorshipId } },
        { state: { in: [...RENDER_STATES_IN_HAND] } },
      ],
    },
  });

  return totalDocs > 0;
}

/**
 * The sponsor's logo as an absolute URL, or `null`.
 *
 * Absolute because the consumer is a Remotion composition running in AWS,
 * which has no origin of its own to resolve `/api/media/file/...` against.
 * `disableErrors` rather than a try/catch: a logo row deleted since checkout
 * is worth a render without the logo, not a render that never happens.
 */
async function logoUrlFor(
  payload: Payload,
  origin: string,
  sponsorship: Sponsorship
): Promise<null | string> {
  const relation = sponsorship.overlayImage;
  const mediaId =
    typeof relation === "object" && relation !== null ? relation.id : relation;

  if (
    sponsorship.hasLogo !== true ||
    mediaId === null ||
    mediaId === undefined
  ) {
    return null;
  }

  const media = await payload.findByID({
    collection: "media",
    depth: 0,
    disableErrors: true,
    id: mediaId,
    overrideAccess: true,
  });
  const url = media?.url;

  if (typeof url !== "string" || url === "") {
    return null;
  }

  return url.startsWith("/") ? `${origin}${url}` : url;
}

/**
 * Submits one render for each sponsorship a payment has just moved to
 * `pending_approval`.
 *
 * `origin` is this deployment's public origin, which the callback URL and a
 * relative logo URL are built from; the webhook passes its own request's, for
 * the reason `endpoints/mollie.ts` gives.
 *
 * **It never throws.** The payment is recorded by the time this runs, and a
 * video pipeline that is unconfigured, misconfigured or unreachable must not
 * be able to turn that into a webhook failure Mollie would redeliver. Each
 * sponsorship is tried on its own, so one that fails does not cost the rest
 * of the order its render. `submitRenderJob` catches and logs its own
 * failures; the `catch` below is the second line, for a fault in the lookups
 * here or in the logging itself.
 *
 * **Concurrently**, each sponsorship in its own `try`. This runs inside
 * `ctx.waitUntil` (`endpoints/mollie.ts`), and the platform keeps that work
 * alive only for a bounded time after the response is sent; one Lambda start
 * after another — each allowed up to 30 s by `lib/remotionLambda.ts` — would
 * let a slow start cost every later sponsorship in the order its render.
 * Unlike `createSponsorships`' writes in `endpoints/sponsorships.ts`, these
 * touch no shared row: each claims its own `renders` row under its own job
 * id, so there is no order to preserve.
 */
export async function submitPaidRenders(
  payload: Payload,
  input: { origin: string; sponsorships: readonly Sponsorship[] }
): Promise<void> {
  const now = Date.now();

  await Promise.all(
    input.sponsorships.map((sponsorship) =>
      submitOne(payload, input.origin, now, sponsorship)
    )
  );
}

/** One sponsorship's submission; never throws (see `submitPaidRenders`). */
async function submitOne(
  payload: Payload,
  origin: string,
  now: number,
  sponsorship: Sponsorship
): Promise<void> {
  try {
    if (await hasRenderInHand(payload, sponsorship.id)) {
      payload.logger.info(
        `[renderJob] No render was submitted for sponsorship ${sponsorship.id}: it already has one that has not failed.`
      );

      return;
    }

    await submitRenderJob(payload, {
      logoUrl: await logoUrlFor(payload, origin, sponsorship),
      now,
      origin,
      overlayText: sponsorship.overlayText,
      playbackId: sponsorship.originalVideoPlaybackId,
      sponsorshipId: sponsorship.id,
    });
  } catch (error) {
    payload.logger.error(
      `[renderJob] No render could be submitted for sponsorship ${sponsorship.id}; it is paid for and has no composited video: ${messageOf(error)}`
    );
  }
}
