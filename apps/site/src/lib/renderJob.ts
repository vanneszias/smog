import type { SponsoredVideoInputProps } from "@smog/types/render";
import { SPONSORED_VIDEO_COMPOSITION_ID } from "@smog/types/render";
import type { Payload } from "payload";
import { signedMuxSourceUrl } from "@/lib/mux";
import { startRemotionRender } from "@/lib/remotionLambda";
import { claimRenderJob, releaseRenderJob } from "@/lib/renderState";

/**
 * What a render of a sponsored gesture asks Remotion Lambda for, and the
 * submission that sends it.
 *
 * ## Decision: `fetch` and SigV4 rather than `@remotion/lambda`. Measured.
 *
 * The plan asked for a measurement before either was chosen, on the grounds
 * that Stage 5 rejected the Mollie SDK at +165.71 KiB gzipped for two REST
 * calls. Measured the same way
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
 * to spend. The dependency is therefore not added: `lib/remotionLambda.ts`
 * sends the one request itself, and its test holds it byte-identical to the
 * official client's.
 *
 * `@remotion/lambda/client` does **not** pull in the AWS SDK, contrary to the
 * plan's original reasoning: it re-exports `@remotion/lambda-client`, whose
 * `dependencies` are empty. The cost is the rest of the Remotion client
 * surface — its zod schemas and serverless protocol types.
 *
 * ## The job id is ours, and it travels in `customData`
 *
 * Remotion names its render with an id it picks inside the start routine, so
 * that id cannot be the key of a row written before the start is sent. The
 * row is keyed by a UUID minted here instead, claimed before the start, and
 * handed to Remotion as `webhook.customData.jobId`. `@remotion/serverless`
 * echoes `customData` in every webhook body it sends (`dist/handlers/
 * launch.js`: the `success`, `error` and `timeout` payloads alike), and
 * `endpoints/render.ts` settles the render by that id and ignores Remotion's.
 *
 * Claiming before starting is what makes a callback always find its row: a
 * render that finished faster than the row was written would otherwise be
 * answered as a job this application never submitted.
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
 * **The callback secret is deliberately not a field.** Remotion Lambda stores
 * a render's payload in S3 for the life of the job, and the secret is what
 * makes a callback admissible — anybody holding it can put any video on any
 * gesture — so it is added only at the moment the start is sent.
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

/** Where the render is sent, or `null` if this deployment has nowhere. */
function lambdaTarget(): null | {
  functionName: string;
  region: string;
  serveUrl: string;
} {
  const functionName = process.env.REMOTION_FUNCTION_NAME?.trim();
  const region = process.env.REMOTION_REGION?.trim();
  const serveUrl = process.env.REMOTION_SERVE_URL?.trim();

  if (!(functionName && region && serveUrl)) {
    return null;
  }

  return { functionName, region, serveUrl };
}

/** An error's message and nothing else: no stack, no cause, no body. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * The render request for one sponsored gesture.
 *
 * Pure but for the signing key it mints the source URL with, and separate from
 * the transport so that what can be verified without AWS is verified here:
 * which composition, which video, which text, which logo, and where the result
 * is reported.
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
 * Submits a render of one sponsored gesture to Remotion Lambda.
 *
 * **It never throws.** A sponsor has paid by the time this runs, and a video
 * pipeline that is unconfigured, misconfigured or unreachable must not be able
 * to fail a checkout. Every outcome is a log line naming the sponsorship.
 *
 * - **Unconfigured** (no function name, region or serve URL) says so and does
 *   no work, so a checkout needs no Mux signing key.
 * - **No `RENDER_CALLBACK_SECRET`** refuses before anything is claimed or
 *   started: the callback would be answered 401, so the render would be paid
 *   for and never settled.
 * - **Configured** builds the submission, claims a `renders` row under a fresh
 *   job id, and starts the render with that id in `webhook.customData`. If
 *   anything after the claim throws, the claim is handed back: a `queued` row
 *   for a render that was never started is a job nothing will ever settle.
 *
 * Logs carry ids and error messages only — never the submission, which holds
 * a signed source URL, and never the secret. `lib/remotionLambda.ts` builds
 * its errors to carry neither.
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

  // Passed on exactly as `endpoints/render.ts` reads it, untrimmed: a secret
  // signed with one spelling and verified with another refuses every callback.
  const secret = process.env.RENDER_CALLBACK_SECRET ?? "";

  if (secret.trim() === "") {
    payload.logger.error(
      `[renderJob] No render was submitted for sponsorship ${input.sponsorshipId}: RENDER_CALLBACK_SECRET is not set, so its callback would be refused.`
    );

    return;
  }

  const jobId = crypto.randomUUID();
  let claimed = false;

  try {
    const submission = await renderSubmission(input);
    const claim = await claimRenderJob(payload, {
      jobId,
      sponsorship: input.sponsorshipId,
    });

    if (claim === null) {
      payload.logger.warn(
        `[renderJob] No render was submitted for sponsorship ${input.sponsorshipId}: render job ${jobId} is already claimed.`
      );

      return;
    }

    claimed = true;

    const started = await startRemotionRender({
      composition: submission.composition,
      functionName: target.functionName,
      inputProps: submission.inputProps,
      region: target.region,
      serveUrl: target.serveUrl,
      webhook: {
        customData: { jobId },
        secret,
        url: submission.webhook.url,
      },
    });

    payload.logger.info(
      `[renderJob] Submitted render ${jobId} for sponsorship ${input.sponsorshipId} (Remotion render ${started.renderId})`
    );
  } catch (error) {
    // Only a claim this call took is handed back. A claim that threw was
    // confirmed absent by `claimRenderJob`, and releasing it would only add a
    // misleading "could not release" line beside the real fault.
    if (claimed) {
      await releaseRenderJob(payload, jobId);
    }

    payload.logger.error(
      `[renderJob] Failed to submit render ${jobId} for sponsorship ${input.sponsorshipId}: ${messageOf(error)}`
    );
  }
}
