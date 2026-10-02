import { stubTemplate } from "./stub";

export interface PaymentConfirmedProps {
  /** This gesture's amount in integer cents (`payment_item.amount_cents`). */
  amountCents: number;
  /** For a renewal, the new end date (ISO 8601); `null` for an initial payment. */
  endsAt: string | null;
  gestureName: string | null;
  kind: "initial" | "renewal";
  name: string;
}

/**
 * `payment_confirmed` (E-03): one per gesture with that gesture's amount, also for renewals (`payment_confirmed:<paymentId>:<sponsorshipId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const paymentConfirmed =
  stubTemplate<PaymentConfirmedProps>("paymentConfirmed");
