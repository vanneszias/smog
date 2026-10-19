/**
 * The only place a sponsorship price is computed (spec §5.6, ruling 3):
 * integer cents, a flat price per gesture and year plus the logo add-on, no
 * VAT line and no discounts. The wizard shows this; the server recomputes
 * it and stores each item's amount; a renewal costs the same per gesture.
 */
import {
  LOGO_ADDON_PER_GESTURE_CENTS,
  MAX_GESTURES_PER_CHECKOUT,
  PRICE_PER_GESTURE_YEAR_CENTS,
} from "@smog/config/constants";

export interface PriceInput {
  /** How many gestures (1..`MAX_GESTURES_PER_CHECKOUT`). */
  count: number;
  /** Whether the sponsor's logo is shown (the add-on per gesture). */
  logo: boolean;
}

export interface PriceItem {
  amountCents: number;
  includesLogo: boolean;
}

export interface Price {
  /** One item per gesture, in the order asked. */
  items: PriceItem[];
  perGestureCents: number;
  totalCents: number;
}

/** A count outside 1..10 (or not an integer): nothing is priced. */
export class SponsorshipPricingError extends RangeError {
  constructor(count: number) {
    super(
      `[sponsorships] A checkout prices 1 to ${MAX_GESTURES_PER_CHECKOUT} gestures, got ${count}`
    );
    this.name = "SponsorshipPricingError";
  }
}

/** `count × (5000 + (logo ? 1000 : 0))` cents. */
export function priceSponsorship({ count, logo }: PriceInput): Price {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_GESTURES_PER_CHECKOUT
  ) {
    throw new SponsorshipPricingError(count);
  }
  const perGestureCents =
    PRICE_PER_GESTURE_YEAR_CENTS + (logo ? LOGO_ADDON_PER_GESTURE_CENTS : 0);
  return {
    items: Array.from({ length: count }, () => ({
      amountCents: perGestureCents,
      includesLogo: logo,
    })),
    perGestureCents,
    totalCents: count * perGestureCents,
  };
}
