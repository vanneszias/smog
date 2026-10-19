import type { SponsorshipTokenPurpose, Statement } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage } from "@smog/jobs";
import type { MollieFetch, MolliePayment } from "@smog/payments";
import { implementRpc, requireAdmin } from "@smog/rpc";
import type { InvalidStateReason } from "@smog/sponsorships/schema";
import type { MuxFetch } from "@smog/video";
import { ADMIN_PROCEDURE_KINDS, adminContract } from "../contract";
import { adminGuard } from "./guard";

/**
 * The one builder of every admin procedure: the admin contract, the rpc
 * context with `logErrors`, `requireAdmin` (`UNAUTHORIZED` for guests,
 * `FORBIDDEN` for users) and the audit guard. The role comes from the
 * session, which Better Auth reads from D1 on every request, so a demotion
 * applies at once (ruling 10). `context.user` is the acting admin. The
 * guard enforces each procedure's kind (`ADMIN_PROCEDURES` in its slice):
 * reads cannot write, and a mutation must build its mapped audit entry
 * with `auditStatement(context.db, …)` or `writeAudit(context.db, …)`.
 */
export const adminProcedure = implementRpc(adminContract)
  .use(requireAdmin)
  .use(adminGuard(ADMIN_PROCEDURE_KINDS));

/** Something to enqueue once a batch committed (phase 6 ruling 8). */
export type AdminAfterCommit =
  | { email: OutboxEmail; kind: "email" }
  | { event: EventMessage; kind: "event" };

/** One D1 batch of a sponsorship action and what follows its commit. */
export interface SponsorshipPlan {
  after: AdminAfterCommit[];
  statements: Statement[];
}

/**
 * A plan that issues a link. `url` (and the raw token inside it) is for
 * the admin's copy dialog only: never in audit data, an event or a log.
 */
export interface SponsorshipLinkPlan extends SponsorshipPlan {
  /** Epoch ms. */
  expiresAt: number;
  url: string;
}

interface ActorInput {
  actorId: string;
  now: Date;
  sponsorshipId: string;
}

interface PaymentActionInput {
  actorId: string;
  now: Date;
  paymentId: string;
}

/**
 * The sponsorship operations of `@smog/sponsorships/server` (phase 6
 * rulings 1 and 14), injected by `@smog/api`: each reads, checks and
 * returns the statements of one D1 batch, to which the admin appends its
 * audit entries. They throw a refusal that `refusalOf` reads.
 */
export interface AdminSponsorshipServices {
  approve: (
    db: Db,
    input: ActorInput & { siteUrl: string }
  ) => Promise<SponsorshipPlan>;
  cancelPayment: (
    db: Db,
    input: PaymentActionInput
  ) => Promise<SponsorshipPlan & { sponsorshipIds: string[] }>;
  forceExpire: (
    db: Db,
    input: ActorInput
  ) => Promise<SponsorshipPlan & { muxAssetId: string | null }>;
  markPaid: (
    db: Db,
    input: PaymentActionInput & { note?: string }
  ) => Promise<SponsorshipPlan & { sponsorshipIds: string[] }>;
  recordRefund: (
    db: Db,
    input: { now: Date; payment: MolliePayment; paymentId: string }
  ) => Promise<
    SponsorshipPlan & { amountCents: number; refundedCents: number }
  >;
  /**
   * What a failed operation stands for: `notFound`, an `INVALID_STATE`
   * reason (a lost race is `stale`), or `null` for any other error.
   */
  refusalOf: (error: unknown) => InvalidStateReason | "notFound" | null;
  regenerateToken: (
    db: Db,
    input: ActorInput & {
      purpose: SponsorshipTokenPurpose;
      siteUrl: string;
    }
  ) => Promise<SponsorshipLinkPlan>;
  reject: (
    db: Db,
    input: ActorInput & { reason: string }
  ) => Promise<SponsorshipPlan>;
  requestChanges: (
    db: Db,
    input: ActorInput & { siteUrl: string }
  ) => Promise<SponsorshipLinkPlan>;
  /**
   * The retry of a failed render (A-27): `render_failed → rendering` and
   * the next job; `after` holds its `render.requested`.
   */
  retryRender: (
    db: Db,
    input: ActorInput
  ) => Promise<SponsorshipPlan & { attempt: number; renderJobId: string }>;
  /**
   * `settlePayment` (ruling 6): what the webhook does with Mollie's
   * payment. Its own batches; the caller enqueues `events` and `notify`.
   * `null` when the payment is not ours.
   */
  settle: (
    db: Db,
    input: {
      /** Written in the settlement's final batch (the admin's audit entries). */
      extra?: Statement[];
      now: Date;
      payment: MolliePayment;
    }
  ) => Promise<{
    events: EventMessage[];
    notify: OutboxEmail[];
    outcome: string;
  } | null>;
}

/**
 * What `@smog/api` injects: logic from other features' servers (a feature
 * never imports another feature's `./server`).
 */
export interface AdminDeps {
  /** `@smog/gestures/server`: starts a new catalogue version (Task 2). */
  bumpCatalogVersion: (kv: KVNamespace) => Promise<string>;
  /**
   * The `fetch` the Mollie client uses (phase 6 task 6). Unset in
   * production (the Worker's `fetch`, to `MOLLIE_API_URL`); the tests
   * inject the in-memory Mollie fake (`@smog/payments/testing`).
   */
  mollieFetch?: MollieFetch;
  /**
   * The `fetch` the Mux client uses (Task 3). Unset in production (the
   * Worker's `fetch`, to `MUX_API_URL`); the tests inject the in-memory
   * Mux fake (`@smog/video/testing`).
   */
  muxFetch?: MuxFetch;
  /** `@smog/sponsorships/server` (phase 6 task 6). */
  sponsorships: AdminSponsorshipServices;
}
