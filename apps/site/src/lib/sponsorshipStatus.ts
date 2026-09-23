import type { SponsorshipStatus } from "@smog/config/sponsorships";

/**
 * Which status may follow which.
 *
 * Without this table every transition between the seven values would be legal.
 * This is the table that closes that, and it is data rather than a chain of
 * `if`s so that the whole policy can be read, tested and diffed in one place.
 *
 * A status staying put is allowed by `canTransition` rather than by a
 * self-edge here, because *every* update re-submits `status`: renaming a
 * sponsor would otherwise be refused as an illegal move to where it
 * already is.
 *
 * `expired` and `cancelled` have empty lists on purpose. They are answers,
 * not waypoints — a sponsor who wants another term buys another
 * sponsorship, which is a new row with its own payment. Re-opening one
 * would silently reuse a paid-for record.
 *
 * `rejected` is *not* one of them, however terminal it looks. An administrator
 * may re-open a rejected sponsorship for a re-edit, which is established
 * sponsorship behaviour, so it wins over a tidier table. Note it is the only
 * edge out: a rejected sponsorship cannot be approved straight back to `active`
 * without passing through the queue again.
 *
 * The subpath import rather than the `@smog/config` barrel is the same
 * constraint `collections/Sponsorships.ts` documents: this module reaches
 * `payload.config.ts` through the hook, and the Payload CLI's loader
 * mangles the barrel's relative re-exports.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<SponsorshipStatus, readonly SponsorshipStatus[]>
> = {
  // The webhook advances this one; the sponsor or a stale-payment sweep
  // cancels it. It cannot go straight to `active`: approval is a person.
  pending_payment: ["pending_approval", "cancelled"],
  // An admin approves, rejects, or asks for changes.
  pending_approval: ["active", "rejected", "pending_resubmission"],
  // The sponsor edits through the re-edit token and it returns to the queue.
  pending_resubmission: ["pending_approval", "cancelled"],
  // Runs its term, or is pulled.
  active: ["expired", "cancelled"],
  expired: [],
  rejected: ["pending_resubmission"],
  cancelled: [],
};

/** Whether `from` may become `to`. A status staying put always may. */
export function canTransition(
  from: SponsorshipStatus,
  to: SponsorshipStatus
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}
