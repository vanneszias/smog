import type { SponsoredVideoInputProps } from "@smog/types/render";
import { SPONSORED_VIDEO_COMPOSITION_ID } from "@smog/types/render";
import type { Payload } from "payload";
import { signedMuxSourceUrl } from "@/lib/mux";
import { RemotionStartError, startRemotionRender } from "@/lib/remotionLambda";
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
 * mounted at `/api/render/callback`. Remotion holds this URL for the life of
 * the render — it travels in the start payload — and its `invokeWebhook`
 * delivers to it up to three times, about 1 s and 2 s apart, each attempt with
 * a 10 s timeout. That is exactly why the address a third party keeps is the
 * one this application publishes on purpose.
 */
const CALLBACK_PATH = "/render/callback";

/**
 * The render request, minus the transport's own configuration.
 *
 * Not exported, for the reason `lib/mux.ts` gives about its own result type:
 * knip fails `bun release:check` on an exported symbol nothing imports.
 *
 * **The callback secret is deliberately not a field**, so that this object
 * can be asserted on and compared whole, and so that a stray log of it would
 * leak at most the short-lived signed source URL it does hold — never the
 * long-lived secret that makes every callback admissible (anybody holding it
 * can put any video on any gesture). It joins the request only in the
 * `startRemotionRender` call itself. It does then travel in the start
 * payload, which Remotion keeps; that is Remotion's design, and nothing this
 * object can change.
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

/** Where Lambda reports for a deployment at `origin`. */
function callbackUrl(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}

/** Whether `url` is absolute and `https:` or `http:` — somewhere Lambda can post. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);

    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
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
    webhook: { url: callbackUrl(input.origin) },
  };
}

/**
 * Submits a render of one sponsored gesture to Remotion Lambda.
 *
 * Called by `lib/paidRenders.ts` once the Mollie webhook has moved the
 * sponsorship to `pending_approval`, never at checkout (user decision,
 * 2026-09-23): a render is paid-for work, asked for only once it is paid for.
 *
 * **It never throws.** The sponsor has paid by the time this runs, and a
 * video pipeline that is unconfigured, misconfigured or unreachable must not
 * be able to fail the webhook that recorded it. Every outcome is a log line
 * naming the sponsorship.
 *
 * - **Unconfigured** (no function name, region or serve URL) says so and does
 *   no work, so recording a payment needs no Mux signing key.
 * - **No `RENDER_CALLBACK_SECRET`**, or a callback URL that is not absolute
 *   `https:` or `http:` (an empty origin, say), refuses before anything is
 *   claimed or started: the callback would be refused or sent nowhere, so the
 *   render would be paid for and never settled.
 * - **Configured** builds the submission, mints a job id, claims a `renders`
 *   row under it, and starts the render with that id in `webhook.customData`.
 *   The id is minted only once the submission exists, so no log line names a
 *   job that was never claimed.
 *
 * What happens to the claim when the start fails depends on whether Lambda
 * may have started the render anyway (`RemotionStartError.definite`):
 *
 * - **Definitely not started** (a refused invoke, a 4xx, a routine error): the
 *   claim is handed back. No webhook will ever name the job, and a `queued`
 *   row would only wait for the stalled-render sweep to fail it.
 * - **Maybe started** (a timeout, a dropped connection, a 5xx, an unreadable
 *   answer): the claim is **kept**. The row stays `queued`, so a late webhook
 *   still finds it and settles it; if none ever comes, the stalled-render
 *   sweep fails it with a reason. Releasing here would turn a render that ran
 *   into "a job this application never submitted", paid for and discarded.
 * - **Any other error** after the claim: handed back, as before.
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

  if (!isWebUrl(callbackUrl(input.origin))) {
    // The origin itself is not logged: it came from the request.
    payload.logger.error(
      `[renderJob] No render was submitted for sponsorship ${input.sponsorshipId}: its callback URL would not be an absolute https: or http: URL, so Lambda could not report back.`
    );

    return;
  }

  let submission: RenderSubmission;

  try {
    submission = await renderSubmission(input);
  } catch (error) {
    payload.logger.error(
      `[renderJob] Failed to submit a render for sponsorship ${input.sponsorshipId}: ${messageOf(error)}`
    );

    return;
  }

  const jobId = crypto.randomUUID();
  let claimed = false;

  try {
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
    if (!claimed) {
      // `claimRenderJob` threw, having confirmed no row exists: nothing was
      // claimed, so nothing is handed back and no job is named.
      payload.logger.error(
        `[renderJob] Failed to submit a render for sponsorship ${input.sponsorshipId}: ${messageOf(error)}`
      );

      return;
    }

    if (error instanceof RemotionStartError && !error.definite) {
      payload.logger.error(
        `[renderJob] Render ${jobId} may have started; keeping its claim for the callback or the stalled-render sweep: ${error.message}`
      );

      return;
    }

    await releaseRenderJob(payload, jobId);
    payload.logger.error(
      `[renderJob] Failed to submit render ${jobId} for sponsorship ${input.sponsorshipId}: ${messageOf(error)}`
    );
  }
}
