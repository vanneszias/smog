import { stubTemplate } from "./stub";

export interface RenewalReminderProps {
  /** `sponsorship.ends_at` (ISO 8601). */
  endsAt: string;
  gestureName: string | null;
  name: string;
  /** `/sponsor/renew?token=<raw token>`. */
  url: string;
}

/**
 * `renewal_reminder` (E-05): 30 days before the end, with the renewal link (bug 2; `renewal_reminder:<sponsorshipId>:<endsAt>`).
 * A stub until phase 6 task 2 designs it.
 */
export const renewalReminder =
  stubTemplate<RenewalReminderProps>("renewalReminder");
