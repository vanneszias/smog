/**
 * `sponsorships.quote`: the price of a selection, from `priceSponsorship`
 * (the function the wizard and the checkout use), and which of the
 * gestures cannot be sponsored now (one availability read).
 */
import type { Db } from "@smog/db/client";
import type { Quote } from "../schema/availability";
import { priceSponsorship } from "../schema/pricing";
import { getAvailability } from "./availability";

export async function getQuote(
  db: Db,
  input: { gestureIds: readonly string[]; logo: boolean }
): Promise<Quote> {
  const { gestureIds, logo } = input;
  const price = priceSponsorship({ count: gestureIds.length, logo });
  const availability = await getAvailability(db, gestureIds);
  return {
    currency: "EUR",
    items: gestureIds.map((gestureId, index) => {
      const item = price.items[index] ?? {
        amountCents: price.perGestureCents,
        includesLogo: logo,
      };
      return { ...item, gestureId };
    }),
    totalCents: price.totalCents,
    unavailable: availability
      .filter((item) => item.state !== "available")
      .map((item) => item.gestureId),
  };
}
