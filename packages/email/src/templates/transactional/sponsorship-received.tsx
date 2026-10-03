import { stubTemplate } from "./stub";

export interface SponsorshipReceivedProps {
  /** The name shown in the video. */
  displayName: string;
  /** The gesture's name; `null` falls back to `email.common.yourGesture` (bug 28). */
  gestureName: string | null;
  /** The sponsor's contact name. */
  name: string;
}

/**
 * `sponsorship_received` (E-02): one per sponsorship after payment (`sponsorship_received:<sponsorshipId>`).
 * A stub until phase 6 task 2 designs it.
 */
export const sponsorshipReceived = stubTemplate<SponsorshipReceivedProps>(
  "sponsorshipReceived"
);
