import { stubTemplate } from "./stub";

export interface AdminRefundNeededProps {
  /**
   * In integer cents: the share to refund (late), what Mollie received
   * (mismatch, paid twice), or what the bank charged back (chargeback).
   */
  amountCents: number;
  paymentId: string;
  /**
   * Late (the gesture was taken), an amount mismatch, paid twice, or a
   * chargeback (sent as `admin_chargeback:<paymentId>:<cents>:<adminId>`).
   */
  reason: "late" | "mismatch" | "double" | "chargeback";
  /** The payment's page in the Mollie dashboard. */
  url: string;
}

/**
 * `admin_refund_needed` (E-08): to every admin when a payment must be refunded by hand (`admin_refund_needed:<paymentId>:<adminId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const adminRefundNeeded =
  stubTemplate<AdminRefundNeededProps>("adminRefundNeeded");
