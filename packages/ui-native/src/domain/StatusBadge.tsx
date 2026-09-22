import type { SponsorshipStatus } from "@smog/config";
import { SPONSORSHIP_STATUS_LABELS } from "@smog/ui-web/vocabulary";
import { Badge, type BadgeProps } from "../components/Badge";

/*
 * Typed as `Record<SponsorshipStatus, …>` on purpose: the seven statuses come
 * from `@smog/config`, and an eighth added there fails `check-types` here
 * rather than shipping a badge that reads `pending_resubmission` at a
 * sponsor. Mirrors `packages/ui-web/src/domain/StatusBadge.tsx`'s own map;
 * the labels themselves come from `@smog/ui-web/vocabulary` rather than a
 * second copy of the seven Dutch strings.
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
   * from a database row — same reasoning as web's `StatusBadgeProps`.
   */
  status: SponsorshipStatus | (string & Record<never, never>);
  /** Override individual labels, for a caller translating the interface. */
  labels?: Partial<Record<SponsorshipStatus, string>>;
};

/**
 * A sponsorship's status, in words a sponsor can read.
 *
 * The native twin of `packages/ui-web/src/domain/StatusBadge.tsx`: it must
 * not render `pending_resubmission` at a human, and it must not throw on a
 * status nobody has heard of — a row written by an older deploy is not a
 * reason to lose the screen. An unknown status falls back to the raw value
 * in a neutral badge.
 */
export function StatusBadge({
  labels,
  status,
  testID = "root",
  ...props
}: StatusBadgeProps) {
  const variant = isKnownStatus(status) ? STATUS_VARIANTS[status] : "neutral";
  const label = isKnownStatus(status)
    ? (labels?.[status] ?? SPONSORSHIP_STATUS_LABELS[status])
    : status;

  return (
    <Badge testID={testID} variant={variant} {...props}>
      {label}
    </Badge>
  );
}
