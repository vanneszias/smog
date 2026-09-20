import { SPONSORSHIP_STATUSES, type SponsorshipStatus } from "@smog/config";
import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../components/Badge";

interface StatusStyle {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
}

/*
 * Typed as `Record<SponsorshipStatus, …>` on purpose: the seven statuses come
 * from `@smog/config`, and an eighth added there fails `check-types` here
 * rather than shipping a badge that reads `pending_resubmission` at a sponsor.
 * The list is imported, never copied — see the note in
 * `packages/config/src/sponsorships.ts`.
 */
const STATUS_STYLES: Record<SponsorshipStatus, StatusStyle> = {
  pending_payment: { label: "Wacht op betaling", variant: "warning" },
  pending_approval: { label: "Wacht op goedkeuring", variant: "warning" },
  pending_resubmission: { label: "Wacht op aanpassing", variant: "warning" },
  active: { label: "Actief", variant: "success" },
  expired: { label: "Verlopen", variant: "neutral" },
  rejected: { label: "Afgewezen", variant: "danger" },
  cancelled: { label: "Geannuleerd", variant: "danger" },
};

/**
 * The Dutch label for each status, exported so a page can say the same words
 * in a heading, a filter or a table cell that the badge says.
 */
export const SPONSORSHIP_STATUS_LABELS = Object.fromEntries(
  SPONSORSHIP_STATUSES.map((status) => [status, STATUS_STYLES[status].label])
) as Record<SponsorshipStatus, string>;

const isKnownStatus = (status: string): status is SponsorshipStatus =>
  Object.hasOwn(STATUS_STYLES, status);

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
    const style: StatusStyle = isKnownStatus(status)
      ? STATUS_STYLES[status]
      : { label: status, variant: "neutral" };
    const label =
      (isKnownStatus(status) ? labels?.[status] : undefined) ?? style.label;

    return (
      <Badge ref={ref} variant={style.variant} {...props}>
        {label}
      </Badge>
    );
  }
);

StatusBadge.displayName = "StatusBadge";
