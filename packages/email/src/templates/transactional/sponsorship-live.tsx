import { stubTemplate } from "./stub";

export interface SponsorshipLiveProps {
  displayName: string;
  /** `sponsorship.ends_at` (ISO 8601). */
  endsAt: string;
  gestureName: string | null;
  name: string;
  /** `sponsorship.starts_at` (ISO 8601). */
  startsAt: string;
  /** The gesture's page. */
  url: string;
}

/**
 * `sponsorship_live` (E-04): after approval, with the stored dates (bug 1; `sponsorship_live:<sponsorshipId>:<startsAt>`).
 * A stub until phase 6 task 2 designs it.
 */
export const sponsorshipLive =
  stubTemplate<SponsorshipLiveProps>("sponsorshipLive");
