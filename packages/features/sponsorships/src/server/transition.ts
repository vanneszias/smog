/**
 * The only writer of `sponsorship.status` (global constraint; a source scan
 * enforces it). Every status change is `transitionStatements(…)` in a D1
 * batch: an in-batch guard that the row still has the status the caller
 * read, the update, and its `sponsorship_event`, so the change and its
 * trail land together or not at all. A guard that fires is a lost race
 * (`isStaleTransition`), which callers answer as `INVALID_STATE stale`.
 */
import {
  failWhen,
  type SponsorshipEventType,
  type SponsorshipStatus,
  type Statement,
  sponsorship,
  sponsorshipEvent,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { and, eq, type SQL, sql } from "drizzle-orm";
import {
  SPONSORSHIP_EVENT_DATA_SCHEMAS,
  type SponsorshipEventData,
} from "../schema/events";
import { type TransitionEvent, transition } from "./transition-table";

/** The guard name of a transition whose row moved on. */
export const STALE_GUARD = "sponsorship-stale";

/** `transition(from, event)` is `null`: nothing was built. */
export class InvalidTransitionError extends Error {
  readonly event: SponsorshipEventType;
  readonly from: SponsorshipStatus;

  constructor(from: SponsorshipStatus, event: SponsorshipEventType) {
    super(`[sponsorships] ${event} is not allowed from ${from}`);
    this.event = event;
    this.from = from;
    this.name = "InvalidTransitionError";
  }
}

/** Event data that does not match its type's schema: nothing was built. */
export class SponsorshipEventDataError extends Error {
  readonly type: SponsorshipEventType;

  constructor(type: SponsorshipEventType, cause: unknown) {
    super(`[sponsorships] Invalid event data for ${type}`, { cause });
    this.type = type;
    this.name = "SponsorshipEventDataError";
  }
}

/** Whether a batch failed because a transition's row moved on. */
export function isStaleTransition(error: unknown): boolean {
  return toGuardFailure(error)?.guard === STALE_GUARD;
}

type Patchable =
  | "displayName"
  | "endsAt"
  | "logoKey"
  | "reminderSentAt"
  | "startsAt"
  | "videoAssetId"
  | "videoPlaybackId";

/** Columns a transition may set with the status (never the status itself). */
export type SponsorshipPatch = {
  [K in Patchable]?: (typeof sponsorship.$inferInsert)[K] | SQL;
};

export interface TransitionInput<E extends TransitionEvent> {
  /** The acting admin, or `null` for the sponsor, Mollie or a job. */
  actorId: string | null;
  data: SponsorshipEventData<E>;
  event: E;
  /** The status the caller read; the batch fails if it changed since. */
  from: SponsorshipStatus;
  now: Date;
  patch?: SponsorshipPatch;
  sponsorshipId: string;
}

function parseData(type: SponsorshipEventType, data: unknown): unknown {
  const parsed = SPONSORSHIP_EVENT_DATA_SCHEMAS[type].safeParse(data);
  if (!parsed.success) {
    throw new SponsorshipEventDataError(type, parsed.error);
  }
  return parsed.data;
}

function insertEvent(
  db: Db,
  values: {
    actorId: string | null;
    data: unknown;
    now: Date;
    sponsorshipId: string;
    type: SponsorshipEventType;
  }
): Statement {
  return db.insert(sponsorshipEvent).values({
    actorId: values.actorId,
    createdAt: values.now,
    data: values.data,
    id: newId(),
    sponsorshipId: values.sponsorshipId,
    type: values.type,
  });
}

/**
 * `[guard, update, event]` for one transition, for a D1 batch:
 * - `failWhen` the row's status is no longer `from` (`STALE_GUARD`);
 * - the update of the status, `updated_at` and `patch` (also conditioned
 *   on `from`);
 * - the `sponsorship_event`, its data validated per type.
 * Throws `InvalidTransitionError` when the table refuses `from → event`,
 * and `SponsorshipEventDataError` for invalid data, before anything runs.
 */
export function transitionStatements<E extends TransitionEvent>(
  db: Db,
  input: TransitionInput<E>
): [Statement, Statement, Statement] {
  const { actorId, event, from, now, sponsorshipId } = input;
  const to = transition(from, event);
  if (to === null) {
    throw new InvalidTransitionError(from, event);
  }
  const patch = input.patch ?? {};
  if (Object.hasOwn(patch, "status") || Object.hasOwn(patch, "updatedAt")) {
    throw new TypeError(
      "[sponsorships] A transition patch never sets the status or updated_at"
    );
  }
  const data = parseData(event, input.data);
  const current = sql`SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.id} = ${sponsorshipId} AND ${sponsorship.status} = ${from}`;
  return [
    failWhen(db, STALE_GUARD, sql`NOT EXISTS (${current})`),
    db
      .update(sponsorship)
      .set({ ...patch, status: to, updatedAt: now })
      .where(
        and(eq(sponsorship.id, sponsorshipId), eq(sponsorship.status, from))
      ),
    insertEvent(db, { actorId, data, now, sponsorshipId, type: event }),
  ];
}

/** The events that only go into the trail (no status change). */
export type TrailEvent = Exclude<
  SponsorshipEventType,
  TransitionEvent | "legacy"
>;

const TRAIL_EVENTS: ReadonlySet<SponsorshipEventType> = new Set<TrailEvent>([
  "created",
  "refund_needed",
  "render_started",
  "token_issued",
]);

/**
 * A trail-only `sponsorship_event` (`created`, `render_started`,
 * `refund_needed`, `token_issued`), validated per type. A transition
 * event is refused: it is written only by `transitionStatements`, with
 * its status change. `legacy` rows come from the data migration only.
 */
export function eventStatement<T extends TrailEvent>(
  db: Db,
  input: {
    actorId: string | null;
    data: SponsorshipEventData<T>;
    now: Date;
    sponsorshipId: string;
    type: T;
  }
): Statement {
  const type: SponsorshipEventType = input.type;
  if (!TRAIL_EVENTS.has(type)) {
    throw new TypeError(
      `[sponsorships] ${type} is not a trail-only event; use transitionStatements`
    );
  }
  return insertEvent(db, { ...input, data: parseData(type, input.data) });
}
