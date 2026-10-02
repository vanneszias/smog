import { stubTemplate } from "./stub";

export interface AdminNewSponsorshipProps {
  contact: { company: string | null; email: string; name: string };
  displayName: string;
  /** Each gesture of the payment with its amount in integer cents. */
  gestures: { amountCents: number; name: string | null }[];
  /** The invoice request, or `null` for none. */
  invoice: { email: string; name: string; vatNumber: string } | null;
  kind: "initial" | "renewal";
  paymentId: string;
  totalCents: number;
  /** `/admin/sponsorships/<id>`, or `/admin/sponsorships?payment=<id>` for several. */
  url: string;
}

/**
 * `admin_new_sponsorship` (E-06): to every admin after payment, with the invoice box (`admin_new_sponsorship:<paymentId>:<adminId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const adminNewSponsorship = stubTemplate<AdminNewSponsorshipProps>(
  "adminNewSponsorship"
);
