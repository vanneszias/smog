/**
 * The retirement of the render states (phase 10b task 9, owner-confirmed).
 * Nothing renders any more: the sponsor message is an end card over the
 * gesture's own video. A sponsorship that was already in `rendering` or
 * `render_failed` when the pipeline was removed would wait for a render
 * that can never come, so the hourly stale sweep moves it to `in_review`
 * (the admin then approves or rejects it like any other): one D1 batch per
 * row, the transition `render_succeeded` with `retired: true` in its trail
 * (the actor is null: the system), and its still `queued`/`running`
 * `render_job` rows closed as `failed`. A row keeps the rendered video it
 * may have (`video_playback_id`); the render columns and the `render_job`
 * table are history and stay (migrations are append-only).
 */
import {
  inList,
  renderJob,
  type SponsorshipStatus,
  type Statement,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, asc, eq, not } from "drizzle-orm";
import { isStaleTransition, transitionStatements } from "./transition";

/** The statuses only the retired pipeline produced. */
export const RETIRED_RENDER_STATUSES = [
  "rendering",
  "render_failed",
] as const satisfies readonly SponsorshipStatus[];

/** The error stored on a render job the retirement closes. */
export const RENDER_RETIRED_ERROR = "render pipeline retired";

/** Rows moved per run; whatever is left waits for the next hour. */
const RETIRE_PAGE_SIZE = 100;
const RETIRE_MAX_PAGES = 10;

export interface RetireRenderResult {
  /** Sponsorships moved from a render state to `in_review`. */
  retired: number;
  /** Rows whose batch failed (logged; the next run retries). */
  retireFailed: number;
}

/**
 * Moves every `rendering` / `render_failed` sponsorship to `in_review`
 * (see the module comment). Idempotent: a row another writer moved first is
 * a lost race and skipped.
 */
export async function retireRenderStates({
  db,
  now,
}: {
  db: Db;
  now: Date;
}): Promise<RetireRenderResult> {
  const result: RetireRenderResult = { retired: 0, retireFailed: 0 };
  const skip: string[] = [];
  for (let round = 0; round < RETIRE_MAX_PAGES; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each page reads what the last one left.
    const rows = await db
      .select({ id: sponsorship.id, status: sponsorship.status })
      .from(sponsorship)
      .where(
        and(
          inList(sponsorship.status, RETIRED_RENDER_STATUSES),
          skip.length > 0 ? not(inList(sponsorship.id, skip)) : undefined
        )
      )
      .orderBy(asc(sponsorship.updatedAt), asc(sponsorship.id))
      .limit(RETIRE_PAGE_SIZE);
    for (const row of rows) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one record per D1 batch (spec §8.1), in order.
        await retireOne(db, row, now);
        result.retired += 1;
      } catch (error) {
        skip.push(row.id);
        if (!isStaleTransition(error)) {
          result.retireFailed += 1;
          console.error(
            `[sponsorships] Failed to retire the render state of ${row.id}:`,
            error
          );
        }
      }
    }
    if (rows.length < RETIRE_PAGE_SIZE) {
      break;
    }
  }
  if (result.retired > 0) {
    console.warn(
      `[sponsorships] Moved ${result.retired} sponsorship(s) from a retired render state to in_review`
    );
  }
  return result;
}

async function retireOne(
  db: Db,
  row: { id: string; status: SponsorshipStatus },
  now: Date
): Promise<void> {
  const [guard, update, event] = transitionStatements(db, {
    actorId: null,
    data: { retired: true },
    event: "render_succeeded",
    from: row.status,
    now,
    sponsorshipId: row.id,
  });
  const statements: [Statement, ...Statement[]] = [
    guard,
    update,
    event,
    db
      .update(renderJob)
      .set({
        error: RENDER_RETIRED_ERROR,
        finishedAt: now,
        status: "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(renderJob.sponsorshipId, row.id),
          inList(renderJob.status, ["queued", "running"])
        )
      ),
  ];
  await db.batch(statements);
}
