import type { MolliePaymentStatus } from "./schema";

/** The `payment.status` values a Mollie status can lead to. */
export type MappedPaymentStatus =
  | "open"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

const STATUS_MAP = {
  authorized: "open",
  canceled: "canceled",
  expired: "expired",
  failed: "failed",
  open: "open",
  paid: "paid",
  pending: "open",
} as const satisfies Record<MolliePaymentStatus, MappedPaymentStatus>;

/**
 * Mollie's status as ours (`payment.status`). `pending` and `authorized`
 * are still open: nothing changes until Mollie says paid or ends it
 * (ruling 6). `refund_needed` is ours alone and never comes from Mollie.
 */
export function mapMollieStatus(
  status: MolliePaymentStatus
): MappedPaymentStatus {
  return STATUS_MAP[status];
}
