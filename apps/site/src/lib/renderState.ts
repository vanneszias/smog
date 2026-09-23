import type { Payload } from "payload";
import type { Render } from "@/payload-types";

/**
 * The render state machine, and the claim that makes one render job the
 * property of exactly one writer.
 *
 * ## The states
 *
 * A render is submitted to Remotion Lambda (`queued`), Lambda works on it
 * (`rendering`), the callback uploads the result to Mux (`uploading`), and it
 * either arrives (`ready`) or does not (`failed`).
 *
 * `ready` and `failed` are answers rather than waypoints, for the same reason
 * `expired` and `cancelled` are in `lib/sponsorshipStatus.ts`: a render that
 * has to be done again is a **new job id**, which is a new row with its own
 * claim. Re-opening a finished one would mean two Lambda jobs sharing one
 * record, and the second callback overwriting the first one's Mux ids —
 * which is how an asset becomes an orphan nobody has a pointer to and Mux
 * bills for monthly, for ever.
 */
export const RENDER_STATES = [
  "queued",
  "rendering",
  "uploading",
  "ready",
  "failed",
] as const;

export type RenderState = (typeof RENDER_STATES)[number];

/**
 * Which state may follow which. Data rather than a chain of `if`s, so the
 * whole policy reads, tests and diffs in one place — `lib/sponsorshipStatus.ts`
 * is the precedent.
 *
 * Two edges are worth defending because they look wrong at a glance:
 *
 * - **`queued -> uploading` is allowed, skipping `rendering`.** Nothing in
 *   this application observes a render *starting*. There is no poller; the
 *   first and only news Lambda sends is the callback, and it says the render
 *   finished. `rendering` exists for a future progress poll (Remotion Lambda
 *   exposes one) and for an operator reading the admin panel, not because the
 *   happy path passes through it. Refusing the skip would force the callback
 *   to write a state that was never true, purely to satisfy this table.
 * - **`rendering -> ready` is refused.** `ready` means a Mux asset exists and
 *   plays; the only thing that can know that is the code that uploaded it,
 *   which passes through `uploading` on the way. A render marked ready without
 *   one is a sponsorship pointing at nothing.
 *
 * Every non-terminal state may go straight to `failed`: Lambda can report a
 * failure at any point, including before it started.
 */
const ALLOWED_RENDER_TRANSITIONS: Readonly<
  Record<RenderState, readonly RenderState[]>
> = {
  queued: ["rendering", "uploading", "failed"],
  rendering: ["uploading", "failed"],
  uploading: ["ready", "failed"],
  ready: [],
  failed: [],
};

/**
 * Whether a render in `from` may become `to`. A state staying put always may.
 *
 * The self-edge lives here rather than in the table above for the reason
 * `canTransition` gives: every update re-submits the whole document, so
 * recording a failure reason on an already-`failed` render would otherwise be
 * refused as an illegal move to where it already is.
 */
export function canAdvance(from: RenderState, to: RenderState): boolean {
  return from === to || ALLOWED_RENDER_TRANSITIONS[from].includes(to);
}

/**
 * Takes the job, answering `null` if somebody else already holds it.
 *
 * ## Why this is an insert and not an update
 *
 * There are no transactions on this adapter — `sqliteD1Adapter` is built
 * without `transactionOptions`, so `beginTransaction` resolves to `null` — and
 * **a `where` on an update is a SELECT, not a conditional UPDATE**. Payload's
 * `collections/operations/update.js` (3.89.0) resolves the filter with a
 * separate `payload.db.find` and then updates each id it found; measured
 * against a real D1, two concurrent conditional updates on one row *both*
 * reported a changed document, and five concurrent ones all five did.
 *
 * A unique index is the one atomic primitive left, because SQLite evaluates it
 * inside the INSERT. That is what `renders.jobId` is for, and the whole of why
 * `collections/Renders.ts` exists. See its doc block, and `lib/claims.ts`,
 * which holds the pattern — `webhook-deliveries` and `render-completions`
 * were folded into one `claims` table once there were four consumers.
 *
 * ## Why the failure is confirmed by reading the row back
 *
 * A create can fail because somebody else won the race, and it can fail
 * because the database is unreachable. Treating the second as the first means
 * a render is silently dropped: the caller is told "already handled" when in
 * truth nothing was. So a failure is confirmed by looking for the row — if it
 * is there, this insert lost a race it was meant to lose; if it is not,
 * something else is wrong and the error is rethrown for the caller to answer
 * 502 with, so the sender retries.
 *
 * The lost race arrives as a raw `Failed query: insert into "renders" ...`
 * driver error rather than Payload's `ValidationError`, which is not an
 * accident and not something to paper over: Payload's own `unique` pre-check
 * is a read followed by a write, so it does not fire reliably under
 * concurrency — and if it did, it would be exactly the read-then-write pair
 * this mechanism exists to avoid. Matching on the error's shape instead of
 * reading the row back would therefore be matching on a string the driver is
 * free to change, for a distinction it cannot make.
 */
export async function claimRenderJob(
  payload: Payload,
  input: { jobId: string; sponsorship: number }
): Promise<null | Render> {
  try {
    return await payload.create({
      collection: "renders",
      data: {
        jobId: input.jobId,
        sponsorship: input.sponsorship,
        state: "queued",
      },
      overrideAccess: true,
    });
  } catch (error) {
    const { totalDocs } = await payload.find({
      collection: "renders",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { jobId: { equals: input.jobId } },
    });

    if (totalDocs === 0) {
      throw error;
    }

    return null;
  }
}

/**
 * Gives the job back, so the work can be attempted again.
 *
 * A claim that outlives the work it covers is worse than no claim at all: the
 * row says this job was taken care of, so the retry that would have finished
 * it is waved through as a replay and the render is lost. The Mollie webhook
 * deletes its claim on exactly this reasoning — see `endpoints/mollie.ts` —
 * and the rule is the same here: **hand the claim back if the work did not
 * complete.**
 *
 * A failure to release is logged rather than thrown. The caller is already on
 * a failure path by the time it gets here, and replacing whatever went wrong
 * with "could not delete a row" would lose the original fault; the log line
 * says plainly what a replay of this job will now do.
 */
export async function releaseRenderJob(
  payload: Payload,
  jobId: string
): Promise<void> {
  try {
    await payload.delete({
      collection: "renders",
      overrideAccess: true,
      where: { jobId: { equals: jobId } },
    });
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[renderState] Could not release the claim on render job ${jobId}; a retry of this render will be turned away as a replay`
    );
  }
}
