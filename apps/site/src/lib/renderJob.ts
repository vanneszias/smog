import type { SponsoredVideoInputProps } from "@smog/types/render";
import { SPONSORED_VIDEO_COMPOSITION_ID } from "@smog/types/render";
import type { Payload } from "payload";
import { signedMuxSourceUrl } from "@/lib/mux";

/**
 * What a render of a sponsored gesture asks Remotion Lambda for — and the
 * seam where that request would be sent, which is deliberately empty.
 *
 * ## Decision: `fetch` and SigV4 rather than `@remotion/lambda`. Measured.
 *
 * The plan asked for a measurement before either was chosen, on the grounds
 * that Stage 5 rejected the Mollie SDK at +165.71 KiB gzipped for two REST
 * calls. Measured the same way on this commit's parent
 * (`CLOUDFLARE_ENV=staging bun run build:app && bun run check-bundle-size`),
 * with `renderMediaOnLambda` imported from `@remotion/lambda/client` into an
 * endpoint so it could not be tree-shaken away:
 *
 * | build | gzipped | headroom of 10.00 MiB |
 * |---|---|---|
 * | without it | 7514.73 KiB | 27% |
 * | with it | 8268.12 KiB | 19% |
 *
 * **+753.39 KiB gzipped**, which is four and a half times what Stage 5 refused
 * to spend, out of a budget Stage 7 has yet to draw on. The dependency is
 * therefore not added.
 *
 * One detail of the plan's reasoning is wrong and is worth correcting rather
 * than repeating: `@remotion/lambda/client` does **not** pull in the AWS SDK.
 * It re-exports `@remotion/lambda-client`, whose `dependencies` are empty — it
 * carries its own request signing. The cost is the rest of what comes with it
 * (the Remotion client surface, its zod schemas, the serverless protocol
 * types), and it is larger than the SDK argument suggested, not smaller.
 *
 * ## Decision: submission is stubbed, and this says so rather than pretending
 *
 * Nothing here submits anything, and `submitRenderJob` is the whole of the
 * seam. Three things are missing and none of them can be invented:
 *
 * - **A deployed Remotion Lambda function**, with its name and region. The
 *   plan's "BLOCKED ON CREDENTIALS" is explicit that no task may deploy one:
 *   it creates billable AWS resources in an account nobody has named.
 * - **A serve URL** — an S3-hosted bundle of the composition — which is
 *   produced by the same deploy.
 * - **The invoke payload's own shape.** `@remotion/lambda-client` speaks a
 *   private protocol to the function it deployed, versioned against it: the
 *   payload carries the Remotion version and the function refuses a mismatch.
 *   Writing that request from memory and testing it against a fake of my own
 *   making would prove only that the two agree with each other, which is the
 *   exact failure this stage is trying to avoid with the callback signature.
 *
 * So what is built here is everything that *is* knowable and checkable: the
 * composition id, the input props the composition declares, the source URL and
 * the callback address. `renderSubmission` is that, and it is fully tested.
 * The transport is one function body, and Task 6 owns it — at which point the
 * SigV4 request goes in `submitRenderJob` and nothing else moves.
 */

/**
 * Where Lambda is told to report, as a path rather than the endpoint's own.
 *
 * `/render/callback` is the rewrite in `next.config.ts`; the handler is
 * mounted at `/api/render/callback`. AWS holds this URL for the life of the
 * render and retries against it, which is exactly why the address a third
 * party keeps is the one this application publishes on purpose.
 */
const CALLBACK_PATH = "/render/callback";

/**
 * The render request, minus the transport's own configuration.
 *
 * Not exported, for the reason `lib/mux.ts` gives about its own result type:
 * knip fails `bun release:check` on an exported symbol nothing imports.
 *
 * **The callback secret is deliberately not a field.** This object is logged,
 * and Remotion Lambda stores a render's payload in S3 for the life of the job.
 * The secret is what makes a callback admissible — anybody holding it can put
 * any video on any gesture — so the transport adds it at send time.
 */
interface RenderSubmission {
  codec: "h264";
  composition: string;
  inputProps: SponsoredVideoInputProps;
  webhook: { url: string };
}

/** Everything a render of one sponsored gesture needs to be described. */
interface RenderSubmissionInput {
  /** An absolute URL for the sponsor's logo, or `null` if none was bought. */
  logoUrl: null | string;
  /** The clock, passed in so the source URL's expiry is a caller's decision. */
  now: number;
  /** This deployment's own origin, which the callback URL is built from. */
  origin: string;
  /** What Remotion draws: the sponsor's name, as the wizard collected it. */
  overlayText: string;
  /** The gesture's own Mux playback id — the video being sponsored. */
  playbackId: string;
  sponsorshipId: number;
}

/** Where the render would be sent, or `null` if this deployment has nowhere. */
function lambdaTarget(): null | { functionName: string; region: string } {
  const functionName = process.env.REMOTION_FUNCTION_NAME?.trim();
  const region = process.env.REMOTION_REGION?.trim();
  const serveUrl = process.env.REMOTION_SERVE_URL?.trim();

  if (!(functionName && region && serveUrl)) {
    return null;
  }

  return { functionName, region };
}

/**
 * The render request for one sponsored gesture.
 *
 * Pure but for the signing key it mints the source URL with, and separate from
 * the transport precisely so that the part which *can* be verified here is
 * verified here: which composition, which video, which text, which logo, and
 * where the result is reported.
 *
 * @throws If the Mux signing key is unset; see `lib/mux.ts`.
 */
export async function renderSubmission(
  input: RenderSubmissionInput
): Promise<RenderSubmission> {
  const source = await signedMuxSourceUrl(input.playbackId, input.now);

  return {
    codec: "h264",
    composition: SPONSORED_VIDEO_COMPOSITION_ID,
    inputProps: {
      // Spread rather than `logoUrl: input.logoUrl ?? undefined`, because
      // `SponsoredVideoSchema` marks it `z.string().optional()` and zod refuses
      // an explicit `null` there — which would be every logo-less render
      // failing inside Lambda instead of here.
      ...(input.logoUrl === null ? {} : { logoUrl: input.logoUrl }),
      sponsorName: input.overlayText,
      videoSrc: source.url,
    },
    webhook: { url: `${input.origin}${CALLBACK_PATH}` },
  };
}

/**
 * Submits a render to Remotion Lambda — or, today, records that it did not.
 *
 * **This is the seam, and it is empty on purpose.** See the module's doc block
 * for the three things that are missing and why none of them may be invented
 * here. Task 6 replaces this function's body with the signed invoke and the
 * `claimRenderJob` that records the job id; no caller changes.
 *
 * It never throws for a caller's benefit — a sponsor has paid by the time this
 * runs, and a video pipeline that is not configured yet must not be able to
 * fail a checkout. The caller logs what comes back out of it.
 *
 * Two branches, both reachable and both tested. Unconfigured — which is every
 * environment today — says so calmly and does no work, so a checkout needs no
 * Mux signing key. Configured builds the submission, so that a broken source
 * URL surfaces here rather than on first contact, and then says plainly that
 * nothing was sent.
 */
export async function submitRenderJob(
  payload: Payload,
  input: RenderSubmissionInput
): Promise<void> {
  const target = lambdaTarget();

  if (target === null) {
    payload.logger.info(
      `[renderJob] No render was submitted for sponsorship ${input.sponsorshipId}: REMOTION_FUNCTION_NAME, REMOTION_REGION and REMOTION_SERVE_URL are not all set, so there is no Remotion Lambda to submit to.`
    );

    return;
  }

  const submission = await renderSubmission(input);

  // The submission itself is never logged: it carries a signed source URL, and
  // a log line is not where a credential goes.
  payload.logger.warn(
    `[renderJob] A render of ${submission.composition} for sponsorship ${input.sponsorshipId} was prepared for ${target.functionName} in ${target.region} and not submitted: Stage 6 Task 6 owns first contact with Remotion Lambda.`
  );
}
