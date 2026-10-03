import type { Availability } from "../schema/availability";
import { useAvailability } from "./use-availability";

/** The gesture fields the CTA reads (a `GestureDetail` fits). */
export interface SponsorCtaGesture {
  id: string;
  /** The detail's own credit while a sponsorship runs. */
  sponsor: { name: string; until: number } | null;
}

/** What the gesture's sponsor card says (ruling 13, L-17). */
export type SponsorCtaView =
  | { kind: "available" }
  | { kind: "pending" }
  | { endsAt: number | null; kind: "sponsored"; name: string };

export interface SponsorCtaOptions {
  /**
   * Whether the "Sponsor now" link may show at all (mobile: not on iOS
   * without `SPONSOR_LINK_IN_APP`, App Store guideline 3.1.1). Default true.
   */
  linkShown?: boolean;
}

/**
 * The CTA's decision table, pure (the site and the app render it):
 * - no answer yet, a failed read, or an answer without this gesture: the
 *   detail's own credit stands (so the page never waits on the read and
 *   never loses the credit), else nothing;
 * - `available`: the call to action, only while checkout is on and the
 *   link may show;
 * - `pending`: "being sponsored";
 * - `sponsored`: the answer's name (else the credit's) and end date;
 * - `unavailable` (unknown or unpublished): nothing.
 */
export function sponsorCtaView(
  gesture: SponsorCtaGesture,
  availability: Availability | undefined,
  { linkShown = true }: SponsorCtaOptions = {}
): SponsorCtaView | null {
  const item = availability?.items.find(
    (entry) => entry.gestureId === gesture.id
  );
  if (!(availability && item)) {
    return gesture.sponsor
      ? {
          endsAt: gesture.sponsor.until,
          kind: "sponsored",
          name: gesture.sponsor.name,
        }
      : null;
  }
  switch (item.state) {
    case "available":
      return availability.checkoutEnabled && linkShown
        ? { kind: "available" }
        : null;
    case "pending":
      return { kind: "pending" };
    case "sponsored":
      return {
        endsAt: item.endsAt ?? null,
        kind: "sponsored",
        name: item.sponsorName ?? gesture.sponsor?.name ?? "",
      };
    default:
      return null;
  }
}

/**
 * The gesture CTA's view model, headless: `sponsorships.availability` for
 * this one gesture through `sponsorCtaView`. Both apps keep only markup.
 */
export function useSponsorCta(
  gesture: SponsorCtaGesture,
  options: SponsorCtaOptions = {}
): SponsorCtaView | null {
  const availability = useAvailability([gesture.id]);
  return sponsorCtaView(gesture, availability.data, options);
}
