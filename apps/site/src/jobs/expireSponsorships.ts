import type { Payload } from "payload";
import { deleteMuxAsset, readMuxAsset } from "@/lib/mux";
import { canAdvance } from "@/lib/renderState";
import { ALLOWED_TRANSITIONS } from "@/lib/sponsorshipStatus";
import type { Render, Sponsorship } from "@/payload-types";

/**
 * The back half of a composed video's life: taking a sponsorship off the
 * public page when its term ends, and taking the Mux asset off Mux.
 *
 * `jobs/index.ts` owns the scheduler. **This module owns the operation**, so
 * that scheduling it is wiring rather than design.
 *
 * ## What "restore the original video" means here
 *
 * Expiry restores the gesture's original video *and* deletes the sponsored
 * Mux asset, and deleting first and failing to restore would leave a gesture
 * pointing at an asset that no longer exists.
 *
 * **Restoring is not a write to the gesture here, and treating it as one would
 * be a bug.** This application never touches `gestures.playbackId`. Nothing in
 * `apps/site` writes it outside the seed and the admin panel;
 * `hooks/publishComposedVideo.ts` writes the composite to
 * `sponsorships.sponsoredVideoPlaybackId`, and the page composes the two at
 * read time:
 *
 *     const playbackId = overlay?.sponsoredVideoPlaybackId ?? gesture.playbackId;
 *
 * where `overlay` is `lib/sponsorOverlay.ts`'s `fetchGestureOverlay`, which
 * returns a sponsorship only while it is `active` **and** in term. So the
 * gesture's own video is never displaced and there is nothing on the gesture
 * to put back. Writing `originalVideoPlaybackId` onto `gestures.playbackId`
 * would be a no-op on every row where the two already agree, and on the rows
 * where they do not — an administrator replaced the gesture's video during the
 * term — it would silently revert that administrator's newer video to a
 * snapshot taken at checkout. The column is still worth keeping: it is what
 * `lib/renderPreview.ts` and the re-edit page render against, and it is the
 * record of what the sponsor was sold.
 *
 * **The restore is therefore the status move to `expired`**, and the danger
 * in deleting first is worth stating plainly rather than leaving as an
 * implication, because it changes where the danger in this job actually is.
 * `fetchGestureOverlay` bounds the *term* as well as the status —
 * `activeAndInTerm` is `status = active AND startDate <= now AND endDate >=
 * now` — so a sponsorship this job selects, whose `endDate` has by definition
 * already passed, **has already stopped being drawn on the gesture page before
 * the job runs at all**. The status move is what makes the stored row agree
 * with what the page is already doing, and it is what every deletion in this
 * module is keyed off.
 *
 * So the harm of deleting too early does not arrive by way of an out-of-term
 * row. It arrives if the guard below is ever wrong about *which* sponsorships
 * have left the page: the sweep also reaches assets belonging to `cancelled`
 * sponsorships, whose term may still be running, and an asset deleted out from
 * under an `active` in-term sponsorship is a dead player on a live page with no
 * way back. That is what
 * `it("does not delete the asset of a sponsorship that is still on the page")`
 * asserts, through `fetchGestureOverlay` rather than through a column, so the
 * claim is about what a visitor sees.
 *
 * ## The order is the whole job
 *
 * Deleting a Mux asset cannot be undone. There is no transaction to lean on —
 * `sqliteD1Adapter` is built without `transactionOptions`, so
 * `beginTransaction` resolves to `null` — so the ordering is the only
 * mechanism there is, and it is expressed as a guard rather than as two
 * statements in a hopeful sequence: **`releaseAsset` reads the sponsorship
 * back out of the database and refuses to call Mux unless it says the
 * sponsorship has left the page.**
 *
 * That is stronger than checking the return value of the update that made the
 * move. An update that silently changed nothing answers with a document all
 * the same, and a job that believed it would delete the asset out from under a
 * sponsorship that is still live. `it("does not take the update's word for
 * it")` is the test, and the mutation that reads `status` off the row the due
 * query returned fails it.
 *
 * It also means the two callers below share one guard rather than one each.
 * Swapping the restore and the delete does not merely reorder them, it makes
 * the guard refuse — so the *happy path* fails, which is the strongest place
 * for an ordering mistake to show up.
 *
 * ## Why there is no claim, unlike `POST /api/render/callback`
 *
 * The only atomic primitive here is a unique index (`lib/claims.ts`), and
 * anything needing exactly-once semantics needs its own claim row. **This job
 * does not need one**, and the difference is worth stating rather than assumed:
 * the irreversible step in the callback is `POST /assets`, where a second one
 * is a second asset and a monthly bill for ever. The irreversible step here is
 * `DELETE /assets/:id`, and Mux answers a second one `404`, which `lib/mux.ts`
 * treats as success. Two schedulers running this job concurrently therefore
 * cost one wasted request and nothing else: the restore is `active -> expired`
 * and a second one is `expired -> expired`, which
 * `hooks/enforceStatusTransitions.ts` allows and
 * `hooks/logSponsorshipTransitions.ts` declines to log twice, because it logs
 * only a change.
 *
 * So this job wants at-least-once with an idempotent effect, which is what it
 * has, rather than exactly-once, which would cost a table. `claims` is the
 * one generic collection for the consumers that do need exactly-once — and
 * this job is not one of them.
 *
 * ## Resumability
 *
 * A half-run is the normal case, not the exceptional one: a Worker has a CPU
 * budget, Mux can be down, and a daily job that gave up on its first failure
 * would leak a billable asset every time. So no step records "I did this" —
 * every step is derived from state that the next run reads for itself:
 *
 * - a sponsorship still `active` past its end date has not been restored;
 * - a render row still carrying a `muxAssetId` has an asset on Mux;
 * - and the second is swept independently of the first, so a run that
 *   restored a sponsorship and then died still finishes the deletion the next
 *   day, even though that sponsorship is no longer `active` and no due query
 *   will ever return it again.
 *
 * `muxAssetId` is therefore the ledger, and clearing it is what "deleted"
 * means. That is also why a Mux `404` is a success: an asset an operator
 * removed by hand, or that a previous run deleted before dying, must let the
 * job finish rather than pin it for ever.
 */

/**
 * The statuses from which a sponsorship can never come back, derived rather
 * than restated.
 *
 * A Mux asset may only be deleted once nothing can put it back on a page, and
 * `lib/sponsorshipStatus.ts` already holds that fact: a status with no
 * outgoing edges is one nothing leaves. Today that is `expired` and
 * `cancelled`.
 *
 * `rejected` is the one that makes deriving this worth the line. It *looks*
 * terminal and is not — `rejected -> pending_resubmission` is legal because
 * an administrator may re-open a rejected sponsorship — so a rejected
 * sponsorship's composite can still reach a public page, by way of a
 * resubmission an administrator approves. A hand-written list would have had
 * `rejected` in it, and the asset would have been deleted out from under the
 * approval.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(
  Object.entries(ALLOWED_TRANSITIONS)
    .filter(([, next]) => next.length === 0)
    .map(([status]) => status)
);

/**
 * How many rows a query takes in one run.
 *
 * Bounded because an unbounded read has already broken this suite once —
 * `apps/site/README.md` records the measurement, a `Failed query` at 132 bound
 * parameters against D1's documented cap of 100 — and because a scheduled job
 * that reads a table whose size grows with the product's whole history is a
 * job that gets slower for ever.
 *
 * **A bound means an order, and a bound with the wrong candidate set means
 * starvation.** Neither query below can express what it actually wants in
 * SQL, because what it wants spans two tables and this adapter has no join.
 *
 * - the outstanding-deletion sweep reads *sponsorships*, most recently changed
 *   first, because the row it is looking for is one this job itself expired
 *   moments before it died.
 * - the render sweeps read *renders*, oldest first, over sets that a
 *   successful sweep removes rows from: `settledAt` for the readiness sweep
 *   and a null `sponsorship` for the orphan sweep. Those two filters close a
 *   starvation — before them, one page of `-createdAt` over *every* render
 *   holding an asset meant
 *   a render from a year ago sat behind every healthy live asset and was never
 *   reached at all.
 */
const PAGE = 200;

/**
 * What one run did, for the scheduler to log and for a test to assert on.
 *
 * Not exported, for the reason `lib/mux.ts` and `lib/mollie.ts` both give:
 * knip fails `bun release:check` on an exported symbol nothing imports, and
 * every caller reads the counts off the result rather than naming the type.
 * It is still the contract; it is spelled out in the return type instead.
 */
interface ExpiryReport {
  assetsDeleted: number;
  deleteFailures: number;
  expired: number;
  restoreFailures: number;
}

/** A relationship's id, whatever depth the document came back at. */
function relationId(
  value: null | number | { id: number } | undefined
): null | number {
  if (typeof value === "object" && value !== null) {
    return value.id;
  }

  return value ?? null;
}

/** A recorded asset id that is really there, treating `""` as absent. */
function assetId(render: Render): null | string {
  return typeof render.muxAssetId === "string" && render.muxAssetId !== ""
    ? render.muxAssetId
    : null;
}

async function findSponsorship(
  payload: Payload,
  id: number
): Promise<null | Sponsorship> {
  // `find` rather than `findByID`, which throws `NotFound` for a row that has
  // been deleted. That is a legitimate state here — a deleted sponsorship is
  // one nothing can point at — and it should read as an answer rather than as
  // an exception to be caught and re-interpreted.
  const { docs } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { id: { equals: id } },
  });

  return docs[0] ?? null;
}

async function rendersForSponsorship(
  payload: Payload,
  sponsorshipId: number
): Promise<Render[]> {
  const { docs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    where: { sponsorship: { equals: sponsorshipId } },
  });

  return docs;
}

/**
 * Whether the asset this render holds may be deleted.
 *
 * **The one gate on deletion.** Every deletion in this application goes
 * through it, both callers share it, and it answers from the database rather
 * than from anything a caller is holding.
 *
 * Two ways an asset stops being reachable, and neither of them is defensive:
 *
 * - **the render row has no sponsorship.** `collections/Renders.ts` makes that
 *   column nullable on purpose and says why: Payload emits `ON DELETE set
 *   null` for every relationship, so deleting a sponsorship strands its render
 *   rows rather than taking them with it, and such a row is "exactly what a
 *   cleanup has left to work from". Nothing can point at that asset, so it may
 *   go.
 * - **the sponsorship is in a status nothing leaves.** That is the ordinary
 *   path, and it is what makes the restore-before-delete ordering real:
 *   before the restore the sponsorship is `active` and this answers `false`.
 *
 * There is deliberately no third arm for "the relationship names a row that is
 * not there". `ON DELETE set null` means a deleted sponsorship arrives as the
 * first case rather than the second, so an arm for it would be a guard nothing
 * can reach — `hooks/stampReviewDecision.ts` and the source endpoint's own
 * mutation sweep both made that call, and a guard nothing can reach is a
 * comment rather than a weaker guard. What is left instead is the narrowing
 * `sponsorship !== null`, which fails *closed*: an asset whose sponsorship
 * cannot be read is one this job declines to delete.
 */
async function isReleasable(
  payload: Payload,
  render: Render
): Promise<boolean> {
  const sponsorshipId = relationId(render.sponsorship);

  if (sponsorshipId === null) {
    return true;
  }

  const sponsorship = await findSponsorship(payload, sponsorshipId);

  return sponsorship !== null && TERMINAL_STATUSES.has(sponsorship.status);
}

/**
 * Deletes the Mux asset a render holds, once nothing can point at it.
 *
 * The order inside is as load-bearing as the order outside: Mux is asked
 * first and the ledger is cleared second. A crash between them leaves a
 * `muxAssetId` for an asset that is already gone, and the next run asks Mux to
 * delete it again and is answered `404`, which is a success — so the job
 * finishes. The other order would clear the ledger for an asset still on Mux,
 * which is an orphan nobody can name and a bill nobody can stop.
 */
async function releaseAsset(
  payload: Payload,
  render: Render,
  report: ExpiryReport
): Promise<void> {
  const id = assetId(render);

  if (id === null) {
    return;
  }

  if (!(await isReleasable(payload, render))) {
    payload.logger.warn(
      `[expireSponsorships] Render job ${render.jobId} still belongs to a sponsorship that has not been taken off the page; its Mux asset is left alone`
    );

    return;
  }

  try {
    await deleteMuxAsset(id);
  } catch (error) {
    report.deleteFailures += 1;
    payload.logger.error(
      { err: error },
      `[expireSponsorships] Failed to delete the Mux asset for render job ${render.jobId}; it is still recorded and the next run will try again`
    );

    return;
  }

  await payload.update({
    collection: "renders",
    data: { muxAssetId: null },
    id: render.id,
    overrideAccess: true,
  });
  report.assetsDeleted += 1;
}

/**
 * Sponsorships nothing can come back from, most recently changed first.
 *
 * This is the resumability sweep, and it is deliberately not the due query: a
 * run that restored a sponsorship and then died left it `expired`, where no
 * query for `active` rows will ever see it again. Its renders may still hold
 * an asset, and this is what finds them the next day.
 *
 * `-updatedAt` because the row this is looking for was updated by the run that
 * died, which makes it one of the most recent — so a half-run is finished
 * whatever else has accumulated behind it.
 */
async function sponsorshipsPastTheEnd(
  payload: Payload
): Promise<Sponsorship[]> {
  const { docs } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "-updatedAt",
    where: { status: { in: [...TERMINAL_STATUSES] } },
  });

  return docs;
}

/**
 * Render rows holding an asset that Mux has never confirmed is playable,
 * oldest first.
 *
 * `muxAssetId` is this application's whole record of what it is being billed
 * for: `POST /api/render/callback` writes it when Mux accepts an asset, and
 * the only things that clear it are a completed deletion and an asset Mux says
 * is dead.
 *
 * **`settledAt` is what stops this sweep starving.** This query used to be
 * every render holding an asset, `-createdAt`, capped at one page — so the
 * moment the product had more than `PAGE` healthy live assets, the sweep read
 * the same newest page every hour for ever and an older render was never asked
 * about again. The filter, not the ordering, is the fix: a render Mux has
 * called `ready` is stamped and leaves this set permanently, so the set is the
 * work outstanding rather than the whole history, and it drains.
 *
 * The ordering is then oldest-first rather than newest-first, which is the
 * opposite of what this query used to do and is deliberate. The old order was
 * argued from "the asset whose fate is in doubt is the one Mux accepted
 * minutes ago", and that is still true — but it is an argument for checking
 * the newest *soon*, not for checking them *instead*. With a set that drains,
 * a new render is settled on the next tick either way, and oldest-first is the
 * order in which nothing can be left behind: the one render that has waited
 * longest is always in the page.
 */
async function unsettledRendersHoldingAssets(
  payload: Payload
): Promise<Render[]> {
  const { docs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "createdAt",
    where: {
      and: [{ muxAssetId: { exists: true } }, { settledAt: { exists: false } }],
    },
  });

  return docs;
}

/**
 * Render rows holding an asset that no sponsorship leads to any more, oldest
 * first.
 *
 * A sponsorship deleted from the admin panel takes its own row and leaves its
 * renders behind holding the one thing Mux bills for — `ON DELETE set null`,
 * which `collections/Renders.ts` records as deliberate — and no query keyed on
 * a sponsorship reaches them.
 *
 * **Asked of the database rather than filtered in memory**, and that is the
 * second half of the same starvation. This used to read one page of every
 * render holding an asset and then keep the ones whose `sponsorship` was null:
 * with more than `PAGE` live assets, an orphan behind them was never in the
 * page to be filtered, and an orphan is exactly the row nobody will ever
 * notice — a bill every month for a video nothing points at. `sponsorship` is
 * indexed (`collections/Renders.ts`), so the filter costs nothing and the page
 * is a page of orphans rather than a page of everything.
 */
async function orphanedRendersHoldingAssets(
  payload: Payload
): Promise<Render[]> {
  const { docs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "createdAt",
    where: {
      and: [
        { muxAssetId: { exists: true } },
        { sponsorship: { exists: false } },
      ],
    },
  });

  return docs;
}

/**
 * Takes every sponsorship whose term has ended off the public page, and then
 * takes its composed video off Mux.
 *
 * `now` is a parameter rather than read inside, for the reason
 * `lib/sponsorOverlay.ts` gives about its own clock: the boundary this job
 * applies and the boundary the gesture page applies have to be the same
 * instant to be comparable, and a test should be able to assert a decision
 * rather than race a clock. The comparison is the exact complement of
 * `activeAndInTerm`'s — in term is `endDate >= now`, so expired is
 * `endDate < now` — which means no sponsorship is ever both.
 */
export async function expireSponsorships(
  payload: Payload,
  now: Date
): Promise<ExpiryReport> {
  const report: ExpiryReport = {
    assetsDeleted: 0,
    deleteFailures: 0,
    expired: 0,
    restoreFailures: 0,
  };

  const { docs: due } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: "active" } },
        { endDate: { less_than: now.toISOString() } },
      ],
    },
  });

  /** Sponsorships this run has already worked through, so the sweep below
   * does not ask Mux a second time about an asset that just failed. */
  const handled = new Set<number>();

  for (const sponsorship of due) {
    try {
      // The restore. Nothing else on the row is touched: clearing
      // `sponsoredVideoPlaybackId` would fight `hooks/publishComposedVideo.ts`
      // — which keeps a published composite precisely so that a running
      // sponsor's video is never swapped from underneath them — and it is not
      // needed, because `fetchGestureOverlay` consults the status.
      await payload.update({
        collection: "sponsorships",
        data: { status: "expired" },
        id: sponsorship.id,
        overrideAccess: true,
      });
      report.expired += 1;
    } catch (error) {
      report.restoreFailures += 1;
      payload.logger.error(
        { err: error },
        `[expireSponsorships] Failed to expire sponsorship ${sponsorship.id}; its Mux asset is left alone`
      );

      continue;
    }

    handled.add(sponsorship.id);

    for (const render of await rendersForSponsorship(payload, sponsorship.id)) {
      await releaseAsset(payload, render, report);
    }
  }

  for (const sponsorship of await sponsorshipsPastTheEnd(payload)) {
    if (handled.has(sponsorship.id)) {
      continue;
    }

    for (const render of await rendersForSponsorship(payload, sponsorship.id)) {
      await releaseAsset(payload, render, report);
    }
  }

  // And the rows no sponsorship leads to any more. The due query and the sweep
  // above both start from a sponsorship, so neither can reach one.
  for (const render of await orphanedRendersHoldingAssets(payload)) {
    await releaseAsset(payload, render, report);
  }

  payload.logger.info(
    `[expireSponsorships] Expired ${report.expired} sponsorship(s) and deleted ${report.assetsDeleted} Mux asset(s); ${report.restoreFailures} restore failure(s), ${report.deleteFailures} delete failure(s)`
  );

  return report;
}

/*
 * ---------------------------------------------------------------------------
 * Failure mode: a callback that never arrives at all
 * ---------------------------------------------------------------------------
 */

/**
 * How long a render may sit in `queued`, `rendering` or `uploading` before
 * this sweep gives up on it and marks it `failed`.
 *
 * ## Why a `queued` row can exist for a render that may still be running
 *
 * `lib/renderJob.ts` keeps the claim — leaves the row `queued` — when
 * Remotion Lambda's start call fails ambiguously (`RemotionStartError` with
 * `definite: false`: a timeout, a dropped connection, a 5xx, an unreadable
 * 2xx). The render may have started anyway, and releasing the claim there
 * would turn a render that runs into "a job this application never
 * submitted", paid for and discarded the moment its callback arrived naming a
 * row that no longer exists. So the row is left claimed, for a late webhook
 * to settle — and **this sweep is what eventually fails it if none ever
 * comes.**
 *
 * ## Why `uploading` is swept on the same clock
 *
 * `POST /api/render/callback` moves a render to `uploading` before it asks
 * Mux to ingest the output, and only advances it to `ready` once Mux answers.
 * Remotion's own webhook delivery (`@remotion/serverless`'s `invoke-webhook.js`)
 * times out after 10s and is retried at most twice, about 1s and then 2s
 * later — three deliveries in all. A Mux upload slower than that leaves
 * nothing to settle a row stuck in `uploading`: the callback that would have
 * advanced it has already given up, and no further delivery is coming.
 *
 * ## The two timestamps
 *
 * `queued` and `rendering` are read against `createdAt`, which is stamped
 * once, at `claimRenderJob`'s insert, and never touched again — it is exactly
 * "when this job was claimed", and neither state is entered by any other
 * write. `uploading` is read against `updatedAt` instead, because it is
 * **entered** by an ordinary update (`state: "uploading"`), and
 * `collections/operations/utilities/update.js` stamps `updatedAt` with the
 * real clock on every write regardless of what changed — so at the instant a
 * row becomes `uploading`, `updatedAt` is exactly "when it entered this
 * state". Confirmed by reading both: `createdAt` is written once by
 * `@payloadcms/drizzle`'s `upsertRow` only `if (operation === 'create' &&
 * !data.createdAt)`, and never again; `updatedAt` is overwritten by every
 * subsequent update, so a row that only ever receives the one write that puts
 * it in `uploading` carries that write's timestamp until something moves it
 * on.
 */
const STALLED_RENDER_AFTER_MS = 6 * 60 * 60 * 1000;

/** Why a `queued` or `rendering` render is failed by this sweep. */
const NO_CALLBACK_REASON = "Remotion Lambda never reported back";

/** Why an `uploading` render is failed by this sweep. */
const NO_UPLOAD_REASON = "The upload to Mux never finished";

/** What one stalled-render sweep found. Not exported; see `ExpiryReport`. */
interface StalledRenderReport {
  failed: number;
}

/**
 * `queued` and `rendering` renders whose claim is older than `cutoff`, oldest
 * first.
 *
 * Bounded and ordered exactly like the sweeps above: `PAGE` at a time, oldest
 * first, over a set that drains as this sweep fails rows out of it — `failed`
 * has no outgoing edge, so a row this sweep has already touched never
 * reappears as a candidate.
 */
async function stalledSubmittedRenders(
  payload: Payload,
  cutoff: string
): Promise<Render[]> {
  const { docs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "createdAt",
    where: {
      and: [
        { state: { in: ["queued", "rendering"] } },
        { createdAt: { less_than: cutoff } },
      ],
    },
  });

  return docs;
}

/** `uploading` renders that entered that state before `cutoff`, oldest first. */
async function stalledUploadingRenders(
  payload: Payload,
  cutoff: string
): Promise<Render[]> {
  const { docs } = await payload.find({
    collection: "renders",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "updatedAt",
    where: {
      and: [
        { state: { equals: "uploading" } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  });

  return docs;
}

/**
 * Fails one stalled render, and logs rather than throws if it cannot.
 *
 * A render this sweep selected is always still in a state `lib/renderState.ts`
 * lets advance to `failed` — every non-terminal state may. The write can
 * still lose a race to a webhook that arrives between the query above and
 * this update (settling the row to `ready` or `failed` itself, both of which
 * refuse a further move); that failure is left for the next run to re-read
 * rather than treated as this sweep's own failure, exactly like a Mux delete
 * failure above.
 */
async function failStalledRender(
  payload: Payload,
  render: Render,
  reason: string,
  report: StalledRenderReport
): Promise<void> {
  try {
    await payload.update({
      collection: "renders",
      data: { failureReason: reason, state: "failed" },
      id: render.id,
      overrideAccess: true,
    });
    report.failed += 1;
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[expireSponsorships] Could not fail stalled render job ${render.jobId}; the next sweep will try again`
    );
  }
}

/**
 * Fails every render whose Lambda callback never arrived, or whose Mux
 * upload never finished.
 *
 * `now` is a parameter for the reason `expireSponsorships` gives about its
 * own clock: a test should be able to assert a decision rather than race one.
 *
 * The sponsorship a stalled render belongs to is never touched: it keeps
 * whatever preview it already has, exactly as `recordUnplayable` leaves the
 * sponsorship alone for a render that is not the composite it is holding.
 * There is nothing to restore here, because nothing was ever attached —
 * `attachToSponsorship` only runs once Mux has confirmed the asset, which is
 * exactly the step that never happened.
 */
export async function failStalledRenders(
  payload: Payload,
  now: Date
): Promise<StalledRenderReport> {
  const cutoff = new Date(
    now.getTime() - STALLED_RENDER_AFTER_MS
  ).toISOString();
  const report: StalledRenderReport = { failed: 0 };

  for (const render of await stalledSubmittedRenders(payload, cutoff)) {
    await failStalledRender(payload, render, NO_CALLBACK_REASON, report);
  }

  for (const render of await stalledUploadingRenders(payload, cutoff)) {
    await failStalledRender(payload, render, NO_UPLOAD_REASON, report);
  }

  payload.logger.info(
    `[expireSponsorships] Failed ${report.failed} stalled render(s)`
  );

  return report;
}

/*
 * ---------------------------------------------------------------------------
 * Failure mode: Mux accepts the upload and then fails to process it
 * ---------------------------------------------------------------------------
 */

/** What one readiness sweep found. Not exported; see `ExpiryReport`. */
interface SettlementReport {
  checked: number;
  /** Assets Mux called `ready`, which will never be asked about again. */
  settled: number;
  unreadable: number;
  unplayable: number;
}

/**
 * Asks Mux whether the assets this application is holding actually became
 * playable, and throws away the ones that did not.
 *
 * ## The hole this closes
 *
 * `POST /api/render/callback` creates the asset and answers Lambda in the same
 * request, and a freshly created Mux asset is never `ready` — ingest is
 * asynchronous and `createMuxAssetFromUrl` documents that its `status` is
 * `preparing` on the happy path. The callback refuses an asset that is already
 * `errored` by then, or that came back with no public playback id, which is
 * as much as anything inside that request can know. What it cannot know is
 * that an asset which looked fine went `errored` a minute later.
 *
 * Left alone, that composite sits in `previewVideoPlaybackId` waiting for an
 * administrator, and approval copies it to `sponsoredVideoPlaybackId`, and the
 * gesture page plays a video that does not exist. This sweep is what stops the
 * copy: a dead composite is cleared from the sponsorship *before* anybody can
 * approve it, using the same column and the same value
 * `hooks/invalidateComposedVideo` uses when the overlay changes, so the two
 * cannot disagree about what "there is no composite" looks like.
 *
 * ## Why the render row is often not marked `failed`
 *
 * Because it cannot be. `lib/renderState.ts` gives `ready` no outgoing edges —
 * a render that must be done again is a new job id, and re-opening a finished
 * row would let a second callback overwrite the first one's Mux ids — and the
 * callback marks a render `ready` as soon as Mux accepts the asset. So a
 * render whose asset dies afterwards is already terminal, and `canAdvance`
 * refuses `ready -> failed`.
 *
 * **So "marks a render failed when Mux reports the asset errored" holds only
 * where the state table allows it.** The state is advanced where the table
 * allows it — a render still `uploading`, which is what a crash between the Mux
 * create and the render update leaves behind — and where it does not, the
 * reason is recorded on the row anyway, because a `failureReason` beside a
 * `ready` state is exactly the honest description of what happened and is what
 * an operator has to go on. Widening the table instead would undo a
 * mutation-proven decision.
 *
 * ## Why this does not delete anything
 *
 * Deletion lives in `releaseAsset` and is gated on nothing being able to point
 * at the asset. A dead asset usually belongs to a sponsorship that is very
 * much alive, so this sweep clears the ledger (`muxAssetId`) and records the
 * id verbatim in `failureReason` rather than calling Mux a second way. An
 * `errored` asset holds no media; if Mux nevertheless bills for one, the id is
 * in the row for an operator. The alternative — a second deletion site with a
 * second guard — is how the one irreversible operation in this module ends up
 * with two sets of rules.
 */
/**
 * Why an asset will never play, or `null` if nothing says it will not.
 *
 * `null` from Mux — an asset it does not have — and `errored` are both
 * verdicts. `preparing` is not one, and neither is an outage, which never
 * reaches here: `readMuxAsset` throws for a refusal that is not a 404, so the
 * caller leaves the row alone rather than passing an absence in here.
 */
function unplayableReason(
  assetId: string,
  asset: Awaited<ReturnType<typeof readMuxAsset>>
): null | string {
  if (asset === null) {
    return `Mux no longer has asset ${assetId}.`;
  }

  if (asset.status !== "errored" && asset.playbackId) {
    return null;
  }

  return `Mux asset ${assetId} is not playable (status ${asset.status}, ${asset.playbackId === null ? "no public playback id" : "playback id present"}).`;
}

/**
 * Takes a dead composite off the sponsorship, and records it on the render.
 *
 * The sponsorship first, because it is the one with a public consequence:
 * until that write lands, an administrator's approval can still publish the
 * dead composite. Only the unpublished column is touched — a composite already
 * on a page is left alone for the reason `hooks/publishComposedVideo.ts` gives
 * about not swapping a paying sponsor's video out from a hook — and a render
 * whose playback id is not the one the sponsorship is holding leaves it alone
 * too, because that render is not the composite in question.
 *
 * `muxAssetId` is cleared in the same write as the reason, and the reason
 * names the id verbatim: the ledger means "an asset this application believes
 * is alive and has not deleted", and a dead one is neither. Clearing it is
 * also what stops every run from here to eternity asking Mux the same question
 * about the same corpse.
 */
async function recordUnplayable(
  payload: Payload,
  render: Render,
  sponsorship: null | Sponsorship,
  reason: string
): Promise<void> {
  const composed = render.muxPlaybackId;

  if (
    sponsorship !== null &&
    typeof composed === "string" &&
    composed !== "" &&
    sponsorship.previewVideoPlaybackId === composed
  ) {
    await payload.update({
      collection: "sponsorships",
      data: { previewVideoPlaybackId: null },
      id: sponsorship.id,
      overrideAccess: true,
    });
  }

  await payload.update({
    collection: "renders",
    data: {
      failureReason: reason,
      muxAssetId: null,
      ...(canAdvance(render.state, "failed") ? { state: "failed" } : {}),
    },
    id: render.id,
    overrideAccess: true,
  });

  payload.logger.error(
    `[expireSponsorships] ${reason} The composite from render job ${render.jobId} will not be published.`
  );
}

/**
 * Records that Mux has confirmed this asset is playable, so no later sweep
 * asks about it again.
 *
 * **Only `ready` settles, and the distinction is the whole of the guard.**
 * `unplayableReason` answers `null` for two different states — `ready`, which
 * is final, and `preparing`, which is the ordinary answer minutes after a
 * callback and may still turn into `errored`. Stamping a preparing asset would
 * take it out of the candidate set on the strength of an answer that has not
 * been given yet, and the composite that then died would sit in
 * `previewVideoPlaybackId` waiting for an administrator to publish a video
 * that does not exist. That is the failure this whole sweep exists to prevent,
 * reintroduced by the fix for a different one.
 *
 * A stamped render is never read again: the candidate query filters on this
 * column, which is what makes the sweep's cost proportional to new work rather
 * than to the product's whole history — and what makes it impossible for an
 * older render to wait behind a page of healthy ones for ever.
 */
async function settle(
  payload: Payload,
  render: Render,
  asset: Awaited<ReturnType<typeof readMuxAsset>>,
  report: SettlementReport
): Promise<void> {
  if (asset?.status !== "ready") {
    return;
  }

  await payload.update({
    collection: "renders",
    data: { settledAt: new Date().toISOString() },
    id: render.id,
    overrideAccess: true,
  });
  report.settled += 1;
}

/** The sponsorship a render was made for, or `null` if there is not one. */
async function sponsorshipOf(
  payload: Payload,
  render: Render
): Promise<null | Sponsorship> {
  const sponsorshipId = relationId(render.sponsorship);

  return sponsorshipId === null
    ? null
    : await findSponsorship(payload, sponsorshipId);
}

export async function settleComposedVideos(
  payload: Payload
): Promise<SettlementReport> {
  const report: SettlementReport = {
    checked: 0,
    settled: 0,
    unplayable: 0,
    unreadable: 0,
  };

  for (const render of await unsettledRendersHoldingAssets(payload)) {
    const id = assetId(render);
    const sponsorship = await sponsorshipOf(payload, render);

    // A sponsorship nothing can come back from is `expireSponsorships`'s
    // business, and its asset is about to be deleted; asking Mux whether it is
    // playable is a request for an answer nobody acts on.
    if (
      id === null ||
      (sponsorship !== null && TERMINAL_STATUSES.has(sponsorship.status))
    ) {
      continue;
    }

    report.checked += 1;

    let asset: Awaited<ReturnType<typeof readMuxAsset>>;

    try {
      asset = await readMuxAsset(id);
    } catch (error) {
      report.unreadable += 1;
      payload.logger.error(
        { err: error },
        `[expireSponsorships] Could not ask Mux about asset ${id} for render job ${render.jobId}; it is left exactly as it was`
      );

      continue;
    }

    const reason = unplayableReason(id, asset);

    if (reason === null) {
      await settle(payload, render, asset, report);

      continue;
    }

    report.unplayable += 1;
    await recordUnplayable(payload, render, sponsorship, reason);
  }

  payload.logger.info(
    `[expireSponsorships] Checked ${report.checked} Mux asset(s); ${report.settled} settled, ${report.unplayable} unplayable, ${report.unreadable} could not be read`
  );

  return report;
}
