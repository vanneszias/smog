import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import { equalConstantTime } from "@/lib/constantTime";
import { createMuxAssetFromUrl, signedMuxSourceUrl } from "@/lib/mux";
import {
  RENDER_SIGNATURE_SCHEME,
  verifyRenderCallback,
} from "@/lib/renderSignature";
import type { Render } from "@/payload-types";

/**
 * `POST /api/render/callback` — the only thing that turns a finished Remotion
 * Lambda render into a Mux asset.
 *
 * ## The body is the evidence, so it has to be signed
 *
 * This is a public URL. It carries an `outputUrl`, and what this handler does
 * with it is have Mux ingest the video it points at and put the playback id
 * Mux hands back onto a gesture's sponsorship. Anyone who can post an accepted
 * body can therefore put any video on any gesture.
 *
 * That is the opposite situation from `endpoints/mollie.ts`, and the two are
 * worth comparing because they look alike. Mollie does not sign its webhooks,
 * so that handler throws the body away except for an id and asks Mollie, over
 * an authenticated connection, what the payment actually is — the body is a
 * hint, never evidence. Here there is nobody to ask back: the result of a
 * render is known only to the thing that produced it. So the body *is* the
 * evidence, and `lib/renderSignature.ts` is what makes it admissible. There is
 * no session, no `Origin` and no source address to lean on — AWS Lambda posts
 * from wherever it likes — and the shared secret is the whole of the
 * authentication.
 *
 * The signature is checked **first**, before the body is parsed, before the
 * job is looked up and long before anything is written. Every refusal below it
 * is a decision about work this application asked for; the signature is what
 * decides whether it asked for it at all.
 *
 * ## Exactly one Mux asset per job
 *
 * Delivery is at-least-once: Remotion's `invokeWebhook`
 * (`@remotion/serverless`, `dist/invoke-webhook.js`) retries any non-2xx or
 * timeout, for at most three deliveries about 1 s and 2 s apart, each attempt
 * with a 10 s timeout. So two callbacks for one render are ordinary rather
 * than exceptional — a slow answer that outlives the 10 s is retried while it
 * is still running. Two Mux
 * assets are not: only one can ever be referenced, and the other is a bill
 * that arrives every month, for ever, for a video nobody can name.
 *
 * **The plan said to reuse Task 1's claim on the `renders` row, and that
 * cannot work.** That row is created by the submitter — the Mollie webhook,
 * once the payment is paid — so it already exists by the time Lambda calls
 * back: two concurrent callbacks would both *lose* an insert against it and
 * neither would upload. It cannot be an `update` with a `where` either,
 * however phrased — **a `where` on an update is a SELECT**, measured on this
 * adapter, with two concurrent conditional updates both reporting a changed
 * row.
 *
 * So the claim is its own insert against its own unique index: one `claims`
 * row per job id, taken **before any Mux call**. First callback inserts and
 * proceeds; a replay's insert fails and is answered 200 having done nothing; a
 * failure that is *not* a duplicate is confirmed by reading the row back, so a
 * database outage cannot masquerade as a replay and silently drop a render
 * somebody paid for.
 *
 * The claim is handed back whenever the work did not complete, which is what
 * keeps that safe — see `releaseCompletion`.
 *
 * A callback for a render that is already `ready` or `failed` — most often
 * one that arrives after the stalled-render sweep gave up on it — is answered
 * before the claim is even tried, and takes none: nothing it says can change
 * an answer, and a claim taken for it would be a row nothing ever settles.
 *
 * That was `render-completions`, a table of its own, until Stage 7 folded it
 * and `webhook-deliveries` into one generic `claims` table — the refactor
 * `collections/RenderCompletions.ts` deferred until all four consumers were
 * visible. **Nothing about this handler's behaviour changed**, and the way
 * that is known is that Stage 6's concurrency mutation still fails Stage 6's
 * tests through the new table: drop `unique` from `claims.key` and `survives
 * two concurrent callbacks for one job` fails.
 *
 * The claim carries **no expiry**, and that is load-bearing rather than a
 * default. `endpoints/jobs.ts` leases its claim, because a runner that dies
 * must not stop the queue for ever. A completion claim that expired would let
 * a retried delivery — Remotion's `invokeWebhook` is at-least-once — upload
 * the same render again once the lease lapsed, which is the second Mux asset and the
 * monthly bill this whole mechanism exists to prevent. A render job id is used
 * once, so nothing legitimate ever needs the row back.
 *
 * ## The world moves while a render runs
 *
 * Renders take minutes. In that window a sponsorship can be cancelled, or
 * rejected, or sent back to the sponsor for a re-edit, and the composite this
 * callback is holding is of content that is no longer what anyone agreed to.
 * So the playback id is attached only to a sponsorship still in a status that
 * is waiting for one — see `STATUSES_AWAITING_A_COMPOSITION`.
 *
 * **The plan expected `hooks/enforceStatusTransitions.ts` to refuse that, and
 * it does not.** That hook compares `originalDoc.status` with `data.status`,
 * and `data` is the whole merged document by the time a `beforeChange` runs —
 * `fields/hooks/beforeValidate/promise.js` (3.89.0) fills every absent field
 * from `originalDoc` — so an update that writes only a playback id arrives
 * carrying the status it already had, `from === to`, and `canTransition`
 * allows it. There is no transition to refuse, because this handler is not
 * making one. The guard below is therefore not a second line of defence
 * behind the hook; it is the only one, and deleting it puts the rejected
 * submission's video on the page the moment the sponsor's re-edit is
 * approved.
 *
 * The render row is advanced to `ready` **before** the sponsorship is
 * considered, and regardless of what that consideration decides. The render
 * really did finish, and losing that fact means a retry re-renders and pays
 * for it a second time. It is the sponsorship that must not move, not the
 * record of the work.
 *
 * ## What every answer says
 *
 * A settled decision answers `200 {"status":"ok"}`, byte for byte, whatever it
 * decided — including for a job id this application has never heard of, and
 * for a body that names no job id of ours at all. A 404 there would make this
 * an oracle for which renders exist, and a non-2xx for a replay would have
 * Lambda retrying a decision that will not change.
 *
 * There are exactly three exceptions:
 *
 * - **An unsigned, empty or wrong signature** answers 401. Nothing about the
 *   request is believed, so there is nothing to be idempotent about.
 * - **A body that is not a JSON object** answers 400. It is signed, so it
 *   came from this application's own secret, and a retry of the same bytes
 *   will be refused the same way.
 * - **Mux could not be asked** answers 502, and hands the claim back. A
 *   timeout, a 503 or a rate limit says nothing about the render, and
 *   swallowing it would throw away a composite that cost real money to make.
 *   The retry is Remotion's, and it is short: at most three deliveries in
 *   all, about 1 s and 2 s apart. A Mux outage longer than that leaves the
 *   render `uploading`, for the stalled-render sweep to report.
 */

/**
 * The header Remotion Lambda signs the body into: `X-Remotion-Signature`.
 *
 * Read from `lib/renderSignature.ts` rather than restated, because the header
 * name, the HMAC and the value's prefix are one decision, taken there from
 * `@remotion/serverless`'s own `invoke-webhook.js` — so a change to it moves
 * this handler with it instead of leaving a second copy behind.
 */
const SIGNATURE_HEADER = RENDER_SIGNATURE_SCHEME.header;

/** How a service token is presented, and the only spelling accepted. */
const BEARER = "Bearer ";

/**
 * The sponsorship statuses a freshly composed video may be attached to.
 *
 * A render is submitted by the Mollie webhook as it moves the sponsorship to
 * `pending_approval` (`lib/paidRenders.ts`), and the callback lands minutes
 * later, while the sponsorship waits in the approval queue with the
 * composite still to come. That is the legitimate window.
 *
 * `pending_payment` stays in the set although this application no longer
 * submits a render for a sponsorship in it — renders used to be submitted at
 * checkout — because nothing moves a sponsorship back to `pending_payment`,
 * so the entry can only admit a render that was really asked for, and taking
 * it out was not part of the change that moved submission after payment.
 *
 * Every other status is excluded for its own reason, and none of them is
 * defensive:
 *
 * - `cancelled` and `expired` are terminal. Nothing will ever play this.
 * - `rejected` looks terminal and is not: `lib/sponsorshipStatus.ts` allows
 *   `rejected -> pending_resubmission`, because the shipped product re-opens a
 *   rejected sponsorship. Attaching here means the *rejected* submission's
 *   video goes live the moment the sponsor's re-edit is approved.
 * - `pending_resubmission` is the same worry one step earlier: the sponsor is
 *   changing the overlay right now, so this composite is of the old text or
 *   the old logo.
 * - `active` would overwrite a composite that is already on a public page with
 *   one from a render nobody is waiting for.
 */
const STATUSES_AWAITING_A_COMPOSITION = new Set([
  "pending_payment",
  "pending_approval",
]);

/**
 * Render states a callback can no longer change: `lib/renderState.ts` gives
 * `ready` and `failed` no outgoing edge. A callback for one is answered as a
 * settled decision before anything is claimed or asked of Mux.
 */
const TERMINAL_RENDER_STATES = new Set<Render["state"]>(["failed", "ready"]);

const NO_STORE = { "Cache-Control": "no-store" };

/** HTTP statuses, named so the handler reads as decisions rather than numbers. */
const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const BAD_GATEWAY = 502;

/**
 * The one body every settled decision answers with.
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

/** What Lambda said happened, reduced to the four things this handler acts on. */
interface RenderReport {
  /**
   * Our own job id, from `customData.jobId` — the `renders.jobId` the
   * submitter claimed — or `null` when the body carries none. Never
   * Remotion's `renderId`, which is chosen after the row is written.
   */
  jobId: null | string;
  /** Where Lambda put the composed video. Empty when the render failed. */
  outputUrl: string;
  /** Whatever Lambda said went wrong, verbatim. Empty when it succeeded. */
  reason: string;
  succeeded: boolean;
}

/** The raw request body, or `""` if there is not one to be had. */
async function readBody(req: PayloadRequest): Promise<string> {
  try {
    return typeof req.text === "function" ? await req.text() : "";
  } catch {
    return "";
  }
}

/**
 * Whatever Lambda put in `errors`, joined, verbatim.
 *
 * Verbatim is the point: this is the only thing an operator will have to go on
 * when a render fails, and a summarised or truncated version of it is a
 * support ticket that cannot be answered. A report with no usable message
 * still yields a sentence, because an empty `failureReason` reads as "nobody
 * recorded why" rather than as "Lambda did not say".
 *
 * **Verbatim except for URLs**, which become `<url>`. Lambda's error text can
 * quote the source it failed to fetch, and that is the signed Mux URL
 * `lib/renderJob.ts` minted; the reason is stored on the row and written to
 * the log, neither of which is where a credential goes. The sentence around
 * it is what an operator needs, and it stays.
 */
function failureReason(payload: Record<string, unknown>): string {
  return withoutUrls(rawFailureReason(payload));
}

/**
 * Every `http(s)://…` run in `text`, in any case, replaced by `<url>`.
 *
 * Trailing punctuation a sentence puts after a URL — `.` `,` `;` `:` `)` `]`
 * `}` `!` `?` — is given back rather than swallowed, so `(https://…).` reads
 * `(<url>).`. A URL genuinely ending in one of them loses that character to
 * the sentence, which only ever errs towards redacting less of the prose.
 */
function withoutUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>`]+/gi, (match) => {
    const trailing = /[.,;:)\]}!?]+$/.exec(match)?.[0] ?? "";

    return `<url>${trailing}`;
  });
}

function rawFailureReason(payload: Record<string, unknown>): string {
  const errors = payload.errors;

  if (Array.isArray(errors)) {
    const messages = errors
      .map((entry) =>
        entry !== null && typeof entry === "object"
          ? (entry as { message?: unknown }).message
          : entry
      )
      .filter(
        (message): message is string =>
          typeof message === "string" && message !== ""
      );

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  const type = typeof payload.type === "string" ? payload.type : "unknown";

  return `Remotion Lambda reported "${type}" without an error message.`;
}

/**
 * The job id `lib/renderJob.ts` put in `webhook.customData`, or `null`.
 *
 * Remotion echoes `customData` into every webhook body as it was submitted,
 * and as `null` when there was none (`launch.js`: `customData ?? null`).
 * Anything but a non-empty string is no id of ours.
 */
function ourJobId(customData: unknown): null | string {
  if (customData === null || typeof customData !== "object") {
    return null;
  }

  const jobId = (customData as { jobId?: unknown }).jobId;

  return typeof jobId === "string" && jobId !== "" ? jobId : null;
}

/**
 * The render report out of a signed body, or `null` if it is not one.
 *
 * The shape is Remotion Lambda's own webhook payload, as
 * `@remotion/serverless@4.0.484`'s `dist/handlers/launch.js` builds it: `type`
 * (`success`, `error` or `timeout`), Remotion's `renderId`, `outputUrl` on a
 * success, `errors` on an error, and `customData` — where our job id is.
 * The other fields it sends (`bucketName`, `expectedBucketOwner`, `costs`,
 * `lambdaErrors`, …) are not read.
 *
 * Any JSON object is a report. One with no job id of ours is still answered
 * as a decision — an unknown job — rather than a 400, because a retry of the
 * same bytes would name no job either.
 *
 * A `success` with no `outputUrl` is **not** a parse failure: Lambda said the
 * render finished, which is a fact worth recording, and there is simply
 * nothing to upload. It becomes a failed render with that as its reason,
 * rather than a 400 that Remotion would deliver twice more to no effect.
 */
function parseReport(raw: string): null | RenderReport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const payload = parsed as Record<string, unknown>;
  const jobId = ourJobId(payload.customData);
  const succeeded = payload.type === "success";
  const outputUrl = payload.outputUrl;
  const usableUrl = typeof outputUrl === "string" ? outputUrl : "";

  if (succeeded && usableUrl !== "") {
    return { jobId, outputUrl: usableUrl, reason: "", succeeded: true };
  }

  return {
    jobId,
    outputUrl: "",
    reason: succeeded
      ? "Remotion Lambda reported a success with no output URL."
      : failureReason(payload),
    succeeded: false,
  };
}

/**
 * The gesture whose video Mux plays under `playbackId`, or `null`.
 *
 * `overrideAccess: true` and an explicit `isActive` test at the call site,
 * rather than `overrideAccess: false` leaning on `publicReadActive`. The two
 * would agree today, and the explicit one is the guard that can be *seen* —
 * and, more to the point, the one a mutation sweep can delete and watch a test
 * fail. A guard expressed as the absence of a flag is a guard nobody reviews.
 */
async function findGestureByPlaybackId(
  req: PayloadRequest,
  playbackId: string
): Promise<null | { isActive?: boolean | null }> {
  const { docs } = await req.payload.find({
    collection: "gestures",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { playbackId: { equals: playbackId } },
  });

  return docs[0] ?? null;
}

/** The render this job belongs to, or `null` if this app never submitted it. */
async function findRender(
  req: PayloadRequest,
  jobId: string
): Promise<null | Render> {
  const { docs } = await req.payload.find({
    collection: "renders",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { jobId: { equals: jobId } },
  });

  return docs[0] ?? null;
}

/**
 * The claim one callback is taken with.
 *
 * `lib/claims.ts` holds the mechanism and the reasoning — the unique index as
 * the only atomic primitive, and the read-back that keeps a database outage
 * from masquerading as a replay and silently dropping a render somebody paid
 * for. This is only the name the callback goes under, namespaced by kind so
 * that a Remotion job id and a Mollie payment id that happened to be the same
 * string could never shadow each other.
 */
const completionClaim = (jobId: string) =>
  ({ key: jobId, kind: CLAIM_KINDS.renderCompletion }) as const;

/**
 * Gives the lock back, so the retry Remotion is about to make can finish the job.
 *
 * A claim that outlives the work it covers is worse than no claim at all: the
 * row says this callback was handled, so the retry that would have completed
 * it is waved through as a replay and the render is lost. `endpoints/mollie.ts`
 * releases its claim on exactly this reasoning.
 *
 * A failure to release is logged rather than thrown. The caller is already on
 * a failure path by the time it gets here, and replacing whatever went wrong
 * with "could not delete a row" would lose the original fault.
 */
function releaseCompletion(req: PayloadRequest, jobId: string): Promise<void> {
  return releaseClaim(req.payload, {
    ...completionClaim(jobId),
    consequence: `[render] Could not release the completion claim on render job ${jobId}; a retry of this render will be turned away as a replay`,
  });
}

/** Records a render that will never produce a playable asset. */
async function recordFailure(
  req: PayloadRequest,
  render: Render,
  reason: string,
  muxAssetId?: string
): Promise<void> {
  await req.payload.update({
    collection: "renders",
    data: {
      failureReason: reason,
      state: "failed",
      ...(muxAssetId ? { muxAssetId } : {}),
    },
    id: render.id,
    overrideAccess: true,
  });
}

/**
 * Puts the composed video on the sponsorship, if it is still the sponsorship
 * the composite was made for.
 *
 * `previewVideoPlaybackId` and not `sponsoredVideoPlaybackId`, which is the
 * column the public gesture page reads (`lib/sponsorOverlay.ts`). That copy is
 * made when an administrator approves the sponsorship, which is the shipped
 * product's own flow — `apps/server/src/services/sponsorship.ts` writes
 * `sponsoredVideoPlaybackId: sponsorship.previewVideoPlaybackId` at exactly
 * that moment and calls it the "simplified flow". Keeping the two columns
 * distinct means no callback, however well signed, can reach a public page
 * without a person in between.
 *
 * `overrideAccess: true` because `sponsorships.update` is `isAdmin` and this
 * request has no user at all. It is the same arrangement every writer in this
 * stage uses, and the reason the guards here are code rather than access
 * rules: an access rule this handler bypasses is not a guard this handler is
 * subject to.
 */
async function attachToSponsorship(
  req: PayloadRequest,
  render: Render,
  playbackId: string
): Promise<void> {
  const relation = render.sponsorship;
  const sponsorshipId =
    typeof relation === "object" && relation !== null ? relation.id : relation;

  if (sponsorshipId === null || sponsorshipId === undefined) {
    // The sponsorship was deleted while the render ran. The render row is the
    // only thing left that knows the Mux asset id, which is what a cleanup
    // needs; see `collections/Renders.ts`.
    req.payload.logger.warn(
      `[render] Render job ${render.jobId} finished for a sponsorship that no longer exists`
    );

    return;
  }

  const sponsorship = await req.payload.findByID({
    collection: "sponsorships",
    depth: 0,
    id: sponsorshipId,
    overrideAccess: true,
  });

  if (!STATUSES_AWAITING_A_COMPOSITION.has(sponsorship.status)) {
    req.payload.logger.warn(
      `[render] Render job ${render.jobId} finished for a sponsorship that is now ${sponsorship.status}; the composed video is recorded but not attached`
    );

    return;
  }

  await req.payload.update({
    collection: "sponsorships",
    data: { previewVideoPlaybackId: playbackId },
    id: sponsorshipId,
    overrideAccess: true,
  });
}

/**
 * `GET /api/mux/source/:id` — the source video a render container renders from.
 *
 * ## What the service token is, and what it is not
 *
 * A single shared bearer token in `MUX_SOURCE_SERVICE_TOKEN`, compared with
 * `lib/constantTime.ts` for the reason that module documents at length: a
 * byte-by-byte `===` on a value an attacker can present repeatedly turns
 * guessing it into a per-character search. It is the third caller of that
 * helper, and the copy of the comparison that did not get written.
 *
 * It fails closed. An unset variable refuses every caller rather than waving
 * them through, because the alternative is a deployment where an empty
 * `Authorization` header is a valid credential.
 *
 * ## Why an unknown playback id is answered exactly like a wrong token
 *
 * A different answer here makes this endpoint an oracle for which gestures
 * exist: anybody guessing playback ids could sort them into "real" and "not"
 * without ever holding the token. The same applies to a gesture that has been
 * deactivated, which the public API refuses to serve at all
 * (`publicReadActive`) — so it is refused here too, and refused in a way
 * that is indistinguishable from it.
 *
 * That is cheap to hold because there is nothing useful to say: a caller
 * without the token has no business knowing, and a caller with it is asking
 * about a gesture this application is not going to render.
 *
 * ## What this actually protects, stated honestly
 *
 * Not the video. Every playback id in this product has a `public` policy, and
 * Mux serves a public id to anyone who asks, token or no token — the gesture
 * page streams exactly this video to anonymous visitors. What the endpoint
 * protects is the enumeration above, and it is the seam that becomes
 * load-bearing the moment a source asset moves to a `signed` policy. The
 * expiry it mints is real, signed and verifiable; Mux is simply not the thing
 * enforcing it today. See `lib/mux.ts`, and Task 6.
 */
const muxSource: PayloadHandler = async (
  req: PayloadRequest
): Promise<Response> => {
  const serviceToken = process.env.MUX_SOURCE_SERVICE_TOKEN ?? "";
  const authorization = req.headers.get("authorization") ?? "";
  const presented = authorization.startsWith(BEARER)
    ? authorization.slice(BEARER.length)
    : "";

  /*
   * Two conditions, not three. An earlier draft also refused outright when
   * `serviceToken === ""`, and the mutation that deletes that disjunct
   * **survived the whole suite** — correctly, because it cannot be reached:
   * `equalConstantTime` compares lengths first, so an unset variable can only
   * match a presented token that is itself empty, and the line above has
   * already refused that one. A guard nothing can reach is not a weaker guard,
   * it is a comment — `hooks/stampReviewDecision.ts` says the same about three
   * field rules it declined to write — so it is a comment.
   *
   * The property it was there for still holds and is still tested by name:
   * with no token configured every caller is refused, including one presenting
   * an empty bearer token. See "refuses every caller when no service token is
   * configured", and the mutation that deletes `presented === ""` fails it.
   */
  if (presented === "" || !equalConstantTime(presented, serviceToken)) {
    return problem(UNAUTHORIZED, "This request is not allowed.");
  }

  const requested = req.routeParams?.id;
  const playbackId = typeof requested === "string" ? requested : "";
  const gesture =
    playbackId === "" ? null : await findGestureByPlaybackId(req, playbackId);

  if (gesture === null || gesture.isActive !== true) {
    req.payload.logger.warn(
      "[render] A source URL was asked for a playback id that names no active gesture"
    );

    // Byte for byte the refusal above. See the doc block.
    return problem(UNAUTHORIZED, "This request is not allowed.");
  }

  const source = await signedMuxSourceUrl(playbackId, Date.now());

  return Response.json(
    { expiresAt: new Date(source.expiresAt).toISOString(), url: source.url },
    { headers: NO_STORE, status: OK }
  );
};

const renderCallback: PayloadHandler = async (
  req: PayloadRequest
): Promise<Response> => {
  const raw = await readBody(req);

  const signed = await verifyRenderCallback(
    raw,
    req.headers.get(SIGNATURE_HEADER),
    process.env.RENDER_CALLBACK_SECRET ?? ""
  );

  if (!signed) {
    req.payload.logger.warn(
      "[render] A render callback arrived without an acceptable signature"
    );

    return problem(UNAUTHORIZED, "The callback signature is not acceptable.");
  }

  const report = parseReport(raw);

  if (report === null) {
    return problem(BAD_REQUEST, "The callback body is not a render report.");
  }

  if (report.jobId === null) {
    req.payload.logger.warn(
      "[render] A callback carried no job id in customData, so it names no render this application submitted"
    );

    return acknowledged();
  }

  const render = await findRender(req, report.jobId);

  if (render === null) {
    req.payload.logger.warn(
      `[render] A callback named render job ${report.jobId}, which this application did not submit`
    );

    return acknowledged();
  }

  if (TERMINAL_RENDER_STATES.has(render.state)) {
    // Before the claim, not after it: a claim taken here would sit for ever
    // on a render nothing can settle again, and the `uploading` write below
    // would be refused by the state table as a 4xx Lambda retries. The late
    // callback is most often one the stalled-render sweep beat to it.
    req.payload.logger.info(
      `[render] Ignored a callback for render ${report.jobId}, already ${render.state}`
    );

    return acknowledged();
  }

  if (!(await takeClaim(req.payload, completionClaim(report.jobId)))) {
    req.payload.logger.info(
      `[render] Render job ${report.jobId} has already been completed; this callback is a replay`
    );

    return acknowledged();
  }

  if (!report.succeeded) {
    await recordFailure(req, render, report.reason);
    req.payload.logger.error(
      `[render] Render job ${report.jobId} failed: ${report.reason}`
    );

    return acknowledged();
  }

  // Everything that can refuse the work has now run. What follows is the one
  // step nothing can undo, and it happens exactly once per job because of the
  // claim above.
  await req.payload.update({
    collection: "renders",
    data: { state: "uploading" },
    id: render.id,
    overrideAccess: true,
  });

  let asset: Awaited<ReturnType<typeof createMuxAssetFromUrl>>;
  // The render row's own id, and nothing about the sponsorship or the sponsor:
  // Mux stores it on the asset, where anyone with dashboard access reads it.
  const passthrough = `render:${render.id}`;

  try {
    asset = await createMuxAssetFromUrl(report.outputUrl, passthrough);
  } catch (error) {
    /*
     * A refusal, or a request that never reached Mux, made no asset, and
     * handing the claim back orphans nothing. A timeout is different: the
     * request may have arrived and the asset been made, with only the answer
     * lost — so handing the claim back can orphan a billed asset, and the
     * retry can make a second. It is handed back anyway, because without it
     * the retry this 502 asks for — Remotion's `invokeWebhook` makes at most
     * two more deliveries, about 1 s and 2 s later — is turned away as a
     * replay and the composite is lost outright; what a timeout adds is a log line naming
     * the passthrough, so the possible orphan can be found in Mux and
     * deleted.
     */
    // Read by name rather than `instanceof Error`: an abort surfaces as a
    // `DOMException`, whose prototype chain is the runtime's business.
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "TimeoutError";

    req.payload.logger.error(
      { err: error },
      timedOut
        ? `[render] Creating the Mux asset for render job ${report.jobId} timed out; an asset may exist in Mux with passthrough ${passthrough} that nothing records — answering 502 so it is delivered again`
        : `[render] Mux would not take the output of render job ${report.jobId}; answering 502 so it is delivered again`
    );
    await releaseCompletion(req, report.jobId);

    return problem(BAD_GATEWAY, "The composed video could not be uploaded.");
  }

  if (asset.playbackId === null || asset.status === "errored") {
    // Mux took the asset and then could not prepare it, or prepared one with
    // nothing to play it by. The asset exists and is billable, so the claim
    // stays and the id is recorded — a retry would only make a second one.
    // A sponsorship pointing at this would be a dead player on a public page.
    await recordFailure(
      req,
      render,
      `Mux accepted the asset and it is not playable (status ${asset.status}, ${asset.playbackId === null ? "no public playback id" : "playback id present"}).`,
      asset.assetId
    );
    req.payload.logger.error(
      `[render] Mux asset ${asset.assetId} for render job ${report.jobId} is not playable`
    );

    return acknowledged();
  }

  // Before the sponsorship is even looked at. The render finished, and that
  // fact must survive whatever the sponsorship has become in the meantime —
  // otherwise a retry re-renders and pays for it twice.
  await req.payload.update({
    collection: "renders",
    data: {
      muxAssetId: asset.assetId,
      muxPlaybackId: asset.playbackId,
      state: "ready",
    },
    id: render.id,
    overrideAccess: true,
  });

  await attachToSponsorship(req, render, asset.playbackId);

  return acknowledged();
};

export const renderEndpoints: Endpoint[] = [
  { handler: renderCallback, method: "post", path: "/render/callback" },
  /*
   * No rewrite in `next.config.ts` for this one, unlike the callback's. The
   * caller is this application's own render submission, which builds the URL
   * from `req.origin` and can say `/api/...` as easily as anything else — so
   * there is no third party holding a published address, and no reason to
   * spend a second public URL on it.
   */
  { handler: muxSource, method: "get", path: "/mux/source/:id" },
];
