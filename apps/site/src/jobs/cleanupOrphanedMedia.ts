import type { Payload } from "payload";
import { SPONSOR_LOGO_PREFIX } from "@/lib/sponsorDraft";

/**
 * Removes a sponsor logo that was stored and then never attached to anything.
 *
 * Stage 7 owns the scheduler. **This module owns the operation**, on the
 * precedent the other three jobs set.
 *
 * ## A sibling, not an extension of `cleanupStalePayments`
 *
 * The plan says to decide and say which. This is a sibling module, registered
 * inside the same hourly `cleanup-stale-payments` task, and the split is along
 * the line the other files in this directory already draw: a module is an
 * operation, and these are two operations with nothing in common but a
 * cadence. They read different collections, they are dangerous in different
 * ways — one cancels a purchase, the other destroys a file — and
 * `cleanupStalePayments.ts`'s doc block is a long argument about Mollie that
 * has nothing to say about R2.
 *
 * Sharing the *task* rather than the module is what keeps the spec's four
 * tasks four, and it is the right cadence besides: hourly against a
 * twenty-four hour age bound means a stray upload survives at most a day.
 *
 * ## The gap this closes, recorded at Stage 5's exit and again in Stage 6
 *
 * `endpoints/sponsorships.ts` stores the logo at step 2 and writes the
 * sponsorship at checkout, and there is no transaction between them — so a
 * sponsor who uploads a logo and then closes the tab leaves a row in `media`
 * and an object in R2 that nothing will ever point at or ever delete. Stage 6
 * added a second source of the same shape: a re-edit that replaces
 * `overlayImage` strands the logo it replaced.
 *
 * ## The dangerous half is the timing, not the reachability
 *
 * **A sweep that runs while a sponsor is on step 3 of the wizard must not
 * delete the logo they just uploaded.** At that moment the logo is *exactly*
 * as unreferenced as an abandoned one: the id is sitting in a hidden field in
 * a form nobody has submitted, and no query can see it. Reachability is
 * therefore not sufficient evidence and never will be, so the sweep is bounded
 * by **age** as well — a row younger than the window is left alone whatever
 * points at it, and the window is far longer than any wizard session.
 *
 * `createdAt` is Payload's own column and indexed, so the bound is the
 * candidate query rather than a filter over one.
 *
 * ## And it only ever looks at logos this application wrote
 *
 * `media` is a general collection. `media.create` is `isAdmin`, so an
 * administrator may upload anything to it — and an image they have uploaded
 * but not yet used is, again, exactly as unreferenced as an abandoned logo.
 * **A sweep that deleted every unreferenced row would delete their library**,
 * a day after they uploaded it, with no warning and no way back.
 *
 * So the candidate query is narrowed to the filenames this application writes.
 * `endpoints/sponsorships.ts` names every logo itself — a client-supplied name
 * is a client-supplied R2 key — which makes {@link SPONSOR_LOGO_PREFIX} an
 * invariant rather than a convention, and `lib/sponsorDraft.ts` holds it so
 * the two cannot drift.
 *
 * ## R2 comes after the row, by construction rather than by sequencing
 *
 * The sweep never touches R2. It deletes the `media` document, and
 * `@payloadcms/plugin-cloud-storage`'s `afterDelete` hook removes the object,
 * after the row is gone — because that is what `afterDelete` means — and
 * swallowing its own failures because the row is already deleted and throwing
 * would only hide that.
 *
 * That ordering is the one worth having. The other way round — R2 first —
 * leaves a `media` row whose file is gone if the delete then fails: a broken
 * image on a sponsor's page rather than a stray object in a bucket. An object
 * that is already missing costs nothing: `bucket.delete` on a key that is not
 * there is a no-op, and the hook catches anything else.
 */

/**
 * How old an unreferenced logo must be before it is swept.
 *
 * Twenty-four hours. The bound is on the wizard, not on R2: a sponsor moves
 * from the upload at step 2 to the checkout at step 3 in minutes, and
 * `SPONSOR_DRAFT_TTL_SECONDS` expires the draft that carries the id long
 * before this. A day is far more room than any of that needs and still short
 * enough that a bucket does not fill with rubbish.
 *
 * It is deliberately *not* tuned to the shortest safe value. The cost of
 * waiting is a stray object for a few more hours; the cost of being wrong is a
 * sponsor's logo deleted out from under a checkout they are paying for.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How many rows one run takes on.
 *
 * Bounded for the reason the other jobs record: an unbounded read has already
 * broken this suite once, at 132 bound parameters against D1's documented cap
 * of 100.
 *
 * Oldest first, so a backlog cannot leave the oldest orphan behind every newer
 * one — the starvation Stage 6 flagged for the readiness sweep, avoided here
 * by ordering rather than by a column, because a swept row is deleted and so
 * leaves the candidate set by definition.
 */
const PAGE = 200;

/** What one run did, for the scheduler to log and a test to assert on. */
interface OrphanReport {
  deleted: number;
  /** Rows a sponsorship still points at, or that are too young to judge. */
  kept: number;
  failures: number;
}

/** Whether any sponsorship, in any status, still points at this row. */
async function isReferenced(
  payload: Payload,
  mediaId: number | string
): Promise<boolean> {
  /*
   * Every status, deliberately. A cancelled or expired sponsorship is still
   * the record of what a sponsor was sold and what an administrator approved,
   * and `lib/renderPreview.ts` and the admin panel both render its overlay —
   * so its logo is referenced in the only sense that matters here. Narrowing
   * this to `active` would delete the evidence behind every finished
   * sponsorship a day after it ended.
   */
  const { totalDocs } = await payload.find({
    collection: "sponsorships",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { overlayImage: { equals: mediaId } },
  });

  return totalDocs > 0;
}

export async function cleanupOrphanedMedia(
  payload: Payload,
  now: Date
): Promise<OrphanReport> {
  const report: OrphanReport = { deleted: 0, failures: 0, kept: 0 };

  const { docs: candidates } = await payload.find({
    collection: "media",
    depth: 0,
    limit: PAGE,
    overrideAccess: true,
    sort: "createdAt",
    where: {
      and: [
        {
          createdAt: {
            less_than: new Date(now.getTime() - WINDOW_MS).toISOString(),
          },
        },
        // `like` is a substring match on this adapter, so it is a superset of
        // what is wanted; the anchored check below is what narrows it. Both,
        // because the query is what keeps an administrator's library out of
        // the page in the first place.
        { filename: { like: SPONSOR_LOGO_PREFIX } },
      ],
    },
  });

  for (const media of candidates) {
    if (!media.filename?.startsWith(SPONSOR_LOGO_PREFIX)) {
      report.kept += 1;
      continue;
    }

    if (await isReferenced(payload, media.id)) {
      report.kept += 1;
      continue;
    }

    try {
      /*
       * The row, and nothing else. The storage plugin's `afterDelete` takes
       * the object out of R2 once this has landed; see the note at the top of
       * this file for why that order is the one worth having.
       */
      await payload.delete({
        collection: "media",
        id: media.id,
        overrideAccess: true,
      });
      report.deleted += 1;
    } catch (error) {
      // One row that cannot be deleted must not end the sweep: nothing else
      // will ever look at the rows behind it, so giving up here is giving up
      // on them for good.
      report.failures += 1;
      payload.logger.error(
        { err: error },
        `[cleanupOrphanedMedia] Could not delete unreferenced media ${media.id}; it stays until the next sweep`
      );
    }
  }

  payload.logger.info(
    `[cleanupOrphanedMedia] Deleted ${report.deleted} unreferenced logo(s); ${report.kept} kept, ${report.failures} failure(s)`
  );

  return report;
}
