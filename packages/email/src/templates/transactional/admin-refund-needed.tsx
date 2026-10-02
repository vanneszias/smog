import { stubTemplate } from "./stub";

export interface AdminRefundNeededProps {
  /** The amount Mollie received, in integer cents. */
  amountCents: number;
  paymentId: string;
  /** Late (the gesture was taken), an amount mismatch, or paid twice. */
  reason: "late" | "mismatch" | "double";
  /** The payment's page in the Mollie dashboard. */
  url: string;
}

/**
 * `admin_refund_needed` (E-08): to every admin when a payment must be refunded by hand (`admin_refund_needed:<paymentId>:<adminId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const adminRefundNeeded =
  stubTemplate<AdminRefundNeededProps>("adminRefundNeeded");
