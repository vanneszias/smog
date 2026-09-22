import type { SponsorshipStatus } from "@smog/config";
import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../components/Badge";
import { SPONSORSHIP_STATUS_LABELS } from "../vocabulary";

/**
 * Re-exported from its original home so no existing call site changes.
 * The labels themselves now live in `../vocabulary`, the one module in this
 * package `packages/ui-native` can also import: this file reaches `Badge.tsx`
 * and, through it, React DOM, which a React Native bundle cannot load.
 */
export { SPONSORSHIP_STATUS_LABELS } from "../vocabulary";

/*
 * Typed as `Record<SponsorshipStatus, …>` on purpose: the seven statuses come
 * from `@smog/config`, and an eighth added there fails `check-types` here
 * rather than shipping a badge that reads `pending_resubmission` at a sponsor.
 * The list is imported, never copied — see the note in
 * `packages/config/src/sponsorships.ts`.
 */
const STATUS_VARIANTS: Record<
  SponsorshipStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  pending_payment: "warning",
  pending_approval: "warning",
  pending_resubmission: "warning",
  active: "success",
  expired: "neutral",
  rejected: "danger",
  cancelled: "danger",
};

const isKnownStatus = (status: string): status is SponsorshipStatus =>
  Object.hasOwn(SPONSORSHIP_STATUS_LABELS, status);

export type StatusBadgeProps = Omit<BadgeProps, "children" | "variant"> & {
  /*
   * `string & Record<never, never>` keeps the seven literals in a caller's
   * autocomplete while still accepting the arbitrary string that comes back
   * from a database row. Widening it to plain `string` would lose the
   * suggestions; narrowing it to the union would make an unknown status a
   * type error at the one call site that cannot avoid one.
   */
  status: SponsorshipStatus | (string & Record<never, never>);
  /** Override individual labels, for a caller translating the interface. */
  labels?: Partial<Record<SponsorshipStatus, string>>;
};

/**
 * A sponsorship's status, in words a sponsor can read.
 *
 * Two things this must not do. It must not render `pending_resubmission` at a
 * human, and it must not throw on a status nobody has heard of: these strings
 * live in production rows and in the Mollie flow, and a row written by an
 * older deploy is not a reason to lose the page. An unknown status falls back
 * to the raw value in a neutral badge — visibly odd, which is the point, and
 * still readable.
 *
 * The colours carry the meaning that the label already says, and they group:
 * every `pending_*` is a warning, `rejected` and `cancelled` are failures,
 * `active` is a success, and `expired` is **neutral** — a sponsorship that ran
 * its course is not a failure, and painting it red says something went wrong
 * when nothing did.
 */
export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, labels, ...props }, ref) => {
    const variant = isKnownStatus(status) ? STATUS_VARIANTS[status] : "neutral";
    const label = isKnownStatus(status)
      ? (labels?.[status] ?? SPONSORSHIP_STATUS_LABELS[status])
      : status;

    return (
      <Badge ref={ref} variant={variant} {...props}>
        {label}
      </Badge>
    );
  }
);

StatusBadge.displayName = "StatusBadge";
